import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/client";
import { CardSkeleton, EmptyState, ErrorState, cx } from "../components/ui/index";
import Shell from "../components/Shell";
import { CrownIcon, StarIcon, TrophyIcon } from "../components/icons";

const PODIUM_STYLE = { 0: "order-2 sm:scale-105", 1: "order-1", 2: "order-3" };

export default function RankingPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");

  const load = useCallback(() => {
    setLoading(true); setError("");
    api("/ranking?limit=30&sort=terpopuler")
      .then(d => setItems(d.items || d.animeList || []))
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(a => tab === "all" ? true : a.status === tab);
  const podium = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-caramel text-white shadow-lg shadow-accent/30">
          <TrophyIcon size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Peringkat Teratas</h1>
          <p className="text-sm text-muted">Anime dengan rating tertinggi</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2">
        {[["all", "Semua"], ["ongoing", "Ongoing"], ["completed", "Completed"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${tab === v ? "bg-accent text-white glow-accent" : "bg-elevated text-muted hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? <EmptyState title="Belum ada data" /> : (
        <>
          {podium.length === 3 && (
            <div className="mb-8 grid grid-cols-3 items-end gap-2 sm:gap-4">
              {podium.map((a, i) => {
                const heights = ["h-44", "h-32", "h-24"];
                const colors = [
                  "from-amber-400/30 to-amber-600/10 border-amber-400/40",
                  "from-slate-300/20 to-slate-500/10 border-slate-400/30",
                  "from-orange-700/25 to-orange-900/10 border-orange-700/40",
                ];
                return (
                  <Link key={a.id} to={`/anime/${a.id}`}
                    className={`group flex flex-col items-center rounded-2xl border bg-gradient-to-b p-3 transition hover:-translate-y-1 ${PODIUM_STYLE[i]} ${colors[i]}`}>
                    <div className="relative w-full max-w-[88px] overflow-hidden rounded-xl shadow-lg ring-1 ring-line">
                      <div className="aspect-[2/3]">
                        {a.poster ? (
                          <img src={a.poster} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/40 to-caramel/30 text-2xl">
                            <TrophyIcon size={22} className="text-white/70" />
                          </div>
                        )}
                      </div>
                      <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">#{i + 1}</span>
                    </div>
                    <div className={`mt-2 flex w-full items-end justify-center rounded-t-xl bg-elevated/60 px-2 ${heights[i]}`}>
                      <div className="pb-2 text-center">
                        <div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${i === 0 ? "bg-amber-400 text-black" : i === 1 ? "bg-slate-300 text-black" : "bg-orange-600 text-white"}`}>
                          {i === 0 ? <CrownIcon size={14} /> : i + 1}
                        </div>
                        <p className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-accent2">
                          <StarIcon size={12} className="fill-accent2" />{Number(a.rating || 0).toFixed(1)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-center text-xs font-semibold text-ink">{a.title}</p>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            {rest.map((a, i) => (
              <Link key={a.id} to={`/anime/${a.id}`}
                className="card-hover flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-sm font-extrabold text-muted">{i + 4}</div>
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-elevated">
                  {a.poster ? <img src={a.poster} alt={a.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/40 to-caramel/30"><TrophyIcon size={18} className="text-white/70" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold text-ink">{a.title}</p>
                  <p className="line-clamp-1 text-xs text-muted">{a.genres?.slice(0, 3).join(", ")}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-elevated px-2.5 py-1 text-xs font-bold text-accent2">
                  <StarIcon size={11} className="fill-accent2" />{Number(a.rating || 0).toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
