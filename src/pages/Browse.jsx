import {
  SlidersHorizontal,
  Star,
  ChevronDown,
  Play,
  X,
  Loader2,
  Filter,
  Calendar,
  Search as SearchIcon,
  CheckCircle2,
  RotateCcw,
  Flame,
  Tags,
  CalendarDays,
  Tag,
  Compass,
  ChevronRight,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchSchedule, API_BASE_URL, getProxiedImageUrl } from '../services/api';
import { filterDonghua } from '../utils/donghuaFilter';
import './Browse.css';

// Browse memakai Kuramanime sebagai sumber utama (sesuai permintaan pengguna).
// Endpoint backend: /kuramanime/browse?genre=&year=&order_by=&page=
// dan /kuramanime/genres untuk daftar genre lengkap dari situs.
const fetchKuraBrowse = async ({ genre = '', year = '', page = 1, orderBy = 'latest' }) => {
  const params = new URLSearchParams();
  if (genre) params.set('genre', genre);
  if (year) params.set('year', year);
  params.set('order_by', orderBy);
  params.set('page', String(page));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(`${API_BASE_URL}/kuramanime/browse?${params.toString()}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[Browse] HTTP ${res.status} for page ${page}`);
      return [];
    }
    const j = await res.json();
    const list = j?.data?.animeList || [];
    // Filter donghua HANYA saat user TIDAK pilih filter genre/year.
    // Saat user pilih spesifik (mis. Action), hasil dianggap sudah
    // user-curated; donghua di dalamnya jangan dibuang karena bisa jadi
    // tidak ada hasil sama sekali. Sebelumnya filter blanket bikin hasil
    // genre kosong total.
    if (!genre && !year) {
      return filterDonghua(list);
    }
    return list;
  } catch (e) {
    console.warn('[Browse] fetch error:', e);
    return [];
  }
};

const fetchKuraGenres = async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(`${API_BASE_URL}/kuramanime/genres`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const j = await res.json();
    return j?.data?.genreList || [];
  } catch (_e) {
    return [];
  }
};

// Badge sumber kecil untuk card poster. Konsisten dengan Search.jsx.
const SourceBadge = ({ source }) => {
  const s = (source || 'kuramanime').toLowerCase();
  const map = {
    kuramanime: { label: 'KURAMA', cls: 'bg-indigo-600/90 text-white' },
    otakudesu: { label: 'OTAKU', cls: 'bg-primary text-white' },
    nekopoi: { label: 'KHUSUS', cls: 'bg-pink-600 text-white' },
  };
  const meta = map[s] || map.kuramanime;
  return (
    <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md shadow-sm backdrop-blur-sm ${meta.cls}`}>
      {meta.label}
    </span>
  );
};

export default function Browse() {
  const location = useLocation();
  // Tab default: kalau ada autoFilterGenre, langsung tampil "terbaru" (hasil
  // sudah difilter). Kalau tidak, tampilkan "terbaru" sebagai entry default
  // ala nanimeid. Override tetap respect location.state?.tab.
  const [activeTab, setActiveTab] = useState(
    location.state?.tab || (location.state?.autoFilterGenre ? 'terbaru' : 'terbaru')
  );
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(!!location.state?.autoFilterGenre);
  const [selectedGenre, setSelectedGenre] = useState(location.state?.autoFilterGenre || '');
  const [selectedYear, setSelectedYear] = useState('');
  const [genres, setGenres] = useState([]);
  const [isFiltered, setIsFiltered] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);

  // Schedule states
  const [scheduleList, setScheduleList] = useState([]);
  const [activeDay, setActiveDay] = useState(
    () => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]
  );

  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const daysData = (() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayName = DAY_NAMES[d.getDay()];
      return {
        dateNum: String(d.getDate()).padStart(2, '0'),
        dayName,
        yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        apiDay: dayName,
      };
    });
  })();

  // Popular genres untuk chip rail di tab Terbaru (mirip Home.jsx)
  const popularGenres = [
    { name: 'Action', id: 'action' },
    { name: 'Romance', id: 'romance' },
    { name: 'Comedy', id: 'comedy' },
    { name: 'Fantasy', id: 'fantasy' },
    { name: 'Isekai', id: 'isekai' },
    { name: 'School', id: 'school' },
    { name: 'Sci-Fi', id: 'sci-fi' },
    { name: 'Drama', id: 'drama' },
    { name: 'Slice of Life', id: 'slice-of-life' },
    { name: 'Supernatural', id: 'supernatural' },
  ];

  // Load genres + initial catalog + schedule
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [g, sched] = await Promise.all([fetchKuraGenres(), fetchSchedule()]);
      if (cancelled) return;
      setGenres(g);
      setScheduleList(sched || []);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const items = await fetchKuraBrowse({ page: 1, orderBy: 'latest' });
      if (cancelled) return;
      setCatalog(items.map(mapItem));
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const mapItem = (a) => ({
    id: a.animeId,
    title: a.title,
    posterUrl: a.poster,
    rating: a.score && a.score !== 'N/A' ? a.score : null,
    source: 'kuramanime',
  });

  const autoFilterGenre = location.state?.autoFilterGenre;
  const autoFilterRef = useRef(false);
  useEffect(() => {
    if (!autoFilterGenre || autoFilterRef.current) return;
    if (!genres || genres.length === 0) return;
    autoFilterRef.current = true;
    // Set langsung selectedGenre + trigger apply via fetchKuraBrowse, tanpa
    // membuka modal filter — supaya user yang datang dari Home langsung lihat
    // hasil tanpa modal mengganggu.
    (async () => {
      setSelectedGenre(autoFilterGenre);
      setFilterLoading(true);
      setIsLoading(true);
      const items = await fetchKuraBrowse({ genre: autoFilterGenre, page: 1, orderBy: 'latest' });
      setCatalog(items.map(mapItem));
      setIsFiltered(true);
      setPage(1);
      setFilterLoading(false);
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFilterGenre, genres]);

  // Draft state untuk modal filter — supaya user bisa pilih banyak genre/tahun
  // lalu klik "Terapkan" baru request ke server. Lebih hemat dan UX lebih
  // jelas daripada apply per chip.
  const [draftGenre, setDraftGenre] = useState('');
  const [draftYear, setDraftYear] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  // Sinkronkan draft dengan selected aktif saat modal kebuka.
  useEffect(() => {
    if (showFilters) {
      setDraftGenre(selectedGenre);
      setDraftYear(selectedYear);
      setGenreSearch('');
    }
  }, [showFilters]);

  // Daftar genre yang difilter berdasarkan input search (modal).
  const filteredGenreList = useMemo(() => {
    const q = (genreSearch || '').trim().toLowerCase();
    if (!q) return genres;
    return genres.filter((g) =>
      (g.title || '').toLowerCase().includes(q) || (g.slug || '').toLowerCase().includes(q)
    );
  }, [genres, genreSearch]);

  // Search untuk tab Genre (chip grid). Terpisah supaya modal tidak ikut
  // mereset isi search di tab Genre.
  const [genreTabSearch, setGenreTabSearch] = useState('');
  const filteredGenreTabList = useMemo(() => {
    const q = (genreTabSearch || '').trim().toLowerCase();
    if (!q) return genres;
    return genres.filter((g) =>
      (g.title || '').toLowerCase().includes(q) || (g.slug || '').toLowerCase().includes(q)
    );
  }, [genres, genreTabSearch]);

  const applyDraftFilter = async () => {
    setSelectedGenre(draftGenre);
    setSelectedYear(draftYear);
    setShowFilters(false);
    setFilterLoading(true);
    setIsLoading(true);
    if (!draftGenre && !draftYear) {
      // Reset jadi tampilan default.
      setIsFiltered(false);
      const items = await fetchKuraBrowse({ page: 1, orderBy: 'latest' });
      setCatalog(items.map(mapItem));
    } else {
      const items = await fetchKuraBrowse({ genre: draftGenre, year: draftYear, page: 1, orderBy: 'latest' });
      setCatalog(items.map(mapItem));
      setIsFiltered(true);
    }
    setPage(1);
    setFilterLoading(false);
    setIsLoading(false);
  };

  const clearDraft = () => {
    setDraftGenre('');
    setDraftYear('');
  };

  const resetFilter = async () => {
    setSelectedGenre('');
    setSelectedYear('');
    setIsFiltered(false);
    setPage(1);
    setIsLoading(true);
    const items = await fetchKuraBrowse({ page: 1, orderBy: 'latest' });
    setCatalog(items.map(mapItem));
    setIsLoading(false);
  };

  const loadMore = async () => {
    setIsLoading(true);
    const next = page + 1;
    const items = await fetchKuraBrowse({
      genre: selectedGenre,
      year: selectedYear,
      page: next,
      orderBy: 'latest',
    });
    // Prevent duplicates by checking IDs
    setCatalog((prev) => {
      const existingIds = new Set(prev.map(a => a.id));
      const newItems = items.map(mapItem).filter(a => !existingIds.has(a.id));
      return [...prev, ...newItems];
    });
    setPage(next);
    setIsLoading(false);
  };

  // Klik chip genre di tab Genre → langsung apply + lompat ke tab Terbaru.
  const handleGenreChipClick = async (slug) => {
    setActiveTab('terbaru');
    setSelectedGenre(slug);
    setFilterLoading(true);
    setIsLoading(true);
    const items = await fetchKuraBrowse({ genre: slug, year: selectedYear, page: 1, orderBy: 'latest' });
    setCatalog(items.map(mapItem));
    setIsFiltered(true);
    setPage(1);
    setFilterLoading(false);
    setIsLoading(false);
    // Scroll ke atas supaya hasil langsung kelihatan.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 2026 → 2000
  const years = [];
  for (let y = new Date().getFullYear(); y >= 2000; y--) years.push(String(y));

  // Schedule data
  const currentDayInfo = daysData.find((d) => d.apiDay === activeDay) || daysData[0];
  const dayObj = scheduleList.find((s) => (s.title || '').toLowerCase() === activeDay.toLowerCase());
  const dayAnime = (dayObj?.animeList || []).map((anime) => {
    const source = anime.source || 'otakudesu';
    let posterUrl = anime.poster || '';
    if (posterUrl && source === 'kuramanime') {
      posterUrl = getProxiedImageUrl(posterUrl, 'https://v18.kuramanime.ing/');
    }
    if (!posterUrl) {
      posterUrl = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(anime.title)}`;
    }
    return {
      id: anime.animeId,
      title: anime.title,
      posterUrl,
      jam: anime.jam ? `${anime.jam} WIB` : '',
      source,
    };
  });

  const activeFilterChips = [
    selectedGenre && {
      label: genres.find((g) => g.slug === selectedGenre)?.title || selectedGenre,
      onClear: async () => {
        setSelectedGenre('');
        setIsLoading(true);
        const items = await fetchKuraBrowse({ year: selectedYear, page: 1, orderBy: 'latest' });
        setCatalog(items.map(mapItem));
        setIsFiltered(!!selectedYear);
        setIsLoading(false);
      },
    },
    selectedYear && {
      label: selectedYear,
      onClear: async () => {
        setSelectedYear('');
        setIsLoading(true);
        const items = await fetchKuraBrowse({ genre: selectedGenre, page: 1, orderBy: 'latest' });
        setCatalog(items.map(mapItem));
        setIsFiltered(!!selectedGenre);
        setIsLoading(false);
      },
    },
  ].filter(Boolean);

  // Definisi tab — pill dengan icon + label. Tab Genre dihapus, filter genre
  // tetap tersedia via modal filter dan chip popular di tab Terbaru.
  const TABS = [
    { key: 'terbaru', label: 'Terbaru', icon: Flame, testId: 'tab-terbaru' },
    { key: 'schedule', label: 'Jadwal', icon: CalendarDays, testId: 'tab-jadwal-rilis' },
  ];

  return (
    <div className="browse-container pb-28 bg-bg text-text">
      <div className="container-max pt-24">
        {/* Hero header — eyebrow + big title + tagline (nanimeid style). */}
        <header className="mb-6">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-primary mb-2">
            <Compass size={11} /> Jelajah
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-text leading-[1.05]">
            Telusuri dunia anime
          </h1>
          <p className="text-[13px] sm:text-sm text-text-secondary font-medium mt-2 leading-relaxed max-w-md">
            Pilih berdasarkan genre, susuri update terbaru, atau ikuti jadwal tayang minggu ini.
          </p>
        </header>

        {/* Tab pills — Terbaru / Genre / Jadwal */}
        <div className="flex items-center gap-2 mb-7 -mx-1 overflow-x-auto no-scrollbar px-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                data-testid={tab.testId}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-bold transition-all border active:scale-95 ${
                  isActive
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                    : 'bg-surface text-text-secondary border-border hover:border-primary/40 hover:text-text'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'terbaru' && (
          <>
            {/* Sub-header: judul section + filter button */}
            <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-black tracking-tight text-text leading-tight">
                  {isFiltered ? 'Hasil Filter' : 'Update Terbaru'}
                </h2>
                <p className="text-[12px] text-text-secondary font-medium mt-0.5 leading-relaxed">
                  {isFiltered
                    ? `${catalog.length} anime ditemukan`
                    : 'Anime paling baru dari Kuramanime.'}
                </p>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border active:scale-95 ${
                  showFilters
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                    : 'bg-surface text-text-secondary border-border hover:border-primary/40'
                }`}
              >
                <SlidersHorizontal size={16} /> Filter
              </button>
            </div>

            {/* Active filter chips */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {activeFilterChips.map((chip, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold">
                    {chip.label}
                    <button onClick={chip.onClear} className="hover:bg-primary/20 rounded-full p-0.5 transition" aria-label="Hapus filter">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <button onClick={resetFilter} className="text-xs font-bold text-text-muted hover:text-red-500 px-2 py-1.5 transition">
                  Reset semua
                </button>
              </div>
            )}

            {/* Popular genre chips — quick filter tanpa buka modal */}
            <div className="mb-5">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                {popularGenres.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => handleGenreChipClick(genre.id)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full text-[12px] font-bold border bg-surface border-border text-text-secondary hover:bg-surface-highlight hover:border-primary/40 hover:text-text transition active:scale-95"
                  >
                    {genre.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
              {catalog.map((anime) => (
                <Link
                  to={`/video/${anime.id}?source=kuramanime`}
                  key={`${anime.id}-${anime.title}`}
                  data-testid="anime-card-normal"
                  className="group relative rounded-2xl overflow-hidden bg-surface border border-border shadow-sm card-lift"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                    <img
                      src={anime.posterUrl}
                      alt={anime.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                      onError={(e) => {
                        const fb = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(anime.title || 'Anime')}`;
                        if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                      }}
                    />
                    {/* Gradient untuk legibility judul di atasnya */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

                    {/* Source badge top-left */}
                    <div className="absolute top-2 left-2">
                      <SourceBadge source={anime.source} />
                    </div>

                    {/* Rating badge top-right */}
                    {anime.rating && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-yellow-400 text-[10px] font-bold">
                        <Star size={10} fill="currentColor" /> {anime.rating}
                      </div>
                    )}

                    {/* Play overlay on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-primary/95 rounded-full p-3 shadow-2xl transform scale-50 group-hover:scale-100 transition-transform">
                        <Play size={22} className="text-white fill-white" />
                      </div>
                    </div>

                    {/* Title overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-2.5">
                      <h4 className="text-[12px] sm:text-[13px] font-bold text-white line-clamp-2 leading-snug drop-shadow">
                        {anime.title}
                      </h4>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5 mt-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden border border-border bg-surface">
                    <div className="skeleton aspect-[3/4]" />
                  </div>
                ))}
              </div>
            ) : (
              catalog.length > 0 && (
                <button
                  className="mt-10 mx-auto flex items-center gap-2 px-6 py-3 rounded-full bg-surface hover:bg-surface-highlight border border-border text-text font-bold text-sm active:scale-95 transition-all shadow-sm"
                  onClick={loadMore}
                >
                  Muat Lebih Banyak <ChevronDown size={16} />
                </button>
              )
            )}

            {!isLoading && catalog.length === 0 && (
              <div className="text-center py-12 text-text-secondary bg-surface rounded-3xl border border-border p-8 shadow-sm">
                Tidak ada anime cocok dengan filter ini.
              </div>
            )}
          </>
        )}

        {activeTab === 'schedule' && (
          <div>
            {/* Day pills */}
            <div data-testid="day-selector-list" className="flex gap-2 overflow-x-auto no-scrollbar pb-4 mb-6 border-b border-border">
              {daysData.map((d) => (
                <button
                  key={d.apiDay}
                  data-testid="day-selector-item"
                  onClick={() => setActiveDay(d.apiDay)}
                  className={`whitespace-nowrap px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border flex flex-col items-center min-w-[64px] active:scale-95 ${
                    activeDay === d.apiDay
                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                      : 'bg-surface border-border text-text-secondary hover:bg-surface-highlight'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-80">{d.dayName.slice(0, 3)}</span>
                  <span className="text-base font-black leading-none mt-0.5">{d.dateNum}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-6 bg-surface border border-border px-5 py-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-4">
                <span className="text-4xl font-black text-text leading-none">{currentDayInfo.dateNum}</span>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-black tracking-[0.18em] text-text-muted leading-none mb-1">
                    {currentDayInfo.dayName}
                  </span>
                  <span className="text-xs font-bold text-text-secondary leading-none">{currentDayInfo.yearMonth}</span>
                </div>
              </div>
              <div className="bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 rounded-full text-xs font-bold">
                {dayAnime.length} anime
              </div>
            </div>

            {dayAnime.length > 0 ? (
              <div data-testid="schedule-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-5">
                {dayAnime.map((anime) => (
                  <Link
                    to={`/video/${anime.id}?source=${anime.source}`}
                    key={`${anime.source}-${anime.id}`}
                    data-testid="schedule-card-item"
                    className="group rounded-2xl overflow-hidden bg-surface border border-border shadow-sm hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40 transition-all duration-300"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                      <img
                        src={anime.posterUrl}
                        alt={anime.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

                      {/* Source badge top-left */}
                      <div className="absolute top-2 left-2">
                        <SourceBadge source={anime.source} />
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 p-2.5 space-y-1">
                        <h4 className="text-[11px] md:text-[13px] font-bold text-white line-clamp-1 leading-snug drop-shadow">
                          {anime.title}
                        </h4>
                        {anime.jam && (
                          <span className="inline-block text-[9px] md:text-[10px] font-bold bg-primary/95 backdrop-blur-sm text-white px-2 py-0.5 rounded-md">
                            {anime.jam}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-text-secondary bg-surface rounded-3xl border border-border p-8 shadow-sm">
                Tidak ada jadwal rilis untuk {activeDay}.
              </div>
            )}
          </div>
        )}

        {/* Filter modal bottom-sheet — premium, scrollable, dengan
            search bar untuk genre dan section terpisah yang rapi. */}
        {showFilters && (
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 animate-fade-in"
            onClick={() => setShowFilters(false)}
          >
            <div
              className="bg-surface border-t sm:border border-border rounded-t-[32px] sm:rounded-[28px] max-w-md w-full shadow-2xl flex flex-col"
              style={{ maxHeight: '92vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky header */}
              <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-surface rounded-t-[32px] sm:rounded-t-[28px]">
                <div className="sm:hidden mx-auto -mt-2 mb-3 w-12 h-1.5 rounded-full bg-text-muted/30" />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                      <SlidersHorizontal size={18} />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="text-[16px] font-black text-text leading-tight">Filter Anime</h3>
                      <p className="text-[12px] text-text-secondary font-medium leading-tight">
                        Pilih genre dan tahun untuk mempersempit pencarian
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="w-9 h-9 rounded-2xl bg-surface-highlight hover:bg-border text-text-muted hover:text-text transition flex items-center justify-center active:scale-95 shrink-0"
                    aria-label="Tutup"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div
                className="flex-1 overflow-y-auto custom-scrollbar px-6 pt-5 pb-6 space-y-6"
                style={{ paddingBottom: '24px' }}
              >
                {/* Genre section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Filter size={14} className="text-primary" />
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-text">Genre</span>
                    </div>
                    {draftGenre && (
                      <button
                        type="button"
                        onClick={() => setDraftGenre('')}
                        className="text-[11px] font-bold text-text-muted hover:text-red-500 transition"
                      >
                        Bersihkan
                      </button>
                    )}
                  </div>

                  {/* Search bar untuk genre */}
                  <div className="relative">
                    <SearchIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={genreSearch}
                      onChange={(e) => setGenreSearch(e.target.value)}
                      placeholder="Cari genre..."
                      className="w-full bg-surface-highlight border border-border rounded-2xl pl-10 pr-3 py-2.5 text-[13px] text-text outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-medium placeholder:text-text-muted"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftGenre('')}
                      className={`px-3 py-2.5 rounded-xl text-[12px] font-bold border transition-all active:scale-95 ${
                        !draftGenre
                          ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                          : 'bg-surface-highlight text-text-secondary border-border hover:border-primary/40 hover:text-text'
                      }`}
                    >
                      Semua
                    </button>
                    {filteredGenreList.map((g) => (
                      <button
                        key={g.slug}
                        type="button"
                        onClick={() => setDraftGenre(g.slug)}
                        className={`px-3 py-2.5 rounded-xl text-[12px] font-bold border transition-all active:scale-95 truncate ${
                          draftGenre === g.slug
                            ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                            : 'bg-surface-highlight text-text-secondary border-border hover:border-primary/40 hover:text-text'
                        }`}
                      >
                        {g.title}
                      </button>
                    ))}
                    {filteredGenreList.length === 0 && (
                      <div className="col-span-3 text-center py-4 text-[12px] text-text-muted font-medium">
                        Tidak ada genre cocok dengan "{genreSearch}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Year section */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-3 pt-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-primary" />
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-text">Tahun Rilis</span>
                    </div>
                    {draftYear && (
                      <button
                        type="button"
                        onClick={() => setDraftYear('')}
                        className="text-[11px] font-bold text-text-muted hover:text-red-500 transition"
                      >
                        Bersihkan
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftYear('')}
                      className={`px-2.5 py-2.5 rounded-xl text-[12px] font-bold border transition-all active:scale-95 ${
                        !draftYear
                          ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                          : 'bg-surface-highlight text-text-secondary border-border hover:border-primary/40 hover:text-text'
                      }`}
                    >
                      Semua
                    </button>
                    {years.slice(0, 23).map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setDraftYear(y)}
                        className={`px-2.5 py-2.5 rounded-xl text-[12px] font-bold border transition-all active:scale-95 ${
                          draftYear === y
                            ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                            : 'bg-surface-highlight text-text-secondary border-border hover:border-primary/40 hover:text-text'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary kalau draft != selected aktif */}
                {(draftGenre || draftYear) && (
                  <div className="px-4 py-3 rounded-2xl bg-primary/5 border border-primary/20">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary mb-1.5">Pilihanmu</p>
                    <p className="text-[13px] font-bold text-text leading-relaxed">
                      {draftGenre ? (genres.find((g) => g.slug === draftGenre)?.title || draftGenre) : 'Semua genre'}
                      <span className="text-text-muted mx-1.5">·</span>
                      {draftYear || 'Semua tahun'}
                    </p>
                  </div>
                )}
              </div>

              {/* Sticky footer actions */}
              <div
                className="shrink-0 px-6 py-4 border-t border-border bg-surface flex gap-3"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
              >
                <button
                  type="button"
                  onClick={clearDraft}
                  disabled={!draftGenre && !draftYear}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-2xl bg-surface-highlight hover:bg-border text-text-secondary font-bold text-[13px] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={14} /> Reset
                </button>
                <button
                  type="button"
                  onClick={applyDraftFilter}
                  disabled={filterLoading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary hover:bg-primary-dark text-white font-bold text-[13px] shadow-md shadow-primary/30 active:scale-95 transition-all disabled:opacity-60"
                >
                  {filterLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Memuat...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} /> Terapkan
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
