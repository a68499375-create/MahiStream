// Centralized preferences (video player & notifications) yang dibaca/ditulis
// oleh halaman Settings dan dikonsumsi oleh VideoPlayer + notifyManager.
// Pakai localStorage supaya persisten antar sesi tanpa backend.

const LISTENERS = new Map(); // key -> Set<callback>

const KEYS = {
  autoNext: { key: 'mahistream_pref_auto_next', def: true },
  volumeSwipe: { key: 'mahistream_pref_volume_swipe', def: true },
  brightnessSwipe: { key: 'mahistream_pref_brightness_swipe', def: true },
  fullscreenProgress: { key: 'mahistream_pref_fullscreen_progress', def: true },
  notifEnabled: { key: 'mahistream_pref_notif_enabled', def: true },
  notifVibrate: { key: 'mahistream_pref_notif_vibrate', def: true },
};

// Legacy key migration — auto-next sudah ada di Profile.jsx pakai
// `mahistream_autonext` (boolean as string). Migrasi ke key baru saat boot.
const LEGACY_MAP = {
  autoNext: 'mahistream_autonext',
};

const readBoolean = (storageKey, def) => {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === null) return def;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return def;
  } catch {
    return def;
  }
};

const writeBoolean = (storageKey, value) => {
  try { localStorage.setItem(storageKey, String(!!value)); } catch {}
};

// Migrate legacy keys one-time at module load.
(() => {
  try {
    Object.entries(LEGACY_MAP).forEach(([prefKey, legacyKey]) => {
      const newKey = KEYS[prefKey]?.key;
      if (!newKey) return;
      const newVal = localStorage.getItem(newKey);
      const legacyVal = localStorage.getItem(legacyKey);
      if (newVal === null && legacyVal !== null) {
        localStorage.setItem(newKey, legacyVal);
      }
    });
  } catch {}
})();

export const getPreference = (prefKey) => {
  const def = KEYS[prefKey];
  if (!def) return null;
  return readBoolean(def.key, def.def);
};

export const setPreference = (prefKey, value) => {
  const def = KEYS[prefKey];
  if (!def) return;
  writeBoolean(def.key, value);
  // Maintain legacy key in sync (so existing VideoPlayer code yang masih
  // membaca `mahistream_autonext` tetap melihat update terbaru).
  const legacyKey = LEGACY_MAP[prefKey];
  if (legacyKey) {
    try { localStorage.setItem(legacyKey, String(!!value)); } catch {}
  }
  const set = LISTENERS.get(prefKey);
  if (set) set.forEach((cb) => { try { cb(value); } catch {} });
};

export const subscribePreference = (prefKey, cb) => {
  if (!LISTENERS.has(prefKey)) LISTENERS.set(prefKey, new Set());
  LISTENERS.get(prefKey).add(cb);
  return () => {
    const set = LISTENERS.get(prefKey);
    if (set) set.delete(cb);
  };
};

export const getAllPreferences = () => {
  const out = {};
  Object.keys(KEYS).forEach((k) => { out[k] = getPreference(k); });
  return out;
};
