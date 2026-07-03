// Theme manager: light vs dark.
// Pilihan disimpan di localStorage; saat aplikasi boot, pilihan langsung
// diaplikasikan ke <html data-theme="..."> sebelum React mount supaya tidak
// ada flicker putih saat user berada di mode gelap.

const STORAGE_KEY = 'mahistream_theme_v1';
const VALID = new Set(['light', 'dark']);
const LISTENERS = new Set();

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.has(v) ? v : 'light';
  } catch {
    return 'light';
  }
};

const apply = (theme) => {
  try {
    document.documentElement.setAttribute('data-theme', theme);
  } catch {}
};

export const initTheme = () => {
  const t = readStored();
  apply(t);
  return t;
};

export const getTheme = () => readStored();

export const setTheme = (theme) => {
  if (!VALID.has(theme)) return;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  apply(theme);
  LISTENERS.forEach((cb) => { try { cb(theme); } catch {} });
};

export const toggleTheme = () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
};

export const subscribeTheme = (cb) => {
  LISTENERS.add(cb);
  return () => LISTENERS.delete(cb);
};
