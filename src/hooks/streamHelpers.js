import { API_BASE_URL } from '../services/api';

/**
 * Ambil angka resolusi dari sebuah judul/kualitas, mis. "720p" -> 720,
 * "Mp4 1080" -> 1080, "HD" -> 0 (tak diketahui).
 */
export const resolutionScore = (label = '') => {
  const s = String(label).toLowerCase();
  const m = s.match(/(2160|1440|1080|720|480|360|240)\s*p?/);
  if (m) return parseInt(m[1], 10);
  if (/\b(4k|uhd|ultra\s*hd)\b/.test(s)) return 2160;
  if (/\b(2k|qhd)\b/.test(s)) return 1440;
  if (/\b(fhd|full\s*hd|fullhd)\b/.test(s)) return 1080;
  if (/\b(hd)\b/.test(s)) return 720;
  if (/\b(sd)\b/.test(s)) return 480;
  const any = s.match(/(\d{3,4})/);
  return any ? parseInt(any[1], 10) : 0;
};

/**
 * Pilih item dengan resolusi tertinggi dari sebuah daftar.
 * `getLabel` mengembalikan teks yang mengandung angka resolusi untuk tiap item.
 */
export const pickHighest = (list = [], getLabel = (x) => x?.title || x?.quality || '') => {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.reduce((best, cur) =>
    resolutionScore(getLabel(cur)) > resolutionScore(getLabel(best)) ? cur : best
  , list[0]);
};

/**
 * Urutkan server Nekopoi: dahulukan 720p, lalu vidnest, kemudian server generik,
 * dan terakhir streamruby/streampoi yang token-nya sering dikunci ke sesi embed.
 */
export const orderNekopoiServers = (servers = []) => {
  if (!Array.isArray(servers)) return [];
  const rank = (srv = {}) => {
    const haystack = `${srv.serverId || ''} ${srv.serverName || ''} ${srv.title || ''} ${srv.quality || ''}`.toLowerCase();
    if (haystack.includes('720p') || haystack.includes('720 p')) return 0;
    if (haystack.includes('vidnest')) return 1;
    if (haystack.includes('streamruby') || haystack.includes('streampoi')) return 3;
    return 2;
  };
  return [...servers].sort((a, b) => rank(a) - rank(b));
};

/**
 * Resolve embed URL ke direct stream (mp4/m3u8) via backend /extract-stream.
 * - Nekopoi tetap pakai iframe path (tidak di-extract).
 * - Output di-cache server-side sehingga panggilan kedua < 1 detik.
 */
export const resolveEmbedToStream = async (url, source) => {
  if (!url) return url;
  const isDirect = url.includes('.mp4') || url.includes('.m3u8') || url.includes('stream-proxy') || url.includes('/proxy/stream');
  if (isDirect) return url;
  if (!url.startsWith('http')) return url;
  // Nekopoi tetap pakai iframe path (sumber khusus).
  if (source === 'nekopoi') return url;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(`${API_BASE_URL}/extract-stream?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      const direct = json?.streamUrl;
      if (direct && (direct.includes('.mp4') || direct.includes('.m3u8'))) {
        const proxyBase = `${API_BASE_URL}/proxy/stream?url=`;
        return `${proxyBase}${encodeURIComponent(direct)}`;
      }
      console.warn('extract-stream returned non-stream URL:', direct);
    }
  } catch (e) {
    console.warn('resolveEmbedToStream gagal, pakai URL asli', e);
  }
  // Fallback per source
  if (source === 'kuramanime') {
    return `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(url)}`;
  }
  if (source === 'otakudesu') {
    return `${API_BASE_URL}/otakudesu/iframe-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};
