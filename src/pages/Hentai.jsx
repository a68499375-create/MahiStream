import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, Play, Lock, Unlock, Eye, EyeOff, Sparkles, Check, ChevronRight, Loader2 } from 'lucide-react';
import { fetchNekopoiLatest, fetchNekopoiSearch, fetchNekopoiCategory, fetchNekopoiIndex, getProxiedImageUrl } from '../services/api';
import TopBar from '../components/TopBar';
import { isKhususUnlocked, unlockKhusus } from '../utils/khususAuth';

export default function Hentai() {
  const [categories, setCategories] = useState({
    hentai: { data: [], loading: true, error: null },
    anim2d: { data: [], loading: true, error: null },
    anim3d: { data: [], loading: true, error: null },
    jav: { data: [], loading: true, error: null },
    javCosplay: { data: [], loading: true, error: null },
  });
  // Sub-tab daftar A-Z + Genre dari nekopoi (di luar 5 kategori utama).
  // Lazy-load: hanya fetch saat user buka tab terkait.
  const [activeIndexTab, setActiveIndexTab] = useState(null); // null|'hentai'|'jav'|'genre'
  const [indexData, setIndexData] = useState({ hentai: null, jav: null, genre: null });
  const [indexLoading, setIndexLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isKhususUnlocked());
  const [pwInput, setPwInput] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  // Counter ini cuma dipakai untuk re-trigger animasi shake. Tiap kali
  // password salah, kita increment supaya React render ulang elemen form
  // dengan key baru -> animasi CSS jalan dari awal lagi.
  const [shakeKey, setShakeKey] = useState(0);
  // success: tampilkan checkmark hijau lalu dissolve halus sebelum konten muncul.
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const navigate = useNavigate();

  // Classify a Nekopoi item by its title tag so categories never get mixed.
  const classify = (title = '') => {
    const tagMatch = title.match(/\[([^\]]*)\]/);
    const tag = (tagMatch ? tagMatch[1] : '').toLowerCase();

    if (/\bl2d\b|\b2d\b/.test(tag)) return 'anim2d';
    if (/\b3d\b/.test(tag) || /\bcav\b/i.test(title)) return 'anim3d';
    if (/\bjav\b/.test(tag) || /\b[A-Z]{2,6}-\d{2,4}\b/.test(title)) return 'jav';
    return 'hentai';
  };

  // 5 kategori yang user minta, pakai slug ASLI dari nekopoi.care:
  //   /category/hentai/         → Hentai (live action / mixed)
  //   /category/2d-animation/   → 2D Animation
  //   /category/3d-hentai/      → 3D Hentai
  //   /category/jav/            → JAV biasa
  //   /category/jav-cosplay/    → JAV Cosplay
  // Fetch SEMUA KATEGORI secara INDIVIDUAL (bukan Promise.all) supaya
  // yang selesai dulu langsung tampil, tidak nunggu yang lain.
  const categoryConfig = [
    { key: 'hentai', slug: 'hentai', label: 'Hentai' },
    { key: 'anim2d', slug: '2d-animation', label: '2D Animation' },
    { key: 'anim3d', slug: '3d-hentai', label: '3D Hentai' },
    { key: 'jav', slug: 'jav', label: 'JAV' },
    { key: 'javCosplay', slug: 'jav-cosplay', label: 'JAV Cosplay' },
  ];

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;

    const loadCategory = async (config) => {
      try {
        if (cancelled) return;
        const data = await fetchNekopoiCategory(config.slug, 1).catch(() => []);
        if (cancelled) return;

        const cleanList = (arr) => {
          const out = [];
          const seen = new Set();
          for (const item of arr || []) {
            if (!item || !item.id || seen.has(item.id)) continue;
            const cleanTitle = String(item.title || '').split(/\r?\n/)[0].trim();
            if (/rewind\s+\d{4}|nekopoi\s+mengucapkan|anniversary/i.test(cleanTitle)) continue;
            seen.add(item.id);
            out.push({ ...item, title: cleanTitle });
          }
          return out;
        };

        // Filter L2D/3D/JAV dari kategori hentai (hanya yg tag [HENTAI] atau tanpa tag spesifik)
        const filterHentai = (arr) => arr.filter(item => {
          const tagMatch = item.title.match(/\[([^\]]*)\]/);
          const tag = (tagMatch ? tagMatch[1] : '').toLowerCase();
          return !/\bl2d\b|\b2d\b|\b3d\b|\bjav\b/i.test(tag);
        });

        const cleaned = cleanList(data);
        const finalData = config.key === 'hentai' ? filterHentai(cleaned) : cleaned;

        setCategories(prev => ({
          ...prev,
          [config.key]: { data: finalData, loading: false, error: null }
        }));
      } catch (err) {
        if (!cancelled) {
          setCategories(prev => ({
            ...prev,
            [config.key]: { data: [], loading: false, error: 'Gagal memuat' }
          }));
        }
      }
    };

    // Start loading all categories independently
    categoryConfig.forEach(config => loadCategory(config));

    return () => { cancelled = true; };
  }, [unlocked]);

  const handleUnlock = (e) => {
    e?.preventDefault?.();
    setPwError('');
    const result = unlockKhusus(pwInput);
    if (result.ok) {
      setUnlockSuccess(true);
      setPwInput('');
      setTimeout(() => setUnlocked(true), 700);
    } else if (result.throttled) {
      const min = Math.ceil((result.retryAfterMs || 60000) / 60000);
      setPwError(`Terlalu banyak percobaan. Coba lagi dalam ${min} menit.`);
      setShakeKey((k) => k + 1);
    } else {
      setPwError('Password salah, coba lagi.');
      setShakeKey((k) => k + 1);
    }
  };

  // Layar terkunci: seluruh halaman di-blur dan ditutup overlay password.
  // Konten tidak di-fetch saat masih terkunci, jadi tidak ada poster yang ter-leak
  // di balik blur sekalipun browser memuat sesuatu sebelumnya.
  if (!unlocked) {
    return (
      <div className="relative min-h-screen pb-28 bg-bg overflow-hidden" data-testid="khusus-locked">
        {/* Latar belakang ber-blur: kerangka halaman aslinya tetap ditampilkan
            tapi diburamkan kuat. Memberi kesan ada konten yang sengaja
            disembunyikan, bukan halaman kosong biasa. */}
        <div className="absolute inset-0 z-0 pointer-events-none select-none" style={{ filter: 'blur(28px) saturate(0.55)' }}>
          <TopBar />
          <div className="cr-container mt-6 opacity-50">
            <div className="h-8 w-48 rounded-md bg-surface-highlight mb-4" />
            <div className="grid grid-cols-3 gap-3 md:gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-surface-highlight border border-border" />
              ))}
            </div>
          </div>
        </div>

        {/* Lapisan ambient: gradient hangat khas Mahiru caramel + dua "blob"
            radial untuk highlight lembut. Murni dekoratif, di belakang modal. */}
        <div className="absolute inset-0 z-[1] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#fdf8f1]/70 via-[#f6ebdc]/60 to-[#c68a4e]/30 backdrop-blur-2xl" />
          <div
            className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full opacity-50"
            style={{ background: 'radial-gradient(closest-side, rgba(198,138,78,0.55), transparent 70%)' }}
          />
          <div
            className="absolute -bottom-40 -right-20 w-[460px] h-[460px] rounded-full opacity-45"
            style={{ background: 'radial-gradient(closest-side, rgba(164,104,47,0.5), transparent 70%)' }}
          />
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 py-10">
          <form
            key={shakeKey}
            onSubmit={handleUnlock}
            className={`khusus-gate-card relative w-full max-w-md rounded-[28px] p-8 md:p-10 text-center space-y-6 ${pwError ? 'animate-shake' : 'animate-gate-in'}`}
            data-testid="khusus-password-form"
            aria-live="polite"
          >
            {/* Garis tipis emas di sekeliling kartu untuk efek "premium". */}
            <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-white/40" />
            <div
              className="pointer-events-none absolute inset-0 rounded-[28px]"
              style={{
                background:
                  'linear-gradient(140deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%, rgba(198,138,78,0.18) 100%)',
              }}
            />

            {unlockSuccess ? (
              <div className="relative flex flex-col items-center gap-4 py-6 animate-fade-in">
                <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_18px_40px_-12px_rgba(16,185,129,0.6)]">
                  <Check size={40} strokeWidth={3} className="text-white" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-text tracking-tight">Akses Dibuka</h2>
                  <p className="text-xs text-text-secondary font-medium">Mengarahkan ke konten khusus...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Header kartu: ikon gembok dengan halo gold + label "Privat". */}
                <div className="relative flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-3xl blur-2xl bg-primary/40 scale-125" />
                    <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_18px_40px_-12px_rgba(198,138,78,0.65)] ring-1 ring-white/40">
                      <Lock size={36} strokeWidth={2.4} className="text-white drop-shadow" />
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase text-primary/90 bg-primary/10 border border-primary/25 px-3 py-1 rounded-full">
                    <Sparkles size={11} strokeWidth={2.6} /> Privat
                  </span>
                </div>

                <div className="relative space-y-2">
                  <h2 className="text-2xl md:text-[26px] font-black tracking-tight text-text leading-tight">
                    Konten <span className="text-primary">Khusus</span>
                  </h2>
                  <p className="text-[13px] text-text-secondary leading-relaxed max-w-xs mx-auto">
                    Masukkan password untuk membuka koleksi khusus dewasa. Sekali terbuka, akses tetap aktif sampai kamu menguncinya kembali.
                  </p>
                </div>

                <div className="relative space-y-3">
                  <label
                    htmlFor="khusus-password-input"
                    className="block text-[11px] font-black uppercase tracking-wider text-text-muted text-center"
                  >
                    Password
                  </label>
                  <div className="relative group">
                    <input
                      id="khusus-password-input"
                      type={showPw ? 'text' : 'password'}
                      value={pwInput}
                      onChange={(e) => {
                        setPwInput(e.target.value);
                        if (pwError) setPwError('');
                      }}
                      placeholder="Masukkan password rahasia"
                      autoFocus
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-testid="khusus-password-input"
                      className={`w-full bg-white/80 backdrop-blur border rounded-2xl py-3.5 pl-4 pr-12 text-text outline-none text-sm font-medium transition-all
                        ${pwError
                          ? 'border-red-400 ring-2 ring-red-300/60 focus:ring-red-400/70'
                          : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/40'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwError && (
                    <p
                      className="flex items-center gap-1.5 text-xs text-red-500 font-bold pl-1"
                      data-testid="khusus-password-error"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                      {pwError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  data-testid="khusus-password-submit"
                  className="relative w-full bg-gradient-to-br from-primary to-accent text-white font-black tracking-wide py-3.5 rounded-2xl shadow-[0_14px_32px_-10px_rgba(164,104,47,0.65)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_18px_40px_-12px_rgba(164,104,47,0.7)] active:scale-[0.98] flex items-center justify-center gap-2 text-sm uppercase"
                >
                  <Unlock size={16} strokeWidth={2.6} /> Buka Akses
                </button>

                <p className="text-[10px] text-text-muted leading-relaxed pt-1">
                  Konten 18+. Dengan melanjutkan kamu menyatakan sudah cukup umur sesuai hukum yang berlaku di wilayahmu.
                </p>
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  const renderRow = (title, items, searchQueryParam) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-5 px-1">
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2.5">
            <span className="w-1.5 h-5 rounded-full bg-pink-600" />
            {title}
          </h2>
          <Link
            to={`/search?q=${encodeURIComponent(searchQueryParam)}`}
            className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1 transition-colors"
          >
            Lihat Semua →
          </Link>
        </div>
        <div className="horizontal-scroll no-scrollbar flex flex-nowrap gap-4 overflow-x-auto pb-4 -mx-4 px-4">
          {items.map((item, index) => (
            <div
              key={item.id + index}
              className="group relative cursor-pointer rounded-2xl overflow-hidden bg-surface border border-border shadow-sm card-lift"
              style={{ width: '150px', flexShrink: 0 }}
              onClick={() => navigate(`/video/${encodeURIComponent(item.id)}?source=nekopoi`)}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                <img
                  src={getProxiedImageUrl(item.image || item.posterUrl || item.thumbnail)}
                  alt={item.title}
                  className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                  loading="lazy"
                  onError={(e) => {
                    const fallback = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(item.title || 'Konten')}`;
                    if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-pink-600/95 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-wider shadow-md">
                  Khusus
                </span>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-primary/95 rounded-full p-3 shadow-2xl transform scale-50 group-hover:scale-100 transition-transform">
                    <Play size={20} className="text-white fill-white" />
                  </div>
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-[12.5px] font-bold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-28 bg-bg">
      <TopBar />

      <div className="cr-container mt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-text tracking-wide">
            KHUSUS <span className="text-primary">DEWASA</span>
          </h1>
          <p className="text-sm text-text-secondary mt-1">Konten eksklusif dari Nekopoi.care</p>
        </div>

        {categoryConfig.map((config) => {
          const cat = categories[config.key];
          if (!cat) return null;
          return (
            <div key={config.key} className="mb-8">
              <div className="flex items-center justify-between mb-5 px-1">
                <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2.5">
                  <span className="w-1.5 h-5 rounded-full bg-pink-600" />
                  {config.label}
                </h2>
                <Link
                  to={`/search?q=${encodeURIComponent(config.label)}`}
                  className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1 transition-colors"
                >
                  Lihat Semua →
                </Link>
              </div>

              {cat.loading ? (
                <div className="horizontal-scroll no-scrollbar flex flex-nowrap gap-4 overflow-x-auto pb-4 -mx-4 px-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="group relative cursor-pointer rounded-2xl overflow-hidden bg-surface border border-border shadow-sm card-lift" style={{ width: '150px', flexShrink: 0 }}>
                      <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                        <div className="skeleton w-full h-full" />
                      </div>
                      <div className="p-3">
                        <div className="skeleton h-4 w-3/4 rounded-md" />
                        <div className="skeleton h-3 w-1/2 rounded-md mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : cat.error ? (
                <div className="text-center py-8 text-text-secondary">
                  {cat.error}
                  <button onClick={() => window.location.reload()} className="ml-2 text-primary underline">Coba Lagi</button>
                </div>
              ) : cat.data.length === 0 ? (
                <div className="text-center py-8 text-text-secondary">
                  Tidak ada konten di kategori ini.
                </div>
              ) : (
                <div className="horizontal-scroll no-scrollbar flex flex-nowrap gap-4 overflow-x-auto pb-4 -mx-4 px-4">
                  {cat.data.map((item, index) => (
                    <div
                      key={item.id + index}
                      className="group relative cursor-pointer rounded-2xl overflow-hidden bg-surface border border-border shadow-sm card-lift"
                      style={{ width: '150px', flexShrink: 0 }}
                      onClick={() => navigate(`/video/${encodeURIComponent(item.id)}?source=nekopoi`)}
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                        <img
                          src={getProxiedImageUrl(item.image || item.posterUrl || item.thumbnail)}
                          alt={item.title}
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                          loading="lazy"
                          onError={(e) => {
                            const fallback = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(item.title || 'Konten')}`;
                            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                        <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-pink-600/95 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-wider shadow-md">
                          Khusus
                        </span>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-primary/95 rounded-full p-3 shadow-2xl transform scale-50 group-hover:scale-100 transition-transform">
                            <Play size={20} className="text-white fill-white" />
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="text-[12.5px] font-bold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                          {item.title}
                        </h4>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Sub-tab daftar lengkap A-Z + Genre Khusus */}
        <div className="mt-10">
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-text mb-4 px-1 flex items-center gap-2.5">
            <span className="w-1.5 h-5 rounded-full bg-pink-600" />
            Daftar Lengkap
          </h2>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 -mx-4 px-4">
            {[
              { id: 'hentai', label: 'Hentai List A-Z', path: 'hentai-list' },
              { id: 'jav', label: 'JAV List A-Z', path: 'jav-list' },
              { id: 'genre', label: 'Genre Khusus', path: 'genre-list' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  const next = activeIndexTab === tab.id ? null : tab.id;
                  setActiveIndexTab(next);
                  if (next && !indexData[next]) {
                    setIndexLoading(true);
                    fetchNekopoiIndex(tab.path)
                      .then((data) => setIndexData((p) => ({ ...p, [tab.id]: data || [] })))
                      .catch(() => setIndexData((p) => ({ ...p, [tab.id]: [] })))
                      .finally(() => setIndexLoading(false));
                  }
                }}
                className={`whitespace-nowrap px-4 py-2.5 rounded-2xl text-[12.5px] font-bold border transition-all active:scale-95 ${
                  activeIndexTab === tab.id
                    ? 'bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/30'
                    : 'bg-surface text-text-secondary border-border hover:border-pink-600/40 hover:text-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeIndexTab && (
            <div className="bg-surface border border-border rounded-3xl p-5 mt-4 shadow-md">
              {indexLoading && !indexData[activeIndexTab] ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-8 h-8 border-4 border-pink-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (indexData[activeIndexTab] || []).length === 0 ? (
                <p className="text-center text-[13px] text-text-secondary py-6 font-medium">
                  Belum ada data tersedia.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-text-muted font-bold uppercase tracking-wider mb-4">
                    {indexData[activeIndexTab].length} judul
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                    {indexData[activeIndexTab].map((item, idx) => (
                      <button
                        key={item.id + idx}
                        onClick={() => navigate(`/video/${encodeURIComponent(item.id)}?source=nekopoi`)}
                        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-surface-highlight hover:bg-pink-600/10 hover:border-pink-600/40 border border-border transition-all active:scale-[0.98] text-left"
                      >
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-pink-600/15 text-pink-600 flex items-center justify-center text-[11px] font-black">
                          {(item.title || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0 text-[13px] font-bold text-text truncate">
                          {item.title}
                        </span>
                        <ChevronRight size={14} className="text-text-muted shrink-0" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
