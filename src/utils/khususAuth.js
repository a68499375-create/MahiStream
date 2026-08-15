// Password gate untuk fitur "Khusus" / Nekopoi.
// Status terkunci/terbuka di-bind PER-AKUN:
// Kalau user sudah login dan unlock, akses tetap terbuka di device manapun
// selama login dengan akun yang sama. Guest/anonymous tetap per-device.
import { obfuscate, deobfuscate, checkRateLimit, incrementRateLimit, resetRateLimit } from './security';

const KHUSUS_PASSWORD_OBFUSCATED = obfuscate('animebokep');
const RATE_LIMIT_KEY = 'khusus_password';
const LISTENERS = new Set();

// Get logged-in user's account ID from AuthContext's localStorage key
const getAccountId = () => {
  try {
    // AuthContext stores user data under 'mahi-user'
    const raw = localStorage.getItem('mahi-user');
    const u = raw ? JSON.parse(raw) : null;
    if (u && u.id) return u.id;
    if (u && (u.email || u.username)) return u.email || u.username;
  } catch {}
  return null; // not logged in
};

// Storage key — per-account for logged-in users, per-device for guests
const storageKeyForAccount = () => {
  const accountId = getAccountId();
  if (accountId) {
    return `mahistream_khusus_account_${accountId}`;
  }
  // Fallback for guests: per-device
  return 'mahistream_khusus_guest';
};

export const isKhususUnlocked = () => {
  try {
    const raw = localStorage.getItem(storageKeyForAccount());
    return raw === 'unlocked';
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
    localStorage.setItem(storageKeyForAccount(), 'unlocked');
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
