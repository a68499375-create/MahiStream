import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { cx, Poster, RatingBadge, StatusPill, Badge } from "./ui/index";
import { PlayIcon, SparklesIcon, ChevronRightIcon } from "./icons";

export default function HeroCarousel({ items }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);
  const touchX = useRef(null);
  const count = items.length;

  const go = (n) => setIdx(((n % count) + count) % count);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  useEffect(() => {
    if (count <= 1) return;
    timer.current = setTimeout(() => go(idx + 1), 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [idx, count]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") setIdx(prev => ((prev - 1) % count + count) % count);
      if (e.key === "ArrowRight") setIdx(prev => ((prev + 1) % count + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  if (!count) return null;

  return (
    <section
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fade-up relative overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="absolute inset-0">
        {items.map((a, i) => (
          <div key={a.id} className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`}>
            <div className="relative h-full w-full">
              <Poster title={a.title} poster={a.poster} />
              <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/20" />
              <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-transparent" />
              <div className="absolute inset-0 backdrop-blur-[1px]" />
            </div>
          </div>
        ))}
      </div>

      <div className="relative grid min-h-[200px] grid-cols-[100px_1fr] gap-3 p-4 sm:min-h-[360px] sm:grid-cols-[220px_1fr] sm:p-7">
        <div className="relative hidden sm:block">
          {items.map((a, i) => (
            <div key={a.id} className={`absolute inset-0 aspect-[2/3] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-line transition-all duration-500 ${i === idx ? "z-20 opacity-100" : "z-10 scale-95 opacity-0"}`}>
              <Poster title={a.title} poster={a.poster} />
            </div>
          ))}
          <div className="aspect-[2/3] w-full" />
        </div>

        <div className="relative flex flex-col justify-center">
          {items.map((a, i) => (
            <div key={a.id} className={`transition-all duration-500 ${i === idx ? "block" : "hidden"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={a.status} />
                {a.featured && <Badge tone="accent"><SparklesIcon size={11} className="mr-1" /> Unggulan</Badge>}
              </div>
              <h2 className="text-balance mt-2 text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{a.title}</h2>
              {a.title_jp && <p className="mt-0.5 text-sm text-muted">{a.title_jp}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RatingBadge rating={a.rating} />
                <span className="text-xs text-muted">{a.aired_from || a.year} · {a.episode_count} Episode</span>
              </div>
              <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-muted">{a.synopsis}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/video/${a.id}`} data-testid="spotlight-tonton-btn"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent2 glow-accent">
                  <PlayIcon size={16} className="ml-0.5 fill-white" /> Tonton
                </Link>
                <Link to={`/anime/${a.id}`} data-testid="spotlight-unduh-btn"
                  className="inline-flex items-center gap-1 rounded-xl border border-line bg-elevated/80 px-4 py-2.5 text-sm font-semibold text-ink backdrop-blur transition hover:bg-elevated">
                  Unduh Batch <ChevronRightIcon size={15} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
          {items.map((_, i) => (
            <button key={i} onClick={() => go(i)} aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-accent" : "w-1.5 bg-white/40 hover:bg-white/70"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
