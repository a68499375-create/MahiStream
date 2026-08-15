import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { api, uid, API_BASE } from '../lib/client';
import { BellIcon } from './icons';
import { useToast } from './Toast';
import { io } from "socket.io-client";

const POLL_INTERVAL = 5000;
const STORAGE_KEY = 'mahi-notif-last';

function isCapacitor() {
  try { return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(); } catch { return false; }
}

async function ensureChannel() {
  if (!isCapacitor()) return;
  try {
    await LocalNotifications.createChannel({
      id: 'mahistream_notif_channel',
      name: 'Notifikasi MahiStream',
      description: 'Notifikasi update anime dan pesan MahiStream',
      importance: 5,
      visibility: 1,
      sound: 'mahistream_notif',
      vibration: true,
    });
  } catch (e) {
    console.warn('[LocalNotifications createChannel error]:', e);
  }
}

async function tryCapacitorNotify(title, body) {
  if (!isCapacitor()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return false;
    }
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{
        title: title || 'MahiStream',
        body: body || '',
        id: Math.floor(Math.random() * 1000000) + 1,
        channelId: 'mahistream_notif_channel',
        sound: 'mahistream_notif',
        smallIcon: 'ic_stat_mahistream',
        schedule: { at: new Date(Date.now() + 100), allowWhileIdle: true },
      }]
    });
    return true;
  } catch (err) {
    console.warn('[LocalNotifications schedule error]:', err);
    return false;
  }
}

function tryWebNotify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title || 'MahiStream', { body: body || '', tag: 'mahi-notif-' + Date.now() });
    setTimeout(() => n.close(), 8000);
    return true;
  } catch { return false; }
}

let notifBuffer = null;
async function getOrFetchBuffer(ctx) {
  if (notifBuffer) return notifBuffer;
  try {
    const resp = await fetch('/MahiStream-notif.mp3');
    const arr = await resp.arrayBuffer();
    notifBuffer = await ctx.decodeAudioData(arr);
  } catch { notifBuffer = null; }
  return notifBuffer;
}

function tryPlaySound(ctx) {
  if (ctx) {
    if (ctx.state === 'running') {
      getOrFetchBuffer(ctx).then(buf => {
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
      }).catch(() => {});
      return;
    }
    if (ctx.state === 'suspended') { ctx.resume(); }
  }
  try {
    const audio = new Audio('/MahiStream-notif.mp3');
    audio.volume = 0.8;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

function processNotification(n, toast, audioCtx) {
  const msg = n.title ? `${n.title}${n.body ? ': ' + n.body : ''}` : n.body;
  const tone = n.type === 'error' ? 'error' : n.type === 'warning' ? 'error' : n.type === 'success' ? 'success' : 'info';
  toast(msg, tone);
  tryCapacitorNotify(n.title, n.body) || tryWebNotify(n.title, n.body);
  api(`/notifications/${n.id}/read`, 'POST', { userId: uid() }).catch(() => {});
}

export default function NotificationWatcher() {
  const { toast } = useToast();
  const lastId = useRef(parseInt(localStorage.getItem(STORAGE_KEY) || '0'));
  const seen = useRef(new Set());
  const audioCtx = useRef(null);
  const [showPermBanner, setShowPermBanner] = useState(false);

  const requestNativePerm = async () => {
    try {
      if (isCapacitor()) {
        await ensureChannel();
        const res = await LocalNotifications.requestPermissions();
        if (res.display === 'granted') {
          setShowPermBanner(false);
          toast('Notifikasi MahiStream berhasil diaktifkan!', 'success');
          tryCapacitorNotify('Notifikasi MahiStream Aktif!', 'Anda akan menerima pemberitahuan episode anime terbaru.');
        }
      } else if ('Notification' in window) {
        const res = await Notification.requestPermission();
        if (res === 'granted') {
          setShowPermBanner(false);
          toast('Notifikasi MahiStream berhasil diaktifkan!', 'success');
          tryWebNotify('Notifikasi MahiStream Aktif!', 'Anda akan menerima pemberitahuan episode anime terbaru.');
        }
      }
    } catch (e) {
      console.warn('[NotificationWatcher] requestNativePerm error:', e);
    }
  };

  useEffect(() => {
    async function initNativeNotifications() {
      if (isCapacitor()) {
        try {
          await ensureChannel();
          const perm = await LocalNotifications.checkPermissions();
          if (perm.display === 'granted') {
            setShowPermBanner(false);
            return;
          }
          const res = await LocalNotifications.requestPermissions();
          if (res.display === 'granted') {
            setShowPermBanner(false);
          } else {
            setShowPermBanner(true);
          }
        } catch (e) {
          console.warn('[NotificationWatcher] Native init error:', e);
          setShowPermBanner(true);
        }
      } else if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          setShowPermBanner(false);
        } else if (Notification.permission === 'default') {
          setShowPermBanner(true);
          Notification.requestPermission().then(p => {
            if (p === 'granted') setShowPermBanner(false);
          }).catch(() => {});
        } else {
          setShowPermBanner(true);
        }
      }
    }
    initNativeNotifications();

    // ── FCM Push Token Registration ──
    if (isCapacitor()) {
      const addListeners = async () => {
        await PushNotifications.addListener('registration', (token) => {
          const userId = uid();
          api('/fcm/register', 'POST', { userId, token: token.value }).catch(() => {});
        });
        await PushNotifications.addListener('registrationError', (err) => {
          console.error('[FCM] Registration error:', err);
        });
      };
      addListeners();
      PushNotifications.requestPermissions().then(result => {
        if (result.receive === 'granted') {
          PushNotifications.register();
        }
      }).catch(() => {});
    }

    function unlock() {
      if (audioCtx.current) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        audioCtx.current = ctx;
      } catch {}
    }
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      if (audioCtx.current) { try { audioCtx.current.close(); } catch {} }
    };
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const rawData = await api(`/notifications?since=${lastId.current}`);
        if (!rawData || !active) return;
        const list = Array.isArray(rawData) ? rawData : (rawData.notifications || rawData.items || []);
        if (!Array.isArray(list) || !list.length) return;
        const newOnes = list.filter(n => !seen.current.has(n.id) && n.id > lastId.current);
        newOnes.forEach(n => seen.current.add(n.id));
        if (!newOnes.length) return;
        const maxId = Math.max(...newOnes.map(n => n.id));
        if (maxId > lastId.current) {
          lastId.current = maxId;
          localStorage.setItem(STORAGE_KEY, String(maxId));
        }
        tryPlaySound(audioCtx.current);
        newOnes.forEach(async n => {
          const msg = n.title ? `${n.title}${n.body ? ': ' + n.body : ''}` : n.body;
          const tone = n.type === 'error' ? 'error' : n.type === 'warning' ? 'error' : n.type === 'success' ? 'success' : 'info';
          toast(msg, tone);
          (await tryCapacitorNotify(n.title, n.body)) || tryWebNotify(n.title, n.body);
          api(`/notifications/${n.id}/read`, 'POST', { userId: uid() }).catch(() => {});
        });
      } catch {}
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, [toast]);

  useEffect(() => {
    const socket = io(API_BASE || window.location.origin, {
      transports: ["websocket", "polling"],
    });
    socket.on("notification", (n) => {
      if (!n || !n.id) return;
      if (seen.current.has(n.id)) return;
      seen.current.add(n.id);
      if (n.id > lastId.current) {
        lastId.current = n.id;
        localStorage.setItem(STORAGE_KEY, String(n.id));
      }
      tryPlaySound(audioCtx.current);
      processNotification(n, toast, audioCtx);
    });
    return () => { socket.disconnect(); };
  }, [toast]);

  if (!showPermBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 p-4 rounded-2xl bg-card/95 backdrop-blur-md border border-primary/30 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-ink animate-slideUp">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
          <BellIcon size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold">Aktifkan Notifikasi MahiStream</h4>
          <p className="text-xs text-muted">Dapatkan pemberitahuan update episode anime terbaru langsung di HP Anda.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        <button
          onClick={requestNativePerm}
          className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-bg bg-primary rounded-xl hover:bg-primary-hover transition-colors shadow-md"
        >
          Izinkan Notifikasi
        </button>
        <button
          onClick={() => setShowPermBanner(false)}
          className="px-3 py-2 text-xs text-muted hover:text-ink transition-colors"
        >
          Nanti
        </button>
      </div>
    </div>
  );
}

