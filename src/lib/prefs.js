export const ACCENTS = [
  { key: "gold", label: "Flaxen", accent: "#eaa84e", accent2: "#f3c169", caramel: "#c8853c" },
  { key: "rose", label: "Sakura", accent: "#ec4899", accent2: "#f472b6", caramel: "#be185d" },
  { key: "violet", label: "Lavender", accent: "#a78bfa", accent2: "#c4b5fd", caramel: "#7c3aed" },
  { key: "teal", label: "Aqua", accent: "#2dd4bf", accent2: "#5eead4", caramel: "#0d9488" },
  { key: "crimson", label: "Crimson", accent: "#f43f5e", accent2: "#fb7185", caramel: "#be123c" },
  { key: "amber", label: "Caramel", accent: "#f59e0b", accent2: "#fbbf24", caramel: "#b45309" },
];

const DEFAULT_PLAYBACK = {
  autoplayNext: true, defaultQuality: "1080p", defaultRate: 1,
  defaultVolume: 1, muted: false, skipIntroSeconds: 85, skipOutroSeconds: 90,
};

const DEFAULT_PROFILE = { displayName: "Penonton", favoriteGenres: [] };

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getTheme() {
  return localStorage.getItem("mahi-theme") || "dark";
}
export function setTheme(t) {
  localStorage.setItem("mahi-theme", t);
  applyTheme(t);
}
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === "auto") {
    const sys = (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    root.classList.toggle("light", sys === "light");
    root.classList.toggle("amoled", false);
  } else {
    root.classList.toggle("light", t === "light");
    root.classList.toggle("amoled", t === "amoled");
  }
}

export function getAccent() {
  return localStorage.getItem("mahi-accent") || "gold";
}
export function applyAccent(key) {
  const def = ACCENTS.find(a => a.key === key) || ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--accent", def.accent);
  root.style.setProperty("--accent-2", def.accent2);
  root.style.setProperty("--caramel", def.caramel);
  root.style.setProperty("--glow", hexToRgba(def.accent, 0.32));
}
export function setAccent(key) {
  localStorage.setItem("mahi-accent", key); applyAccent(key);
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getPlayback() { return read("mahi-playback", DEFAULT_PLAYBACK); }
export function setPlayback(p) { write("mahi-playback", p); }

export function getProfile() { return read("mahi-profile", DEFAULT_PROFILE); }
export function setProfile(p) { write("mahi-profile", p); }

export function getReduceMotion() { return localStorage.getItem("mahi-reduce-motion") === "1"; }
export function setReduceMotion(v) { localStorage.setItem("mahi-reduce-motion", v ? "1" : "0"); }

export function clearAllLocal() {
  ["mahi-playback", "mahi-profile", "mahi-reduce-motion"].forEach(k => localStorage.removeItem(k));
}
