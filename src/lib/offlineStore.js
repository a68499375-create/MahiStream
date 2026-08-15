import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const IS_NATIVE = Capacitor.isNativePlatform();
const STORE_KEY = 'mahi-offline';
const DB_NAME = 'mahistream-offline';
const DB_STORE = 'blobs';
const CHUNK = 2 * 1024 * 1024;
const NATIVE_DIR = 'offline';

let downloads = load();
let activeKey = null;
let activeCtrl = null;
const listeners = new Set();
const blobUrls = new Map();
let snapshot = downloads.slice();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    for (const d of raw) {
      if (d.status === 'downloading' || d.status === 'queued') {
        if (IS_NATIVE) { d.status = 'downloading'; }
        else { d.done = 0; d.status = 'queued'; }
      }
      if (d.status === 'downloading' && d.done === 0) d.status = 'queued';
    }
    return raw;
  } catch { return []; }
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(downloads)); } catch { void 0; }
}

function emit() {
  snapshot = downloads.slice();
  for (const l of listeners) l();
}

function find(key) { return downloads.find(d => d.key === key); }

function filePath(key) { return `${NATIVE_DIR}/${key.replace(/[/\\:]/g, '_')}.mp4`; }

export function getDownloads() { return downloads.slice(); }
export function getDownload(key) { return find(key); }

export function useDownloads() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot,
    () => snapshot
  );
}

export function isOfflineAvailable(key) {
  const d = find(key);
  return !!d && d.status === 'done';
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(DB_STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

async function idbPut(key, blob) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    db.close();
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const rq = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
    db.close();
  });
}

async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    db.close();
  });
}

async function runNative(d) {
  const relPath = filePath(d.key);
  if (d.done === 0) {
    await Filesystem.mkdir({ path: NATIVE_DIR, directory: Directory.Documents, recursive: true });
  }
  const ctrl = new AbortController();
  activeCtrl = ctrl;
  while (!d.canceled) {
    const res = await fetch(d.url, {
      headers: { Range: `bytes=${d.done}-${d.done + CHUNK - 1}` },
      signal: ctrl.signal
    });
    if (res.status === 200) {
      if (d.done > 0) throw new Error('Server tidak mendukung resume');
    } else if (res.status !== 206) {
      throw new Error(`HTTP ${res.status}`);
    }
    const cr = res.headers.get('content-range');
    const m = cr && cr.match(/\/(\d+)/);
    const size = m ? parseInt(m[1], 10) : parseInt(res.headers.get('content-length') || '0', 10) || 0;
    if (size) d.totalSize = size;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) break;
    const b64 = arrayBufferToBase64(buf);
    if (res.status === 206) {
      await Filesystem.appendFile({ path: relPath, data: b64, directory: Directory.Documents });
      d.done += buf.byteLength;
    } else {
      await Filesystem.writeFile({ path: relPath, data: b64, directory: Directory.Documents });
      d.done = buf.byteLength;
    }
    if (d.totalSize) d.done = Math.min(d.done, d.totalSize);
    persist();
    emit();
    if (d.totalSize && d.done >= d.totalSize) break;
  }
  if (d.canceled) return;
  const uri = (await Filesystem.getUri({ path: relPath, directory: Directory.Documents })).uri;
  d.localUrl = Capacitor.convertFileSrc(uri);
  d.status = 'done';
  persist();
  emit();
}

async function runWeb(d) {
  const ctrl = new AbortController();
  activeCtrl = ctrl;
  const res = await fetch(d.url, { signal: ctrl.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cl = res.headers.get('content-length');
  if (cl) d.totalSize = parseInt(cl, 10);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    d.done = buf.byteLength;
    await idbPut(d.key, new Blob([buf]));
    if (d.canceled) return;
    const blobUrl = URL.createObjectURL(new Blob([buf]));
    blobUrls.set(d.key, blobUrl);
    d.localUrl = blobUrl;
    d.status = 'done';
    persist();
    emit();
  } else {
    const reader = res.body.getReader();
    const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      d.done += value.byteLength;
      persist();
      emit();
    }
    await idbPut(d.key, new Blob(parts));
    if (d.canceled) return;
    const blobUrl = URL.createObjectURL(new Blob(parts));
    blobUrls.set(d.key, blobUrl);
    d.localUrl = blobUrl;
    d.status = 'done';
    persist();
    emit();
  }
}

async function pump() {
  if (activeKey) return;
  const next = downloads.find(d => d.status === 'queued' || d.status === 'downloading');
  if (!next) return;
  activeKey = next.key;
  const d = next;
  d.status = 'downloading';
  persist();
  emit();
  try {
    if (IS_NATIVE) await runNative(d);
    else await runWeb(d);
  } catch (e) {
    if (d.canceled || e?.name === 'AbortError') {
      d.status = 'canceled';
    } else {
      d.status = 'error';
      d.error = e?.message || 'Gagal mengunduh';
    }
    persist();
    emit();
  } finally {
    activeKey = null;
    activeCtrl = null;
pump();
hydrate();
  }
}

function hydrate() {
  if (IS_NATIVE) return;
  (async () => {
    let changed = false;
    for (const d of downloads) {
      if (d.status === 'done' && !d.localUrl) {
        try {
          const blob = await idbGet(d.key);
          if (blob) { d.localUrl = URL.createObjectURL(blob); blobUrls.set(d.key, d.localUrl); changed = true; }
        } catch { void 0; }
      }
    }
    if (changed) emit();
  })();
}

export function startDownload(entry) {
  const existing = find(entry.key);
  if (existing && (existing.status === 'done' || existing.status === 'downloading' || existing.status === 'queued')) return existing;
  const d = {
    key: entry.key,
    animeId: entry.animeId,
    animeTitle: entry.animeTitle,
    poster: entry.poster || '',
    epNumber: entry.epNumber,
    epTitle: entry.epTitle || `Episode ${entry.epNumber}`,
    label: entry.label || 'HD',
    url: entry.url,
    totalSize: existing?.totalSize || 0,
    done: existing?.done || 0,
    status: 'queued',
    error: '',
    downloadedAt: existing?.downloadedAt || Date.now()
  };
  downloads = downloads.filter(x => x.key !== entry.key);
  downloads.push(d);
  persist();
  emit();
  pump();
  return d;
}

export function cancelDownload(key) {
  const d = find(key);
  if (!d) return;
  d.canceled = true;
  if (d.status === 'queued') {
    d.status = 'canceled';
    persist();
    emit();
  }
  if (activeKey === key && activeCtrl) {
    try { activeCtrl.abort(); } catch { void 0; }
  }
}

export async function removeDownload(key) {
  const d = find(key);
  if (!d) return;
  if (d.status === 'downloading' || d.status === 'queued') cancelDownload(key);
  downloads = downloads.filter(x => x.key !== key);
  persist();
  emit();
  try {
    if (IS_NATIVE) {
      await Filesystem.deleteFile({ path: filePath(key), directory: Directory.Documents }).catch(() => null);
    } else {
      await idbDel(key).catch(() => null);
      const u = blobUrls.get(key);
      if (u) { URL.revokeObjectURL(u); blobUrls.delete(key); }
    }
  } catch { void 0; }
}

export function getLocalUrl(key) {
  const d = find(key);
  if (!d || d.status !== 'done') return null;
  return d.localUrl || null;
}

export function totalDownloadedBytes() {
  return downloads.reduce((sum, d) => sum + (d.done || 0), 0);
}

export function fmtBytes(n) {
  if (!n) return '0 MB';
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

pump();
