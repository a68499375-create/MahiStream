import { animeData } from '../data/animeData';
import { filterDonghua } from '../utils/donghuaFilter';
import { Capacitor } from '@capacitor/core';

/**
 * MahiStream Full API Service Architecture
 * ----------------------------------------
 * Semua komponen akan mengambil data melalui fungsi di file ini.
 * Isi fungsi-fungsi ini dengan logika 'fetch' API Anda sendiri.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://mahistream.103.67.244.19.nip.io';
const BASE_API_URL = `${API_BASE_URL}/otakudesu`;

// =====================
// Client-side cache (stale-while-revalidate + localStorage persistence)
// Memory map untuk hit panas, localStorage supaya cold start (buka app baru)
// bisa render data lama dulu sambil refetch di background. TTL hanya
// menentukan kapan revalidate, BUKAN kapan data dibuang - UI tidak pernah
// kosong selama pernah berhasil fetch sekali. Key disimpan dengan prefix
// `mahistream_cache_v1_` supaya gampang invalidate kalau struktur berubah.
// =====================
const _cache = new Map();
const _inflight = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 menit
const LS_PREFIX = 'mahistream_cache_v1_';

const readCache = (key) => {
  const mem = _cache.get(key);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === 'number') {
        _cache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    /* localStorage tidak available (mis. private mode) */
  }
  return null;
};

const writeCache = (key, data) => {
  const entry = { data, ts: Date.now() };
  _cache.set(key, entry);
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota exceeded / disabled - memory cache tetap jalan */
  }
};

const isFresh = (entry) => !!entry && Date.now() - entry.ts <= CACHE_TTL;

// Compat helpers: dipakai oleh kode lama yang cuma butuh hit/miss biasa.
const getCached = (key) => {
  const entry = readCache(key);
  return isFresh(entry) ? entry.data : null;
};
const setCache = (key, data) => writeCache(key, data);

/**
 * Stale-while-revalidate wrapper. Kembalikan cached data instan kalau ada;
 * kalau lewat TTL, fire background refetch supaya pemanggil berikutnya
 * dapat data segar tanpa loading. Cache miss murni di-await. Inflight
 * di-dedup biar tidak ada dua request paralel ke endpoint yang sama.
 */
const swr = async (key, fetcher) => {
  const entry = readCache(key);
  if (entry) {
    if (!isFresh(entry) && !_inflight.has(key)) {
      const bg = (async () => {
        try {
          const data = await fetcher();
          if (data !== undefined && data !== null) writeCache(key, data);
        } catch {
          /* background refresh error: kita sudah punya data lama, abaikan */
        } finally {
          _inflight.delete(key);
        }
      })();
      _inflight.set(key, bg);
    }
    return entry.data;
  }
  if (_inflight.has(key)) return _inflight.get(key);
  const p = (async () => {
    try {
      const data = await fetcher();
      if (data !== undefined && data !== null) writeCache(key, data);
      return data;
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, p);
  return p;
};

/** Prefetch home data saat app mount supaya first-paint lebih cepat */
export const prefetchHome = () => {
  fetchHomeData().catch(() => {});
};

/** Prefetch schedule supaya navigasi ke /jadwal feel instant */
export const prefetchSchedule = () => {
  fetchSchedule().catch(() => {});
};

/** Prefetch browse page 1 supaya navigasi ke /browse feel instant */
export const prefetchBrowse = () => {
  fetchBrowseCatalog(1).catch(() => {});
};

/**
 * Identitas user yang konsisten untuk history/bookmark.
 * Bug lama: player menyimpan history pakai `email` sementara halaman History
 * membaca pakai `id`, sehingga backend (yang auto-create user berdasarkan email)
 * tidak pernah menemukan baris yang sama -> history selalu kosong. Semua kode
 * sekarang HARUS lewat fungsi ini agar kunci-nya sama persis di save & fetch.
 */
/**
 * Identifier user untuk history & bookmark.
 * - Kalau user sudah login Google, pakai email mereka → history per-akun
 *   yang konsisten antar perangkat (selama login Google sama).
 * - Kalau belum login, pakai `guest:<deviceToken>` yang unik per device
 *   (token random pertama kali di-generate). Konsekuensinya history guest
 *   TIDAK ke-share antar device, dan login Google akan memberi history
 *   yang berbeda dari history guest (sesuai harapan: history per-akun).
 */
export const getCurrentUserId = () => {
  try {
    const raw = localStorage.getItem('mahistream_user');
    const u = raw ? JSON.parse(raw) : null;
    const accountId = u && (u.email || u.name || u.username || u.id);
    if (accountId) return String(accountId);
    // Guest: pakai device token random supaya history terpisah antar device
    // dan antar akun. Token dipersist di localStorage.
    let tok = localStorage.getItem('mahistream_guest_device_v1');
    if (!tok) {
      tok = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'g-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      localStorage.setItem('mahistream_guest_device_v1', tok);
    }
    return `guest:${tok}`;
  } catch {
    return 'guest:fallback';
  }
};

// Helper function untuk mensimulasikan waktu tunggu API
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * fetch dengan timeout + retry berjenjang.
 * Di HP, saat layar mati atau jaringan pindah (WiFi <-> seluler) socket TCP
 * lama mati diam-diam; fetch biasa menunggu socket mati itu selamanya sehingga
 * app terlihat "putus" sampai radio di-restart. AbortController memutus request
 * yang menggantung lalu mencoba lagi dengan koneksi baru.
 */
const rawFetch = (typeof window !== 'undefined' ? window.fetch : fetch).bind(
  typeof window !== 'undefined' ? window : globalThis
);

const fetchWithRetry = async (url, options = {}, { timeout = 15000, retries = 1, backoff = 500 } = {}) => {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await rawFetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
        keepalive: false,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await delay(backoff * Math.pow(2, attempt)); // 500ms
      }
    }
  }
  throw lastErr;
};

/**
 * 1. Mengambil URL Streaming Video
 */
export const resolveServerUrl = async (serverId) => {
  try {
    const res = await fetchWithRetry(`${BASE_API_URL}/server/${serverId}`);
    const json = await res.json();
    if (json.statusCode === 200 && json.data && json.data.details) {
      let rawUrl = json.data.details.url;
      if (rawUrl) {
        // Jangan proxy Vidhide/desustream karena Cloudflare memblokir node-fetch
        // dan menampilkan CAPTCHA Turnstile (kotak kecil pojok kiri atas).
        return rawUrl;
      }
    }
  } catch (error) {
    console.error("Gagal resolve server url:", error);
  }
  return null;
};

// USER API (SQLite Backend)
export const saveHistory = async (userId, anime) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/user/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        animeId: anime.id,
        title: anime.title,
        posterUrl: anime.posterUrl || anime.poster,
        episode: anime.episode || '1',
        source: anime.source || 'otakudesu',
        progressSeconds: anime.progressSeconds || anime.progress_seconds || 0,
        durationSeconds: anime.durationSeconds || anime.duration_seconds || 0,
      })
    });
    return res.ok;
  } catch (err) {
    console.error('Error saving history:', err);
    return false;
  }
};

export const fetchHistory = async (userId) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/user/history?userId=${userId}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Error fetching history:', err);
    return [];
  }
};

export const deleteHistory = async (userId, animeId = null) => {
  try {
    const url = animeId 
      ? `${API_BASE_URL}/user/history?userId=${userId}&animeId=${encodeURIComponent(animeId)}`
      : `${API_BASE_URL}/user/history?userId=${userId}`;
    const res = await fetchWithRetry(url, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('Error deleting history:', err);
    return false;
  }
};

export const toggleBookmark = async (userId, anime) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/user/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        animeId: anime.id,
        title: anime.title,
        posterUrl: anime.posterUrl || anime.poster,
        source: anime.source || 'otakudesu'
      })
    });
    return await res.json();
  } catch (err) {
    console.error('Error toggling bookmark:', err);
    return null;
  }
};

export const fetchBookmarks = async (userId) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/user/bookmark?userId=${userId}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Error fetching bookmarks:', err);
    return [];
  }
};

export const fetchProfile = async (userId) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/user/profile?userId=${userId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Error fetching profile:', err);
    return null;
  }
};

export const uploadImage = async (file) => {
  try {
    const formData = new FormData();
    formData.append('image', file);
    
    const res = await fetchWithRetry(`${API_BASE_URL}/user/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url.startsWith('http') ? data.url : `${API_BASE_URL}${data.url}`;
  } catch (err) {
    console.error('Error uploading image:', err);
    return null;
  }
};

export const updateProfile = async (profileData) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    return await res.json();
  } catch (err) {
    console.error('Error updating profile:', err);
    return { error: 'Gagal terhubung ke server' };
  }
};

export const fetchStreamUrl = async (episodeId) => {
  try {
    const res = await fetchWithRetry(`${BASE_API_URL}/episode/${episodeId}`);
    if (!res.ok) throw new Error("API failed");
    const json = await res.json();
    if (json.statusCode === 200 && json.data) {
      const details = json.data.details;
      
      let streamUrl = "";
      
      // 1. Coba cari link download PixelDrain untuk resolusi tertinggi (native MP4)
      if (details.download && details.download.qualityList && details.download.qualityList.length > 0) {
        // Ambil kualitas tertinggi secara dinamis (biasanya yang terakhir di array atau cari 1080p/720p)
        const highestResolutionList = [...details.download.qualityList].reverse();
        const bestDownload = highestResolutionList.find(q => q.title.toLowerCase().includes('1080p')) 
                          || highestResolutionList.find(q => q.title.toLowerCase().includes('720p')) 
                          || highestResolutionList[0];
                          
        if (bestDownload && bestDownload.urlList) {
          const pdrain = bestDownload.urlList.find(u => u.title.toLowerCase().includes('pdrain'));
          if (pdrain) {
            // Ekstrak URL asli menggunakan proxy redirect
            try {
              const redirectRes = await fetchWithRetry(`${BASE_API_URL}/redirect-proxy?url=${encodeURIComponent(pdrain.url)}`);
              if (redirectRes.ok) {
                const redirectJson = await redirectRes.json();
                if (redirectJson.data && redirectJson.data.url) {
                  const finalUrl = redirectJson.data.url;
                  // Jika URL adalah pixeldrain.com/u/ID, ubah ke API stream
                  const pdMatch = finalUrl.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
                  if (pdMatch && pdMatch[1]) {
                    streamUrl = `https://pixeldrain.com/api/file/${pdMatch[1]}`;
                  }
                }
              }
            } catch (e) {
              console.warn("Gagal mengekstrak PixelDrain URL", e);
            }
          }
        }
      }

      // 2. Fallback ke server embed web jika PixelDrain gagal
      if (!streamUrl && details.server && details.server.qualityList && details.server.qualityList.length > 0) {
         // Ambil kualitas tertinggi
         const bestQuality = details.server.qualityList[details.server.qualityList.length - 1];
         if (bestQuality && bestQuality.serverList && bestQuality.serverList.length > 0) {
           // HINDARI ondesu (Blogger) jika memungkinkan, karena proteksi Blogger menggagalkan proxy iframe
           const targetServer = 
             bestQuality.serverList.find(s => s.title.toLowerCase().includes('filedon')) ||
             bestQuality.serverList.find(s => !s.title.toLowerCase().includes('ondesu')) || 
             bestQuality.serverList[0];
           
           const resolvedUrl = await resolveServerUrl(targetServer.serverId);
           if (resolvedUrl) {
             streamUrl = resolvedUrl;
           }
         }
      }
      
      // Fallback ke default jika server pihak ketiga gagal
      if (!streamUrl && details.defaultStreamingUrl) {
         streamUrl = details.defaultStreamingUrl;
      }

      return {
        url: streamUrl || "",
        title: details.title || "Episode",
        details: details
      };
    }
    throw new Error("Invalid format");
  } catch (error) {
    console.warn("Fallback to empty URL due to API error:", error);
    return {
      url: "",
      title: "Episode 1",
    };
  }
};

/**
 * Mengambil Detail Anime berdasarkan ID
 */
export const fetchAnimeDetails = async (animeId) => {
  try {
    const res = await fetchWithRetry(`${BASE_API_URL}/anime/${animeId}`);
    if (!res.ok) throw new Error("API failed");
    const json = await res.json();
    if (json.statusCode === 200 && json.data) {
      return json.data.details;
    }
    throw new Error("Invalid format");
  } catch (error) {
    console.warn("Fallback to mock data due to API error in fetchAnimeDetails:", error);
    // Simulate wajik API response structure using local mock data
    const mockDb = animeData.find(a => a.id === animeId) || animeData[0]; // fallback to first (frieren) if not found
    
    return {
      animeId: mockDb.id,
      title: mockDb.title,
      synopsis: mockDb.synopsis,
      score: mockDb.rating,
      releaseDate: mockDb.year,
      episodeList: mockDb.episodes.map(ep => ({
        episodeId: ep.id,
        title: ep.title
      }))
    };
  }
};

export const fetchHomeData = async () => {
  // Bump cache key v4: setelah aggregate home backend balik kosong, kita
  // tambahkan fallback ke endpoint per-source (otakudesu/ongoing +
  // kuramanime/latest) supaya halaman home tetap terisi. v4 invalidate
  // cache v3 lama yang mungkin sudah tersimpan dengan list kosong.
  // Bump v6: filter donghua di aggregate path baru aktif. Cache v5 lama bisa
  // berisi banner donghua yang ngak sesuai title saat di-klik. Invalidate.
  return swr('home_v6', async () => {
    const mapAggregateItem = (a, fallbackRating) => ({
      id: a.animeId,
      title: a.title,
      posterUrl: a.poster || a.posterUrl || "",
      rating: a.score && a.score !== "?" ? a.score : fallbackRating,
      year: new Date().getFullYear().toString(),
      tags: [a.releaseDay || "Terbaru", a.episodes === "Completed" ? "Tamat" : "Ongoing"],
      episodes: [{ title: `EP ${a.episodes || '1'}` }],
      source: a.source || 'otakudesu',
    });

    let ongoing = [];
    let completed = [];

    // 1) Coba endpoint /aggregate/home dulu — kalau aktif & berisi, langsung
    //    pakai datanya (penggabungan kuramanime + otakudesu sudah di backend).
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/aggregate/home`, {}, { timeout: 30000, retries: 1 });
      if (res.ok) {
        const json = await res.json();
        if (json.statusCode === 200 && json.data) {
          // Backend aggregate kadang include donghua (anime Cina) di list
          // Kurama. App fokus anime Jepang, jadi filter sebelum map.
          // Sebelumnya filter cuma jalan di fallback path → banner home
          // sering jadi donghua yang tidak sesuai.
          const rawOngoing = filterDonghua(json.data.ongoing?.animeList || []);
          const rawCompleted = filterDonghua(json.data.completed?.animeList || []);
          ongoing = rawOngoing.map((a) => mapAggregateItem(a, 8.5));
          completed = rawCompleted.map((a) => mapAggregateItem(a, 9.0));
        }
      }
    } catch (e) {
      console.warn("aggregate/home failed:", e);
    }

    // 2) Fallback paralel ke endpoint per-source kalau aggregate kosong.
    //    Kuramanime: /kuramanime/latest (poster CDN bagus, jam tayang ada).
    //    Otakudesu: /otakudesu/ongoing (judul lengkap + episode terbaru).
    if (ongoing.length === 0 && completed.length === 0) {
      const safeFetch = async (path) => {
        try {
          const r = await fetchWithRetry(`${API_BASE_URL}${path}`, {}, { timeout: 20000, retries: 1 });
          if (!r.ok) return [];
          const j = await r.json();
          return j?.data?.animeList || [];
        } catch { return []; }
      };
      const [otaku, kurama] = await Promise.all([
        safeFetch('/otakudesu/ongoing?page=1'),
        safeFetch('/kuramanime/latest?page=1'),
      ]);
      // Filter donghua dari hasil Kurama — app fokus ke anime Jepang.
      const kuramaAnime = filterDonghua(kurama);
      const mapped = [
        ...otaku.map((a) => mapAggregateItem({ ...a, source: 'otakudesu' }, 8.5)),
        ...kuramaAnime.map((a) => mapAggregateItem({ ...a, source: 'kuramanime' }, 8.5)),
      ];
      // Dedupe by judul-normalized.
      const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const seen = new Set();
      const merged = [];
      for (const it of mapped) {
        const k = norm(it.title);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        merged.push(it);
      }
      ongoing = merged;
      // Sebagai 'completed' tampilkan reverse dari ongoing supaya home tetap
      // berisi dua section walau backend cuma punya satu data slice.
      completed = merged.slice().reverse();
    }

    // 3) Final: kalau tetap kosong setelah fallback, lempar throw supaya
    //    swr() tidak menyimpan kosong sebagai 'data' dan UI lewat ke mock.
    if (ongoing.length === 0 && completed.length === 0) {
      throw new Error('Backend returned empty animeList');
    }

    const ongoingFinal = ongoing.length > 0 ? ongoing : completed.slice();
    const completedFinal = completed.length > 0 ? completed : ongoing.slice().reverse();

    return {
      hero: ongoingFinal[0] || completedFinal[0],
      ongoing: ongoingFinal.slice(0, 30),
      completed: completedFinal.slice(0, 30),
      latestEpisodes: ongoingFinal.slice(0, 24),
    };
  }).catch(() => ({
    hero: animeData.find(a => a.id === 'frieren') || animeData[0],
    ongoing: animeData.slice(0),
    completed: animeData.slice(0).reverse(),
    latestEpisodes: animeData.slice(0),
  }));
};

export const fetchSchedule = async () => {
  // Bump v2: cache schedule lama (key 'schedule') sering ke-pollute dengan
  // empty result saat FlareSolverr timeout. Setelah backend di-patch timeout
  // 8s→60s, kita invalidate cache supaya hasil schedule yang fresh muncul.
  return swr('schedule_v2', async () => {
    try {
      // Jadwal rilis dari aggregate (gabungan Kuramanime + Otakudesu).
      // Sebelumnya kita filter strict ke kuramanime saja, tetapi backend
      // /kuramanime/schedule sering balik kosong total → jadwal hilang.
      // Sekarang biarkan semua item masuk; sumber Otakudesu memberikan
      // judul + day-of-week walaupun tidak punya jam tayang.
      const res = await fetchWithRetry(`${API_BASE_URL}/aggregate/schedule`, {}, { timeout: 20000, retries: 1 });
      if (res.ok) {
        const json = await res.json();
        if (json.statusCode === 200 && json.data && json.data.scheduleList) {
          const list = json.data.scheduleList;
          const hasAny = list.some((d) => Array.isArray(d.animeList) && d.animeList.length > 0);
          if (hasAny) return list;
        }
      }
    } catch (e) {
      console.warn("Aggregate schedule failed:", e);
    }
    // Fallback langsung ke endpoint Kuramanime kalau aggregate gagal.
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/kuramanime/schedule`, {}, { timeout: 20000, retries: 1 });
      if (res.ok) {
        const json = await res.json();
        if (json.statusCode === 200 && json.data && json.data.scheduleList) {
          return json.data.scheduleList.map((day) => ({
            ...day,
            animeList: (day.animeList || []).map((a) => ({ ...a, source: 'kuramanime' })),
          }));
        }
      }
    } catch (error) {
      console.warn("Failed to fetch Kuramanime schedule:", error);
    }
    return [];
  });
};


export const fetchBrowseCatalog = async (page = 1) => {
  // Cache key v2: cache key sebelumnya pernah ke-pollute dengan mock fallback
  // (`animeData` 4 entries), jadi user terus melihat 4 item walau backend
  // hidup. Bumping ke v2 invalidate cache lama. Selain itu fallback mock
  // sekarang TIDAK di-cache supaya panggilan berikutnya bisa fetch ulang.
  // Bump ke v3 — keep in sync dengan fetchHomeData. v2 lama berisi mock
  // data 4 entry yang sering nyangkut padahal backend hidup.
  // Bump v4: cache browse lama bisa berisi empty result dari periode
  // FlareSolverr timeout. Invalidate supaya browse fresh.
  return swr(`browse_v4_${page}`, async () => {
    try {
      // Aggregate dari ongoing + completed sekaligus (sebelumnya cuma ongoing).
      // Ini bikin grid Browse jadi puluhan item, bukan 4. Endpoint dual ini
      // memang berbeda di Otakudesu — keduanya cepat (~2s di prod) jadi bisa
      // di-paralel.
      const [ongRes, comRes] = await Promise.all([
        fetchWithRetry(`${API_BASE_URL}/otakudesu/ongoing?page=${page}`, {}, { timeout: 20000, retries: 1 }),
        fetchWithRetry(`${API_BASE_URL}/otakudesu/completed?page=${page}`, {}, { timeout: 20000, retries: 1 }),
      ]);

      const lists = [];
      let totalPages = 5;
      for (const res of [ongRes, comRes]) {
        if (!res || !res.ok) continue;
        const json = await res.json();
        if (json.statusCode === 200 && json.data) {
          lists.push(json.data.animeList || []);
          if (json.pagination?.totalPages) {
            totalPages = Math.max(totalPages, json.pagination.totalPages);
          }
        }
      }

      const seen = new Set();
      const merged = [];
      for (const list of lists) {
        for (const a of list) {
          const key = a.animeId || a.title;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push({
            id: a.animeId,
            title: a.title,
            posterUrl: a.posterUrl || a.poster,
            rating: a.score && a.score !== '?' ? a.score : 8.5,
            year: new Date().getFullYear().toString(),
            episodes: a.episodes || 'Ongoing',
            tags: [a.releaseDay || 'Terbaru', a.episodes === 'Completed' ? 'Tamat' : 'Ongoing'],
          });
        }
      }
      if (merged.length === 0) throw new Error('Empty list');
      return { items: merged, totalPages };
    } catch (error) {
      console.warn('Browse fetch failed, fallback ke mock:', error);
      // Fallback dilempar lewat throw supaya swr() TIDAK menyimpan mock ke
      // cache. Pemanggil yang menangkap (Browse.jsx) akan tetap dapat undefined
      // → kosong, lebih baik daripada terjebak menampilkan 4 mock selamanya.
      return undefined;
    }
  }).catch(() => ({ items: animeData, totalPages: 5 }));
};

// Live search autocomplete — return top 8 dari Kuramanime untuk dropdown
// instan. Endpoint ini cepat (~2-5s) karena cuma 1 page card mode, tanpa
// agregasi multi-source. Dipakai di Search page sebagai suggestion saat
// user mengetik tapi belum tekan Enter.
// Fallback: kalau Kuramanime kosong / timeout (FlareSolverr lag), pakai
// Otakudesu search supaya dropdown tetap memberi saran. Banyak laporan
// "penulisannya bener tapi tidak ada hasil" disebabkan satu sumber lagi
// down — dengan fallback ini, paling tidak satu sumber selalu jawab.
export const liveSearchKurama = async (query) => {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();

  // Helper kecil untuk fetch dgn timeout.
  const fetchWithTimeout = async (url, timeoutMs) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  // 1. Coba Kuramanime live-search (cepat kalau FlareSolverr session masih hangat).
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/kuramanime/live-search?q=${encodeURIComponent(q)}`,
      20000
    );
    if (res.ok) {
      const j = await res.json();
      const items = j?.data?.items || [];
      if (Array.isArray(items) && items.length > 0) return items;
    }
  } catch (_e) { /* fall through ke fallback */ }

  // 2. Fallback paralel: Kuramanime full search + Otakudesu search.
  //    Ambil hasil pertama yang non-kosong. Karena tidak menggandeng API
  //    yang lambat (aggregate), latency tetap dalam ~5-8s.
  const out = [];
  try {
    const results = await Promise.allSettled([
      fetchWithTimeout(`${API_BASE_URL}/kuramanime/search?q=${encodeURIComponent(q)}`, 20000)
        .then((r) => r.ok ? r.json() : null)
        .then((j) => (j?.data?.animeList || []).map((a) => ({
          animeId: a.animeId || a.id,
          title: a.title,
          poster: a.posterUrl || a.poster || '',
          score: a.score || 'N/A',
          source: 'kuramanime',
        }))),
      fetchWithTimeout(`${API_BASE_URL}/otakudesu/search?q=${encodeURIComponent(q)}`, 20000)
        .then((r) => r.ok ? r.json() : null)
        .then((j) => (j?.data?.animeList || []).map((a) => ({
          animeId: a.animeId || a.id,
          title: a.title,
          poster: a.posterUrl || a.poster || '',
          score: a.score || 'N/A',
          source: 'otakudesu',
        }))),
    ]);
    results.forEach((r) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) out.push(...r.value);
    });
  } catch (_e) { /* swallow */ }

  // Dedup pakai title-normalized (prioritas urutan: kurama dulu).
  const seen = new Set();
  const deduped = [];
  for (const item of out) {
    const key = String(item.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 10) break;
  }
  return deduped;
};

export const searchAnime = async (query) => {
  if (!query) return [];
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/otakudesu/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.statusCode === 200 && json.data) {
        return json.data.animeList || [];
      }
    }
  } catch (e) {
    console.warn("Search failed:", e);
  }
  return [];
};

export const searchAnimeAggregate = async (query, page = 1) => {
  if (!query) return [];
  // Strategi baru: jalankan aggregate DAN per-source paralel sekaligus,
  // lalu merge hasilnya. Sebelumnya per-source hanya dipakai kalau aggregate
  // gagal — sering bikin hasil Kurama tidak muncul karena aggregate sukses
  // tapi hanya berisi Otakudesu (Kurama lambat di backend → di-drop).
  const trySource = async (path, sourceName) => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE_URL}/${path}?q=${encodeURIComponent(query)}`,
        {},
        { timeout: 25000, retries: 1 }
      );
      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.data?.animeList || json?.data || [];
      return Array.isArray(list)
        ? list.map((a) => ({
            id: a.animeId || a.id,
            title: a.title,
            poster_url: a.poster || a.posterUrl || a.image || "",
            rating: a.score || "N/A",
            availableSources: [sourceName],
            sourceIds: { [sourceName]: a.animeId || a.id },
            _source: sourceName,
          }))
        : [];
    } catch (_) {
      return [];
    }
  };

  const aggregatePromise = (async () => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE_URL}/aggregate/search?q=${encodeURIComponent(query)}&page=${page}`,
        {},
        { timeout: 25000, retries: 1, backoff: 600 }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.statusCode === 200 && json.data) {
          // Backend kadang balik data sebagai array langsung, kadang
          // `data.animeList` (mirroring home aggregate). Dukung keduanya.
          const rawList = Array.isArray(json.data)
            ? json.data
            : (Array.isArray(json.data.animeList) ? json.data.animeList : []);
          // Normalisasi ke shape yang dipakai trySource: id, title, poster_url,
          // availableSources, sourceIds, _source. Kalau backend pakai field
          // `animeId` (bukan `id`) maka Search.jsx akan baca anime.id sebagai
          // undefined → broken link. Map ke `id` di sini supaya konsisten.
          // Khusus Kuramanime: animeId formatnya 'NN/slug-anime' (berisi slash)
          // dan harus dipertahankan utuh sebagai sourceIds.kuramanime.
          return rawList.map((a) => {
            const id = a.id || a.animeId || '';
            const explicitSource = a._source || a.source;
            const availArr = Array.isArray(a.availableSources) && a.availableSources.length > 0
              ? a.availableSources.slice()
              : (explicitSource ? [explicitSource] : []);
            const sourceIds = (a.sourceIds && typeof a.sourceIds === 'object')
              ? { ...a.sourceIds }
              : {};
            // Derive sourceIds dari id kalau backend tidak isi. Untuk anime
            // single-source ini wajib — tanpa sourceIds, primary source bisa
            // ke-overwrite jadi otakudesu padahal id-nya dari Kurama.
            if (Object.keys(sourceIds).length === 0 && id) {
              if (availArr.length > 0) {
                availArr.forEach((s) => { sourceIds[s] = id; });
              } else if (explicitSource) {
                sourceIds[explicitSource] = id;
              }
            }
            const primarySource = explicitSource
              || availArr[0]
              || (Object.keys(sourceIds)[0])
              || 'otakudesu';
            const finalAvail = availArr.length > 0 ? availArr : [primarySource];
            return {
              id,
              title: a.title,
              poster_url: a.poster_url || a.poster || a.posterUrl || a.image || "",
              rating: a.rating || a.score || "N/A",
              availableSources: finalAvail,
              sourceIds,
              _source: primarySource,
            };
          }).filter((x) => x.id && x.title);
        }
      }
    } catch (e) {
      console.warn("Aggregate search failed:", e);
    }
    return [];
  })();

  const [aggregate, otaku, kurama, neko] = await Promise.all([
    aggregatePromise,
    trySource('otakudesu/search', 'otakudesu'),
    trySource('kuramanime/search', 'kuramanime'),
    trySource('nekopoi/search', 'nekopoi'),
  ]);

  // Merge: aggregate prioritas pertama (sudah berisi sourceIds map yang
  // lengkap), lalu per-source di-merge ke entry yang sudah ada by title
  // normalized. Entri baru di-append.
  const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const merged = new Map();
  (aggregate || []).forEach((it) => {
    const key = norm(it.title);
    if (!key) return;
    merged.set(key, { ...it });
  });
  [...otaku, ...kurama, ...neko].forEach((it) => {
    const key = norm(it.title);
    if (!key) return;
    if (merged.has(key)) {
      const existing = merged.get(key);
      it.availableSources.forEach((s) => {
        if (!Array.isArray(existing.availableSources)) existing.availableSources = [];
        if (!existing.availableSources.includes(s)) existing.availableSources.push(s);
      });
      existing.sourceIds = { ...(existing.sourceIds || {}), ...it.sourceIds };
      if (!existing.poster_url && it.poster_url) existing.poster_url = it.poster_url;
      if (!existing._source) existing._source = it._source;
    } else {
      merged.set(key, { ...it });
    }
  });
  return Array.from(merged.values());
};

// Generic Fetch Details
export const fetchSourceAnimeDetails = async (source, animeId) => {
  // Cache via SWR: anime detail jarang berubah (kecuali ada episode baru),
  // jadi balikan stale dulu sambil refetch di latar belakang. Ini bikin
  // halaman video buka kedua kalinya feel instant tanpa loading panjang.
  return swr(`anime_${source}_${animeId}`, async () => {
    try {
      // Kuramanime animeId might contain slashes like "185/naruto"
      const encodedId = source === 'kuramanime' ? animeId : encodeURIComponent(animeId);
      const res = await fetchWithRetry(`${API_BASE_URL}/${source}/anime/${encodedId}`, {}, { timeout: 30000, retries: 1 });
      if (res.ok) {
        const json = await res.json();
        if (json.statusCode === 200 && json.data) {
          return json.data.details;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch details for ${source}`, e);
    }
    return null;
  });
};

// Generic Fetch Episode
export const fetchSourceEpisodeDetails = async (source, episodeId) => {
  // Cache episode juga: server list + download links jarang berubah, jadi
  // SWR sini bikin replay/switch episode instant.
  return swr(`episode_${source}_${episodeId}`, async () => {
    try {
      const encodedId = source === 'kuramanime' ? episodeId : encodeURIComponent(episodeId);
      const res = await fetchWithRetry(`${API_BASE_URL}/${source}/episode/${encodedId}`, {}, { timeout: 30000, retries: 1 });
      if (res.ok) {
        const json = await res.json();
        if (json.statusCode === 200 && json.data) {
          return json.data.details;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch episode for ${source}`, e);
    }
    return null;
  });
};

// Generic Resolve Stream
export const fetchSourceStreamUrl = async (source, serverId) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/${source}/resolve-stream?serverId=${encodeURIComponent(serverId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.statusCode === 200 && json.data) {
        return json.data.url;
      }
    }
  } catch (e) {
    console.warn(`Failed to resolve stream for ${source}`, e);
  }
  return null;
};

export const fetchNekopoiLatest = async (page = 1) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/nekopoi/latest?page=${page}`);
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const fetchNekopoiSearch = async (q, page = 1) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/nekopoi/search?q=${encodeURIComponent(q)}&page=${page}`, {}, { timeout: 45000, retries: 1 });
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

// Listing per kategori (mis. /nekopoi/category?slug=hentai). Lebih cocok
// untuk tab "Hentai" di halaman Khusus karena memakai kategori asli situs
// (nekopoi.care/category/hentai/) ketimbang menggabung beberapa search.
export const fetchNekopoiCategory = async (slug = 'hentai', page = 1) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/nekopoi/category?slug=${encodeURIComponent(slug)}&page=${page}`, {}, { timeout: 45000, retries: 1 });
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

// Index list — untuk /hentai-list/, /jav-list/, /genre-list/.
export const fetchNekopoiIndex = async (path = 'hentai-list') => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/nekopoi/index?path=${encodeURIComponent(path)}`, {}, { timeout: 90000, retries: 1 });
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const fetchNekopoiDetail = async (url) => {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}/nekopoi/detail?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return data.data || null;
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const getProxiedImageUrl = (url, referer = 'https://nekopoi.care/') => {
  if (!url) return '';
  // Sudah diproxy atau bukan URL absolut -> biarkan apa adanya.
  if (url.includes('/proxy/stream') || !url.startsWith('http')) return url;
  // Fungsi ini khusus konten Nekopoi; semua CDN-nya menerapkan hotlink protection
  // (butuh referer), jadi proxy semua URL http agar poster tidak gagal load.
  return `${API_BASE_URL}/proxy/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
};

// =====================
// Watch Party (nonton bareng) endpoints
// =====================
const wpFetch = async (path, options = {}) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/watchparty${path}`, options, { timeout: 8000, retries: 1 });
  if (!res.ok) throw new Error(`watchparty ${path} ${res.status}`);
  return res.json();
};

export const watchPartyCreate = ({ userId, name, videoId, source, episodeId }) => wpFetch('/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, name, videoId, source, episodeId }),
});

export const watchPartyJoin = ({ roomId, userId, name }) => wpFetch('/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ roomId, userId, name }),
});

export const watchPartyState = (roomId, userId) =>
  wpFetch(`/${roomId}/state?userId=${encodeURIComponent(userId || '')}`);

export const watchPartyUpdate = (roomId, payload) => wpFetch(`/${roomId}/update`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const watchPartyChat = (roomId, userId, msg) => wpFetch(`/${roomId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, msg }),
});

export const watchPartyLeave = (roomId, userId) => wpFetch(`/${roomId}/leave`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId }),
});

// =====================
// Comments per anime / episode (realtime via SSE)
// =====================
export const listComments = async (animeId, { episode = null, page = 1, limit = 20 } = {}) => {
  const qs = new URLSearchParams({ animeId: String(animeId), page: String(page), limit: String(limit) });
  if (episode) qs.set('episode', String(episode));
  const res = await fetchWithRetry(`${API_BASE_URL}/comments?${qs.toString()}`, {}, { timeout: 8000, retries: 1 });
  const json = await res.json();
  return json?.data?.comments || [];
};

export const createComment = async ({ userId, animeId, episode, parentId, body }) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, animeId, episode: episode || null, parentId: parentId || null, body }),
  }, { timeout: 8000, retries: 1 });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`createComment failed ${res.status}: ${t.slice(0, 120)}`);
  }
  const json = await res.json();
  return json?.data?.comment || null;
};

export const likeComment = async (commentId, userId) => {
  const res = await fetchWithRetry(`${API_BASE_URL}/comments/${commentId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  }, { timeout: 8000, retries: 1 });
  const json = await res.json();
  return json?.data || { liked: false, likes: 0 };
};

export const deleteComment = async (commentId, userId) => {
  const res = await fetchWithRetry(
    `${API_BASE_URL}/comments/${commentId}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    { timeout: 8000, retries: 1 }
  );
  return res.ok;
};

// EventSource subscribe ke realtime channel. Pengembalian = fungsi cleanup.
export const subscribeCommentsSSE = (animeId, episode, onEvent) => {
  if (typeof EventSource === 'undefined') return () => {};
  const qs = new URLSearchParams({ animeId: String(animeId) });
  if (episode) qs.set('episode', String(episode));
  const url = `${API_BASE_URL}/comments/sse/stream?${qs.toString()}`;
  let es;
  try {
    es = new EventSource(url);
  } catch {
    return () => {};
  }
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent?.(data);
    } catch {
      /* ping / non-JSON */
    }
  };
  es.onerror = () => {
    // browser akan auto-reconnect; tidak perlu logging spam
  };
  return () => {
    try { es.close(); } catch { /* noop */ }
  };
};

