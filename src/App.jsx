import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';
import Layout from './components/Layout';
import DownloadProgressOverlay from './components/DownloadProgressOverlay';
import { DialogProvider } from './components/DialogProvider';
import ExitConfirmGate from './components/ExitConfirmGate';

// Home + Profile di-import langsung (bukan lazy) karena dua page paling
// sering diakses dari BottomNav. Lazy-load page lain supaya bundle awal
// tetap kecil tapi navigasi ke tab utama instant tanpa fallback spinner.
import Home from './pages/Home';
import Profile from './pages/Profile';
const Browse = lazy(() => import('./pages/Browse'));
const Search = lazy(() => import('./pages/Search'));
const VideoPlayer = lazy(() => import('./pages/VideoPlayer'));
const Login = lazy(() => import('./pages/Login'));
const Bookmark = lazy(() => import('./pages/Bookmark'));
const History = lazy(() => import('./pages/History'));
const Hentai = lazy(() => import('./pages/Hentai'));
const Jadwal = lazy(() => import('./pages/Jadwal'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Settings = lazy(() => import('./pages/Settings'));
const SettingsVideoPlayer = lazy(() => import('./pages/SettingsVideoPlayer'));
const SettingsNotifikasi = lazy(() => import('./pages/SettingsNotifikasi'));
const SettingsDiagnosa = lazy(() => import('./pages/SettingsDiagnosa'));
const SettingsTentang = lazy(() => import('./pages/SettingsTentang'));
const Monitoring = lazy(() => import('./pages/Monitoring'));

// Fallback ringan supaya tidak ada layar putih yang lama saat lazy chunk loading.
const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-bg">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  useEffect(() => {
    // Prefetch home/schedule/browse sudah dipanggil di main.jsx sebelum React
    // mount, jadi cache (memory + localStorage) sudah hangat saat komponen
    // pertama render. Tidak perlu fire ulang di sini.

    // Sembunyikan splash secepat mungkin: requestAnimationFrame menunggu
    // sampai React render frame pertama, jadi user tidak lihat layar putih
    // ataupun splash terlalu lama.
    const hideSplash = async () => {
      try {
        await SplashScreen.hide();
      } catch (_e) {
        /* ignore */
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(hideSplash);
    });

    // GoogleAuth diinisialisasi di latar belakang setelah app render -
    // tidak diblok di main.jsx supaya first paint tidak menunggu plugin native.
    const initGoogleAuth = async () => {
      try {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        await GoogleAuth.initialize({
          clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '632438660940-tcvha04g67vg492qlr8f1jiufg6vmj5k.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
      } catch (_e) {
        /* ignore - non-critical */
      }
    };
    // delay supaya tidak menabrak frame pertama
    const t = setTimeout(initGoogleAuth, 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <BrowserRouter>
      <DialogProvider>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/video/*" element={<VideoPlayer />} />

            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/search" element={<Search />} />
              <Route path="/khusus" element={<Hentai />} />
              <Route path="/jadwal" element={<Jadwal />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/video-player" element={<SettingsVideoPlayer />} />
              <Route path="/settings/notifikasi" element={<SettingsNotifikasi />} />
              <Route path="/settings/diagnosa" element={<SettingsDiagnosa />} />
              <Route path="/settings/tentang" element={<SettingsTentang />} />
              <Route path="/settings/monitoring" element={<Monitoring />} />
              <Route path="/bookmark" element={<Bookmark />} />
              <Route path="/history" element={<History />} />
              <Route path="/inbox" element={<Inbox />} />
            </Route>
          </Routes>
        </Suspense>
        <DownloadProgressOverlay />
        <ExitConfirmGate />
      </DialogProvider>
    </BrowserRouter>
  );
}

export default App;
