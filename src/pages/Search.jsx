import { Search as SearchIcon, Play, TrendingUp, Sparkles, Clock, X, Filter, Loader2 } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import { searchAnimeAggregate, searchAnime, liveSearchKurama, getProxiedImageUrl } from '../services/api';
import { fuzzyRank, scoreTitle } from '../utils/fuzzyMatch';
import { isKhususUnlocked, subscribeKhusus } from '../utils/khususAuth';
import { buildVideoHref } from '../utils/buildVideoHref';
import './Search.css';

// Kunci sessionStorage untuk persistensi query + hasil search ketika user
// pergi ke halaman video lalu kembali. sessionStorage dipilih (bukan
// localStorage) supaya state hilang saat tab/aplikasi ditutup, jadi tidak
// menyimpan riwayat panjang. Hasil di-cache 5 menit supaya kalau user
// kembali lewat dari 5 menit, query tetap, tapi hasil di-fetch ulang
// (mungkin ada release baru).
const SEARCH_STATE_KEY = 'mahistream_search_state_v1';
const SEARCH_STATE_TTL_MS = 5 * 60 * 1000;

// Pemetaan query → anime terakhir yang dipilih user. Saat klik chip
// "Riwayat Pencarian", langsung navigate ke anime tsb (bukan re-search).
const PICK_MAP_KEY = 'mahistream_search_lastpick_v1';

const readPickMap = () => {
  try {
    const raw = localStorage.getItem(PICK_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};

const writePickMap = (map) => {
  try { localStorage.setItem(PICK_MAP_KEY, JSON.stringify(map)); } catch {}
};

const recordLastPick = (query, anime) => {
  if (!query || !anime) return;
  const q = String(query).trim().toLowerCase();
  if (!q) return;
  const map = readPickMap();
  map[q] = {
    id: anime.animeId || anime.id,
    source: anime._source || anime.source || 'otakudesu',
    sourceIds: anime.sourceIds || null,
    title: anime.title || '',
    poster: anime.poster_url || anime.posterUrl || anime.poster || '',
    ts: Date.now(),
  };
  // Cap entry agar tidak meledak (FIFO).
  const keys = Object.keys(map);
  if (keys.length > 60) {
    const sorted = keys.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
    sorted.slice(0, keys.length - 60).forEach((k) => delete map[k]);
  }
  writePickMap(map);
};

const getLastPick = (query) => {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  if (!q) return null;
  const map = readPickMap();
  return map[q] || null;
};

const readSavedState = () => {
  try {
    const raw = sessionStorage.getItem(SEARCH_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const persistSearchState = (state) => {
  try {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch {
    /* quota / private mode */
  }
};

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialState = readSavedState();
  const initialQuery = searchParams.get('q') || initialState?.query || '';
  const isFreshlyMountedRef = useRef(true);

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  // Hasil di-cache di session-storage. Pakai sebagai initial value supaya
  // saat user kembali dari halaman video, hasil sebelumnya langsung tampil
  // tanpa flicker / re-fetch.
  const [results, setResults] = useState(() => {
    if (!initialState || initialState.query !== initialQuery) return [];
    if (Date.now() - (initialState.ts || 0) > SEARCH_STATE_TTL_MS) return [];
    return Array.isArray(initialState.results) ? initialState.results : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [khususUnlocked, setKhususUnlocked] = useState(() => isKhususUnlocked());
  // Filter aktif per-sumber. Default semua aktif. User bisa toggle chip
  // untuk mempersempit hasil ke sumber tertentu (mis. cuma Kurama).
  const [sourceFilters, setSourceFilters] = useState({ otakudesu: true, kuramanime: true, nekopoi: true });

  // Sinkronkan URL ?q= dengan state. Memakai replaceState supaya tombol
  // back tetap mengembalikan ke halaman sebelum search (bukan ke versi
  // sebelumnya dari halaman search yang sama).
  useEffect(() => {
    const currentQ = searchParams.get('q') || '';
    if (searchQuery && searchQuery !== currentQ) {
      setSearchParams({ q: searchQuery }, { replace: true });
    } else if (!searchQuery && currentQ) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Persist query + hasil saat ada perubahan agar pas user kembali, halaman
  // search langsung tampil dengan state terakhir.
  useEffect(() => {
    if (!searchQuery) {
      // Bersihkan saat input kosong supaya tidak nyangkut.
      try { sessionStorage.removeItem(SEARCH_STATE_KEY); } catch {}
      return;
    }
    persistSearchState({ query: searchQuery, results });
  }, [searchQuery, results]);

  // Re-render daftar hasil saat status unlock berubah supaya item nekopoi
  // muncul/hilang langsung tanpa user harus reload.
  useEffect(() => {
    const unsubscribe = subscribeKhusus((next) => setKhususUnlocked(next));
    return () => unsubscribe();
  }, []);

  // Saring hasil dari sumber nekopoi sebelum dirender selama fitur khusus
  // masih terkunci. Lalu juga apply filter chip sumber yang aktif. Terakhir
  // re-rank lewat fuzzy match supaya judul terdekat (typo / cross-language)
  // naik ke atas.
  const visibleResults = useMemo(() => {
    let arr = results;
    // CATATAN: filter `!khususUnlocked` lama yang membuang hasil Nekopoi-only
    // dihapus — user ingin search universal (termasuk anime dari Nekopoi)
    // muncul di tab Search. Tag "KHUSUS" tetap dipasang di card supaya user
    // tahu konten dewasa. Gate password Khusus di-handle di tab /khusus
    // dan saat user klik card, halaman video akan tampilkan konten kalau
    // anime memang Nekopoi (player tidak gate per-video).
    //
    // Filter berdasarkan chip sumber: tampilkan item kalau setidaknya satu
    // sumbernya masih aktif. Kalau SEMUA chip off, tampilkan apa adanya.
    const anyActive = Object.values(sourceFilters).some(Boolean);
    if (anyActive) {
      arr = arr.filter((item) => {
        const sources = item.availableSources || [item._source];
        return sources.some((s) => sourceFilters[s]);
      });
    }
    if (searchQuery && searchQuery.length >= 2) {
      arr = fuzzyRank(arr, searchQuery, (x) => x.title, 0.2);
    }
    return arr;
  }, [results, searchQuery, sourceFilters]);
  const [popularSearches] = useState(() => {
    const pool = [
      'Solo Leveling', 'Jujutsu Kaisen', 'Demon Slayer', 'Chainsaw Man', 'One Piece',
      'Naruto', 'Bleach', 'Attack on Titan', 'My Hero Academia', 'Spy x Family',
      'Oshi no Ko', 'Frieren', 'Mushoku Tensei', 'Re:Zero', 'Sword Art Online',
      'Tokyo Revengers', 'Blue Lock', 'Vinland Saga', 'Dragon Ball', 'Dandadan',
      'Kaiju No. 8', 'Wind Breaker', 'Shangri-La Frontier', 'Undead Unluck', 'Sakamoto Days'
    ];
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5);
  });

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('mahistream_search_history') || '[]');
    setSearchHistory(history);
  }, []);

  const saveSearchToHistory = (query) => {
    if (!query || query.trim() === '') return;
    const q = query.trim();
    const history = JSON.parse(localStorage.getItem('mahistream_search_history') || '[]');
    const newHistory = [q, ...history.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, 10);
    setSearchHistory(newHistory);
    localStorage.setItem('mahistream_search_history', JSON.stringify(newHistory));
  };

  const deleteSearchHistoryItem = (query) => {
    const newHistory = searchHistory.filter(item => item !== query);
    setSearchHistory(newHistory);
    localStorage.setItem('mahistream_search_history', JSON.stringify(newHistory));
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('mahistream_search_history');
  };

  // AbortController per-query — kalau user terus mengetik, request lama
  // ke server bisa di-cancel supaya tidak race condition (hasil ketikan
  // lama overwrite hasil ketikan baru). Ditambah lebih hemat bandwidth.
  const searchAbortRef = useRef(null);

  const performSearch = async (query, currentPage, isLoadMore = false, options = {}) => {
    if (!query) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setIsLoading(true);

    // Batalkan request sebelumnya kalau masih jalan.
    if (searchAbortRef.current) {
      try { searchAbortRef.current.abort(); } catch {}
    }
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;

    if (options.saveHistory) {
      saveSearchToHistory(query);
    }

    try {
      const aggregatedList = await searchAnimeAggregate(query, currentPage);

      // Jika request sudah di-abort (user ketik query baru), jangan setState
      // supaya tidak overwrite hasil query terbaru dengan hasil stale.
      if (ctrl.signal.aborted) return;

      const merged = isLoadMore ? [...results] : [];

      if (Array.isArray(aggregatedList)) {
        aggregatedList.forEach(anime => {
          const sources = anime.availableSources && anime.availableSources.length > 0
            ? anime.availableSources
            : (anime._source ? [anime._source] : ['otakudesu']);

          // Pilih sumber utama untuk navigasi. Backend aggregate biasanya
          // tidak menyertakan `_source` eksplisit, jadi kita pilih dari
          // availableSources dengan prioritas KURAMANIME dulu karena:
          //   (a) Kurama biasanya lebih lengkap metadata-nya
          //   (b) ID Kurama (1533/road-of-naruto) lebih stabil ketimbang
          //       Otakudesu slug yang kadang berubah / berbeda anime
          //   (c) User komplain: klik hasil search "dari Kurama" tetapi
          //       VideoPlayer load anime lain karena fallback ke Otakudesu
          //       slug yang ternyata mismatch.
          // Hanya pilih source yang punya sourceIds-nya supaya tidak
          // navigate ke source yang kosong.
          const PRIORITY = ['kuramanime', 'otakudesu', 'nekopoi'];
          const hasSourceId = (s) => anime.sourceIds && anime.sourceIds[s];
          const primarySource = PRIORITY.find((p) => sources.includes(p) && hasSourceId(p))
            || PRIORITY.find((p) => sources.includes(p))
            || anime._source
            || sources[0];

          // ID yang dipakai untuk navigasi harus sesuai dengan primarySource,
          // bukan ID generik. Untuk Kuramanime, animeId berisi slash
          // (mis. '1533/road-of-naruto') — pertahankan utuh.
          const navId = (anime.sourceIds && anime.sourceIds[primarySource]) || anime.id;
          if (!navId) return; // skip entry tanpa ID valid

          const mappedAnime = {
            id: navId,
            animeId: navId,
            title: anime.title,
            poster: anime.poster_url,
            posterUrl: anime.poster_url,
            score: anime.rating,
            rating: anime.rating,
            availableSources: sources,
            sourceIds: anime.sourceIds || { [primarySource]: navId },
            _source: primarySource,
          };

          const cleanTitle = mappedAnime.title.toLowerCase().trim();
          const existing = merged.find(item => item.title.toLowerCase().trim() === cleanTitle);
          if (existing) {
            if (!existing.availableSources) existing.availableSources = [existing._source];
            mappedAnime.availableSources.forEach(src => {
              if (!existing.availableSources.includes(src)) {
                existing.availableSources.push(src);
              }
            });
            existing.sourceIds = { ...existing.sourceIds, ...mappedAnime.sourceIds };
          } else {
            merged.push(mappedAnime);
          }
        });
      }

      setResults(merged);
      setHasMore(Array.isArray(aggregatedList) && aggregatedList.length > 0);
    } catch (err) {
      console.error(err);
      if (!isLoadMore) setHasMore(false);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    // Initial load recommendations (popular search like "isekai")
    const loadRecommendations = async () => {
      setIsLoading(true);
      try {
        const data = await searchAnime('isekai');
        setResults(data.map(item => ({ ...item, _source: 'otakudesu' })));
        setHasMore(false);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (!searchQuery) {
      loadRecommendations();
      return;
    }

    if (searchQuery.length >= 2) {
      // Kalau halaman baru di-mount dan kita punya hasil cached untuk query
      // ini (user kembali dari halaman video), JANGAN re-fetch — pakai
      // langsung hasil sebelumnya supaya scroll position dan list tidak
      // di-reset.
      if (
        isFreshlyMountedRef.current &&
        results.length > 0
      ) {
        isFreshlyMountedRef.current = false;
        setPage(1);
        setHasMore(true);
        return undefined;
      }
      isFreshlyMountedRef.current = false;
      setPage(1);
      // Debounce 350ms — cukup pendek supaya responsif, cukup lama supaya
      // tidak hammer server untuk tiap keystroke. Request sebelumnya
      // di-cancel via AbortController di performSearch.
      const delayDebounceFn = setTimeout(() => {
        performSearch(searchQuery, 1, false);
      }, 200);

      return () => clearTimeout(delayDebounceFn);
    } else {
      setResults([]);
      setHasMore(false);
    }
  }, [searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length >= 2) {
      setShowLiveDropdown(false);
      performSearch(q, 1, false, { saveHistory: true });
    }
  };

  // Live search dropdown — autocomplete cepat dari Kuramanime. Debounce
  // 250ms supaya UI responsive dan tidak hammer server. Dropdown
  // ditampilkan saat input fokus + ada query >= 2 char.
  const [liveResults, setLiveResults] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [showLiveDropdown, setShowLiveDropdown] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLiveResults([]);
      return undefined;
    }
    setLiveLoading(true);
    const t = setTimeout(async () => {
      const items = await liveSearchKurama(q);
      setLiveResults(items);
      setLiveLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  return (
    <div className="min-h-screen pb-28 bg-bg text-text">
      <div className="cr-container pt-6">

        {/* Hero header — nanimeid style: big title, supporting tagline */}
        <header className="mb-6">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
              <SearchIcon size={11} /> Pencarian
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-text leading-[1.05] mb-2">
            Cari anime <span className="text-primary">favoritmu</span>
          </h1>
          <p className="text-[13px] text-text-secondary font-medium leading-relaxed max-w-xl">
            Ketik judul, genre, atau studio. Saran muncul saat kamu mengetik — tekan Enter untuk cari lebih luas.
          </p>
        </header>

        {/* Search bar — big rounded pill ala nanimeid. Fokus visual yang tinggi
            supaya jadi CTA utama halaman. */}
        <form onSubmit={handleSearchSubmit} className="mb-6 relative">
          <div className="relative flex items-center bg-surface border-2 border-border rounded-full shadow-lg focus-within:shadow-xl focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 transition-all">
            <span className="flex items-center justify-center w-14 h-14 shrink-0 text-primary">
              <SearchIcon size={22} className="transition-colors" strokeWidth={2.5} />
            </span>
            <input
              type="text"
              value={searchQuery}
              data-testid="search-input"
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowLiveDropdown(true)}
              onBlur={() => setTimeout(() => setShowLiveDropdown(false), 200)}
              placeholder="Mis. one piece, naruto, attack on titan..."
              className="flex-1 min-w-0 bg-transparent py-4 pr-4 text-text outline-none font-medium placeholder:text-text-muted text-[15px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mr-2 w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-surface-highlight hover:bg-border text-text-muted hover:text-text transition active:scale-95"
                aria-label="Bersihkan"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={!searchQuery.trim() || searchQuery.trim().length < 2}
              className="mr-2 px-5 py-2.5 rounded-full bg-primary hover:bg-primary-dark text-white font-bold text-[12.5px] shadow-md shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              Cari
            </button>

            {/* Live autocomplete dropdown — rich nanimeid-style rows */}
            {showLiveDropdown && searchQuery.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-surface border border-border rounded-3xl shadow-2xl z-30 overflow-hidden max-h-[460px] overflow-y-auto custom-scrollbar">
                {liveLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-text-muted">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[12.5px] font-bold">Mencari saran...</span>
                  </div>
                ) : liveResults.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <p className="text-[12.5px] text-text-muted font-medium">
                      Tidak ada saran cepat untuk "<span className="font-bold text-text">{searchQuery.trim()}</span>".
                    </p>
                    <p className="text-[11px] text-text-muted mt-1">
                      Tekan <kbd className="px-1.5 py-0.5 rounded bg-surface-highlight border border-border text-[10px] font-black">Enter</kbd> untuk cari lebih luas.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="px-5 py-2.5 text-[10.5px] font-black uppercase tracking-[0.18em] text-text-muted border-b border-border bg-surface-highlight/40 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Sparkles size={11} /> Saran cepat</span>
                      <span className="font-bold normal-case tracking-normal text-text-muted">{liveResults.length} hasil</span>
                    </div>
                    {liveResults.map((item, idx) => {
                      const src = item.source || 'kuramanime';
                      const srcLabel = src === 'kuramanime' ? 'KURAMA' : src === 'otakudesu' ? 'OTAKU' : String(src).toUpperCase();
                      const srcColor = src === 'kuramanime'
                        ? 'bg-indigo-600/15 text-indigo-500'
                        : src === 'otakudesu'
                          ? 'bg-[#c68a4e]/15 text-[#c68a4e]'
                          : 'bg-zinc-600/15 text-zinc-500';
                      return (
                      <Link
                        key={`${src}-${item.animeId}`}
                        to={buildVideoHref({ id: item.animeId, _source: src, sourceIds: { [src]: item.animeId } })}
                        onClick={() => {
                          recordLastPick(searchQuery, {
                            animeId: item.animeId,
                            id: item.animeId,
                            title: item.title,
                            poster_url: item.poster,
                            _source: src,
                            sourceIds: { [src]: item.animeId },
                          });
                          setShowLiveDropdown(false);
                        }}
                        className={`flex items-center gap-3.5 px-4 py-3 hover:bg-surface-highlight transition-colors border-b border-border/60 last:border-b-0 ${
                          idx === 0 ? 'bg-primary/5' : ''
                        }`}
                      >
                        <img
                          src={item.poster || `https://placehold.co/80x108/c68a4e/fff?text=?`}
                          alt={item.title}
                          loading="lazy"
                          className="w-12 h-16 rounded-xl object-cover shrink-0 bg-surface-highlight shadow-sm"
                          onError={(e) => {
                            const fb = `https://placehold.co/80x108/c68a4e/fff?text=?`;
                            if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-bold text-text line-clamp-2 leading-snug">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${srcColor}`}>
                              {srcLabel}
                            </span>
                            {item.score && item.score !== 'N/A' && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] text-primary font-bold">
                                ★ {item.score}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 w-7 h-7 rounded-full bg-surface-highlight flex items-center justify-center text-text-muted">
                          <SearchIcon size={13} />
                        </span>
                      </Link>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Quick suggestion chips — selalu tampil saat input kosong supaya
            user punya entry point cepat tanpa mengetik (nanimeid pattern). */}
        {!searchQuery && (
          <div className="mb-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center text-[10.5px] font-black uppercase tracking-[0.16em] text-text-muted px-1 py-1.5">
              Coba cari:
            </span>
            {['One Piece', 'Naruto', 'Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'Solo Leveling'].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setSearchQuery(q);
                  performSearch(q, 1, false, { saveHistory: true });
                }}
                className="px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-highlight border border-border text-[12px] font-bold text-text-secondary hover:text-primary hover:border-primary/40 active:scale-95 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Source filter chips */}
        {searchQuery.length >= 2 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6 pb-1">
            <div className="flex items-center gap-2 text-[11px] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap">
              <Filter size={12} /> Sumber:
            </div>
            {[
              { key: 'otakudesu', label: 'Otaku', color: 'bg-[#c68a4e]' },
              { key: 'kuramanime', label: 'Kurama', color: 'bg-indigo-600' },
              ...(khususUnlocked ? [{ key: 'nekopoi', label: 'Khusus', color: 'bg-pink-600' }] : []),
            ].map((src) => (
              <button
                key={src.key}
                onClick={() => setSourceFilters((f) => ({ ...f, [src.key]: !f[src.key] }))}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  sourceFilters[src.key]
                    ? `${src.color} text-white border-transparent shadow-sm`
                    : 'bg-surface text-text-secondary border-border hover:border-primary/40'
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>
        )}

        {/* Search history */}
        {searchHistory.length > 0 && !searchQuery && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted flex items-center gap-2">
                <Clock size={13} /> Riwayat Pencarian
              </h2>
              <button
                onClick={() => setShowConfirmDelete(true)}
                data-testid="search-history-delete-btn"
                className="text-[11px] text-red-500 hover:text-white font-bold border border-red-500/30 hover:bg-red-500 hover:border-red-500 px-3 py-1.5 rounded-xl transition-all"
              >
                Hapus Semua
              </button>
            </div>
            <div data-testid="search-history-list" className="flex flex-wrap gap-2">
              {searchHistory.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center bg-surface hover:bg-surface-highlight border border-border rounded-2xl pl-4 pr-1 py-1.5 transition group shadow-sm"
                >
                  <button
                    onClick={() => {
                      // Kalau user pernah memilih anime spesifik untuk query
                      // ini sebelumnya, langsung navigate ke anime itu
                      // (perilaku ala nanimeid: history search = shortcut).
                      const last = getLastPick(item);
                      if (last?.id) {
                        const href = buildVideoHref({
                          id: last.id,
                          _source: last.source,
                          sourceIds: last.sourceIds || { [last.source]: last.id },
                          availableSources: last.sourceIds ? Object.keys(last.sourceIds) : [last.source],
                        });
                        navigate(href);
                        return;
                      }
                      setSearchQuery(item);
                      performSearch(item, 1, false, { saveHistory: true });
                    }}
                    className="text-[13px] font-bold text-text mr-2"
                    title={getLastPick(item)?.title ? `Buka ${getLastPick(item).title}` : `Cari "${item}"`}
                  >
                    {item}
                  </button>
                  <button
                    onClick={() => deleteSearchHistoryItem(item)}
                    className="w-7 h-7 rounded-full hover:bg-red-500/15 text-text-muted hover:text-red-500 transition flex items-center justify-center"
                    aria-label="Hapus"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular searches */}
        {!searchQuery && (
          <div
            data-testid="populer-section"
            className="mb-8 bg-gradient-to-br from-surface to-surface-highlight border border-primary/20 p-6 rounded-3xl shadow-md"
          >
            <h2 className="text-[15px] font-black text-text mb-5 flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/30">
                <TrendingUp size={17} className="text-white" />
              </span>
              Pencarian Populer
            </h2>
            <div className="flex flex-col gap-1.5">
              {popularSearches.map((item, idx) => (
                <button
                  key={item}
                  onClick={() => {
                    setSearchQuery(item);
                    performSearch(item, 1, false, { saveHistory: true });
                  }}
                  className="group flex items-center gap-3.5 px-3.5 py-3 rounded-2xl hover:bg-primary/10 transition-colors text-left"
                >
                  <span className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-[13px] font-black ${
                    idx < 3 ? 'bg-primary text-white shadow-sm' : 'bg-surface-highlight text-text-muted'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="text-[14px] font-bold text-text group-hover:text-primary transition-colors flex-1">
                    {item}
                  </span>
                  <SearchIcon size={16} className="text-text-muted group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results section */}
        <div data-testid={searchQuery ? undefined : 'rekomendasi-section'}>
          <h2 className="text-[15px] font-black uppercase tracking-[0.18em] text-text mb-5 flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            {searchQuery ? `Hasil untuk "${searchQuery}"` : 'Rekomendasi Untukmu'}
            {searchQuery && visibleResults.length > 0 && (
              <span className="text-[11px] text-text-muted font-bold normal-case tracking-normal ml-1">
                · {visibleResults.length} item
              </span>
            )}
          </h2>

          {isLoading && results.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-border bg-surface">
                  <div className="skeleton aspect-[3/4]" />
                  <div className="p-3 space-y-2">
                    <div className="skeleton h-3 w-4/5 rounded-md" />
                    <div className="skeleton h-2.5 w-2/5 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
              {visibleResults.map((anime, idx) => (
                <Link
                  to={buildVideoHref(anime)}
                  onClick={() => searchQuery && recordLastPick(searchQuery, anime)}
                  key={`${anime.animeId || anime.id}-${idx}`}
                  data-testid="rekomendasi-card"
                  className="group rounded-2xl overflow-hidden bg-surface border border-border shadow-sm card-lift"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                    <img
                      src={anime._source === 'nekopoi'
                        ? getProxiedImageUrl(anime.posterUrl || anime.poster)
                        : (anime.posterUrl || anime.poster)}
                      alt={anime.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                      onError={(e) => {
                        const fb = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(anime.title || 'Anime')}`;
                        if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {/* Source tags */}
                    <div className="absolute top-2 left-2 z-10 flex gap-1 flex-wrap max-w-[90%]">
                      {(anime.availableSources && anime.availableSources.length > 0
                        ? anime.availableSources
                        : [anime._source || 'otakudesu']
                      )
                        .filter((s) => s !== 'samehadaku')
                        .slice(0, 3)
                        .map((src) => {
                          const palette = {
                            otakudesu: 'bg-[#c68a4e] text-white',
                            kuramanime: 'bg-indigo-600 text-white',
                            nekopoi: 'bg-pink-600 text-white',
                          };
                          const label = {
                            otakudesu: 'OTAKU',
                            kuramanime: 'KURAMA',
                            nekopoi: 'KHUSUS',
                          };
                          return (
                            <span
                              key={src}
                              className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-md ${palette[src] || 'bg-zinc-700 text-white'}`}
                            >
                              {label[src] || src}
                            </span>
                          );
                        })}
                    </div>
                    {/* Hover play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-primary/95 rounded-full p-3.5 shadow-2xl transform scale-50 group-hover:scale-100 transition-transform">
                        <Play size={22} className="text-white fill-white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="text-[13px] font-bold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {anime.title}
                    </h4>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            searchQuery && (
              <div className="text-center py-16 flex flex-col items-center">
                <div className="w-20 h-20 rounded-3xl bg-surface-highlight border border-border flex items-center justify-center mb-5">
                  <SearchIcon size={36} className="text-text-muted" />
                </div>
                <h3 className="text-base font-black text-text mb-2">Tidak ditemukan</h3>
                <p className="text-[13px] text-text-secondary max-w-xs leading-relaxed">
                  Tidak ada hasil untuk "<span className="font-bold text-text">{searchQuery}</span>". Coba kata kunci lain atau periksa ejaan.
                </p>
              </div>
            )
          )}
        </div>

      </div>

      {/* Confirmation Modal (Riwayat Pencarian) */}
      {showConfirmDelete && (
        <div data-testid="search-delete-confirm-modal" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-6">
            <h3 data-testid="search-delete-confirm-text" className="text-lg font-bold text-text">Apakah anda yakin akan menghapus ini</h3>
            <div className="flex flex-col gap-3">
              <button
                data-testid="search-delete-confirm-btn"
                onClick={() => {
                  clearSearchHistory();
                  setShowConfirmDelete(false);
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl shadow-lg transition active:scale-95 cursor-pointer"
              >
                Hapus
              </button>
              <button
                data-testid="search-delete-cancel-btn"
                onClick={() => setShowConfirmDelete(false)}
                className="w-full bg-black hover:bg-zinc-900 text-white font-bold py-3 rounded-2xl shadow-md transition active:scale-95 cursor-pointer"
              >
                Kembali
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
