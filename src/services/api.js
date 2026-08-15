import { Capacitor } from '@capacitor/core';
import { uid as getClientUid } from '../lib/client';

const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
const isLocalhost = typeof window !== 'undefined' && (
  window.location.origin.includes('localhost') ||
  window.location.origin.startsWith('file:') ||
  window.location.origin.startsWith('capacitor:')
);
export const API_BASE = 'https://mahistream-api-production.up.railway.app/api';

const get = async (url) => {
  const res = await fetch(API_BASE + url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || json;
};

const post = async (url, body, headers = {}) => {
  const res = await fetch(API_BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const del = async (url, headers = {}) => {
  const res = await fetch(API_BASE + url, {
    method: "DELETE",
    headers: { ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const getUserId = () => {
  return getClientUid();
};

export const fetchAnimeList = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return get(`/anime${qs ? "?" + qs : ""}`);
};

export const fetchAnimeDetail = (id) => get(`/anime/${id}`);

export const fetchHistory = () => {
  const uid = getUserId();
  return get(`/history?userId=${uid}`);
};

export const saveHistory = (data) => {
  return post("/history", { userId: getUserId(), ...data });
};

export const deleteHistory = (animeId) => {
  const uid = getUserId();
  if (animeId) return del(`/history/${uid}/${animeId}`);
  return del(`/history/${uid}/clear`);
};

export const fetchBookmarks = () => {
  const uid = getUserId();
  return get(`/bookmarks/${uid}`);
};

export const toggleBookmark = (animeId, title, poster) => {
  return post("/bookmarks", { userId: getUserId(), animeId, title, poster });
};

export const fetchRequests = () => get("/requests");

export const submitRequest = (title, notes) => {
  return post("/requests", { title, notes, userId: getUserId() });
};

export const ADMIN_KEY = "adminbaikbanget";

const adminHeaders = () => {
  const extra = { "x-admin-key": ADMIN_KEY };
  try {
    const raw = localStorage.getItem("mahi-user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.token) extra["x-auth-token"] = u.token;
    }
  } catch {}
  return extra;
};

export const adminFetch = async (url) => {
  return fetch(API_BASE + url, {
    headers: adminHeaders(),
  }).then((r) => r.json());
};

export const adminPost = (url, data) => {
  return post(url, data, adminHeaders());
};

export const adminDel = (url) => {
  return del(url, adminHeaders());
};

export const fetchAnnouncements = () => get("/announcements");
export const fetchSchedule = () => get("/schedule");
export const fetchKhusus = () => get("/khusus");

// Aliases for Profile.jsx compatibility
export const addBookmark = (data) => {
  return post("/bookmarks", { userId: getUserId(), animeId: data.anime_id, title: data.title, poster: data.poster });
};
export const removeBookmark = (animeId) => {
  return del(`/bookmarks/${getUserId()}/${animeId}`);
};
export const removeHistoryItem = (animeId) => {
  const uid = getUserId();
  return del(`/history/${uid}/${animeId}`);
};
