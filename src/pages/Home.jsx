import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, uid, fmtTime } from "../lib/client";
import { DAYS, QUICK_GENRES } from "../lib/types";
import { AnimeCard, Badge, CardSkeleton, EmptyState, ErrorState, Poster, RatingBadge, SectionTitle, StatusPill, cx } from "../components/ui/index";
import Shell from "../components/Shell";
import HeroCarousel from "../components/HeroCarousel";
import { useToast } from "../components/Toast";
import { BellIcon, CalendarIcon, ChevronRightIcon, ClockIcon, PlayIcon, ShuffleIcon, TrashIcon, WrenchIcon, CheckIcon, XIcon } from "../components/icons";
import { useDialog } from "../components/DialogProvider";
import { adminHeaders } from "../lib/client";

let lastRandomId = "";

export default function HomePage() {
  const navigate = useNavigate();
  const [anime, setAnime] = useState([]);
  const [ann, setAnn] = useState([]);
  const [sched, setSched] = useState([]);
  const [history, setHistory] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [day, setDay] = useState(DAYS[0]);
  const [spinning, setSpinning] = useState(false);
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [editingAnn, setEditingAnn] = useState(null);
  const [editAnnText, setEditAnnText] = useState('');
  const [sections, setSections] = useState({ recommendations: true, genres: true, schedule: true, trending: true, latest: true, heroIds: [] });
  const [realTrending, setRealTrending] = useState([]);

  useEffect(() => {
    api('/settings/home-sections').then(d => { if (d) setSections(d); }).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true); setError("");
    const MOCK_ANIME = [
      { id: 'otonari-ni-tenshi-s2-sub-indo', title: 'Otonari no Tenshi-sama S2', poster: 'https://otakudesu.blog/wp-content/uploads/2026/04/Otonari-no-Tenshi-sama-ni-Itsunomanika-Dame-Ningen-ni-Sareteita-Ken-S2-Sub.jpg', rating: 4.8, status: 'ongoing', episodes: 'Episode 12', type: 'TV' },
      { id: 'yuru-camp-movie', title: 'Yuru Camp Movie', poster: 'https://r2.nyomo.my.id/images/20250413-1744533506-278991f3-bf6b-483c-80b8-e1cf648b5010.', rating: 4.9, status: 'completed', episodes: 'Movie', type: 'Movie' },
      { id: 'solo-leveling-season-2', title: 'Solo Leveling Season 2', poster: 'https://placehold.co/300x400?text=Solo+Leveling+S2', rating: 4.9, status: 'ongoing', episodes: 'Episode 8', type: 'TV' },
    ];
    Promise.all([
      api("/anime?limit=100").catch(() => []),
      api("/announcements").catch(() => []),
      api("/schedule").catch(() => []),
      api(`/history?userId=${uid()}`).catch(() => []),
      api("/trending-real?limit=12").catch(() => ({ items: [] })),
    ]).then(([a, n, s, h, rt]) => {
      const fetched = a?.animeList || a?.items || (Array.isArray(a) ? a : []);
      const list = fetched && fetched.length > 0 ? fetched : MOCK_ANIME;
      setAnime(list);
      setAnn(Array.isArray(n) ? n : []);
      setSched(Array.isArray(s) ? s : []);
      setHistory(Array.isArray(h) ? h : []);
      setRealTrending(rt?.items || []);
      const excl = (Array.isArray(h) ? h : []).map(x => x.anime_id).filter(Boolean);
      api(`/recommendations?limit=10&userId=${uid()}${excl.length ? `&exclude=${excl.join(",")}` : ''}`)
        .then(d => setRecs(d?.items || d?.animeList || d || [])).catch(() => {});
    }).catch(() => {
      setAnime(MOCK_ANIME);
    }).finally(() => setLoading(false));
  };

  const surprise = async () => {
    setSpinning(true); toast("Mencari anime acak...", "info");
    try {
      const a = await api(`/random?exclude=${encodeURIComponent(lastRandomId)}`);
      if (a?.id) { lastRandomId = a.id; navigate(`/anime/${a.id}`); }
      else setSpinning(false);
    }
    catch { setSpinning(false); toast("Gagal mengambil anime", "error"); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { const todayIdx = (new Date().getDay() + 6) % 7; setDay(DAYS[todayIdx]); }, []);

  const featured = Array.isArray(sections.heroIds) && sections.heroIds.length > 0
    ? sections.heroIds.map(id => anime.find(a => a.id === id)).filter(Boolean).slice(0, 5)
    : anime.filter(a => a.featured).slice(0, 5);
  const heroSlides = featured.length >= 1 ? featured : anime.slice(0, 5);
  const hero = featured[0] || anime[0];
  const trending = Array.isArray(sections.trendingIds) && sections.trendingIds.length > 0
    ? sections.trendingIds.map(id => anime.find(a => a.id === id)).filter(Boolean).slice(0, 12)
    : [...anime].sort((a, b) => b.rating - a.rating).slice(0, 12);
  const rest = anime.filter(a => !featured.some(f => f?.id === a.id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const schedToday = sched.filter(s => s.day === day || s.day_of_week === day);
  const customRecs = Array.isArray(sections.recommendationIds) && sections.recommendationIds.length > 0
    ? sections.recommendationIds.map(id => anime.find(a => a.id === id)).filter(Boolean)
    : recs;
  const customGenres = Array.isArray(sections.genres) && sections.genres.length > 0 ? sections.genres : QUICK_GENRES;

  return (
    <Shell>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <HomeSkeleton />
      ) : (
        <>
          {heroSlides.length > 0 && <HeroCarousel items={heroSlides} />}

          {history.length > 0 && <ContinueWatching items={history} />}

          {sections.recommendations && customRecs.length > 0 && (
            <section className="mt-6">
              <SectionTitle action={<></>}>
                Rekomendasi
              </SectionTitle>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {customRecs.map(a => <div key={a.id} className="w-32 shrink-0 sm:w-36"><AnimeCard anime={a} /></div>)}
              </div>
            </section>
          )}

          {ann.length > 0 && ann.map(a => (
            <div key={a.id} className="group mt-4 flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2.5 text-sm text-ink">
              <BellIcon size={16} className="mt-0.5 shrink-0 text-accent" />
              {editingAnn === a.id ? (
                <div className="flex flex-1 flex-col gap-2">
                  <textarea value={editAnnText} onChange={e => setEditAnnText(e.target.value)} className="input w-full text-sm" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      try { await api(`/admin/announcements/${a.id}`, 'PUT', { content: editAnnText.trim() }, adminHeaders("adminbaikbanget")); setEditingAnn(null); toast("Diupdate", "success"); load(); }
                      catch { toast("Gagal update", "error"); }
                    }} className="rounded bg-accent px-3 py-1 text-xs font-bold text-white"><CheckIcon size={12} /> Simpan</button>
                    <button onClick={() => setEditingAnn(null)} className="rounded border border-line px-3 py-1 text-xs text-muted"><XIcon size={12} /> Batal</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="flex-1">{a.content}</span>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => { setEditingAnn(a.id); setEditAnnText(a.content); }} className="rounded p-0.5 text-muted2 hover:text-accent"><WrenchIcon size={13} /></button>
                    <button onClick={async () => {
                      if (!await confirm({ message: "Hapus pengumuman?", tone: "danger" })) return;
                      try { await api(`/admin/announcements/${a.id}`, 'DELETE', null, adminHeaders("adminbaikbanget")); load(); toast("Dihapus", "success"); }
                      catch { toast("Gagal hapus", "error"); }
                    }} className="rounded p-0.5 text-muted2 hover:text-red"><TrashIcon size={13} /></button>
                  </div>
                </>
              )}
            </div>
          ))}

          {sections.genres && (
          <div className="mt-6">
            <SectionTitle action={
              <Link to="/genres" className="flex items-center gap-0.5 text-xs font-semibold text-accent">
                Semua genre <ChevronRightIcon size={14} />
              </Link>
            }>
              Genre Populer
            </SectionTitle>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {customGenres.map(g => (
                <Link key={g} to={`/browse?genre=${encodeURIComponent(g)}`}
                  className="whitespace-nowrap rounded-full border border-line bg-elevated px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent">
                  {g}
                </Link>
              ))}
            </div>
          </div>
          )}

          {sections.schedule && (
          <div className="mt-6">
            <SectionTitle action={
              <span className="flex items-center gap-0.5 text-xs font-semibold text-accent">
                <CalendarIcon size={14} /> Jadwal
              </span>
            }>
              Jadwal Rilis
            </SectionTitle>
            <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
              {DAYS.map(d => (
                <button key={d} onClick={() => setDay(d)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${day === d ? "bg-accent text-white glow-accent" : "bg-elevated text-muted hover:text-ink"}`}>
                  {d}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {schedToday.length ? schedToday.map(s => (
                <Link key={s.id} to={s.anime_id ? `/anime/${s.anime_id}` : "/browse"}
                  className="card-hover flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 hover:border-accent/50">
                  {s.poster && <img src={s.poster} alt="" className="h-11 w-8 shrink-0 rounded-lg object-cover" />}
                  <span className="line-clamp-1 flex-1 text-sm font-medium text-ink">{s.title}</span>
                  <span className="flex shrink-0 items-center gap-1 rounded bg-elevated px-2 py-0.5 text-xs font-medium text-accent2">
                    <ClockIcon size={12} />{s.time}
                  </span>
                </Link>
              )) : <p className="text-sm text-muted">Tidak ada jadwal untuk hari ini.</p>}
            </div>
          </div>
          )}

          {sections.trending && (
          <div className="mt-7">
            {realTrending.length > 0 && (
              <>
                <SectionTitle action={<span className="text-xs font-semibold text-accent">7 hari terakhir</span>}>
                  Sedang Populer
                </SectionTitle>
                <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                  {realTrending.map((a, i) => (
                    <div key={a.id} className="w-32 shrink-0 sm:w-36"><AnimeCard anime={a} rank={i + 1} /></div>
                  ))}
                </div>
              </>
            )}
            <SectionTitle action={
              <div className="flex items-center gap-3">
                <button onClick={surprise} className="flex items-center gap-1 text-xs font-semibold text-accent">
                  <ShuffleIcon size={14} className={spinning ? "animate-spin" : ""} /> Acak
                </button>
                <Link to="/browse?sort=terpopuler" className="flex items-center gap-0.5 text-xs font-semibold text-accent">
                  Lihat semua <ChevronRightIcon size={14} />
                </Link>
              </div>
            }>
              Trending
            </SectionTitle>
            <div data-testid="sedang-tayang-list" className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {trending.map((a, i) => (
                <div key={a.id} className="w-32 shrink-0 sm:w-36"><AnimeCard anime={a} rank={i + 1} /></div>
              ))}
            </div>
          </div>
          )}

          {sections.latest && (
          <div className="mt-7">
            <SectionTitle action={
              <Link to="/browse" className="flex items-center gap-0.5 text-xs font-semibold text-accent">
                Lihat semua <ChevronRightIcon size={14} />
              </Link>
            }>
              Anime Terbaru
            </SectionTitle>
            {rest.length ? (
      <div data-testid="episode-terbaru-list" className="stagger grid grid-cols-3 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rest.map(a => <AnimeCard key={a.id} anime={a} />)}
      </div>
            ) : <EmptyState title="Belum ada anime" />}
          </div>
          )}
        </>
      )}
    </Shell>
  );
}

function ContinueWatching({ items }) {
  const recent = items.slice(0, 8);
  return (
    <section className="mt-5">
      <SectionTitle action={<></>}>
        Lanjut Nonton
      </SectionTitle>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {recent.map(h => {
          const pct = h.duration_seconds && h.duration_seconds > 0 && h.progress_seconds
            ? Math.min(100, Math.round((h.progress_seconds / h.duration_seconds) * 100))
            : h.progress_seconds ? Math.min(100, Math.round((h.progress_seconds / 1440) * 100)) : 0;
          return (
            <Link key={h.id} to={`/video/${h.anime_id}?ep=${h.episode || 1}&t=${h.progress_seconds || 0}`} className="group w-48 shrink-0 sm:w-56">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-line/60 transition group-hover:ring-accent/50">
                {h.poster_url ? (
                  <img src={h.poster_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-elevated text-xs font-bold text-accent">{h.title || 'MahiStream'}</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg ring-4 ring-white/20">
                    <PlayIcon size={16} className="ml-0.5 fill-white" />
                  </span>
                </div>
                {h.episode && (
                  <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                    Ep {h.episode}
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-bold text-ink group-hover:text-accent transition">{h.title || 'Anime'}</p>
              <p className="text-xs text-muted">{h.episode ? `Episode ${h.episode}` : ''} · {pct > 0 ? `${pct}% ditonton` : 'Mulai'}</p>
              <p className="mt-0.5 text-[10px] font-medium text-muted2">
                {h.duration_seconds && h.duration_seconds > 0
                  ? `${fmtTime(h.progress_seconds)} / ${fmtTime(h.duration_seconds)}`
                  : ''}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <>
      <div className="skeleton h-44 rounded-3xl sm:h-80" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </>
  );
}
