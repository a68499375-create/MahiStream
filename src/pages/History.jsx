import { Trash2, Trash, Play, Clock, X, Search as SearchIcon, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import TopBar from '../components/TopBar';
import { useDialog } from '../components/DialogProvider';
import { fetchHistory, deleteHistory, getCurrentUserId } from '../services/api';

const ASSUMED_EPISODE_DURATION = 24 * 60;

const formatRelative = (iso) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'baru saja';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} jam lalu`;
  if (diff < 2 * 86400_000) return 'kemarin';
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} hari lalu`;
  const d = new Date(t);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

// Pakai entri TERBARU per anime — sistem nanimeid: kalau user pernah nonton
// anime yang sama beberapa kali, hanya entry terakhir yang muncul (jadi list
// tidak banjir duplikat ketika user pindah-pindah episode).
const dedupeLatestPerAnime = (items) => {
  const map = new Map();
  for (const it of items) {
    if (!it || !it.anime_id) continue;
    const prev = map.get(it.anime_id);
    const tNew = new Date(it.watched_at || it.created_at || 0).getTime();
    const tPrev = prev ? new Date(prev.watched_at || prev.created_at || 0).getTime() : -1;
    if (!prev || tNew >= tPrev) map.set(it.anime_id, it);
  }
  // Urutkan turun berdasarkan waktu terakhir tonton.
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.watched_at || a.created_at || 0).getTime();
    const tb = new Date(b.watched_at || b.created_at || 0).getTime();
    return tb - ta;
  });
};

const groupByDate = (items) => {
  const now = Date.now();
  const groups = { today: [], week: [], older: [] };
  for (const item of items) {
    const t = new Date(item.watched_at || item.created_at || 0).getTime();
    const diff = now - t;
    if (diff < 86400_000) groups.today.push(item);
    else if (diff < 7 * 86400_000) groups.week.push(item);
    else groups.older.push(item);
  }
  return groups;
};

const formatProgressMinutes = (seconds) => {
  if (!seconds || seconds <= 0) return '0 menit';
  const m = Math.floor(seconds / 60);
  if (m === 0) return `${seconds} detik`;
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h} jam` : `${h}j ${rm}m`;
};

const calcProgressPct = (entry) => {
  const seconds = Number(entry?.progress_seconds) || 0;
  if (seconds <= 0) return 0;
  const dur = Number(entry?.duration_seconds);
  const base = Number.isFinite(dur) && dur > 0 ? dur : ASSUMED_EPISODE_DURATION;
  return Math.min(100, Math.round((seconds / base) * 100));
};

const KNOWN_SOURCES = ['kuramanime', 'otakudesu', 'nekopoi'];
const SOURCE_LABEL = {
  kuramanime: 'Kurama',
  otakudesu: 'Otaku',
  nekopoi: 'Khusus',
};

export default function History() {
  const { confirm, toast } = useDialog();
  const [rawHistory, setRawHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchHistory(getCurrentUserId());
        setRawHistory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleDeleteItem = async (item) => {
    const ok = await confirm({
      title: 'Hapus dari riwayat?',
      message: `"${item.title}" akan hilang dari daftar Lanjutkan Menonton.`,
      okText: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    const success = await deleteHistory(getCurrentUserId(), item.anime_id);
    if (success) {
      setRawHistory((prev) => prev.filter((h) => h.anime_id !== item.anime_id));
      toast('Riwayat dihapus', { tone: 'success' });
    } else {
      toast('Gagal menghapus riwayat', { tone: 'error' });
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: 'Bersihkan seluruh riwayat?',
      message: 'Semua progress tontonan akan dihapus. Aksi ini tidak bisa dibatalkan.',
      okText: 'Hapus Semua',
      tone: 'danger',
    });
    if (!ok) return;
    const success = await deleteHistory(getCurrentUserId());
    if (success) {
      setRawHistory([]);
      toast('Riwayat dibersihkan', { tone: 'success' });
    } else {
      toast('Gagal membersihkan riwayat', { tone: 'error' });
    }
  };

  // 1. Dedupe entri per anime (terbaru menang).
  // 2. Filter by source chip.
  // 3. Filter by query text (case-insensitive, title only).
  const history = useMemo(() => {
    const deduped = dedupeLatestPerAnime(rawHistory);
    const q = query.trim().toLowerCase();
    return deduped.filter((it) => {
      if (sourceFilter !== 'all' && (it.source || 'otakudesu') !== sourceFilter) return false;
      if (!q) return true;
      return String(it.title || '').toLowerCase().includes(q);
    });
  }, [rawHistory, query, sourceFilter]);

  // Source chips ditampilkan hanya kalau user memang punya entri dari source
  // tersebut, supaya tidak menggombal pilihan kosong.
  const sourceCounts = useMemo(() => {
    const counts = { all: 0 };
    KNOWN_SOURCES.forEach((s) => { counts[s] = 0; });
    dedupeLatestPerAnime(rawHistory).forEach((it) => {
      const s = it.source || 'otakudesu';
      counts.all += 1;
      if (counts[s] !== undefined) counts[s] += 1;
    });
    return counts;
  }, [rawHistory]);

  const availableSources = KNOWN_SOURCES.filter((s) => sourceCounts[s] > 0);
  const groups = useMemo(() => groupByDate(history), [history]);
  const totalCount = history.length;

  const renderItem = (item) => {
    const pct = calcProgressPct(item);
    const time = formatRelative(item.watched_at || item.created_at);
    const dur = Number(item?.duration_seconds);
    const watched = formatProgressMinutes(Number(item.progress_seconds) || 0);
    const total = dur > 0 ? ` / ${formatProgressMinutes(dur)}` : '';
    const params = new URLSearchParams({
      ...(item.source ? { source: item.source } : {}),
      ...(item.progress_seconds ? { t: String(item.progress_seconds) } : {}),
      play: 'true',
    });
    const sourceLabel = SOURCE_LABEL[item.source] || (item.source || '').toUpperCase();
    return (
      <div
        key={item.id}
        data-testid="history-item"
        className="group relative flex items-stretch gap-3 p-2.5 rounded-2xl bg-surface border border-border hover:border-primary/40 transition"
      >
        <Link
          to={`/video/${item.anime_id}?${params.toString()}`}
          data-testid="history-item-resume"
          className="flex items-stretch gap-3 flex-1 min-w-0"
        >
          <div className="relative w-28 sm:w-32 shrink-0 rounded-xl overflow-hidden bg-surface-highlight aspect-video">
            <img
              src={item.poster_url}
              alt={item.title}
              loading="lazy"
              className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
              onError={(e) => {
                const fb = `https://placehold.co/200x113/18181b/c68a4e?text=${encodeURIComponent(item.title || 'A')}`;
                if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
              }}
            />
            <span className="absolute top-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/95 text-white text-[9.5px] font-black uppercase tracking-wider shadow">
              EP {item.episode || '1'}
            </span>
            {pct > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/35">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/35 transition">
              <span className="w-9 h-9 rounded-full bg-primary/95 flex items-center justify-center shadow">
                <Play size={14} className="text-white fill-white" />
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <div className="min-w-0">
              <h4 className="text-[13.5px] font-bold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                {item.title}
              </h4>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] text-text-muted font-medium">
                <span>{time}</span>
                {sourceLabel && (
                  <>
                    <span>·</span>
                    <span className="uppercase tracking-wider font-bold text-text-secondary">
                      {sourceLabel}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[11.5px] text-text-secondary font-bold inline-flex items-center gap-1">
                <Clock size={11} className="text-primary" />
                {pct > 0 ? `${watched}${total}` : 'Belum mulai'}
              </span>
              {pct > 0 && (
                <span className="text-[11px] font-black text-primary">{pct}%</span>
              )}
            </div>
          </div>
        </Link>

        <button
          onClick={() => handleDeleteItem(item)}
          data-testid="history-item-delete-btn"
          className="self-start mt-1 w-8 h-8 rounded-full bg-surface-highlight hover:bg-red-500 hover:text-white text-text-muted transition active:scale-90 flex items-center justify-center shrink-0"
          aria-label="Hapus dari riwayat"
        >
          <X size={14} />
        </button>
      </div>
    );
  };

  const renderGroup = (label, items) => {
    if (items.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="text-[12px] font-black uppercase tracking-[0.18em] text-text-muted mb-2.5 px-1 flex items-center gap-2">
          {label}
          <span className="text-[11px] text-text-muted font-bold normal-case tracking-normal">· {items.length}</span>
        </h2>
        <div className="flex flex-col gap-2">
          {items.map(renderItem)}
        </div>
      </section>
    );
  };

  const showFilters = !isLoading && rawHistory.length > 0;
  const showEmptyState = !isLoading && rawHistory.length === 0;
  const showNoResults = !isLoading && rawHistory.length > 0 && totalCount === 0;

  return (
    <div className="min-h-screen pb-28 bg-bg text-text">
      <TopBar />
      <div className="cr-container mt-5">
        <div className="flex items-center justify-between gap-3 mb-4 px-1">
          <div className="min-w-0">
            <h1 className="text-[20px] sm:text-2xl font-black tracking-tight text-text leading-tight">
              Riwayat
            </h1>
            <p className="text-[12.5px] text-text-secondary font-medium leading-snug mt-0.5">
              {rawHistory.length > 0
                ? `${sourceCounts.all} anime · lanjutkan dari episode terakhir`
                : 'Anime yang sudah kamu tonton muncul di sini.'}
            </p>
          </div>
          {rawHistory.length > 0 && (
            <button
              onClick={handleClearAll}
              data-testid="history-delete-all-btn"
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] font-bold text-red-500 hover:text-white border border-red-500/30 hover:bg-red-500 hover:border-red-500 transition active:scale-95"
            >
              <Trash size={13} /> Bersihkan
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mb-5 space-y-3">
            {/* Search filter — input ringkas ala nanimeid. */}
            <div className="relative">
              <SearchIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari judul dalam riwayat..."
                className="w-full pl-10 pr-10 h-10 rounded-full bg-surface border border-border text-[13px] font-medium text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-highlight hover:bg-border text-text-muted flex items-center justify-center transition"
                  aria-label="Bersihkan"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Source filter chips — hanya muncul untuk source yang user
                punya entry-nya. */}
            {availableSources.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap mr-1">
                  <Filter size={11} /> Sumber
                </div>
                <button
                  type="button"
                  onClick={() => setSourceFilter('all')}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[12px] font-bold transition-all border ${
                    sourceFilter === 'all'
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                      : 'bg-surface text-text-secondary border-border hover:border-primary/40 hover:text-text'
                  }`}
                >
                  Semua · {sourceCounts.all}
                </button>
                {availableSources.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSourceFilter(s)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[12px] font-bold transition-all border ${
                      sourceFilter === s
                        ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                        : 'bg-surface text-text-secondary border-border hover:border-primary/40 hover:text-text'
                    }`}
                  >
                    {SOURCE_LABEL[s]} · {sourceCounts[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-2xl p-2.5 flex gap-3 animate-pulse">
                <div className="w-28 sm:w-32 aspect-video rounded-xl bg-surface-highlight shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-3/4 rounded bg-surface-highlight" />
                  <div className="h-3 w-1/3 rounded bg-surface-highlight" />
                  <div className="h-3 w-2/5 rounded bg-surface-highlight" />
                </div>
              </div>
            ))}
          </div>
        ) : showNoResults ? (
          <div className="text-center py-12 bg-surface border border-border rounded-2xl">
            <p className="text-[13px] font-bold text-text-secondary">
              Tidak ada hasil yang cocok dengan filter saat ini.
            </p>
            <button
              type="button"
              onClick={() => { setQuery(''); setSourceFilter('all'); }}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-primary hover:underline"
            >
              Reset filter
            </button>
          </div>
        ) : showEmptyState ? (
          <div className="text-center py-20 flex flex-col items-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-5 shadow-inner">
              <Clock size={36} className="text-primary" />
            </div>
            <h3 className="text-base font-black text-text mb-2">Belum ada riwayat</h3>
            <p className="text-[13px] text-text-secondary mb-6 max-w-xs leading-relaxed">
              Mulai nonton sebuah episode, riwayat akan otomatis tersimpan di sini.
            </p>
            <Link
              to="/browse"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold px-5 py-2.5 rounded-full shadow-md shadow-primary/30 active:scale-95 transition"
            >
              <Play size={14} /> Jelajahi Anime
            </Link>
          </div>
        ) : (
          <>
            {renderGroup('Hari Ini', groups.today)}
            {renderGroup('Minggu Ini', groups.week)}
            {renderGroup('Sebelumnya', groups.older)}
          </>
        )}
      </div>
    </div>
  );
}
