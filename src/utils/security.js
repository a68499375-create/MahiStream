// Frontend security helpers — zero-dep, defensive layer di sisi klien.
//
// Bukan pengganti security backend (semua data sensitif harus diproteksi
// di server), tapi mengurangi permukaan serangan kalau ada XSS / akses
// localStorage tak sengaja:
//   - obfuscate token sederhana (XOR + base64) supaya value bukan plaintext
//   - rate limiter klien untuk percobaan password Khusus
//   - sanitize untrusted text sebelum render via dangerouslySetInnerHTML
//
// Catatan: enkripsi sederhana ini cuma menghalangi reader pasif. Lawan
// XSS aktif tetap perlu CSP + input sanitization. Tapi mengangkat bar
// dari "plaintext" ke "perlu effort" bermakna untuk leaked backup, tools
// devtools awam, dsb.

const KEY = 'mahi-' + (typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 16) : 'fallback');

const xor = (text, key) => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
};

export const obfuscate = (plain) => {
  if (!plain) return '';
  try {
    return btoa(unescape(encodeURIComponent(xor(String(plain), KEY))));
  } catch {
    return '';
  }
};

export const deobfuscate = (cipher) => {
  if (!cipher) return '';
  try {
    return decodeURIComponent(escape(xor(atob(String(cipher)), KEY)));
  } catch {
    return '';
  }
};

// Rate limiter klien — dipakai khusus untuk password gate Khusus.
// Per-key counter dengan reset window. Disimpan di sessionStorage supaya
// reset saat tab ditutup (tidak permanen menjebak user yang lupa password
// setelah aplikasi di-reinstall).
const RATE_PREFIX = 'mahi_rate_';

export const checkRateLimit = (key, max = 5, windowMs = 5 * 60 * 1000) => {
  try {
    const raw = sessionStorage.getItem(RATE_PREFIX + key);
    const now = Date.now();
    if (!raw) {
      sessionStorage.setItem(RATE_PREFIX + key, JSON.stringify({ count: 0, resetAt: now + windowMs }));
      return { ok: true, remaining: max, retryAfterMs: 0 };
    }
    const obj = JSON.parse(raw);
    if (!obj || obj.resetAt < now) {
      sessionStorage.setItem(RATE_PREFIX + key, JSON.stringify({ count: 0, resetAt: now + windowMs }));
      return { ok: true, remaining: max, retryAfterMs: 0 };
    }
    if (obj.count >= max) {
      return { ok: false, remaining: 0, retryAfterMs: obj.resetAt - now };
    }
    return { ok: true, remaining: max - obj.count, retryAfterMs: 0 };
  } catch {
    return { ok: true, remaining: max, retryAfterMs: 0 };
  }
};

export const incrementRateLimit = (key, max = 5, windowMs = 5 * 60 * 1000) => {
  try {
    const raw = sessionStorage.getItem(RATE_PREFIX + key);
    const now = Date.now();
    let obj = raw ? JSON.parse(raw) : null;
    if (!obj || obj.resetAt < now) {
      obj = { count: 0, resetAt: now + windowMs };
    }
    obj.count = (obj.count || 0) + 1;
    sessionStorage.setItem(RATE_PREFIX + key, JSON.stringify(obj));
    return { ok: obj.count <= max, remaining: Math.max(0, max - obj.count), retryAfterMs: obj.resetAt - now };
  } catch {
    return { ok: true, remaining: max, retryAfterMs: 0 };
  }
};

export const resetRateLimit = (key) => {
  try { sessionStorage.removeItem(RATE_PREFIX + key); } catch {}
};

// Sanitize text untuk ditampilkan ke pengguna (mis. dari respons API).
// Bukan untuk eksekusi HTML — kalau perlu tag, gunakan whitelist parser
// dedicated. Function ini menghapus <,>,&,",' supaya tidak jadi entitas
// yang bisa breakout konteks.
export const sanitizeText = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
