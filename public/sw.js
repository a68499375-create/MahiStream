const CACHE = 'mahistream-v6';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Let browser natively handle media streaming requests
  if (url.pathname.startsWith('/api/gdrive/') || url.pathname.startsWith('/api/telegram/') || url.pathname.startsWith('/videos/') || url.pathname.startsWith('/tg-stream/')) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  const isNav = e.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';
  if (isNav) {
    e.respondWith(fetch(e.request).then((resp) => {
      const clone = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request).then((c) => c || caches.match('/index.html'))));
    return;
  }

  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request).then((resp) => {
    if (resp.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'))) {
      const clone = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
    }
    return resp;
  }).catch(() => caches.match('/index.html'))));
});
