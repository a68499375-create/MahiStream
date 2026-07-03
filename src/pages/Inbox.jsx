import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ArrowLeft, CheckCheck, Trash2, ExternalLink, Filter, Heart, Sparkles } from 'lucide-react';
import { API_BASE_URL, getCurrentUserId } from '../services/api';

// Inbox / Notifikasi — mirroring nanimeid pattern:
//   1. Fetch dari /notifications/pending (backend release tracker)
//   2. Filter ke anime yang di-favorit user supaya relevan (toggle "Hanya favorit")
//   3. Persist "last seen" timestamp di localStorage; entries baru = badge biru
//   4. Tap "Tonton" → buka VideoPlayer episode terbaru
//   5. Trash → ack ke backend (release hilang dari queue server-side)
//   6. "Tandai semua" → ack semua satu per satu

const LAST_SEEN_KEY = 'mahistream_inbox_last_seen_v1';
const ONLY_FAVORITE_KEY = 'mahistream_inbox_only_favorite_v1';

const readLastSeen = () => {
  try { return parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10) || 0; } catch { return 0; }
};

const writeLastSeen = (ts) => {
  try { localStorage.setItem(LAST_SEEN_KEY, String(ts)); } catch {}
};

const readOnlyFavorite = () => {
  try { return localStorage.getItem(ONLY_FAVORITE_KEY) === '1'; } catch { return false; }
};

const writeOnlyFavorite = (v) => {
  try { localStorage.setItem(ONLY_FAVORITE_KEY, v ? '1' : '0'); } catch {}
};

// Ambil semua id anime yang di-favorit user (umum + khusus). Dipakai untuk
// filter inbox supaya cuma menampilkan rilisan dari anime yang difollow.
const readFavoriteAnimeIds = () => {
  try {
    const uid = getCurrentUserId();
    const umum = JSON.parse(localStorage.getItem(`mahistream_bookmarks_umum_${uid}`) || '[]');
    const khusus = JSON.parse(localStorage.getItem(`mahistream_bookmarks_khusus_${uid}`) || '[]');
    const ids = new Set();
    const collect = (arr) => Array.isArray(arr) && arr.forEach((b) => {
      if (b && (b.id || b.animeId)) ids.add(String(b.id || b.animeId));
    });
    collect(umum);
    collect(khusus);
    return ids;
  } catch { return new Set(); }
};

export default function Inbox() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSeen, setLastSeen] = useState(() => readLastSeen());
  const [onlyFavorite, setOnlyFavorite] = useState(() => readOnlyFavorite());
  const [favoriteIds] = useState(() => readFavoriteAnimeIds());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${API_BASE_URL}/notifications/pending`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const releases = Array.isArray(json?.releases) ? json.releases : [];
      // Backend pakai `episodeNumber` — kita map ke `episode` untuk UI yg generic
      const mapped = releases.map((r) => ({
        animeId: r.animeId,
        title: r.title,
        episode: r.episodeNumber,
        poster: r.poster,
        source: r.source || 'kuramanime',
        detectedAt: r.detectedAt || Date.now(),
      }));
      mapped.sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
      setItems(mapped);
    } catch (e) {
      setError(e?.message || 'Gagal memuat notifikasi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Tandai semua yang sekarang sebagai "sudah dilihat" — entry baru dari
    // poll berikutnya akan dapet indikator biru karena detectedAt > lastSeen.
    const now = Date.now();
    writeLastSeen(now);
    setLastSeen(now);
  }, []);

  const toggleOnlyFavorite = () => {
    const next = !onlyFavorite;
    setOnlyFavorite(next);
    writeOnlyFavorite(next);
  };

  const ackOne = async (it) => {
    try {
      await fetch(`${API_BASE_URL}/notifications/ack?id=${encodeURIComponent(it.animeId || '')}&episode=${encodeURIComponent(it.episode || 0)}`);
    } catch {}
    setItems((prev) => prev.filter((x) => !(x.animeId === it.animeId && x.episode === it.episode)));
  };

  const ackAll = async () => {
    const filtered = visibleItems;
    const filteredKeys = new Set(filtered.map((it) => `${it.animeId}|${it.episode}`));
    setItems((prev) => prev.filter((x) => !filteredKeys.has(`${x.animeId}|${x.episode}`)));
    // ack ke backend secara paralel (best effort)
    await Promise.all(filtered.map((it) =>
      fetch(`${API_BASE_URL}/notifications/ack?id=${encodeURIComponent(it.animeId || '')}&episode=${encodeURIComponent(it.episode || 0)}`).catch(() => {})
    ));
  };

  // Apply filter favorit. Kalau toggle off → tampil semua.
  const visibleItems = useMemo(() => {
    if (!onlyFavorite) return items;
    return items.filter((it) => favoriteIds.has(String(it.animeId)));
  }, [items, onlyFavorite, favoriteIds]);

  const unreadCount = useMemo(
    () => visibleItems.filter((it) => (it.detectedAt || 0) > lastSeen).length,
    [visibleItems, lastSeen]
  );

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return 'baru saja';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} jam lalu`;
    if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} hari lalu`;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="min-h-screen bg-bg text-text pb-28">
      <div className="cr-container pt-6">
        <header className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-surface border border-border hover:bg-surface-highlight text-text flex items-center justify-center transition active:scale-95 shrink-0"
              aria-label="Kembali"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                <Bell size={20} className="text-white" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border-2 border-bg text-white text-[10px] font-black flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-text leading-tight truncate">Notifikasi</h1>
                <p className="text-[11.5px] text-text-secondary font-medium leading-relaxed truncate">
                  Episode baru dari anime kamu.
                </p>
              </div>
            </div>
          </div>
          {visibleItems.length > 0 && (
            <button
              type="button"
              onClick={ackAll}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface hover:bg-surface-highlight border border-border text-[11px] font-bold text-text-secondary hover:text-primary active:scale-95 transition-all"
            >
              <CheckCheck size={12} /> Tandai semua
            </button>
          )}
        </header>

        {/* Filter chip "Hanya favorit" — mirror nanimeid */}
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={toggleOnlyFavorite}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[12px] font-bold transition-all active:scale-95 ${
              onlyFavorite
                ? 'bg-rose-500 border-rose-500 text-white shadow-sm'
                : 'bg-surface border-border text-text-secondary hover:border-primary/40'
            }`}
          >
            <Heart size={12} fill={onlyFavorite ? 'currentColor' : 'none'} />
            Hanya favorit
            {onlyFavorite && favoriteIds.size > 0 && (
              <span className="text-[10px] opacity-80">· {favoriteIds.size}</span>
            )}
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface border border-border text-[12px] font-bold text-text-secondary hover:border-primary/40 active:scale-95 transition-all"
          >
            <Sparkles size={12} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-2xl p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 mb-4">
              <Bell size={28} />
            </div>
            <p className="text-[13px] text-red-500 font-bold mb-3">{error}</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white font-bold text-[13px] shadow-md shadow-primary/30 active:scale-95 transition-all"
            >
              Coba lagi
            </button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center py-16 flex flex-col items-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-5 shadow-inner">
              <Bell size={42} className="text-primary" />
            </div>
            <h3 className="text-lg font-black text-text mb-2">
              {onlyFavorite ? 'Belum ada notifikasi favorit' : 'Belum ada notifikasi'}
            </h3>
            <p className="text-[13px] text-text-secondary max-w-xs leading-relaxed">
              {onlyFavorite
                ? 'Tambahkan anime ke favorit untuk dapat notifikasi episode baru.'
                : 'Notifikasi rilisan episode baru akan tampil di sini.'}
            </p>
            {onlyFavorite && (
              <button
                type="button"
                onClick={toggleOnlyFavorite}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface border border-border text-[12px] font-bold text-text-secondary active:scale-95 transition"
              >
                Tampilkan semua
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleItems.map((it, idx) => {
              const isFresh = (it.detectedAt || 0) > lastSeen;
              const isFav = favoriteIds.has(String(it.animeId));
              return (
                <li
                  key={`${it.animeId}-${it.episode}-${idx}`}
                  className={`relative bg-surface border rounded-2xl p-4 transition-all ${
                    isFresh ? 'border-primary/40 shadow-md shadow-primary/10' : 'border-border'
                  }`}
                >
                  {isFresh && (
                    <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                  <div className="flex items-start gap-3">
                    {it.poster ? (
                      <img
                        src={it.poster}
                        alt={it.title || 'anime'}
                        loading="lazy"
                        className="w-14 h-20 rounded-xl object-cover shrink-0 bg-surface-highlight shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-20 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Sparkles size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-primary/15 text-primary">
                          Episode {it.episode || '?'}
                        </span>
                        {isFav && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-500">
                            <Heart size={9} fill="currentColor" /> Favorit
                          </span>
                        )}
                        {it.source && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-surface-highlight border border-border text-text-muted">
                            {it.source}
                          </span>
                        )}
                        <span className="text-[10.5px] text-text-muted font-medium">{formatTime(it.detectedAt)}</span>
                      </div>
                      <h3 className="text-[14px] font-black text-text leading-snug mb-1 line-clamp-2">
                        {it.title || 'Episode baru tersedia'}
                      </h3>
                      <p className="text-[12px] text-text-secondary font-medium leading-relaxed line-clamp-2">
                        Episode {it.episode} sudah rilis. Tap "Tonton" untuk lanjut nonton.
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        {it.animeId && (
                          <Link
                            to={`/video/${it.animeId}${it.source ? `?source=${it.source}` : ''}`}
                            onClick={() => ackOne(it)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-[11.5px] font-bold shadow-sm hover:bg-primary-dark active:scale-95 transition"
                          >
                            <ExternalLink size={11} /> Tonton
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => ackOne(it)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-highlight hover:bg-border border border-border text-[11.5px] font-bold text-text-muted hover:text-text active:scale-95 transition"
                          aria-label="Tandai sudah dibaca"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
