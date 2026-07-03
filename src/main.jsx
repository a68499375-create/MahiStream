import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import installAdblock from './utils/adblock.js';
import { prefetchHome, prefetchSchedule, prefetchBrowse } from './services/api';
import { startNotifyPolling } from './services/notifyManager';
import { initTheme } from './utils/themeManager';

// Aplikasikan theme tersimpan SEBELUM React mount supaya tidak ada flicker
// putih saat user pakai mode gelap.
initTheme();

// Blokir total iklan (popunder, suntikan script, elemen iklan) sedini mungkin.
// Sengaja diluar React tree supaya jalan sebelum app mount.
installAdblock();

// Kick off prefetch sebelum React mount: home untuk first paint, schedule &
// browse supaya navigasi ke tab tetangga feel instant. Async fire-and-forget,
// hasilnya nyangkut di cache (memory + localStorage) sebelum komponennya mount.
prefetchHome();
prefetchSchedule();
prefetchBrowse();

// Mulai polling notifikasi rilis baru. Internal-nya menunggu 30 detik
// setelah call agar tidak menabrak first-paint, kemudian polling tiap 5 menit.
startNotifyPolling();

// Hapus StrictMode di production untuk hindari double-mount/double-fetch yang
// bikin loading kelihatan dua kali lipat di home page (efek samping React 19
// di mode dev). Lebih cepat first-paint, sama amannya.
createRoot(document.getElementById('root')).render(<App />);
