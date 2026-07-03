import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogIn, Edit3, Camera, Settings as SettingsIcon, Mail, User, X, Bell, Heart, Clock, ImagePlus, Save,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL, getCurrentUserId, fetchHistory } from '../services/api';
import { useDialog } from '../components/DialogProvider';
import './Profile.css';

const readUser = () => {
  try { return JSON.parse(localStorage.getItem('mahistream_user') || 'null'); } catch { return null; }
};

const ASSUMED_EPISODE_DURATION = 24 * 60; // 24 menit/episode untuk fallback

const formatWatchTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 menit';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  if (hours < 24) return restMin === 0 ? `${hours} jam` : `${hours} jam ${restMin}m`;
  const days = Math.floor(hours / 24);
  const restHr = hours % 24;
  return restHr === 0 ? `${days} hari` : `${days} hari ${restHr}j`;
};

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useDialog();
  const [user, setUser] = useState(readUser);
  const [stats, setStats] = useState({ history: 0, bookmark: 0, watchedSeconds: 0 });
  const [bannerUrl, setBannerUrl] = useState(() => readUser()?.background_url || '');
  const [bio, setBio] = useState(() => readUser()?.bio || '');
  const [showEdit, setShowEdit] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPicture, setEditPicture] = useState('');
  const [editBanner, setEditBanner] = useState('');
  const [editBio, setEditBio] = useState('');
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const [imagePreview, setImagePreview] = useState({ avatar: null, banner: null });

  // Hitung jumlah bookmark dari localStorage (instant).
  useEffect(() => {
    try {
      const userId = getCurrentUserId();
      const u1 = JSON.parse(localStorage.getItem(`mahistream_bookmarks_umum_${userId}`) || '[]');
      const u2 = JSON.parse(localStorage.getItem(`mahistream_bookmarks_khusus_${userId}`) || '[]');
      const local = (Array.isArray(u1) ? u1.length : 0) + (Array.isArray(u2) ? u2.length : 0);
      setStats((p) => ({ ...p, bookmark: local }));
    } catch {}
  }, []);

  // Fetch history dari backend untuk akurasi waktu tonton.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = getCurrentUserId();
        // Profile aggregate endpoint sudah ada di backend, prioritaskan ini
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${API_BASE_URL}/profile/me?userId=${encodeURIComponent(userId)}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok && !cancelled) {
          const json = await res.json();
          const d = json?.data || {};
          if (d.user?.background_url) setBannerUrl(d.user.background_url);
          if (typeof d.user?.bio === 'string') setBio(d.user.bio);
          setStats((p) => ({
            ...p,
            history: d.counts?.history ?? p.history,
            bookmark: d.counts?.bookmark ?? p.bookmark,
            watchedSeconds: Number(d.totalWatchedSeconds) || p.watchedSeconds,
          }));
        }
        // Fallback / koreksi: hitung dari history list sendiri. Logika:
        // - Kalau row punya progress_seconds valid, pakai itu (di-cap ke
        //   duration_seconds bila tersedia, supaya seek tidak menggembungkan
        //   total — pengaman dari progress yang melebihi durasi).
        // - Kalau progress 0 atau hilang, abaikan (anggap belum tonton).
        //   Sebelumnya kita auto-add ASSUMED_EPISODE_DURATION yang membuat
        //   user yang membuka detail anime tanpa nonton tetap kehitung 24m.
        try {
          const list = await fetchHistory(userId);
          if (Array.isArray(list) && !cancelled) {
            let total = 0;
            list.forEach((h) => {
              const s = Number(h.progress_seconds);
              const dur = Number(h.duration_seconds);
              if (Number.isFinite(s) && s > 0) {
                const capped = Number.isFinite(dur) && dur > 0 ? Math.min(s, dur) : s;
                total += Math.max(0, capped);
              }
            });
            setStats((p) => ({
              ...p,
              history: list.length,
              // Prefer angka backend; FE hanya pakai bila backend belum
              // mengembalikan total (mis. endpoint legacy).
              watchedSeconds: p.watchedSeconds > 0 ? p.watchedSeconds : total,
            }));
          }
        } catch {}
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (showEdit) {
      const u = readUser();
      setEditName(u?.name || '');
      setEditPicture(u?.picture || '');
      setEditBanner(bannerUrl || '');
      setEditBio(bio || '');
    }
  }, [showEdit, bannerUrl, bio]);

  const processImage = async (file, maxDim, quality = 0.85) => {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) {
      toast('Foto maksimal 10MB', { tone: 'error' });
      return null;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
    const ratio = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
    const w = Math.max(1, Math.round((img.width || maxDim) * ratio));
    const h = Math.max(1, Math.round((img.height || maxDim) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality) || dataUrl;
  };

  // Native picker pakai Camera plugin dari Capacitor — fallback ke <input file>
  // jika gagal/tidak tersedia. Tujuan: tombol upload PP/banner berfungsi di HP
  // (WebView Capacitor kadang tidak memicu file picker sistem).
  const pickImage = async (kind /* 'avatar' | 'banner' */) => {
    const maxDim = kind === 'banner' ? 1280 : 512;
    const quality = kind === 'banner' ? 0.82 : 0.85;
    try {
      if (Capacitor.isNativePlatform?.()) {
        try {
          // String dipecah supaya Vite tidak coba resolve modul saat build
          // web — @capacitor/camera hanya ada di build APK.
          const CAM_MOD = ['@capacitor', 'camera'].join('/');
          const mod = await import(/* @vite-ignore */ CAM_MOD);
          const { Camera, CameraResultType, CameraSource } = mod;
          
          // Minta izin kamera/galeri
          const permissions = await Camera.checkPermissions();
          if (permissions.camera === 'prompt' || permissions.photos === 'prompt') {
            const requested = await Camera.requestPermissions();
            if (requested.camera === 'denied' || requested.photos === 'denied') {
              toast('Izin kamera/galeri diperlukan untuk memilih foto', { tone: 'error' });
              return;
            }
          }
          
          const photo = await Camera.getPhoto({
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Photos,
            quality: 90,
            allowEditing: false,
          });
          if (photo?.dataUrl) {
            const img = new Image();
            img.src = photo.dataUrl;
            await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
            const ratio = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
            const w = Math.max(1, Math.round((img.width || maxDim) * ratio));
            const h = Math.max(1, Math.round((img.height || maxDim) * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const finalUrl = canvas.toDataURL('image/jpeg', quality);
            if (kind === 'banner') {
              setEditBanner(finalUrl);
              setImagePreview(prev => ({ ...prev, banner: finalUrl }));
            } else {
              setEditPicture(finalUrl);
              setImagePreview(prev => ({ ...prev, avatar: finalUrl }));
            }
            toast('Foto dipilih', { tone: 'success' });
            return;
          }
        } catch (e) {
          if (e && /cancel/i.test(String(e?.message || ''))) return;
        }
      }
    } catch {}
    // Fallback: native input file (web atau plugin tidak ada)
    if (kind === 'banner') bannerInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await processImage(file, 512, 0.85);
      if (compressed) setEditPicture(compressed);
    } catch {
      toast('Gagal memproses foto', { tone: 'error' });
    }
  };

  const handleBannerChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await processImage(file, 1280, 0.82);
      if (compressed) setEditBanner(compressed);
    } catch {
      toast('Gagal memproses banner', { tone: 'error' });
    }
  };

  const handleSaveProfile = async () => {
    const nextLocal = {
      ...(user || {}),
      name: (editName || '').trim() || (user?.name || 'Pengguna'),
      picture: editPicture || user?.picture || '',
      email: user?.email || '',
      background_url: editBanner || '',
      bio: (editBio || '').trim() || '',
    };
    try {
      localStorage.setItem('mahistream_user', JSON.stringify(nextLocal));
    } catch {
      toast('Foto/banner terlalu besar, kecilkan dulu', { tone: 'error' });
      return;
    }
    setUser(nextLocal);
    setBannerUrl(nextLocal.background_url);
    setBio(nextLocal.bio);
    setShowEdit(false);
    setImagePreview({ avatar: null, banner: null });
    toast('Profil tersimpan', { tone: 'success' });

    // Sync ke backend (best-effort, tidak menahan UI).
    try {
      const userId = getCurrentUserId();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      await fetch(`${API_BASE_URL}/profile/update`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: nextLocal.name,
          bio: nextLocal.bio,
          picture: nextLocal.picture,
          background_url: nextLocal.background_url,
        }),
      });
      clearTimeout(t);
    } catch { /* offline ok */ }
  };

  const initials = (user?.name || user?.email || 'M').slice(0, 1).toUpperCase();
  const displayName = user?.name || (user ? 'Pengguna' : 'Tamu');
  const displayEmail = user?.email || 'Belum login';
  const watchTimeLabel = formatWatchTime(stats.watchedSeconds);

  return (
    <div className="min-h-screen bg-bg text-text pb-28 profile-layout">
      <div className="relative">
        <div className="profile-cover">
          {bannerUrl ? (
            <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="profile-hero-bg absolute inset-0">
              <div className="profile-orb" style={{ width: 180, height: 180, top: -60, left: -40, background: 'rgba(255,255,255,0.18)' }} />
              <div className="profile-orb" style={{ width: 140, height: 140, top: 20, right: -30, background: 'rgba(255,255,255,0.12)' }} />
            </div>
          )}
          <div className="profile-cover-fade" />

          <div className="absolute top-0 left-0 right-0 px-5 pt-6 z-10">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white text-[11px] font-bold uppercase tracking-[0.16em]">
                <User size={11} /> Profil
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/inbox')}
                  className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition active:scale-95"
                  aria-label="Notifikasi"
                  title="Notifikasi"
                >
                  <Bell size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition active:scale-95"
                  aria-label="Pengaturan"
                  title="Pengaturan"
                >
                  <SettingsIcon size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-5 -mt-12 relative z-10">
          <div className="max-w-xl mx-auto">
            <div className="flex flex-col items-center gap-3 mb-4 text-center">
              <div className="relative shrink-0">
                <div className="profile-avatar-wrap">
                  {user?.picture ? (
                    <img src={user.picture} alt={displayName} className="w-[96px] h-[96px] rounded-full object-cover bg-surface" />
                  ) : (
                    <div className="profile-avatar-fallback w-[96px] h-[96px] rounded-full flex items-center justify-center font-black text-3xl text-primary">
                      {initials}
                    </div>
                  )}
                  {user && <span className="profile-presence-dot" aria-hidden />}
                </div>
              </div>
              <div className="w-full flex flex-col items-center">
                <h2 className="text-[20px] font-black text-text tracking-tight leading-tight w-full truncate">{displayName}</h2>
                <p className="text-[13px] text-text-secondary font-medium leading-relaxed truncate flex items-center justify-center gap-1.5 mt-1 w-full">
                  <Mail size={12} className="shrink-0 text-primary" />
                  {displayEmail}
                </p>
              </div>
            </div>

            {bio && (
              <div className="bg-surface border border-border rounded-2xl px-4 py-3 mb-4">
                <p className="text-[13.5px] text-text font-medium leading-relaxed whitespace-pre-wrap break-words">{bio}</p>
              </div>
            )}

            {/* Stats: hanya Ditonton & Favorit — points/streak dihapus */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="profile-stat-pill"
                style={{ '--accent': 'var(--color-primary)' }}
                aria-label="Lihat riwayat tontonan"
              >
                <Clock size={18} className="profile-stat-pill-icon text-primary" />
                <span className="profile-stat-pill-value">{watchTimeLabel}</span>
                <span className="profile-stat-pill-label">Ditonton</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/bookmark')}
                className="profile-stat-pill"
                style={{ '--accent': '#f43f5e' }}
                aria-label="Buka favorit"
              >
                <Heart size={18} className="profile-stat-pill-icon text-rose-500" />
                <span className="profile-stat-pill-value">{stats.bookmark}</span>
                <span className="profile-stat-pill-label">Favorit</span>
              </button>
            </div>

            {/* Hanya tombol Edit Profil — tombol Trophy + LogOut dihapus.
                Logout dipindah ke halaman /settings. */}
            <div className="flex gap-2.5 mb-2">
              {user ? (
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-2xl text-[14px] shadow-lg shadow-primary/30 transition-all active:scale-95"
                >
                  <Edit3 size={15} /> Edit Profil
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-2xl text-[14px] shadow-lg shadow-primary/30 transition-all active:scale-95"
                >
                  <LogIn size={15} /> Login Google
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile modal — ala nanimeid, banner + avatar + nama + bio */}
      {showEdit && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowEdit(false)}
        >
          <div
            className="bg-surface border-t sm:border border-border rounded-t-[32px] sm:rounded-[28px] max-w-md w-full shadow-2xl flex flex-col"
            style={{ maxHeight: '92vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-surface rounded-t-[32px] sm:rounded-t-[28px]">
              <div className="sm:hidden mx-auto -mt-2 mb-3 w-12 h-1.5 rounded-full bg-text-muted/30" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/25">
                    <Edit3 size={16} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-black text-text leading-tight">Edit Profil</h3>
                    <p className="text-[11px] text-text-secondary font-medium leading-tight mt-0.5">
                      Atur foto, banner, nama dan bio
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="w-9 h-9 rounded-2xl bg-surface-highlight hover:bg-border text-text-muted hover:text-text transition flex items-center justify-center active:scale-95 shrink-0"
                  aria-label="Tutup"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              className="flex-1 overflow-y-auto custom-scrollbar px-6 pt-5 pb-8"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}
            >
              <div className="space-y-5">
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-text-muted mb-2">Banner Cover</span>
                  <button
                    type="button"
                    onClick={() => pickImage('banner')}
                    className="relative w-full h-32 rounded-2xl overflow-hidden border-2 border-dashed border-border hover:border-primary/50 transition-all bg-surface-highlight group"
                  >
                    {editBanner ? (
                      <>
                        <img src={editBanner} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 text-text text-[12px] font-bold">
                            <Camera size={13} /> Ganti Banner
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
                        <ImagePlus size={26} />
                        <span className="text-[13px] font-bold">Pilih gambar banner</span>
                        <span className="text-[11px] font-medium">Rekomendasi 1280×400</span>
                      </div>
                    )}
                  </button>
                  {editBanner && (
                    <button
                      type="button"
                      onClick={() => setEditBanner('')}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold text-red-500 hover:underline"
                    >
                      <X size={11} /> Hapus banner
                    </button>
                  )}
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerChange} className="sr-only" />
                </div>

                <div className="flex flex-col items-center gap-3 py-2">
                  <button type="button" onClick={() => pickImage('avatar')} className="relative group" aria-label="Ubah foto profil">
                    {editPicture ? (
                      <img src={editPicture} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-border shadow-lg" />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-primary/15 text-primary border-4 border-primary/30 flex items-center justify-center font-black text-4xl shadow-lg">
                        {(editName || initials).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera size={26} className="text-white" />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => pickImage('avatar')}
                    className="inline-flex items-center gap-1.5 text-[13px] font-bold text-primary hover:underline"
                  >
                    <Camera size={13} /> Ganti Foto
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="sr-only" />
                </div>

                <label className="block">
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-text-muted mb-2">Nama Tampilan</span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Masukkan nama"
                    maxLength={32}
                    className="w-full bg-surface-highlight border border-border rounded-2xl px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-[14px] font-medium"
                  />
                  <span className="text-[11px] text-text-muted font-bold mt-1.5 block px-1">{editName.length}/32</span>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-text-muted mb-2">Bio</span>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tulis sesuatu tentang dirimu..."
                    maxLength={280}
                    rows={3}
                    className="w-full bg-surface-highlight border border-border rounded-2xl px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-[14px] font-medium resize-none"
                  />
                  <span className="text-[11px] text-text-muted font-bold mt-1.5 block px-1">{editBio.length}/280</span>
                </label>

                {user?.email && (
                  <div className="px-4 py-3 rounded-2xl bg-surface-highlight border border-border">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted mb-1">Email Akun</p>
                    <p className="text-[13px] font-bold text-text truncate">{user.email}</p>
                    <p className="text-[11px] text-text-muted font-medium mt-1 leading-relaxed">
                      Email mengikuti akun Google dan tidak bisa diubah dari aplikasi.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEdit(false)}
                    className="flex-1 bg-surface-highlight hover:bg-border text-text-secondary font-bold py-3 rounded-2xl text-sm active:scale-95 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-2xl shadow-md shadow-primary/30 text-sm active:scale-95 transition-all"
                  >
                    <Save size={14} /> Simpan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
