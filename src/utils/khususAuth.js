// Password gate untuk fitur "Khusus" / Nekopoi.
// Status terkunci/terbuka di-bind PER-AKUN:
// Kalau user sudah login dan unlock, akses tetap terbuka di device manapun
// selama login dengan akun yang sama. Guest/anonymous tetap per-device.
import { obfuscate, deobfuscate, checkRateLimit, incrementRateLimit, resetRateLimit } from './security';
import { API_BASE } from '../lib/client';

const KHUSUS_PASSWORD_OBFUSCATED = obfuscate('alfathsayangkagari');
const KHUSUS_TOKEN_KEY = 'mahistream_khusus_token_v1';
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

// Token backend (x-khusus-token) hasil POST /api/khusus/unlock. Dipakai
// untuk mengakses route /api/khusus & /api/khusus/:id yang di-gate server.
export const getKhususToken = () => {
  try { return localStorage.getItem(KHUSUS_TOKEN_KEY) || ''; } catch { return ''; }
};

export const setKhususToken = (token) => {
  try {
    if (token) localStorage.setItem(KHUSUS_TOKEN_KEY, token);
    else localStorage.removeItem(KHUSUS_TOKEN_KEY);
  } catch {}
};

// Tukar password dengan token HMAC server supaya koleksi khusus Drive
// (kanojo/overflow dsb.) bisa di-fetch via API yang di-gate backend.
export const syncKhususBackend = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/khusus/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deobfuscate(KHUSUS_PASSWORD_OBFUSCATED) }),
    });
    const json = await res.json();
    if (json && json.ok && json.token) {
      setKhususToken(json.token);
      return true;
    }
  } catch (e) {
    console.warn('Sync khusus backend gagal:', e);
  }
  return false;
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
  syncKhususBackend();
  LISTENERS.forEach((cb) => { try { cb(true); } catch (_e) {} });
  return { ok: true };
};

export const lockKhusus = () => {
  try { localStorage.removeItem(storageKeyForAccount()); } catch {}
  setKhususToken(null);
  LISTENERS.forEach((cb) => { try { cb(false); } catch (_e) {} });
};

export const subscribeKhusus = (cb) => {
  LISTENERS.add(cb);
  return () => LISTENERS.delete(cb);
};
