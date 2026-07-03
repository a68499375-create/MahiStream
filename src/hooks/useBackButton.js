import { useEffect, useRef } from 'react';

const HOME_PATH = '/';

// Vite akan menolak build kalau dia bisa mendeteksi import('@capacitor/app')
// statis. Kita rakit string dependency-nya supaya bundler tidak resolve di
// build time — modul ini hanya tersedia di runtime native (Capacitor APK).
const CAP_APP_MOD = ['@capacitor', 'app'].join('/');

export default function useBackButton({ onExitConfirm }) {
  const lastBackAtRef = useRef(0);

  useEffect(() => {
    let listenerHandle = null;
    let cancelled = false;

    const setup = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform?.()) return;
        const mod = await import(/* @vite-ignore */ CAP_APP_MOD);
        const App = mod?.App || mod?.default;
        if (cancelled || !App?.addListener) return;

        listenerHandle = await App.addListener('backButton', () => {
          const now = Date.now();
          const last = lastBackAtRef.current;
          const dt = now - last;
          lastBackAtRef.current = now;

          const path = window.location.pathname;
          const isHome = path === HOME_PATH || path === '';

          if (isHome) {
            onExitConfirm?.();
            return;
          }

          if (dt < 600) {
            window.location.replace('/');
            return;
          }

          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.replace('/');
          }
        });
      } catch (_e) { /* not native or plugin missing */ }
    };

    setup();

    return () => {
      cancelled = true;
      try { listenerHandle?.remove?.(); } catch {}
    };
  }, [onExitConfirm]);
}
