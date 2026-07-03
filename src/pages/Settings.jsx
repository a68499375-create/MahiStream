import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, ChevronRight, ArrowLeft, Video, Bell, Palette, Lock, Activity,
  Trash2, Info, LogOut, Sun, Moon, ShieldCheck,
} from 'lucide-react';
import { getTheme, setTheme, subscribeTheme } from '../utils/themeManager';
import { isKhususUnlocked, lockKhusus, subscribeKhusus } from '../utils/khususAuth';
import { useDialog } from '../components/DialogProvider';
import { APP_VERSION } from '../utils/appVersion';
import './Settings.css';

const SectionLabel = ({ children }) => (
  <h2 className="settings-section-label">{children}</h2>
);

const Tile = ({ icon: Icon, label, hint, accent = 'primary', onClick, to, right, danger }) => {
  const Body = (
    <span className="settings-tile-body">
      <span
        className="settings-tile-icon"
        style={{
          backgroundColor: danger ? 'rgba(239,68,68,0.14)' : `color-mix(in srgb, var(--color-${accent}) 14%, transparent)`,
          color: danger ? '#ef4444' : `var(--color-${accent})`,
          borderColor: danger ? 'rgba(239,68,68,0.3)' : `color-mix(in srgb, var(--color-${accent}) 28%, transparent)`,
        }}
      >
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="settings-tile-text">
        <span className={`settings-tile-label ${danger ? 'settings-tile-label--danger' : ''}`}>{label}</span>
        {hint && <span className="settings-tile-hint">{hint}</span>}
      </span>
      <span className="settings-tile-right">
        {right ?? <ChevronRight size={16} className="text-text-muted" />}
      </span>
    </span>
  );
  if (to) {
    return (
      <Link to={to} className="settings-tile">{Body}</Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="settings-tile">{Body}</button>
  );
};

export default function Settings() {
  const navigate = useNavigate();
  const { confirm, toast } = useDialog();
  const [theme, setThemeState] = useState(() => getTheme());
  const [khususUnlocked, setKhususUnlocked] = useState(() => isKhususUnlocked());

  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mahistream_user');
      if (raw) {
        const u = JSON.parse(raw);
        setUserEmail(u.email || '');
      }
    } catch {}
  }, []);

  const isAdmin = userEmail && userEmail.toLowerCase() === 'sapapenontonbg@gmail.com';

  useEffect(() => subscribeTheme((t) => setThemeState(t)), []);
  useEffect(() => subscribeKhusus((next) => setKhususUnlocked(next)), []);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  const handleKhususToggle = async () => {
    if (khususUnlocked) {
      const ok = await confirm({
        title: 'Kunci konten khusus?',
        message: 'Konten khusus akan disembunyikan kembali. Buka kunci ulang lewat halaman Khusus.',
        okText: 'Kunci',
        tone: 'danger',
      });
      if (ok) {
        lockKhusus();
        setKhususUnlocked(false);
        toast('Konten khusus dikunci', { tone: 'success' });
      }
    } else {
      navigate('/khusus');
    }
  };

  const handleClearCache = async () => {
    const ok = await confirm({
      title: 'Hapus semua cache aplikasi?',
      message: 'Riwayat pencarian, cache home dan data sementara akan dihapus. Pengaturan tidak terhapus.',
      okText: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((k) => {
        if (k.startsWith('mahistream_cache_v1_') || k === 'mahistream_search_history' || k === 'mahistream_search_state_v1') {
          try { localStorage.removeItem(k); } catch {}
        }
      });
      sessionStorage.clear();
      toast('Cache dibersihkan', { tone: 'success' });
    } catch {
      toast('Gagal membersihkan cache', { tone: 'error' });
    }
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Keluar dari akun?',
      message: 'Anda perlu login ulang untuk akses bookmark dan komentar yang tersinkron.',
      okText: 'Keluar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      await GoogleAuth.signOut();
    } catch {}
    try { localStorage.removeItem('mahistream_user'); } catch {}
    toast('Anda berhasil keluar', { tone: 'success' });
    setTimeout(() => navigate('/'), 200);
  };

  return (
    <div className="min-h-screen bg-bg text-text pb-28">
      <header className="settings-header">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="settings-back-btn"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="settings-header-title">
          <SettingsIcon size={16} className="text-primary" />
          <span>Pengaturan</span>
        </div>
        <span className="settings-header-spacer" aria-hidden />
      </header>

      <main className="settings-main">
        <SectionLabel>Preferensi</SectionLabel>
        <div className="settings-group">
          <Tile icon={Video} label="Pengaturan video player" hint="Volume, kecerahan, indikator progres, auto next" to="/settings/video-player" accent="primary" />
          <Tile icon={Bell} label="Pengaturan notifikasi" hint="Aktifkan, getaran, kirim notifikasi tes" to="/settings/notifikasi" accent="primary" />
          <Tile
            icon={theme === 'dark' ? Moon : Sun}
            label="Tampilan"
            hint={theme === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif'}
            accent="primary"
            onClick={handleToggleTheme}
            right={<span className="settings-toggle-pill">{theme === 'dark' ? 'Gelap' : 'Terang'}</span>}
          />
          <Tile
            icon={khususUnlocked ? ShieldCheck : Lock}
            label="Konten khusus"
            hint={khususUnlocked ? 'Akses terbuka' : 'Akses terkunci'}
            accent="primary"
            onClick={handleKhususToggle}
            right={<span className="settings-toggle-pill">{khususUnlocked ? 'Buka' : 'Kunci'}</span>}
          />
        </div>

        <SectionLabel>Daftar Lainnya</SectionLabel>
        <div className="settings-group">
          <Tile icon={Activity} label="Diagnosa jaringan" hint="Cek koneksi backend dan sumber anime" to="/settings/diagnosa" accent="primary" />
          {isAdmin && <Tile icon={Activity} label="Monitoring" hint="Pemantauan realtime server" to="/settings/monitoring" accent="primary" />}
        </div>

        <SectionLabel>Daftar Sistem</SectionLabel>
        <div className="settings-group">
          <Tile icon={Trash2} label="Hapus cache" hint="Bersihkan cache halaman dan pencarian" accent="primary" onClick={handleClearCache} />
          <Tile icon={Info} label="Tentang aplikasi" hint={`MahiStream v${APP_VERSION}`} to="/settings/tentang" accent="primary" />
        </div>

        <p className="settings-version-text">Versi {APP_VERSION}</p>

        <button type="button" onClick={handleLogout} className="settings-logout-btn">
          <LogOut size={16} />
          Keluar
        </button>
      </main>
    </div>
  );
}
