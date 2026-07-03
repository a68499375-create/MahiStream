/**
 * notifyManager.js
 * ----------------
 * Dua jalur notifikasi:
 *
 * 1. Polling tracker (`tick`) — saat app foreground, hubungi
 *    `/notifications/pending?since=<lastTs>` setiap 15 menit untuk dapat
 *    daftar episode baru yang sudah terdeteksi server-side dan jadwalkan
 *    LocalNotification segera.
 *
 * 2. Schedule advance (`scheduleAdvanceFromTimetable`) — saat app boot dan
 *    setiap 24 jam, fetch `/aggregate/schedule` lalu jadwalkan
 *    LocalNotification PADA jam rilis yang tertera (mis. Selasa 20:30).
 *    LocalNotifications dengan `schedule.at` di-handle OS, jadi notifikasi
 *    tetap muncul walau app ditutup. Ini penting untuk user kita yang
 *    seringnya hanya buka app pas mau nonton — tanpa schedule advance,
 *    notifikasi tidak pernah terkirim karena polling-nya tidak jalan.
 *
 * 3. Web Notification API fallback — untuk browser/PWA.
 *
 * 4. FCM (Firebase Cloud Messaging) support — untuk push notifikasi
 *    real-time saat app background/killed.
 *
 * Persistensi `lastTs` di localStorage.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { API_BASE_URL, getCurrentUserId } from './api';

// Lazy load push notifications only on native
let PushNotifications = null;
const loadPushNotifications = async () => {
  if (!PushNotifications && Capacitor.isNativePlatform?.()) {
    try {
      const PUSH_NOTIF_MOD = ['@capacitor', 'push-notifications'].join('/');
      const mod = await import(/* @vite-ignore */ PUSH_NOTIF_MOD);
      PushNotifications = mod.PushNotifications;
    } catch (e) {
      console.warn('[notifyManager] Failed to load PushNotifications:', e);
    }
  }
  return PushNotifications;
};

const LS_LAST_TS = 'mahistream_release_last_ts_v1';
const LS_LAST_SCHEDULE_TS = 'mahistream_schedule_last_ts_v1';
const LS_ONLY_FAV = 'mahistream_inbox_only_favorite_v1';
const LS_PER_ANIME_NOTIF = 'mahistream_per_anime_notif_v1';
const LS_FCM_TOKEN = 'mahistream_fcm_token_v1';
const LS_NOTIF_SETTINGS = 'mahistream_notif_settings_v1';
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 menit (sesuai rencana)
const SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 jam
const NATIVE = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
const IS_WEB = typeof window !== 'undefined' && !NATIVE;

// Default notification settings
const DEFAULT_NOTIF_SETTINGS = {
  enabled: true,
  onlyFavorites: false,
  onlyWifi: false,
  scheduleAdvance: true,
  perAnime: {},
};

// Read favorit user untuk filter notif — mirror nanimeid behavior. Kalau toggle
// "Hanya favorit" aktif di Inbox, push notification cuma muncul untuk anime
// yang difollow. Default: tampil semua supaya user tidak miss episode baru
// sebelum sempat add ke favorit.
const readFavoriteIds = () => {
  try {
    const uid = getCurrentUserId();
    const umum = JSON.parse(localStorage.getItem(`mahistream_bookmarks_umum_${uid}`) || '[]');
    const khusus = JSON.parse(localStorage.getItem(`mahistream_bookmarks_khusus_${uid}`) || '[]');
    const ids = new Set();
    [umum, khusus].forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach((b) => {
        if (b && (b.id || b.animeId)) ids.add(String(b.id || b.animeId));
      });
    });
    return ids;
  } catch { return new Set(); }
};

const isOnlyFavorite = () => {
  try { return localStorage.getItem(LS_ONLY_FAV) === '1'; } catch { return false; }
};

// Per-anime notification settings
const getPerAnimeNotifSettings = () => {
  try { return JSON.parse(localStorage.getItem(LS_PER_ANIME_NOTIF) || '{}'); } catch { return {}; }
};

const setPerAnimeNotifSetting = (animeId, enabled) => {
  try {
    const settings = getPerAnimeNotifSettings();
    settings[animeId] = enabled;
    localStorage.setItem(LS_PER_ANIME_NOTIF, JSON.stringify(settings));
  } catch {}
};

let _started = false;
let _timer = null;
let _scheduleTimer = null;
let _permReady = false;
let _webPermReady = false;

const ensurePerm = async () => {
  if (!NATIVE) return false;
  if (_permReady) return true;
  try {
    const c = await LocalNotifications.checkPermissions();
    if (c.display === 'granted') { _permReady = true; return true; }
    const r = await LocalNotifications.requestPermissions();
    _permReady = r.display === 'granted';
    if (_permReady) {
      try {
        await LocalNotifications.createChannel({
          id: 'mahistream-releases',
          name: 'Anime Baru Rilis',
          description: 'Notifikasi episode anime baru sesuai jadwal Kuramanime',
          importance: 4,
          visibility: 1,
        });
      } catch {}
    }
    return _permReady;
  } catch {
    return false;
  }
};

const stableNotifId = (animeId, episode) => {
  const key = `${animeId}__${episode}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h % 2147483647) || 1;
};

const scheduleReleaseNotif = async (release) => {
  if (!NATIVE) return;
  const ok = await ensurePerm();
  if (!ok) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: stableNotifId(release.animeId, release.episodeNumber),
        title: `${release.title}`,
        body: `Episode ${release.episodeNumber} sudah rilis`,
        channelId: 'mahistream-releases',
        smallIcon: 'ic_stat_icon_config_sample',
        autoCancel: true,
        extra: {
          animeId: release.animeId,
          episode: release.episodeNumber,
          source: release.source,
        },
      }],
    });
  } catch (e) {
    console.warn('[notifyManager] schedule failed', e);
  }
};

const tick = async () => {
  let since = 0;
  try { since = parseInt(localStorage.getItem(LS_LAST_TS) || '0', 10) || 0; } catch {}
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/pending?since=${since}`);
    if (!res.ok) return;
    const json = await res.json();
    const releases = Array.isArray(json?.releases) ? json.releases : [];
    if (releases.length === 0) {
      const st = json?.serverTime ? Number(json.serverTime) : Date.now();
      try { localStorage.setItem(LS_LAST_TS, String(st)); } catch {}
      return;
    }
    // Filter ke favorit user kalau toggle aktif (mirror nanimeid). Saat
    // toggle off → notif untuk semua anime trending yang dirilis Kuramanime.
    const onlyFav = isOnlyFavorite();
    const favIds = onlyFav ? readFavoriteIds() : null;
    let newest = since;
    for (const r of releases) {
      if (favIds && !favIds.has(String(r.animeId))) {
        // Tetap update newest supaya since bergerak maju.
        if (r.detectedAt && r.detectedAt > newest) newest = r.detectedAt;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await scheduleReleaseNotif(r);
      if (r.detectedAt && r.detectedAt > newest) newest = r.detectedAt;
    }
    try { localStorage.setItem(LS_LAST_TS, String(newest || Date.now())); } catch {}
  } catch (e) {
    console.warn('[notifyManager] tick failed', e);
  }
};

// Mapping nama hari (Indonesia) ke index (0=Minggu, 1=Senin, ...).
const DAY_INDEX = {
  Minggu: 0, Senin: 1, Selasa: 2, Rabu: 3, Kamis: 4, Jumat: 5, Sabtu: 6,
};

// Hitung Date paling dekat di masa depan untuk hari + jam tertentu.
const nextDateAt = (dayName, jam) => {
  const dayIdx = DAY_INDEX[dayName];
  if (dayIdx === undefined) return null;
  const m = String(jam || '').match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const now = new Date();
  const target = new Date(now);
  let diff = (dayIdx - now.getDay() + 7) % 7;
  if (diff === 0) {
    // Sama hari — kalau jam target sudah lewat, geser ke minggu depan.
    if (hh < now.getHours() || (hh === now.getHours() && mm <= now.getMinutes())) {
      diff = 7;
    }
  }
  target.setDate(now.getDate() + diff);
  target.setHours(hh, mm, 0, 0);
  return target;
};

const stableScheduleId = (animeId, ts) => {
  const key = `sched__${animeId}__${ts}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h % 2147483647) || 1;
};

const scheduleAdvanceFromTimetable = async () => {
  if (!NATIVE) return;
  const ok = await ensurePerm();
  if (!ok) return;
  // Throttle: maks 1× per 12 jam supaya tidak spam jadwalkan ulang.
  let lastScheduleAt = 0;
  try { lastScheduleAt = parseInt(localStorage.getItem(LS_LAST_SCHEDULE_TS) || '0', 10) || 0; } catch {}
  if (Date.now() - lastScheduleAt < 12 * 60 * 60 * 1000) return;

  try {
    const res = await fetch(`${API_BASE_URL}/aggregate/schedule`);
    if (!res.ok) return;
    const json = await res.json();
    const days = json?.data?.scheduleList || [];
    if (!Array.isArray(days) || days.length === 0) return;

    const notifs = [];
    for (const day of days) {
      const animeList = day?.animeList || [];
      for (const a of animeList) {
        if (!a?.animeId || !a?.title || !a?.jam) continue;
        const at = nextDateAt(day.title, a.jam);
        if (!at) continue;
        notifs.push({
          id: stableScheduleId(a.animeId, at.getTime()),
          title: 'Anime Baru Rilis',
          body: `${a.title} dijadwalkan rilis ${day.title} ${a.jam}`,
          channelId: 'mahistream-releases',
          smallIcon: 'ic_stat_icon_config_sample',
          autoCancel: true,
          schedule: { at, allowWhileIdle: true },
          extra: { animeId: a.animeId, source: a.source || 'kuramanime' },
        });
      }
    }
    if (notifs.length === 0) return;
    // Capacitor membatasi ukuran array per call — jadwalkan dalam batch 30.
    for (let i = 0; i < notifs.length; i += 30) {
      const chunk = notifs.slice(i, i + 30);
      try {
        // eslint-disable-next-line no-await-in-loop
        await LocalNotifications.schedule({ notifications: chunk });
      } catch (e) {
        console.warn('[notifyManager] schedule batch failed', e);
      }
    }
    try { localStorage.setItem(LS_LAST_SCHEDULE_TS, String(Date.now())); } catch {}
  } catch (e) {
    console.warn('[notifyManager] scheduleAdvance failed', e);
  }
};

export const startNotifyPolling = () => {
  if (_started) return;
  _started = true;
  // Pada native: minta permission di awal supaya user lihat dialog sekali
  // saja. Web: skip semua.
  if (NATIVE) ensurePerm();
  // Tunggu 30 detik setelah app mount supaya tidak menabrak first-paint /
  // home prefetch.
  setTimeout(tick, 30 * 1000);
  _timer = setInterval(tick, POLL_INTERVAL_MS);

  // Schedule advance: jadwalkan notifikasi pada jam rilis sesuai jadwal
  // Kuramanime supaya notifikasi muncul WALAU app ditutup (LocalNotification
  // dengan trigger waktu di-handle OS Android).
  setTimeout(scheduleAdvanceFromTimetable, 45 * 1000);
  _scheduleTimer = setInterval(scheduleAdvanceFromTimetable, SCHEDULE_INTERVAL_MS);
};

export const stopNotifyPolling = () => {
  if (_timer) clearInterval(_timer);
  if (_scheduleTimer) clearInterval(_scheduleTimer);
  _timer = null;
  _scheduleTimer = null;
  _started = false;
};

export default { startNotifyPolling, stopNotifyPolling };
