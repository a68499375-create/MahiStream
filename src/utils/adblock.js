// Adblock TOTAL sisi klien.
// Memblokir popunder/popup, redirect paksa, suntikan <script>/<iframe> dari
// domain iklan, fetch/XHR/sendBeacon ke domain iklan, navigasi top.location
// ke iklan, dan elemen iklan yang muncul belakangan. Juga inject CSS untuk
// menyembunyikan container iklan umum sebelum DOM ready supaya FOUC iklan
// tidak sempat tampak. Dipanggil sekali saat app start (sebelum React mount).

const AD_DOMAINS = [
  // Tier 1: jaringan iklan utama / paling sering muncul
  'googlesyndication', 'doubleclick', 'googleadservices', 'adservice',
  'adsense', 'g.doubleclick', 'pagead2', 'pagead', 'adsbygoogle',
  'googletagservices', 'googletagmanager', 'google-analytics',
  // Adult / popunder networks (banyak dipakai sumber anime/hentai)
  'adnxs', 'adsrv', 'adsterra', 'exoclick', 'juicyads', 'trafficjunky',
  'propellerads', 'propu', 'propellertrack', 'hilltopads', 'hilltop',
  'clickadu', 'clickaine', 'clickadilla',
  'richpush', 'pushnami', 'pushwoosh', 'pushhouse', 'pushground',
  // Native ads / clickbait
  'mgid.com', 'mgid', 'taboola', 'outbrain', 'revcontent', 'plugrush',
  'adskeeper', 'galaksion', 'tsyndicate', 'trafficstars', 'admaven',
  'admoove', 'adsupply', 'evadav', 'mobpartner', 'admixer',
  // Popunder / popcash
  'popads', 'popcash', 'popunder', 'bidvertiser', 'adcash', 'monetag',
  'onclickads', 'onclkds', 'a-ads', 'highperformanceformat', 'profitabledisplaynetwork',
  'cdn-aws.ad.gt', 'megapu', 'megapush', 'topcreativeformat',
  // Crypto miner / tracker
  'coinhive', 'crypto-loot', 'cointraffic', 'webminepool', 'coinimp',
  // Stats / fingerprint
  'histats', 'statcounter', 'yandex.ru/metrika', 'mc.yandex',
  // Misc
  'mediavine', 'bontrilou', 'yllix', 'adblade', 'partypoker', 'betway', '1xbet',
  // URL shortener iklan-heavy (hindari klik tidak sengaja)
  'shrinkme.io', 'ouo.io', 'shorte.st', 'adfly', 'adf.ly', 'linkbucks', 'adyou.me',
  // Nekopoi-specific iklan/popup hosts (diobservasi dari traffic) — list
  // diperluas untuk blokir total iklan saat user buka anime dari Nekopoi.
  'ofcgcdcvk.com', 'tsyndicate.com', 'rygnk.com', 'fapality',
  'tigerc.click', 'tigerc', 'omeoyqq', 'mctracking', 'go.bestadbid',
  'pushinpay', 'cpamatica', 'gotrackier', 'p9k.com', 'p7k.com',
  // Domain affiliate / popunder yang sering muncul dari iframe Nekopoi
  // (streamruby, streampoi, vidnest, playmogo embed ad-loaders)
  'pussysaga', 'sexgangsters', 'lifeselector', 'liveselector',
  'fapcat', 'porngate', 'pornhub-cdn', 'hentaipornsex',
  'redirect-tracker', 'click-tracker', 'campaign-tracker',
  'ad-maven', 'admaven', 'ad-spend', 'ad-deal',
  'plug-rush', 'plugrush', 'twinrdsperf', 'twinrdsync',
  'cdnsva.com', 'cdnsva', 'sva-cdn', 'svaad',
  'fapsterr', 'pornpass', 'sexpaytv', 'streamtape-ads',
  'ad-pop-up', 'ad-popup', 'inpage-push', 'inpagepush',
  // User-reported affiliate / gambling popups
  'stake.com', 'stake.bet', 'stake.partners', 'staked.com',
  'v2006.com', 'v2006', 'v2006.bet', 'v2006.partners',
];

const AD_PATH_PATTERNS = [
  /\/ads?[\.\-_/]/i,
  /\/popunder/i,
  /\/popup/i,
  /\/banner/i,
  /\/sponsor/i,
  /pagead/i,
  /\/iklan/i,
  /\/adframe/i,
];

const isAdUrl = (url = '') => {
  const u = String(url || '').toLowerCase();
  if (!u || u === 'about:blank') return false;
  if (AD_DOMAINS.some((d) => u.includes(d))) return true;
  if (AD_PATH_PATTERNS.some((re) => re.test(u))) return true;
  return false;
};

// Domain MahiStream/streaming yg whitelist supaya tidak ke-blokir false-positive.
const SAFE_DOMAINS = [
  '103.67.244.19', 'nip.io', 'kuramanime', 'otakudesu', 'nekopoi',
  'pixeldrain', 'mp4upload', 'krakenfiles', 'gofile', 'r2.nyomo', 'iino.my',
  'playmogo', 'streampoi', 'streamtape', 'vidnest', 'kdrive', 'komari', 'asuna',
  'kitasan', 'chisato', 'huntersekai', 'pdrain', 'filedon',
  'horikita', 'horikita.my.id', 'amiya', 'amiya.my.id', 'kuramadrive',
  'jikan.moe', 'placehold.co', 'localhost', '127.0.0.1',
  'capacitor', 'capacitorjs',
];
const isSafeUrl = (url = '') => {
  const u = String(url || '').toLowerCase();
  return SAFE_DOMAINS.some((d) => u.includes(d));
};

// Cek apakah url terlihat sebagai target popup eksternal yang harus
// di-blokir di host Nekopoi (klik tidak sengaja ke iklan/affiliate).
const isExternalPopupTarget = (url = '') => {
  const u = String(url || '').toLowerCase();
  if (!u) return true;
  if (u.startsWith('blob:') || u.startsWith('data:')) return false;
  if (u.startsWith('javascript:')) return true;
  if (isSafeUrl(u)) return false;
  return true;
};

let installed = false;

const injectCss = () => {
  const style = document.createElement('style');
  style.textContent = `
    ins.adsbygoogle,
    iframe[id^="google_ads_"],
    iframe[id^="aswift_"],
    iframe[name^="google_ads_iframe"],
    iframe[src*="googlesyndication"],
    iframe[src*="doubleclick"],
    iframe[src*="adsterra"],
    iframe[src*="propellerads"],
    iframe[src*="exoclick"],
    iframe[src*="juicyads"],
    iframe[src*="popads"],
    iframe[src*="popunder"],
    iframe[src*="onclickads"],
    iframe[src*="taboola"],
    iframe[src*="outbrain"],
    iframe[src*="mgid"],
    iframe[src*="a-ads"],
    iframe[src*="tsyndicate"],
    iframe[src*="ofcgcdcvk"],
    iframe[src*="rygnk"],
    iframe[src*="tigerc"],
    div[id^="aswift_"],
    div[id^="google_ads_"],
    div[id*="banner-ad"],
    div[id*="ad-banner"],
    div[class*="adsbox"],
    div[class*="ad-banner"],
    div[class*="banner-ad"],
    div[class*="iklan"],
    div[id*="iklan"],
    a[href*="popads"],
    a[href*="adsterra"],
    a[href*="ouo.io/"][rel*="sponsored"],
    a[href*="tsyndicate"],
    a[href*="ofcgcdcvk"],
    a[href*="rygnk"],
    a[href*="tigerc"],
    a[target="_blank"][href*="tsyndicate"],
    a[target="_blank"][href*="ofcgcdcvk"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      max-width: 0 !important;
      max-height: 0 !important;
      position: absolute !important;
      left: -9999px !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
};

export default function installAdblock() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  injectCss();

  // 1. Blokir popunder/popup. Hanya izinkan window.open ke URL aplikasi sendiri
  //    (mis. tombol download manual ke domain stream/pixeldrain).
  const realOpen = window.open ? window.open.bind(window) : null;
  window.open = function (url, ...rest) {
    if (!url || url === 'about:blank' || url === '') return null;
    if (isAdUrl(url)) return null;
    if (isExternalPopupTarget(url)) return null;
    return realOpen ? realOpen(url, ...rest) : null;
  };

  // 2. Cegah suntikan <script>/<iframe>/<img> dari domain iklan.
  const realCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName, options) {
    const el = realCreateElement(tagName, options);
    const tag = String(tagName).toLowerCase();
    if (tag === 'script' || tag === 'iframe' || tag === 'img' || tag === 'link') {
      const guard = (value) => !isAdUrl(value);
      const realSetAttr = el.setAttribute.bind(el);
      el.setAttribute = function (name, value) {
        const lname = String(name || '').toLowerCase();
        if ((lname === 'src' || lname === 'href' || lname === 'data-src') && !guard(value)) return;
        return realSetAttr(name, value);
      };
      try {
        Object.defineProperty(el, 'src', {
          configurable: true,
          get() { return el.getAttribute('src') || ''; },
          set(value) { if (guard(value)) realSetAttr('src', value); },
        });
      } catch (e) { /* sebagian browser tidak izinkan redefine */ }
    }
    return el;
  };

  // 3. Blokir fetch ke domain iklan.
  if (typeof window.fetch === 'function') {
    const realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isAdUrl(url) && !isSafeUrl(url)) {
        return Promise.reject(new Error('Blocked ad request'));
      }
      return realFetch(input, init);
    };
  }

  // 4. Blokir XMLHttpRequest ke domain iklan.
  if (typeof window.XMLHttpRequest === 'function') {
    const RealXhr = window.XMLHttpRequest;
    const realOpenXhr = RealXhr.prototype.open;
    RealXhr.prototype.open = function (method, url, ...rest) {
      if (isAdUrl(url) && !isSafeUrl(url)) {
        return realOpenXhr.call(this, method, 'about:blank', ...rest);
      }
      return realOpenXhr.call(this, method, url, ...rest);
    };
  }

  // 5. Blokir navigator.sendBeacon (banyak dipakai untuk tracking pixel).
  if (navigator && typeof navigator.sendBeacon === 'function') {
    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isAdUrl(url) && !isSafeUrl(url)) return true;
      return realBeacon(url, data);
    };
  }

  // 6. Blokir top.location override yang dipakai popunder script.
  try {
    const realLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: false,
      get() { return realLocation; },
      set(value) {
        if (isAdUrl(String(value)) && !isSafeUrl(String(value))) {
          console.log('[adblock] blocked top.location =', value);
          return;
        }
        realLocation.href = String(value);
      },
    });
  } catch (_e) { /* sebagian browser proteksi window.location */ }

  // 6b. Intercept click pada anchor target=_blank ke domain eksternal —
  //     popunder Nekopoi sering disuntik sebagai overlay anchor fullscreen.
  document.addEventListener('click', (e) => {
    try {
      const a = e.target?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href) return;
      if (isAdUrl(href)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const target = (a.getAttribute('target') || '').toLowerCase();
      if (target === '_blank' && isExternalPopupTarget(href)) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch {}
  }, true);

  // 7. Buang elemen iklan yang sudah/akan muncul di DOM.
  const AD_SELECTORS = [
    'iframe[src*="ads"]', 'iframe[src*="pop"]', 'iframe[src*="banner"]',
    'iframe[id^="google_ads_"]', 'iframe[id^="aswift_"]',
    'iframe[name^="google_ads_iframe"]',
    'iframe[src*="tsyndicate"]', 'iframe[src*="ofcgcdcvk"]',
    'iframe[src*="rygnk"]', 'iframe[src*="tigerc"]',
    'ins.adsbygoogle',
    'div[id^="aswift_"]', 'div[id^="google_ads_"]',
    'div[id*="banner-ad"]', 'div[id*="ad-banner"]',
    'div[class*="adsbox"]', 'div[class*="ad-banner"]', 'div[class*="banner-ad"]',
    'div[class*="iklan"]', 'div[id*="iklan"]',
    'a[href*="popads"]', 'a[href*="adsterra"]',
    'a[href*="tsyndicate"]', 'a[href*="ofcgcdcvk"]',
    'a[href*="rygnk"]', 'a[href*="tigerc"]',
  ];

  const sweep = (root) => {
    if (!root || !root.querySelectorAll) return;
    AD_SELECTORS.forEach((sel) => {
      try {
        root.querySelectorAll(sel).forEach((node) => {
          try { node.remove(); } catch (_e) { /* noop */ }
        });
      } catch (_e) { /* selector invalid di host tertentu */ }
    });
    try {
      root.querySelectorAll('script[src], iframe[src], img[src]').forEach((node) => {
        const src = node.getAttribute('src');
        if (isAdUrl(src) && !isSafeUrl(src)) {
          try { node.remove(); } catch (_e) {}
        }
      });
    } catch (_e) {}
  };

  const startObserver = () => {
    sweep(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes && m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const src = node.getAttribute && node.getAttribute('src');
          if (src && isAdUrl(src) && !isSafeUrl(src)) {
            try { node.remove(); } catch (_e) {}
            return;
          }
          sweep(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);
}
