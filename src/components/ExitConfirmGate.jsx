import { useState, useCallback, useEffect } from 'react';
import { LogOut, X } from 'lucide-react';
import useBackButton from '../hooks/useBackButton';

// Hindari resolusi statis: @capacitor/app baru tersedia di build APK,
// tidak ada di node_modules saat dev.
const CAP_APP_MOD = ['@capacitor', 'app'].join('/');

export default function ExitConfirmGate() {
  const [showExit, setShowExit] = useState(false);

  const handleExitConfirm = useCallback(() => {
    setShowExit(true);
  }, []);

  useBackButton({ onExitConfirm: handleExitConfirm });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setShowExit(false); };
    if (showExit) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showExit]);

  if (!showExit) return null;

  const handleExit = async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform?.()) {
        const mod = await import(/* @vite-ignore */ CAP_APP_MOD);
        const App = mod?.App || mod?.default;
        await App?.exitApp?.();
        return;
      }
    } catch {}
    setShowExit(false);
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in"
      onClick={() => setShowExit(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface text-text border border-border rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-6 pb-3 flex items-start gap-3">
          <span className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <LogOut size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-black text-text leading-snug">Keluar Aplikasi</h3>
            <p className="text-[13px] text-text-secondary font-medium leading-relaxed mt-1.5">
              Apakah anda yakin ingin keluar sekarang?
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowExit(false)}
            className="p-1.5 rounded-full hover:bg-surface-highlight text-text-muted hover:text-text transition"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={() => setShowExit(false)}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-surface-highlight hover:bg-border text-text font-bold text-[13px] transition active:scale-[0.97]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleExit}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-primary hover:bg-primary-dark text-white font-bold text-[13px] transition active:scale-[0.97]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
