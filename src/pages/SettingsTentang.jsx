import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Sparkles, Heart } from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '../utils/appVersion';
import './Settings.css';

export default function SettingsTentang() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg text-text pb-28">
      <header className="settings-header">
        <button type="button" onClick={() => navigate(-1)} className="settings-back-btn" aria-label="Kembali">
          <ArrowLeft size={18} />
        </button>
        <div className="settings-header-title">
          <Info size={16} className="text-primary" />
          <span>Tentang Aplikasi</span>
        </div>
        <span className="settings-header-spacer" aria-hidden />
      </header>

      <main className="settings-main">
        <div className="settings-sub-section" style={{ padding: '24px 18px', textAlign: 'center' }}>
          <div
            className="mx-auto mb-3 rounded-3xl flex items-center justify-center"
            style={{
              width: 78,
              height: 78,
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              color: '#fff',
            }}
          >
            <Sparkles size={34} strokeWidth={2.2} />
          </div>
          <div className="text-[20px] font-black text-text">MahiStream</div>
          <div className="text-[12px] text-text-secondary font-bold mt-1">
            Versi {APP_VERSION} · Build {APP_BUILD_DATE}
          </div>
          <p className="text-[13px] text-text-secondary font-medium leading-relaxed mt-4">
            Streaming anime sub Indonesia dengan akses ke beragam sumber.
            Dibuat dengan semangat dari komunitas, untuk komunitas.
          </p>
        </div>

        <h2 className="settings-section-label">Kontributor</h2>
        <div className="settings-sub-section" style={{ padding: '14px 18px' }}>
          <div className="text-[13px] text-text-secondary font-medium leading-relaxed">
            Terima kasih untuk semua kontribusi, masukan dan laporan bug dari
            pengguna yang membuat MahiStream terus tumbuh.
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-primary">
            <Heart size={12} className="fill-current" /> Dibuat dengan cinta untuk para wibu.
          </div>
        </div>
      </main>
    </div>
  );
}
