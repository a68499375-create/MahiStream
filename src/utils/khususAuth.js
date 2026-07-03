// Password gate untuk fitur "Khusus" / Nekopoi.
// Status terkunci/terbuka di-bind ke kombinasi PER-DEVICE + PER-AKUN:
// kunci flag-nya menggunakan {device-token + user-id}. Akun A yang
// unlock di device X tidak otomatis membuka akun B di device yang sama.
// Akun A yang unlock di device X juga tidak ke-unlock di device Y.
import { obfuscate, deobfuscate, checkRateLimit, incrementRateLimit, resetRateLimit } from './security';

const DEVICE_TOKEN_KEY = 'mahistream_device_token_v1';
const KHUSUS_PASSWORD_OBFUSCATED = obfuscate('alfathsayangkagari');
const RATE_LIMIT_KEY = 'khusus_password';
const LISTENERS = new Set();

const getDeviceToken = () => {
  try {
    let tok = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!tok) {
      tok = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'tok-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      localStorage.setItem(DEVICE_TOKEN_KEY, tok);
    }
    return tok;
  } catch {
    return 'tok-fallback';
  }
};

// User ID untuk binding khusus — pakai email Google kalau login,
// fallback ke 'guest' supaya semua tamu di device yang sama berbagi flag.
const getAccountId = () => {
  try {
    const raw = localStorage.getItem('mahistream_user');
    const u = raw ? JSON.parse(raw) : null;
    return (u && (u.email || u.name)) || 'guest';
  } catch {
    return 'guest';
  }
};

const storageKeyForAccount = () =>
  `mahistream_khusus_unlocked_${getAccountId()}_v2`;

export const isKhususUnlocked = () => {
  try {
    const raw = localStorage.getItem(storageKeyForAccount());
    if (!raw) return false;
    const expectedToken = getDeviceToken();
    const [tok, status] = raw.split(':');
    if (tok !== expectedToken || status !== 'true') {
      try { localStorage.removeItem(storageKeyForAccount()); } catch {}
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const verifyKhususPassword = (input = '') => {
  return String(input) === deobfuscate(KHUSUS_PASSWORD_OBFUSCATED);
};

export const canAttemptPassword = () => checkRateLimit(RATE_LIMIT_KEY, 5, 5 * 60 * 1000);

export const unlockKhusus = (password) => {
  const limit = checkRateLimit(RATE_LIMIT_KEY, 5, 5 * 60 * 1000);
  if (!limit.ok) {
    return { ok: false, throttled: true, retryAfterMs: limit.retryAfterMs };
  }
  if (!verifyKhususPassword(password)) {
    incrementRateLimit(RATE_LIMIT_KEY, 5, 5 * 60 * 1000);
    return { ok: false, throttled: false };
  }
  try {
    const tok = getDeviceToken();
    localStorage.setItem(storageKeyForAccount(), `${tok}:true`);
  } catch {}
  resetRateLimit(RATE_LIMIT_KEY);
  LISTENERS.forEach((cb) => { try { cb(true); } catch (_e) {} });
  return { ok: true };
};

export const lockKhusus = () => {
  try { localStorage.removeItem(storageKeyForAccount()); } catch {}
  LISTENERS.forEach((cb) => { try { cb(false); } catch (_e) {} });
};

export const subscribeKhusus = (cb) => {
  LISTENERS.add(cb);
  return () => LISTENERS.delete(cb);
};
