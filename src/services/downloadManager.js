/**
 * downloadManager.js - background downloader untuk MahiStream
 * --------------------------------------------------------
 * Goals:
 * - User pilih resolusi (360p / 480p / 720p / 1080p / 4K) dari modal player
 * - Download jalan di latar belakang (tidak buka browser)
 * - Notifikasi sistem (LocalNotifications) menampilkan progress + selesai
 * - File tersimpan di folder Download device (Android) atau Downloads browser (web)
 * - Antrian persisten lewat localStorage supaya panel tetap menampilkan riwayat
 *
 * Strategy:
 * - Native (Capacitor Android): pakai Filesystem.write dgn chunk-by-chunk fetch
 *   ke `Documents/MahiStream/...` lalu pindahkan ke folder Downloads via
 *   ExternalStorage directory. LocalNotifications schedule untuk progress + done.
 * - Web (browser): fetch + Response.body.getReader -> Blob -> anchor <a download>.
 *   Notifikasi browser pakai Notification API (kalau permission diberikan).
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';

const LS_KEY = 'mahistream_download_queue_v2';
const NATIVE = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();

// State internal
const downloads = new Map(); // id -> entry
const subscribers = new Set();

// ---------- Native init ----------
let _notifReady = false;
const ensureNotifPermission = async () => {
  if (!NATIVE || _notifReady) return _notifReady;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      const r = await LocalNotifications.requestPermissions();
      _notifReady = r.display === 'granted';
    } else {
      _notifReady = true;
    }
    if (_notifReady) {
      try {
        await LocalNotifications.createChannel({
          id: 'mahistream-downloads',
          name: 'MahiStream Downloads',
          description: 'Progress dan status unduhan episode',
          importance: 3,
          visibility: 1,
          lights: false,
          vibration: false,
        });
      } catch {}
    }
  } catch (e) {
    console.warn('LocalNotifications permission failed', e);
  }
  return _notifReady;
};

const notifId = (entryId) => {
  // Stable hash → small int (LocalNotifications butuh number id)
  let h = 0;
  for (let i = 0; i < entryId.length; i++) {
    h = (h * 31 + entryId.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 2147483647) || 1;
};

const sendNotif = async (entry, opts = {}) => {
  if (!NATIVE) return;
  const ok = await ensureNotifPermission();
  if (!ok) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: notifId(entry.id),
        title: opts.title || `Mengunduh ${entry.animeTitle}`,
        body: opts.body || `EP ${entry.episode} • ${entry.resolution}`,
        channelId: 'mahistream-downloads',
        ongoing: opts.ongoing !== false,
        autoCancel: !!opts.autoCancel,
        smallIcon: 'ic_stat_icon_config_sample',
      }],
    });
  } catch (e) {
    console.warn('schedule notif failed', e);
  }
};

const cancelNotif = async (entry) => {
  if (!NATIVE) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId(entry.id) }] });
  } catch {}
};

// ---------- Persistence ----------
const loadPersisted = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => {
      if (!entry || !entry.id) return;
      // Yang belum selesai dianggap interrupted -> tandai gagal supaya UI jelas
      const status =
        entry.status === 'completed' || entry.status === 'failed'
          ? entry.status
          : 'failed';
      downloads.set(entry.id, {
        ...entry,
        status,
        progress: status === 'completed' ? 1 : (entry.progress || 0),
        error: status === 'failed' && entry.status !== 'failed' ? 'Terputus' : entry.error || null,
        _controller: null,
      });
    });
  } catch {
    /* corrupted storage */
  }
};

const persist = () => {
  try {
    const serializable = Array.from(downloads.values()).map((d) => ({
      id: d.id,
      animeTitle: d.animeTitle,
      episode: d.episode,
      resolution: d.resolution,
      url: d.url,
      filename: d.filename,
      progress: d.progress,
      status: d.status,
      error: d.error || null,
      createdAt: d.createdAt,
      filePath: d.filePath || null,
    }));
    localStorage.setItem(LS_KEY, JSON.stringify(serializable));
  } catch {
    /* quota */
  }
};

// ---------- Pub/sub ----------
const snapshot = () =>
  Array.from(downloads.values()).map((d) => ({
    id: d.id,
    animeTitle: d.animeTitle,
    episode: d.episode,
    resolution: d.resolution,
    progress: d.progress,
    status: d.status,
    error: d.error || null,
    filename: d.filename,
    filePath: d.filePath || null,
  }));

const emit = () => {
  const data = snapshot();
  subscribers.forEach((cb) => {
    try { cb(data); } catch {}
  });
};

export const subscribe = (callback) => {
  if (typeof callback !== 'function') return () => {};
  subscribers.add(callback);
  try { callback(snapshot()); } catch {}
  return () => subscribers.delete(callback);
};

export const getActiveDownloads = () => snapshot();

// ---------- Helpers ----------
const sanitize = (str) =>
  String(str || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'untitled';

const buildFilename = ({ animeTitle, episode, resolution }) => {
  // Gunakan separator ` - ` (spasi-dash-spasi) supaya filename terbaca rapi
  // di galeri Android, bukan menyatu seperti `JudulEP1720p`. Tambahkan
  // prefix "MahiStream" supaya gampang dicari + sortable di file manager.
  const t = sanitize(animeTitle);
  const ep = sanitize(episode);
  const r = sanitize(resolution || 'auto').replace(/[^0-9a-zA-Z]/g, '');
  return `MahiStream - ${t} - EP ${ep} - ${r}.mp4`;
};

const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  // Chunk untuk hindari "Maximum call stack size exceeded"
  const CHUNK = 0x8000;
  for (let i = 0; i < len; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    URL.revokeObjectURL(url);
  }, 1500);
};

// Wrap URL ke backend proxy supaya:
//   1. Referer / User-Agent yang dibutuhkan CDN (kdrive.my.id, iino.my.id,
//      asuna.my.id, dst.) di-set di sisi server, bukan browser. Tanpa ini
//      browser akan gagal dengan "failed to fetch" / 403.
//   2. CORS dibypass — backend kirim header `Access-Control-Allow-Origin: *`.
//   3. DNS override untuk host yang diblokir ISP (nekopoi.care) tetap jalan.
//
// Direct .mp4/.m3u8 yang sudah di-proxy (ada `proxy/stream` di URL-nya)
// tidak di-wrap dua kali. URL https external tanpa proxy → wrap.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const PROXY_HOST_HINTS = {
  // Kuramanime CDN family — Referer harus origin Kurama supaya tidak 403/451.
  // Termasuk kuramanime.ing dan domain alternatifnya supaya kalau frontend
  // mengirim direct URL kuramanime.ing, referer tetap di-set di backend.
  'kdrive': 'https://v18.kuramanime.ing/',
  'iino.my.id': 'https://v18.kuramanime.ing/',
  'komari.my.id': 'https://v18.kuramanime.ing/',
  'asuna.my.id': 'https://v18.kuramanime.ing/',
  'kitasan.my.id': 'https://v18.kuramanime.ing/',
  'chisato.my.id': 'https://v18.kuramanime.ing/',
  'amiya.my.id': 'https://v18.kuramanime.ing/',
  'huntersekai': 'https://v18.kuramanime.ing/',
  'r2.nyomo': 'https://v18.kuramanime.ing/',
  'horikita': 'https://v18.kuramanime.ing/',
  'horikita.my.id': 'https://v18.kuramanime.ing/',
  'kuramadrive': 'https://v18.kuramanime.ing/',
  'kuramanime.ing': 'https://v18.kuramanime.ing/',
  'kuramanime.dad': 'https://v18.kuramanime.ing/',
  'kuramanime': 'https://v18.kuramanime.ing/',
  // Nekopoi CDN family — termasuk streamruby/streampoi/vidnest yang dipakai
  // sebagai server stream tapi kadang juga muncul di link download.
  'nekopoi': 'https://nekopoi.care/',
  'streamruby': 'https://nekopoi.care/',
  'streampoi': 'https://nekopoi.care/',
  'vidnest': 'https://nekopoi.care/',
  'playmogo': 'https://nekopoi.care/',
  // Otakudesu CDN family
  'desustream': 'https://otakudesu.cloud/',
  'odstream': 'https://otakudesu.cloud/',
  'ondesu': 'https://otakudesu.cloud/',
};

const proxify = (url) => {
  if (!url || typeof url !== 'string') return url;
  // Sudah di-proxy / data URL / blob — biarkan.
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.includes('/proxy/stream') || url.includes('/kuramanime/stream-proxy')) return url;
  if (!url.startsWith('http')) return url;
  let referer = '';
  const low = url.toLowerCase();
  for (const [hint, ref] of Object.entries(PROXY_HOST_HINTS)) {
    if (low.includes(hint)) { referer = ref; break; }
  }
  const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : '';
  return `${API_BASE}/proxy/stream?url=${encodeURIComponent(url)}${refParam}`;
};

// ---------- Native download via Filesystem.downloadFile (streaming ala nanimeid) ----------
// nanimeid pakai DownloadManager Android yang stream langsung ke disk tanpa
// buffer di memory. Capacitor 8 menyediakan Filesystem.downloadFile yang
// melakukan hal yang sama: HEAD ke URL → progress listener → write streaming.
// File besar (300MB+) tidak akan crash karena memory bloat seperti pendekatan
// fetch + base64 lama.
const nativeDownload = async (entry) => {
  entry.status = 'downloading';
  entry.progress = 0;
  emit();
  persist();
  await sendNotif(entry, {
    title: `Mulai mengunduh ${entry.animeTitle}`,
    body: `EP ${entry.episode} • ${entry.resolution} • 0%`,
    ongoing: true,
  });

  let lastNotifPct = 0;
  let progressHandle = null;
  let watchdog = null;
  let filePoll = null;

  // Daftar mirror URL untuk fallback otomatis. Mirror yang region-block (451)
  // atau token expired (403/HTML) akan di-skip ke yang berikutnya.
  const mirrorUrls = Array.isArray(entry.urls) && entry.urls.length > 0
    ? entry.urls
    : [entry.url];
  let lastError = null;
  let success = false;
  // Total bytes yang kita ketahui dari HEAD / probe. Dipakai sebagai
  // fallback kalau Capacitor progress event tidak mengirim contentLength
  // (sering terjadi di proxy chunked Kuramanime → progress UI stuck di 95%).
  let knownTotal = 0;
  // Timestamp event progress terakhir — dipakai watchdog di bawah untuk
  // mendeteksi download yang nyantol di tengah jalan.
  let lastProgressAt = Date.now();

  try {
    // Setup progress listener sekali untuk seluruh attempts.
    progressHandle = await Filesystem.addListener('progress', (status) => {
      if (entry.status !== 'downloading') return;
      const total = status?.contentLength || knownTotal || 0;
      const got = status?.bytes || 0;
      lastProgressAt = Date.now();
      if (total > 0) {
        entry.progress = Math.min(got / total, 0.999);
      } else {
        // Tidak ada contentLength. Naikkan cap ke 0.99 supaya UI tidak
        // berhenti di 95% lalu kelihatan "macet" padahal masih streaming.
        entry.progress = Math.min(0.99, entry.progress + 0.003);
      }
      emit();
      const pct = Math.round(entry.progress * 100);
      if (pct >= lastNotifPct + 5) {
        lastNotifPct = pct;
        sendNotif(entry, {
          title: `Mengunduh ${entry.animeTitle}`,
          body: `EP ${entry.episode} • ${entry.resolution} • ${pct}%`,
          ongoing: true,
        });
      }
    });

    // Watchdog: kalau lebih dari 90 detik tidak ada event progress
    // sementara entry masih "downloading", log ke konsol. Tidak men-cancel
    // (Capacitor downloadFile tidak punya abort handle yang reliable di
    // Android), tapi minimal kita tahu kalau ada yang stuck. UI tetap maju
    // pakai fake progress di 0.99.
    watchdog = setInterval(() => {
      if (entry.status !== 'downloading') return;
      if (Date.now() - lastProgressAt > 90_000) {
        console.warn(`[download] no progress for 90s on ${entry.filename}`);
      }
    }, 30_000);

    const folder = 'MahiStream';
    const path = `${folder}/${entry.filename}`;

    // Polling Filesystem.stat tiap 1 detik sebagai sumber progress alternatif
    // — beberapa device Android tidak konsisten mengirim event 'progress'
    // dari Capacitor Filesystem.downloadFile (khususnya untuk respons proxy
    // chunked seperti Kuramanime). Dengan stat polling, kita selalu tahu
    // ukuran file aktual yang sudah ter-tulis di disk → progress UI selalu
    // akurat dan tidak stuck di 95%.
    //
    // Selain itu polling ini juga jadi sumber AUTO-COMPLETE saat
    // `Filesystem.downloadFile` di Android kadang tidak resolve walau file
    // sudah tertulis penuh. Logikanya:
    //   - Jika knownTotal diketahui & file size >= knownTotal → selesai.
    //   - Jika knownTotal tidak diketahui & file size stabil >= 10 detik
    //     (tidak nambah byte selama itu) → anggap selesai.
    let lastFileBytes = 0;
    let stableSince = 0;
    filePoll = setInterval(async () => {
      if (entry.status !== 'downloading') return;
      try {
        const info = await Filesystem.stat({
          path: `${folder}/${entry.filename}`,
          directory: Directory.External,
        }).catch(async () => {
          return await Filesystem.stat({
            path: `${folder}/${entry.filename}`,
            directory: Directory.Documents,
          });
        });
        const bytes = Number(info?.size) || 0;
        if (bytes <= 0) return;
        lastProgressAt = Date.now();
        if (bytes !== lastFileBytes) {
          stableSince = 0;
          lastFileBytes = bytes;
        } else if (!stableSince) {
          stableSince = Date.now();
        }

        if (knownTotal > 0) {
          entry.progress = Math.min(bytes / knownTotal, 1);
        } else {
          entry.progress = Math.max(entry.progress, Math.min(0.99, entry.progress + 0.01));
        }
        emit();
        const pct = Math.round(entry.progress * 100);
        if (pct >= lastNotifPct + 5) {
          lastNotifPct = pct;
          sendNotif(entry, {
            title: `Mengunduh ${entry.animeTitle}`,
            body: `EP ${entry.episode} • ${entry.resolution} • ${pct}%${knownTotal ? '' : ' (estimasi)'}`,
            ongoing: true,
          });
        }

        // Auto-complete trigger.
        const reachedTotal = knownTotal > 0 && bytes >= knownTotal * 0.999;
        const stableLongEnough = !knownTotal && stableSince && Date.now() - stableSince > 8_000 && bytes > 1_000_000;
        if (reachedTotal || stableLongEnough) {
          // Cegah double-emit kalau downloadFile keburu resolve.
          if (entry.status === 'downloading') {
            entry.progress = 1;
            entry.status = 'completed';
            entry.filePath = entry.filePath || `${folder}/${entry.filename}`;
            success = true;
            emit();
            persist();
            cancelNotif(entry).catch(() => {});
            sendNotif(entry, {
              title: `Selesai: ${entry.animeTitle}`,
              body: `EP ${entry.episode} • ${entry.resolution} tersimpan`,
              ongoing: false,
              autoCancel: true,
            }).catch(() => {});
          }
          clearInterval(filePoll);
          filePoll = null;
        }
      } catch { /* file belum dibuat di tick ini */ }
    }, 1000);

    // Sanity check pakai GET dengan range kecil (2KB pertama) — bukan HEAD.
    // HEAD sering tidak reliable di CDN: bisa return text/html walau GET
    // mengembalikan video, atau di-block sepenuhnya. GET range jauh lebih
    // akurat untuk mendeteksi 451/403 dan halaman HTML.
    for (let i = 0; i < mirrorUrls.length; i++) {
      const tryUrl = mirrorUrls[i];
      if (!tryUrl) continue;
      try {
        const fetchUrl = proxify(tryUrl);
        console.log(`[download] mirror ${i + 1}/${mirrorUrls.length}: probing ${tryUrl.slice(0, 80)}...`);

        // Probe 2KB pertama via GET + Range. Statusnya 206 (partial) atau
        // 200 (CDN tidak support Range tapi tetap kirim video) keduanya OK.
        // 451/403/429 → langsung skip.
        let probeOk = true;
        try {
          const probeRes = await fetch(fetchUrl, {
            method: 'GET',
            headers: {
              Range: 'bytes=0-2047',
              Accept: 'video/*,application/octet-stream,*/*',
            },
          });
          if (probeRes.status === 451 || probeRes.status === 403 || probeRes.status === 429) {
            lastError = new Error(`HTTP ${probeRes.status}`);
            console.warn(`[download] probe failed HTTP ${probeRes.status}, trying next mirror...`);
            try { await probeRes.arrayBuffer(); } catch {}
            probeOk = false;
          } else if (!probeRes.ok && probeRes.status !== 206 && probeRes.status !== 416) {
            lastError = new Error(`HTTP ${probeRes.status}`);
            console.warn(`[download] probe failed HTTP ${probeRes.status}, trying next mirror...`);
            try { await probeRes.arrayBuffer(); } catch {}
            probeOk = false;
          } else {
            const ct = (probeRes.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('text/html') || ct.includes('application/json')) {
              lastError = new Error('Halaman bukan video');
              console.warn(`[download] probe returned ${ct}, trying next mirror...`);
              try { await probeRes.arrayBuffer(); } catch {}
              probeOk = false;
            } else {
              // Ekstrak total size dari Content-Range: "bytes 0-2047/123456"
              // atau Content-Length kalau server tidak balik range. Dipakai
              // sebagai fallback untuk progress UI saat Capacitor tidak
              // mengirim contentLength (sering terjadi di proxy chunked
              // Kuramanime → progress stuck di 95%).
              const cr = probeRes.headers.get('content-range');
              if (cr) {
                const m = cr.match(/\/(\d+)$/);
                if (m) knownTotal = parseInt(m[1], 10) || knownTotal;
              }
              if (!knownTotal) {
                const cl = probeRes.headers.get('content-length');
                if (cl && probeRes.status !== 206) {
                  knownTotal = parseInt(cl, 10) || knownTotal;
                }
              }
              try { await probeRes.arrayBuffer(); } catch {}
            }
          }
        } catch (probeErr) {
          console.warn(`[download] probe error: ${probeErr?.message}, attempting full download anyway...`);
          probeOk = true;
        }
        if (!probeOk) continue;

        // Streaming download via Capacitor (nanimeid-style — pakai Android
        // DownloadManager native, tidak buffer di memory).
        let writeRes = null;
        try {
          writeRes = await Filesystem.downloadFile({
            url: fetchUrl,
            path,
            directory: Directory.External,
            recursive: true,
            progress: true,
          });
        } catch (e) {
          // External directory mungkin tidak available → fallback ke Documents
          try {
            writeRes = await Filesystem.downloadFile({
              url: fetchUrl,
              path,
              directory: Directory.Documents,
              recursive: true,
              progress: true,
            });
          } catch (e2) {
            lastError = e2;
            console.warn(`[download] downloadFile failed: ${e2?.message}, trying next mirror...`);
            continue;
          }
        }
        entry.url = tryUrl;
        entry.filePath = writeRes?.path || writeRes?.uri || path;
        entry.progress = 1;
        entry.status = 'completed';
        success = true;
        break;
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    if (!success) {
      throw new Error(lastError?.message
        ? `Semua mirror gagal: ${lastError.message}`
        : 'Server tidak mengirim video (link expired)');
    }

    emit();
    persist();
    await cancelNotif(entry);
    await sendNotif(entry, {
      title: `Selesai: ${entry.animeTitle}`,
      body: `EP ${entry.episode} • ${entry.resolution} tersimpan`,
      ongoing: false,
      autoCancel: true,
    });
  } catch (err) {
    entry.status = 'failed';
    entry.error = err && err.message ? err.message : 'Gagal download';
    emit();
    persist();
    await cancelNotif(entry);
    await sendNotif(entry, {
      title: `Gagal mengunduh ${entry.animeTitle}`,
      body: entry.error,
      ongoing: false,
      autoCancel: true,
    });
  } finally {
    if (progressHandle && progressHandle.remove) {
      try { await progressHandle.remove(); } catch {}
    }
    if (watchdog) {
      try { clearInterval(watchdog); } catch {}
    }
    if (filePoll) {
      try { clearInterval(filePoll); } catch {}
    }
    entry._controller = null;
  }
};

// ---------- Web download via blob anchor ----------
const webDownload = async (entry) => {
  const controller = new AbortController();
  entry._controller = controller;
  entry.status = 'downloading';
  entry.progress = 0;
  emit();
  persist();

  try {
    // Multi-mirror fallback sama dengan nativeDownload.
    const mirrorUrls = Array.isArray(entry.urls) && entry.urls.length > 0
      ? entry.urls
      : [entry.url];
    let res = null;
    let lastError = null;

    for (let i = 0; i < mirrorUrls.length; i++) {
      const tryUrl = mirrorUrls[i];
      if (!tryUrl) continue;
      try {
        const fetchUrl = proxify(tryUrl);
        const tryRes = await fetch(fetchUrl, { signal: controller.signal });
        if (!tryRes.ok) {
          lastError = new Error(`HTTP ${tryRes.status}`);
          try { await tryRes.arrayBuffer(); } catch {}
          continue;
        }
        const ct = (tryRes.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) {
          lastError = new Error('Bukan video');
          try { await tryRes.arrayBuffer(); } catch {}
          continue;
        }
        res = tryRes;
        entry.url = tryUrl;
        break;
      } catch (e) {
        lastError = e;
        if (e?.name === 'AbortError') throw e;
        continue;
      }
    }

    if (!res) {
      throw new Error(lastError?.message
        ? `Semua mirror gagal: ${lastError.message}`
        : 'Server tidak mengirim video');
    }

    const totalHeader = res.headers.get('content-length');
    let total = totalHeader ? parseInt(totalHeader, 10) : 0;

    // Beberapa proxy chunked (Kuramanime) tidak kirim Content-Length pada
    // GET — coba HEAD ke URL yang sama supaya progress bar akurat.
    if (!total) {
      try {
        const headRes = await fetch(proxify(entry.url), { method: 'HEAD' });
        if (headRes.ok) {
          const h = headRes.headers.get('content-length');
          if (h) total = parseInt(h, 10) || 0;
        }
      } catch { /* tidak fatal */ }
    }

    if (!res.body || !res.body.getReader) {
      const blob = await res.blob();
      triggerBlobDownload(blob, entry.filename);
      entry.progress = 1;
      entry.status = 'completed';
      emit();
      persist();
      return;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    let lastChunkAt = Date.now();
    const IDLE_DONE_MS = 8000; // 8 detik tanpa chunk baru = anggap selesai

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Race antara reader.read() dengan idle timeout. Tanpa ini, reader
      // kadang hang setelah byte terakhir (server tidak kirim final 0-length
      // chunk → progress stuck di 99%).
      const idlePromise = new Promise((resolve) => {
        const remaining = IDLE_DONE_MS - (Date.now() - lastChunkAt);
        setTimeout(() => resolve({ done: true, value: null, _timeout: true }), Math.max(remaining, 100));
      });
      const { done, value, _timeout } = await Promise.race([reader.read(), idlePromise]);
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        lastChunkAt = Date.now();
        if (total > 0) {
          entry.progress = Math.min(received / total, 0.999);
          // Kalau received sudah >= 99.5% dari total, break manual — kadang
          // server stream tidak kirim final chunk → progress mentok di
          // 99% selamanya.
          if (received >= total * 0.995) break;
        } else {
          entry.progress = Math.min(0.99, entry.progress + 0.005);
        }
        emit();
      }
      if (_timeout) break;
    }
    try { reader.cancel().catch(() => {}); } catch {}

    const blob = new Blob(chunks, { type: 'video/mp4' });
    triggerBlobDownload(blob, entry.filename);
    entry.progress = 1;
    entry.status = 'completed';
    emit();
    persist();
  } catch (err) {
    if (controller.signal.aborted) {
      entry.status = 'failed';
      entry.error = 'Dibatalkan';
    } else {
      entry.status = 'failed';
      entry.error = err && err.message ? err.message : 'Gagal download';
    }
    emit();
    persist();
  } finally {
    entry._controller = null;
  }
};

// ---------- Public API ----------

/**
 * Mulai download episode di latar belakang.
 * @param {object} opts
 * @param {string} opts.animeTitle
 * @param {string|number} opts.episode
 * @param {string} opts.resolution - "360p" | "480p" | "720p" | "1080p" | "4K"
 * @param {string} opts.url - URL file MP4
 * @returns {string} download id
 */
export const startDownload = ({ animeTitle, episode, resolution, url, urls }) => {
  if (!url && (!Array.isArray(urls) || urls.length === 0)) {
    throw new Error('startDownload: url atau urls wajib diisi');
  }
  const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mirrorList = Array.isArray(urls) && urls.length > 0 ? urls : [url];
  const entry = {
    id,
    animeTitle: animeTitle || 'Unknown',
    episode: episode != null ? String(episode) : '?',
    resolution: resolution || 'auto',
    url: mirrorList[0],
    urls: mirrorList,
    filename: buildFilename({ animeTitle, episode, resolution }),
    progress: 0,
    status: 'queued',
    error: null,
    createdAt: Date.now(),
    filePath: null,
    _controller: null,
  };
  downloads.set(id, entry);
  emit();
  persist();
  // Background tanpa await
  if (NATIVE) {
    ensureNotifPermission().finally(() => nativeDownload(entry));
  } else {
    webDownload(entry);
  }
  return id;
};

export const cancelDownload = (id) => {
  const entry = downloads.get(id);
  if (!entry) return false;
  if (entry._controller) {
    try { entry._controller.abort(); } catch {}
  }
  return true;
};

export const removeDownload = (id) => {
  const entry = downloads.get(id);
  if (!entry) return false;
  if (entry.status === 'downloading') return false;
  cancelNotif(entry);
  downloads.delete(id);
  emit();
  persist();
  return true;
};

export const clearFinished = () => {
  let changed = false;
  for (const [id, entry] of downloads) {
    if (entry.status === 'completed' || entry.status === 'failed') {
      cancelNotif(entry);
      downloads.delete(id);
      changed = true;
    }
  }
  if (changed) {
    emit();
    persist();
  }
};

loadPersisted();

export default {
  startDownload,
  cancelDownload,
  removeDownload,
  clearFinished,
  getActiveDownloads,
  subscribe,
};
