import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Bell, Vibrate, Send } from 'lucide-react';
import { getPreference, setPreference } from '../utils/preferences';
import { useDialog } from '../components/DialogProvider';
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

export default function SettingsNotifikasi() {
  const navigate = useNavigate();
  const { toast } = useDialog();
  const [notifEnabled, setNotifEnabled] = useState(() => getPreference('notifEnabled'));
  const [notifVibrate, setNotifVibrate] = useState(() => getPreference('notifVibrate'));
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPreference('notifEnabled', notifEnabled); }, [notifEnabled]);
  useEffect(() => { setPreference('notifVibrate', notifVibrate); }, [notifVibrate]);

  const handleTest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform?.()) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          const req = await LocalNotifications.requestPermissions();
          if (req.display !== 'granted') {
            toast('Izin notifikasi ditolak', { tone: 'error' });
            return;
          }
        }
        try {
          await LocalNotifications.createChannel({
            id: 'mahistream-test',
            name: 'MahiStream Test',
            description: 'Saluran notifikasi tes',
            importance: 4,
            visibility: 1,
            vibration: notifVibrate,
            lights: true,
          });
        } catch {}
        await LocalNotifications.schedule({
          notifications: [{
            id: 999001,
            title: 'MahiStream',
            body: 'Notifikasi berhasil terkirim.',
            channelId: 'mahistream-test',
            smallIcon: 'ic_stat_icon_config_sample',
          }],
        });
        toast('Notifikasi tes dikirim', { tone: 'success' });
      } else if ('Notification' in window) {
        if (Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') {
            toast('Izin notifikasi ditolak', { tone: 'error' });
            return;
          }
        }
        new Notification('MahiStream', { body: 'Notifikasi berhasil terkirim.' });
        toast('Notifikasi tes dikirim', { tone: 'success' });
      } else {
        toast('Perangkat tidak mendukung notifikasi', { tone: 'error' });
      }
    } catch (e) {
      console.warn('test notif failed', e);
      toast('Gagal mengirim notifikasi', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text pb-28">
      <header className="settings-header">
        <button type="button" onClick={() => navigate(-1)} className="settings-back-btn" aria-label="Kembali">
          <ArrowLeft size={18} />
        </button>
        <div className="settings-header-title">
          <Bell size={16} className="text-primary" />
          <span>Notifikasi</span>
        </div>
        <span className="settings-header-spacer" aria-hidden />
      </header>

      <main className="settings-main">
        <h2 className="settings-section-label">Notifikasi</h2>
        <div className="settings-sub-section">
          <Row
            icon={Bell}
            label="Aktifkan notifikasi"
            hint="Terima pemberitahuan rilis episode baru dan unduhan"
            value={notifEnabled}
            onToggle={setNotifEnabled}
          />
          <Row
            icon={Vibrate}
            label="Getaran"
            hint="Getarkan perangkat saat notifikasi muncul"
            value={notifVibrate}
            onToggle={setNotifVibrate}
          />
        </div>

        <div className="mt-5">
          <button
            type="button"
            className="settings-action-btn"
            onClick={handleTest}
            disabled={busy}
            style={{ opacity: busy ? 0.7 : 1 }}
          >
            <Send size={15} />
            {busy ? 'Mengirim…' : 'Test kirim notifikasi'}
          </button>
        </div>
      </main>
    </div>
  );
}
