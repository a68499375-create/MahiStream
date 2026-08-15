import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/client';
import './TopBar.css';

export default function MaintenanceGate({ children }) {
  const [active, setActive] = useState(false);
  const [checking, setChecking] = useState(true);
  const [config, setConfig] = useState(null);
  const location = useLocation();

  const isAdminPath = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-panel');

  const checkMaintenance = useCallback(async () => {
    try {
      const res = await fetch('/maintenance.json');
      if (res.ok) {
        const d = await res.json();
        setActive(d.active === true);
        if (d.message) setConfig(prev => ({ ...prev, maintenanceMessage: d.message }));
        setChecking(false);
        return;
      }
    } catch {}
    try {
      const d = await api('/config');
      setConfig(d);
      setActive(d?.maintenance === true);
    } catch (e) {
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 10000);

    const onMaintenance = (e) => {
      const isMaint = e.detail?.error === 'maintenance' || e.detail?.maintenance === true;
      if (isMaint) {
        setActive(true);
        if (e.detail?.message) setConfig(prev => ({ ...prev, maintenanceMessage: e.detail.message }));
      } else if (e.detail?.maintenance === false) {
        setActive(false);
      }
    };

    window.addEventListener('mahi:maintenance', onMaintenance);
    window.addEventListener('focus', checkMaintenance);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mahi:maintenance', onMaintenance);
      window.removeEventListener('focus', checkMaintenance);
    };
  }, [checkMaintenance]);

  if (checking || !active || isAdminPath) return children;

  const message = config?.maintenanceMessage || config?.maintenance_message ||
    'MahiStream sedang dalam pemeliharaan untuk meningkatkan pengalaman menonton kamu. Kami akan kembali secepatnya!';

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-canvas px-6 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[100px] maintenance-pulse" />
          <div className="absolute bottom-10 right-10 h-56 w-56 rounded-full bg-caramel/10 blur-[80px] maintenance-pulse-2" />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-6 flex items-center gap-3">
            <span className="text-3xl font-extrabold tracking-tight">
              <span className="logo-main">Mahi</span>
              <span className="logo-accent">Stream</span>
            </span>
          </div>

          <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>

          <h1 className="mb-3 text-2xl font-extrabold text-ink sm:text-3xl">Sedang Dalam Perbaikan</h1>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-muted">{message}</p>

          <p className="text-xs font-semibold uppercase tracking-widest text-muted2">Kami akan segera kembali</p>

          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted2">
            v2.1.0 · MahiStream · © {new Date().getFullYear()}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes maintenancePulse {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes maintenancePulse2 {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        .maintenance-pulse { animation: maintenancePulse 5s ease-in-out infinite; }
        .maintenance-pulse-2 { animation: maintenancePulse2 6s ease-in-out infinite; }
      `}</style>
    </>
  );
}
