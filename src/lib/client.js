import { Capacitor } from '@capacitor/core';

const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
const isLocalhost = typeof window !== 'undefined' && (
  window.location.origin.includes('localhost') ||
  window.location.origin.startsWith('file:') ||
  window.location.origin.startsWith('capacitor:') ||
  window.location.origin.includes('127.0.0.1') ||
  window.location.origin.includes('192.168.')
);

export const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? 'http://localhost:3001'
  : 'https://mahistream-api-production.up.railway.app';

const API = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? 'http://localhost:3001/api'
  : 'https://mahistream-api-production.up.railway.app/api';

export function uid() {
  try {
    const saved = localStorage.getItem("mahi-user");
    if (saved) {
      const u = JSON.parse(saved);
      if (u && u.id) return u.id;
    }
    let id = localStorage.getItem("mahi-uid");
    if (!id) {
      id = "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem("mahi-uid", id);
    }
    return id;
  } catch { return "penonton"; }
}

function toQuery(obj) {
  if (!obj || typeof obj !== "object") return "";
  const p = Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return p.length ? "?" + p.join("&") : "";
}

function handleMaintenance(data) {
  if (data?.error === "maintenance" || data?.maintenance === true) {
    window.dispatchEvent(new CustomEvent("mahi:maintenance", { detail: { maintenance: true, message: data?.message || data?.maintenanceMessage } }));
  } else if (data?.maintenance === false) {
    window.dispatchEvent(new CustomEvent("mahi:maintenance", { detail: { maintenance: false } }));
  }
}

function authHeader() {
  try {
    const u = JSON.parse(localStorage.getItem("mahi-user"));
    if (u?.token) return { "x-auth-token": u.token };
  } catch {}
  return {};
}

// Route /khusus di-gate server dengan token HMAC hasil unlock. Token
// disimpan oleh utils/khususAuth.js; dikirim otomatis utk path khusus.
function khususHeader(path) {
  if (typeof path === "string" && path.startsWith("/khusus")) {
    try {
      const tok = localStorage.getItem("mahistream_khusus_token_v1");
      if (tok) return { "x-khusus-token": tok };
    } catch {}
  }
  return {};
}

export async function api(path, opts, body, extraHeaders) {
  let url = API + path;

  if (typeof opts === "string") {
    const headers = { "Content-Type": "application/json", ...authHeader(), ...khususHeader(path), ...(extraHeaders || {}) };
    const fetchOpts = { method: opts, headers, signal: AbortSignal.timeout(30000) };
    if (body) fetchOpts.body = JSON.stringify(body);
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
          err.status = res.status;
          throw err;
        }
        throw new Error("Respon server tidak valid");
      }
    }
    handleMaintenance(data);
    if (!res.ok) {
      const err = new Error(data?.error || data?.message || res.statusText || "Request gagal");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  if (opts?.params) {
    url += toQuery(opts.params);
    delete opts.params;
  }
  const headers = { "Content-Type": "application/json", ...authHeader(), ...khususHeader(path), ...(opts?.headers || {}) };
  const res = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
        err.status = res.status;
        throw err;
      }
      throw new Error("Respon server tidak valid");
    }
  }
  handleMaintenance(data);
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || res.statusText || "Request gagal");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

export function getTheme() {
  return (typeof window !== "undefined" && localStorage.getItem("mahi-theme")) || "dark";
}

export function setTheme(t) {
  localStorage.setItem("mahi-theme", t);
  document.documentElement.classList.toggle("light", t === "light");
}

export function adminHeaders(key) {
  return { "x-admin-key": key };
}

export function compressPosterImage(file, maxWidth = 800, maxHeight = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File bukan gambar'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memuat format gambar'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export const inputCls =
  "w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 transition";
