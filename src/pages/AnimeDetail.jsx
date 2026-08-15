import { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, uid, fmtTime } from "../lib/client";
import { Badge, Btn, EmptyState, ErrorState, Poster, RatingBadge, Spinner, StatusPill, cx } from "../components/ui/index";
import Shell from "../components/Shell";
import Comments from "../components/Comments";
import Reviews from "../components/Reviews";
import { toggleBookmark } from "../services/api";
import { useToast } from "../components/Toast";
import {
  PlayIcon, BookmarkIcon, BookmarkFillIcon, HeartIcon, HeartFillIcon,
  EyeIcon, StarIcon, LayersIcon, CheckIcon, ListIcon, AlertIcon, XIcon, ClockIcon,
} from "../components/icons";

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtAirDate(from, to) {
  const f = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return `${dt.getDate()} ${MONTHS_ID[dt.getMonth()]} ${dt.getFullYear()}`;
  };
  const a = f(from), b = f(to);
  if (a && b) return `${a} s/d ${b}`;
  return a || b || '';
}

export default function AnimeDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eps, setEps] = useState([]);
  const [fav, setFav] = useState(false);
  const [wl, setWl] = useState(null);
  const [bm, setBm] = useState(false);
  const [tab, setTab] = useState("episodes");
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [epSortAsc, setEpSortAsc] = useState(true);
  const [epLayoutGrid, setEpLayoutGrid] = useState(true);
  const [history, setHistory] = useState(null);
  const [isKhusus, setIsKhusus] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportEp, setReportEp] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportMsg, setReportMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    const fetchAnime = (async () => {
      try {
        const a = await api(`/anime/${id}`);
        if (a && (a.id || a.title)) {
          const eps = await api(`/episodes/${id}`).catch(() => []);
          return { anime: a, eps: Array.isArray(eps) ? eps : [], khusus: false };
        }
      } catch {}

      try {
        const k = await api(`/khusus/${id}`);
        if (k && (k.id || k.title)) {
          return {
            anime: k,
            eps: [...(k.gdrive_links || [])].sort((a, b) => (Number(a?.episode) || 0) - (Number(b?.episode) || 0)).map((l, i) => {
              const n = l && l.episode != null ? Number(l.episode) : i + 1;
              return { id: n, anime_id: k.id, number: n, title: `Episode ${n}`, gdrive_links: [l], duration: 0 };
            }),
            khusus: true
          };
        }
      } catch {}

      throw new Error("Anime tidak ditemukan");
    })();

    Promise.all([
      fetchAnime,
      api(`/watchlist/${uid()}/${id}`).catch(() => null),
      api(`/favorites/${uid()}/${id}`).catch(() => null),
      api(`/history?userId=${uid()}&animeId=${id}&all=1`).catch(() => null),
      api(`/bookmarks/${uid()}`).catch(() => []),
    ]).then(([result, wl, fav, hist, bm]) => {
      setAnime(result.anime);
      setEps(result.eps);
      setIsKhusus(result.khusus);
      setWl(wl);
      setFav(!!fav);
      setHistory(hist);
      setBm(Array.isArray(bm) && bm.some(x => x.anime_id === id));
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleWL = async (status) => {
    try {
      await api(`/watchlist/${uid()}/${id}`, "POST", { status });
      setWl(status);
      toast(status === "remove" ? "Dihapus dari watchlist" : "Ditambahkan ke watchlist", "success");
    } catch { toast("Gagal menyimpan", "error"); }
  };

  const toggleFav = async () => {
    try {
      if (fav) { await api(`/favorites/${uid()}/${id}`, "DELETE"); setFav(false); toast("Dihapus dari favorit", "info"); }
      else { await api(`/favorites/${uid()}/${id}`, "POST"); setFav(true); toast("Ditambahkan ke favorit", "success"); }
    } catch { toast("Gagal", "error"); }
  };

  const handleBookmark = async () => {
    try {
      const r = await toggleBookmark(id, anime?.title, anime?.poster);
      setBm(r?.bookmarked ?? !bm);
      toast(r?.bookmarked ? "Ditambahkan ke bookmark" : "Dihapus dari bookmark", "success");
    } catch { toast("Gagal", "error"); }
  };

  const fallbackAnime = {
    id: id || 'otonari-ni-tenshi-s2-sub-indo',
    title: 'Otonari no Tenshi-sama S2',
    poster: 'https://otakudesu.blog/wp-content/uploads/2026/04/Otonari-no-Tenshi-sama-ni-Itsunomanika-Dame-Ningen-ni-Sareteita-Ken-S2-Sub.jpg',
    rating: 4.8,
    status: 'ongoing',
    synopsis: 'MahiStream anime detail view.',
    genres: ['Romance', 'School'],
    episodes: [{ number: 1, title: 'Episode 1' }, { number: 2, title: 'Episode 2' }]
  };

  const displayAnime = anime || fallbackAnime;

  const wlStatuses = ["watching", "plan_to_watch", "completed", "on_hold", "dropped"];
  const historyList = Array.isArray(history) ? history : (history ? [history] : []);
  const resumeEp = historyList[0]?.episode || 0;
  const resumeSec = historyList[0]?.progress_seconds || 0;
  const progressMap = {};
  historyList.forEach(h => { if (h && h.episode && h.progress_seconds > 5) progressMap[String(h.episode)] = h.progress_seconds; });

  return (
    <Shell>
      <div className="relative -mx-4 -mt-4 mb-4 overflow-hidden sm:mx-0 sm:-mt-0 sm:rounded-3xl">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-rose/10" />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:p-6">
          <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-48">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-line">
              <Poster title={anime.title} poster={anime.poster} className="rounded-2xl" />
              {anime.year && (
                <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                  {anime.year}
                </span>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {anime.rating > 0 && <RatingBadge rating={anime.rating} />}
              {anime.status === "completed" ? (
                <span data-testid="anime-detail-status-completed" className="inline-flex items-center gap-1 rounded bg-sky-500 px-2 py-0.5 text-xs font-bold text-white">
                  <CheckIcon size={12} /> Completed
                </span>
              ) : (
                <span data-testid="anime-detail-status-ongoing" className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                  <ClockIcon size={12} /> Ongoing
                </span>
              )}
              {anime.type && <Badge tone="accent">{anime.type}</Badge>}
              {anime.episode_count > 0 && <Badge>{anime.episode_count} eps</Badge>}
            </div>
            <h1 data-testid="anime-detail-title" className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{anime.title}</h1>
            {anime.title_jp && anime.title_jp !== anime.title && (
              <p className="mt-0.5 text-xs text-muted">{anime.title_jp}</p>
            )}
            {anime.genres?.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {anime.genres.map(g => (
                  <Link key={g} to={`/browse?genre=${encodeURIComponent(g)}`}
                    className="rounded-full border border-line bg-elevated px-3 py-0.5 text-xs font-medium text-muted hover:border-accent hover:text-accent">{g}</Link>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Link to={`/video/${id}?ep=${resumeEp || 1}${resumeSec > 5 ? `&t=${resumeSec}` : ''}`} data-testid="anime-detail-tonton-btn"
                className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-bold text-white shadow-lg shadow-accent/30 transition hover:brightness-110">
                <PlayIcon size={16} className="ml-0.5" /> {resumeEp > 0 ? `Lanjut EP ${resumeEp}` : 'Tonton'}
              </Link>
              <button data-testid="anime-detail-unduh-batch-btn" onClick={() => setBatchModalOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-line bg-elevated px-4 py-2 text-xs font-bold text-ink hover:border-accent transition">
                <LayersIcon size={14} /> Unduh Batch
              </button>
              <button data-testid="anime-bookmark-toggle-btn" onClick={handleBookmark}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-elevated text-ink transition hover:border-accent hover:text-accent">
                {bm ? <BookmarkFillIcon size={16} className="text-accent" /> : <BookmarkIcon size={16} />}
              </button>
              <button onClick={toggleFav}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-elevated text-ink transition hover:border-accent hover:text-accent">
                {fav ? <HeartFillIcon size={16} className="text-accent" /> : <HeartIcon size={16} />}
              </button>
              <details className="relative">
                <summary className="flex cursor-pointer items-center gap-1 rounded-full border border-line bg-elevated px-3 py-2 text-xs font-medium text-ink hover:border-accent">
                  <ListIcon size={14} /> {wl && wlStatuses.includes(wl) ? wl.replace(/_/g, " ") : "Watchlist"}
                </summary>
                <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
                  {wlStatuses.map(s => (
                    <button key={s} onClick={() => toggleWL(wl === s ? "remove" : s)}
                      className={cx("w-full px-3 py-2 text-left text-xs font-medium transition hover:bg-elevated", wl === s ? "text-accent" : "text-ink")}>
                      {s.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </details>
              <button onClick={() => { setReportEp(""); setReportText(""); setReportMsg(""); setReportOpen(true); }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-elevated text-ink transition hover:border-rose hover:text-rose"
                aria-label="Laporkan">
                <AlertIcon size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto no-scrollbar border-b border-line pb-3">
        {[["episodes", "Episode"], ["reviews", "Ulasan"], ["comments", "Komentar"], ["info", "Info"], ["recommendations", "Rekomendasi"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={cx("whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition", tab === v ? "bg-accent text-white glow-accent" : "bg-elevated text-muted hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "episodes" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{eps.length} episode</span>
            <div className="flex items-center gap-2">
              <button data-testid="episode-layout-toggle" onClick={() => setEpLayoutGrid(g => !g)}
                className="rounded-full border border-line/60 px-3 py-1 text-xs font-bold text-muted hover:text-ink">
                Layout ({epLayoutGrid ? 'Grid' : 'List'})
              </button>
              <button data-testid="episode-sort-toggle" onClick={() => setEpSortAsc(s => !s)}
                className="rounded-full border border-line/60 px-3 py-1 text-xs font-bold text-muted hover:text-ink">
                Urutan ({epSortAsc ? '1-N' : 'N-1'})
              </button>
              {eps.length > 0 && (
                <button onClick={() => { setBatchMode(b => !b); if (batchMode) setBatchSelected(new Set()); }}
                  className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition", batchMode ? 'bg-accent text-white' : 'border border-line/60 text-muted hover:text-accent')}>
                  <LayersIcon size={13} /> Batch
                </button>
              )}
            </div>
          </div>

          {/* Unduh Batch Warning Modal */}
          {batchModalOpen && (
            <div data-testid="unduh-batch-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
                <h3 className="text-base font-extrabold text-ink mb-2">Unduh Batch Anime</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">
                  Pilih episode yang ingin kamu tonton atau unduh secara bersamaan melalui fitur Batch Download MahiStream.
                </p>
                <button
                  data-testid="unduh-batch-modal-close"
                  onClick={() => setBatchModalOpen(false)}
                  className="rounded-full bg-accent px-5 py-2 text-xs font-bold text-white shadow hover:brightness-110"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
          {eps.length > 0 ? (
            <>
              {(() => {
                const sortedEps = [...eps].sort((a, b) => {
                  const na = Number(a.number) || 0;
                  const nb = Number(b.number) || 0;
                  return epSortAsc ? na - nb : nb - na;
                });
                return epLayoutGrid ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {sortedEps.map(ep => {
                      const num = ep.number;
                      const sel = batchSelected.has(num);
                      const isResume = String(num) === String(resumeEp);
                      const epProgress = progressMap[String(num)];
                      return batchMode ? (
                        <button key={ep.id || num} onClick={() => {
                          const next = new Set(batchSelected);
                          if (sel) next.delete(num); else next.add(num);
                          setBatchSelected(next);
                        }}
                          className={cx("flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition", sel ? 'border-accent/60 bg-accent/10' : 'border-line/60 bg-elevated/60 hover:border-accent/30')}>
                          <span className="text-lg font-bold text-ink">{num}</span>
                          <span className="text-[10px] text-muted">Episode</span>
                          {sel && <CheckIcon size={14} className="text-accent" />}
                        </button>
                      ) : (
                        <Link key={ep.id || num} to={`/video/${id}?ep=${num}${progressMap[String(num)] ? `&t=${progressMap[String(num)]}` : ''}`}
                          className={cx("flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition relative", isResume ? 'border-accent/60 bg-accent/10' : 'border-line/60 bg-elevated/60 hover:border-accent/30')}>
                          <span className="text-lg font-bold text-ink">{num}</span>
                          <span className="text-[10px] text-muted">Episode</span>
                          {epProgress ? (
                            <span className="mt-0.5 text-[9px] font-semibold text-accent">{fmtTime(epProgress)}</span>
                          ) : null}
                          {isResume && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                              <PlayIcon size={10} className="ml-0.5" />
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sortedEps.map(ep => {
                      const num = ep.number;
                      const sel = batchSelected.has(num);
                      const isResume = String(num) === String(resumeEp);
                      const epProgress = progressMap[String(num)];
                      const epTitle = ep.title && ep.title !== `Episode ${num}` ? ep.title : `Episode ${num}`;
                      return batchMode ? (
                        <button key={ep.id || num} onClick={() => {
                          const next = new Set(batchSelected);
                          if (sel) next.delete(num); else next.add(num);
                          setBatchSelected(next);
                        }}
                          className={cx("flex items-center justify-between rounded-xl border p-3 text-left transition", sel ? 'border-accent/60 bg-accent/10' : 'border-line/60 bg-elevated/60 hover:border-accent/30')}>
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface font-bold text-xs text-ink">{num}</span>
                            <span className="text-sm font-semibold text-ink">{epTitle}</span>
                          </div>
                          {sel ? <CheckIcon size={16} className="text-accent" /> : <div className="h-4 w-4 rounded border border-line" />}
                        </button>
                      ) : (
                        <Link key={ep.id || num} to={`/video/${id}?ep=${num}${progressMap[String(num)] ? `&t=${progressMap[String(num)]}` : ''}`}
                          className={cx("flex items-center justify-between rounded-xl border p-3 transition", isResume ? 'border-accent/60 bg-accent/10' : 'border-line/60 bg-elevated/60 hover:border-accent/30')}>
                          <div className="flex items-center gap-3">
                            <span className={cx("flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs", isResume ? "bg-accent text-white" : "bg-surface text-ink")}>{num}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-ink line-clamp-1">{epTitle}</p>
                              {epProgress ? <p className="text-[10px] font-medium text-accent">Lanjut dari {fmtTime(epProgress)}</p> : null}
                            </div>
                          </div>
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
                            <PlayIcon size={12} className="ml-0.5" />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })()}
              {batchMode && batchSelected.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line/60 bg-surface/95 p-4 backdrop-blur-lg">
                  <div className="mx-auto flex max-w-6xl items-center justify-between">
                    <span className="text-xs font-semibold text-muted">{batchSelected.size} episode dipilih</span>
                    <button onClick={() => {
                      const sorted = [...batchSelected].sort((a, b) => a - b);
                      navigate(`/video/${id}?ep=${sorted[0]}&batch=${sorted.join(',')}`);
                    }}
                      className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/30">
                      <PlayIcon size={14} /> Tonton Batch ({batchSelected.size})
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState title="Episode belum tersedia" desc="Episode akan muncul setelah dirilis." />
          )}
        </>
      )}

      {tab === "info" && (
        <div className="grid gap-6 md:grid-cols-[1fr_250px]">
          <div>
            <h3 className="mb-3 text-lg font-bold text-ink">Sinopsis</h3>
            <p className="text-sm leading-relaxed text-muted">{anime.synopsis || anime.description || "Sinopsis tidak tersedia."}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Informasi</h3>
            <div className="space-y-2 text-sm">
              {anime.status && (
                <div className="flex justify-between">
                  <span className="text-muted">Status</span>
                  <StatusPill status={anime.status} />
                </div>
              )}
              {anime.year && (
                <div className="flex justify-between">
                  <span className="text-muted">Tahun</span>
                  <span className="font-medium text-ink">{anime.year}</span>
                </div>
              )}
              {(anime.aired_from || anime.aired_to) && (
                <div className="flex justify-between">
                  <span className="text-muted">Tayang</span>
                  <span className="font-medium text-ink">{fmtAirDate(anime.aired_from, anime.aired_to)}</span>
                </div>
              )}
              {anime.episode_count > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Episode</span>
                  <span className="font-medium text-ink">{anime.episode_count}</span>
                </div>
              )}
              {anime.rating > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Rating</span>
                  <span className="flex items-center gap-1 font-medium text-ink"><StarIcon size={13} className="text-accent2" />{Number(anime.rating || 0).toFixed(1)}</span>
                </div>
              )}
              {anime.type && (
                <div className="flex justify-between">
                  <span className="text-muted">Tipe</span>
                  <span className="font-medium text-ink">{anime.type}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "reviews" && <Reviews animeId={id} />}
      {tab === "comments" && (
        <Comments animeId={id} />
      )}
      {tab === "recommendations" && <Recommendations animeId={id} exclude={[id]} />}

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setReportOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Laporkan Masalah</h2>
              <button onClick={() => setReportOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted"><XIcon size={14} /></button>
            </div>
            <p className="mb-4 text-xs text-muted">Laporkan bug, link rusak, atau masalah lain pada anime ini.</p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-muted">Episode (opsional)</label>
              <select value={reportEp} onChange={(e) => setReportEp(e.target.value)}
                className="w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30">
                <option value="">Semua episode</option>
                {eps.map(ep => (
                  <option key={ep.id || ep.number} value={ep.number}>Episode {ep.number}</option>
                ))}
              </select>
            </div>
            <label className="mb-1 block text-xs font-semibold text-muted">Deskripsi Masalah</label>
            <textarea value={reportText} onChange={(e) => setReportText(e.target.value)}
              placeholder="Jelaskan masalah yang kamu temui..."
              rows={4}
              className="w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            {reportMsg && (
              <p className={cx("mt-2 flex items-center gap-1.5 text-sm", reportMsg.includes("terkirim") ? "text-emerald-400" : "text-rose-400")}>
                <CheckIcon size={14} /> {reportMsg}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setReportOpen(false)}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-line text-sm font-semibold text-muted">
                Batal
              </button>
              <button onClick={async () => {
                if (!reportText.trim()) return;
                setReportSending(true); setReportMsg("");
                try {
                  await api("/reports", "POST", {
                    anime_id: id,
                    episode: reportEp,
                    userId: uid(),
                    title: `[${anime?.title}] Episode ${reportEp || "Semua"}`,
                    description: reportText.trim()
                  });
                  setReportMsg("Laporan berhasil terkirim.");
                  setTimeout(() => setReportOpen(false), 1500);
                } catch (err) { setReportMsg(err.message); }
                finally { setReportSending(false); }
              }}
                disabled={reportSending || !reportText.trim()}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-accent bg-accent text-sm font-semibold text-white disabled:opacity-60">
                {reportSending ? "Mengirim..." : "Kirim Laporan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Recommendations({ animeId, exclude = [] }) {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const exclParam = (Array.isArray(exclude) ? exclude : [exclude]).filter(Boolean).join(",");
    api(`/recommendations?limit=10&userId=${uid()}&exclude=${encodeURIComponent(exclParam)}`).then(d => {
      setRecs(d.items || d.animeList || d || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [animeId]);

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!recs.length) return <EmptyState title="Belum ada rekomendasi" />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {recs.slice(0, 10).map(a => (
        <Link key={a.id} to={`/anime/${a.id}`} className="group">
          <div className="aspect-[2/3] overflow-hidden rounded-xl bg-elevated ring-1 ring-line">
            {a.poster ? <img src={a.poster} alt={a.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
            : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/30 to-caramel/20 p-4 text-center text-xs text-muted">{a.title}</div>}
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-ink">{a.title}</p>
          {a.rating && <p className="flex items-center gap-1 text-xs text-accent2"><StarIcon size={11} className="fill-accent2" />{Number(a.rating || 0).toFixed(1)}</p>}
        </Link>
      ))}
    </div>
  );
}
