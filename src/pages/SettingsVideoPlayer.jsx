import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Video, Sun, Volume2, BarChart3, FastForward, VolumeX, Monitor, SlidersHorizontal } from 'lucide-react';
import { getPreference, setPreference } from '../utils/preferences';
import './Settings.css';

const Row = ({ icon: Icon, label, hint, value, onToggle, accent = 'primary' }) => (
  <div className="settings-toggle-row">
    <span
      className="settings-tile-icon"
      style={{
        backgroundColor: `color-mix(in srgb, var(--color-${accent}) 14%, transparent)`,
        color: `var(--color-${accent})`,
        borderColor: `color-mix(in srgb, var(--color-${accent}) 28%, transparent)`,
      }}
    >
      <Icon size={18} strokeWidth={2.2} />
    </span>
    <div className="settings-toggle-row-text">
      <div className="settings-toggle-row-label">{label}</div>
      <div className="settings-toggle-row-hint">{hint}</div>
    </div>
    <button
      type="button"
      className="switch"
      data-on={String(value)}
      onClick={() => onToggle(!value)}
      aria-pressed={value}
      aria-label={`${label} ${value ? 'aktif' : 'nonaktif'}`}
    />
  </div>
);

const SliderSetting = ({ icon: Icon, label, hint, value, onChange, min = 0, max = 100, step = 1, unit = '%', accent = 'primary' }) => {
  return (
    <div className="settings-slider-row">
      <span
        className="settings-tile-icon"
        style={{
          backgroundColor: `color-mix(in srgb, var(--color-${accent}) 14%, transparent)`,
          color: `var(--color-${accent})`,
          borderColor: `color-mix(in srgb, var(--color-${accent}) 28%, transparent)`,
        }}
      >
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <div className="settings-slider-content">
        <div className="settings-slider-header">
          <div className="settings-toggle-row-label">{label}</div>
          <div className="settings-slider-value">{value}{unit}</div>
        </div>
        <div className="settings-toggle-row-hint">{hint}</div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="settings-slider"
          style={{
            '--slider-accent': `var(--color-${accent})`,
          }}
        />
      </div>
    </div>
  );
};

export default function SettingsVideoPlayer() {
  const navigate = useNavigate();
  const [volumeSwipe, setVolumeSwipe] = useState(() => getPreference('volumeSwipe'));
  const [brightnessSwipe, setBrightnessSwipe] = useState(() => getPreference('brightnessSwipe'));
  const [fullscreenProgress, setFullscreenProgress] = useState(() => getPreference('fullscreenProgress'));
  const [autoNext, setAutoNext] = useState(() => getPreference('autoNext'));
  
  // Volume & Brightness settings (0-100%, real-time, persist localStorage)
  const [volumeLevel, setVolumeLevel] = useState(() => getPreference('volumeLevel', 80));
  const [brightnessLevel, setBrightnessLevel] = useState(() => getPreference('brightnessLevel', 100));

  useEffect(() => {
    setPreference('volumeSwipe', volumeSwipe);
  }, [volumeSwipe]);
  useEffect(() => {
    setPreference('brightnessSwipe', brightnessSwipe);
  }, [brightnessSwipe]);
  useEffect(() => {
    setPreference('fullscreenProgress', fullscreenProgress);
  }, [fullscreenProgress]);
  useEffect(() => {
    setPreference('autoNext', autoNext);
  }, [autoNext]);

  // Persist volume & brightness to localStorage
  useEffect(() => {
    setPreference('volumeLevel', volumeLevel);
  }, [volumeLevel]);
  useEffect(() => {
    setPreference('brightnessLevel', brightnessLevel);
  }, [brightnessLevel]);

  return (
    <div className="min-h-screen bg-bg text-text pb-28">
      <header className="settings-header">
        <button type="button" onClick={() => navigate(-1)} className="settings-back-btn" aria-label="Kembali">
          <ArrowLeft size={18} />
        </button>
        <div className="settings-header-title">
          <Video size={16} className="text-primary" />
          <span>Video Player</span>
        </div>
        <span className="settings-header-spacer" aria-hidden />
      </header>

      <main className="settings-main">
        <h2 className="settings-section-label">Kontrol Gestur</h2>
        <div className="settings-sub-section">
          <Row
            icon={Volume2}
            label="Kontrol volume"
            hint="Geser vertikal di sisi kanan video untuk mengatur volume"
            value={volumeSwipe}
            onToggle={setVolumeSwipe}
            accent="amber"
          />
          <Row
            icon={Sun}
            label="Kontrol kecerahan"
            hint="Geser vertikal di sisi kiri video untuk mengatur kecerahan"
            value={brightnessSwipe}
            onToggle={setBrightnessSwipe}
            accent="amber"
          />
        </div>

        <h2 className="settings-section-label">Level Default (0-100%)</h2>
        <div className="settings-sub-section">
          <SliderSetting
            icon={Volume2}
            label="Volume Default"
            hint="Volume awal saat memutar video baru (real-time, tersimpan otomatis)"
            value={volumeLevel}
            onChange={setVolumeLevel}
            min={0}
            max={100}
            step={1}
            unit="%"
            accent="amber"
          />
          <SliderSetting
            icon={Monitor}
            label="Kecerahan Default"
            hint="Kecerahan awal layar video (CSS filter, real-time, tersimpan otomatis)"
            value={brightnessLevel}
            onChange={setBrightnessLevel}
            min={0}
            max={100}
            step={1}
            unit="%"
            accent="amber"
          />
        </div>

        <h2 className="settings-section-label">Tampilan Player</h2>
        <div className="settings-sub-section">
          <Row
            icon={BarChart3}
            label="Indikator progres di bawah (fullscreen)"
            hint="Bar tipis di bagian bawah video saat fullscreen"
            value={fullscreenProgress}
            onToggle={setFullscreenProgress}
          />
        </div>

        <h2 className="settings-section-label">Pemutaran</h2>
        <div className="settings-sub-section">
          <Row
            icon={FastForward}
            label="Auto next episode"
            hint="Lanjutkan otomatis ke episode berikutnya saat video selesai"
            value={autoNext}
            onToggle={setAutoNext}
          />
        </div>
      </main>
    </div>
  );
}