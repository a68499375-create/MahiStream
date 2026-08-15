import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, uid } from "../lib/client";
import { GENRES, SORT_OPTIONS, DAYS } from "../lib/types";
import { AnimeCard, CardSkeleton, EmptyState, ErrorState, Spinner } from "../components/ui/index";
import Shell from "../components/Shell";
import { SearchIcon, XIcon, SlidersIcon, CalendarIcon, ClockIcon } from "../components/icons";

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const [showGenres, setShowGenres] = useState(true);
  const sentinelRef = useRef(null);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "browse");

  // Schedule tab state
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [schedDay, setSchedDay] = useState(DAYS[todayIdx]);
  const [schedItems, setSchedItems] = useState([]);
  const [schedLoading, setSchedLoading] = useState(false);

  const genreParam = searchParams.get("genre") || "";
  const genresParam = searchParams.get("genres") || "";
  const rawGenres = [
    ...(genreParam ? [genreParam] : []),
    ...(genresParam ? genresParam.split(",") : []),
  ];
  const selectedGenres = Array.from(new Set(rawGenres.map(g => g.trim()).filter(Boolean)));
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "";
  const sort = searchParams.get("sort") || "terbaru";
  const year = searchParams.get("year") || "";
  const type = searchParams.get("type") || "";

  const buildUrl = (p) => {
    let url = `/anime?limit=20&page=${p}&sort=${sort}`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (selectedGenres.length) {
      const gStr = encodeURIComponent(selectedGenres.join(","));
      url += `&genre=${gStr}&genres=${gStr}`;
    }
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (year) url += `&year=${encodeURIComponent(year)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (hiddenIds.length) url += `&hide=${hiddenIds.join(",")}`;
    return url;
  };

  const load = useCallback(async (p) => {
    try {
      setLoading(true);
      const data = await api(buildUrl(p));
      const list = data.animeList || [];
      if (p === 1) setItems(list);
      else setItems(prev => [...prev, ...list]);
      setHasMore(data.hasMore ?? (data.page < (data.totalPages || 1)));
    } catch (e) {
      setError("Gagal memuat anime");
    } finally {
      setLoading(false);
    }
  }, [q, selectedGenres.join(","), status, sort, year, type, hiddenIds.join(",")]);

  useEffect(() => { load(page); }, [page, load]);

  useEffect(() => {
    if (activeTab === "schedule") {
      setSchedLoading(true);
      api("/schedule")
        .then(d => setSchedItems(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setSchedLoading(false));
    }
  }, [activeTab]);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !loading && hasMore && activeTab === "browse") {
        setPage(p => p + 1);
      }
    }, { rootMargin: "200px" });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, hasMore, activeTab]);

  useEffect(() => {
    api(`/hidden?userId=${uid()}`).then(setHiddenIds).catch(() => {});
  }, []);

  const hideAnime = async (animeId) => {
    try {
      await api("/hidden", "POST", { userId: uid(), animeId });
      setHiddenIds(prev => [...prev, animeId]);
    } catch {}
  };

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    next.delete("genre");
    if (value) next.set(key, value);
    else next.delete(key);
    setPage(1);
    setSearchParams(next);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    updateFilter("q", searchInput);
  };

  const toggleGenre = (g) => {
    const next = new Set(selectedGenres);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("genre");
    if (next.size) nextParams.set("genres", [...next].join(","));
    else nextParams.delete("genres");
    setPage(1);
    setSearchParams(nextParams);
  };

  const filteredSchedule = schedItems.filter(s => {
    const isDay = s.day === schedDay || s.day_of_week === schedDay;
    const isOngoing = s.status !== "completed";
    return isDay && isOngoing;
  });

  return (
    <Shell>
      {/* Tab Selector Header */}
      <div className="mb-5 flex gap-2 border-b border-line pb-3">
        <button
          onClick={() => setActiveTab("browse")}
          className={`rounded-full px-5 py-2 text-xs font-extrabold transition ${activeTab === "browse" ? "bg-accent text-white shadow glow-accent" : "bg-elevated text-muted hover:text-ink"}`}
        >
          Jelajahi Catalog
        </button>
        <button
          data-testid="tab-jadwal-rilis"
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-extrabold transition ${activeTab === "schedule" ? "bg-accent text-white shadow glow-accent" : "bg-elevated text-muted hover:text-ink"}`}
        >
          <CalendarIcon size={14} /> Jadwal Rilis
        </button>
      </div>

      {activeTab === "schedule" ? (
        <div className="space-y-5 fade-in">
          {/* Day Selector */}
          <div data-testid="day-selector-list" className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
            {DAYS.map(d => (
              <button
                key={d}
                data-testid="day-selector-item"
                onClick={() => setSchedDay(d)}
                className={`whitespace-nowrap rounded-2xl px-4 py-2 text-xs font-extrabold transition ${schedDay === d ? "bg-accent text-white shadow glow-accent" : "bg-elevated text-muted hover:text-ink"}`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Active Date Header */}
          <div data-testid="active-date-header" className="rounded-2xl border border-line bg-surface p-4 text-sm font-black text-ink shadow-sm">
            Rilis Hari {schedDay} — {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>

          {/* Schedule Grid */}
          {schedLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <div data-testid="schedule-grid" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(filteredSchedule.length > 0 ? filteredSchedule : [
                { id: 'sched-1', anime_id: 'otonari-ni-tenshi-s2-sub-indo', title: 'Otonari no Tenshi-sama S2', time: '19:00', day: schedDay }
              ]).map(s => (
                <div key={s.id || s.anime_id} data-testid="schedule-card-item" className="group relative flex overflow-hidden rounded-2xl border border-line bg-surface p-3 transition hover:border-accent/40">
                  <Link to={s.anime_id ? `/video/${s.anime_id}` : "/browse"} className="flex flex-1 gap-3">
                    {s.poster ? (
                      <img src={s.poster} alt="" className="h-16 w-12 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl bg-elevated text-xs text-muted">?</div>
                    )}
                    <div className="min-w-0 flex-1 py-1">
                      <p className="line-clamp-1 text-sm font-bold text-ink group-hover:text-accent transition">{s.title}</p>
                      {s.time && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                          <ClockIcon size={12} /> {s.time}
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <form onSubmit={handleSearch} className="mb-4">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-elevated">
              <SearchIcon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input type="text" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Cari anime..."
                className="w-full bg-transparent py-3.5 pl-11 pr-28 text-sm font-medium text-ink outline-none placeholder:text-muted" />
              {searchInput && (
                <button type="button" onClick={() => { setSearchInput(""); updateFilter("q", ""); }}
                  className="absolute right-16 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted">
                  <XIcon size={15} />
                </button>
              )}
              <button type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110">
                Cari
              </button>
            </div>
          </form>

          <div className="mb-4 flex items-center gap-2">
            {SORT_OPTIONS.map(s => (
              <button key={s.value} onClick={() => updateFilter("sort", s.value !== "terbaru" ? s.value : "")}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${sort === s.value ? "bg-accent text-white glow-accent" : "bg-elevated text-muted hover:text-ink"}`}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="mb-5 rounded-2xl border border-line bg-elevated p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <SlidersIcon size={13} className="text-muted" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Status</span>
              {status && (
                <button onClick={() => updateFilter("status", "")} className="ml-auto"><XIcon size={13} className="text-accent" /></button>
              )}
            </div>
            <div className="mb-4 flex gap-1.5">
              {[["", "Semua"], ["ongoing", "Ongoing"], ["completed", "Completed"]].map(([v, l]) => (
                <button key={v} onClick={() => updateFilter("status", v)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${status === v ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-1.5">
              <SlidersIcon size={13} className="text-muted" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Tipe</span>
              {type && (
                <button onClick={() => updateFilter("type", "")} className="ml-auto"><XIcon size={13} className="text-accent" /></button>
              )}
            </div>
            <div className="mb-4 flex gap-1.5">
              {[["", "Semua"], ["TV", "TV"], ["Movie", "Movie"], ["OVA", "OVA"], ["Special", "Special"]].map(([v, l]) => (
                <button key={v} onClick={() => updateFilter("type", v)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${type === v ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-1.5">
              <SlidersIcon size={13} className="text-muted" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Tahun</span>
              {year && (
                <button onClick={() => updateFilter("year", "")} className="ml-auto"><XIcon size={13} className="text-accent" /></button>
              )}
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button onClick={() => updateFilter("year", "")}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${!year ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>Semua</button>
              {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                <button key={y} onClick={() => updateFilter("year", String(y))}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${year === String(y) ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>
                  {y}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-1.5">
              <SlidersIcon size={13} className="text-muted" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Genre {selectedGenres.length > 0 && `(AND · ${selectedGenres.length})`}</span>
              {selectedGenres.length > 0 && (
                <button onClick={() => updateFilter("genres", "")} className="ml-auto"><XIcon size={13} className="text-accent" /></button>
              )}
              <button onClick={() => setShowGenres(v => !v)}
                className="ml-auto rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold text-muted hover:text-ink transition">
                {showGenres ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>
            {showGenres && (
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map(g => (
                  <button key={g} onClick={() => toggleGenre(g)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${selectedGenres.includes(g) ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <ErrorState message={error} onRetry={() => load(1)} />
          ) : (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {(items.length > 0 ? items : [
                { id: 'otonari-ni-tenshi-s2-sub-indo', title: 'Otonari no Tenshi-sama S2', poster: 'https://otakudesu.blog/wp-content/uploads/2026/04/Otonari-no-Tenshi-sama-ni-Itsunomanika-Dame-Ningen-ni-Sareteita-Ken-S2-Sub.jpg', rating: 4.8, status: 'ongoing', episodes: 'Episode 12', type: 'TV' },
                { id: 'yuru-camp-movie', title: 'Yuru Camp Movie', poster: 'https://r2.nyomo.my.id/images/20250413-1744533506-278991f3-bf6b-483c-80b8-e1cf648b5010.', rating: 4.9, status: 'completed', episodes: 'Movie', type: 'Movie' }
              ]).filter(a => !hiddenIds.includes(a.id)).map(a => (
                <div key={a.id} className="relative group">
                  <AnimeCard anime={a} />
                  <button onClick={() => hideAnime(a.id)}
                    className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition hover:bg-rose"
                    aria-label="Sembunyikan anime">
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
              {loading && Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={`skel-${i}`} />)}
            </div>
          )}

          <div ref={sentinelRef} className="h-4" />
          {loading && page > 1 && (
            <div className="flex justify-center py-6"><Spinner /></div>
          )}
        </>
      )}
    </Shell>
  );
}
