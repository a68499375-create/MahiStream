import { Link } from 'react-router-dom';
import { useState } from 'react';
import { PlayIcon, StarIcon, FilmIcon, AlertIcon } from '../icons';

export function cx(...a) { return a.filter(Boolean).join(" "); }

const GRADS = [
  "from-white/5 via-white/[0.02] to-transparent",
  "from-white/8 via-white/[0.03] to-transparent",
  "from-white/6 via-white/[0.02] to-transparent",
  "from-white/10 via-white/[0.03] to-transparent",
  "from-white/4 via-white/[0.01] to-transparent",
  "from-white/7 via-white/[0.02] to-transparent",
  "from-white/9 via-white/[0.03] to-transparent",
];

export function gradFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADS[h % GRADS.length];
}

export function Poster({ title, poster, className }) {
  const [err, setErr] = useState(false);
  const showImg = poster && !err;
  return (
    <div className={`relative h-full w-full overflow-hidden ${className || ""}`}>
      {showImg ? (
        <img src={poster} alt={title} loading="lazy" onError={() => setErr(true)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-elevated p-3 text-center">
          <FilmIcon size={30} className="text-muted2" />
          <div className="mt-2 line-clamp-4 text-sm font-extrabold text-muted">{title}</div>
        </div>
      )}
    </div>
  );
}

export function RatingBadge({ rating, className }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-amber-300 backdrop-blur ring-1 ring-white/10 ${className || ""}`}>
      <StarIcon size={11} className="fill-amber-300" />
      {Number(rating || 0).toFixed(1)}
    </span>
  );
}

export function StatusPill({ status }) {
  const ongoing = status === "ongoing";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${ongoing ? "bg-emerald-500/90 text-white" : "bg-sky-500/90 text-white"}`}>
      <span className={`h-1 w-1 rounded-full bg-white ${ongoing ? "animate-pulse" : ""}`} />
      {ongoing ? "Ongoing" : "Completed"}
    </span>
  );
}

export function AnimeCard({ anime, compact, overlay, progress, rank }) {
  return (
    <div className="group fade-up">
      <Link to={`/video/${anime.id}`} data-testid="anime-card-normal" className="card-hover relative block aspect-[2/3] overflow-hidden rounded-xl bg-elevated ring-1 ring-line">
        <Poster title={anime.title} poster={anime.poster} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/10" />
        <RatingBadge rating={anime.rating} className="absolute left-1.5 top-1.5 z-20" />
        {rank != null && (
          <span className="absolute right-1.5 top-1.5 z-20 flex h-6 min-w-6 items-center justify-center rounded-md bg-accent px-1 text-[11px] font-extrabold text-white shadow">#{rank}</span>
        )}
        <span className={`absolute bottom-1.5 z-20 ${rank != null ? "left-1.5" : "right-1.5"}`}>
          <StatusPill status={anime.status} />
        </span>
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="mb-auto mt-auto flex h-12 w-12 scale-90 items-center justify-center self-center rounded-full bg-accent text-white shadow-lg ring-4 ring-white/15 transition-transform duration-200 group-hover:scale-100">
            <PlayIcon size={20} className="ml-0.5 fill-white" />
          </span>
          {!compact && anime.synopsis && (
            <p className="line-clamp-2 text-[11px] leading-snug text-white/85">{anime.synopsis}</p>
          )}
        </div>
        {progress != null && (
          <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-black/50">
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        )}
        {overlay}
      </Link>
      <h3 className="mt-1.5 line-clamp-1 text-sm font-semibold text-ink transition group-hover:text-accent">{anime.title}</h3>
      {!compact && (
        <p className="line-clamp-1 text-xs text-muted">{anime.episode_count} Episode · {anime.genres?.slice(0, 2).join(", ")}</p>
      )}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[2/3] w-full rounded-xl" />
      <div className="skeleton mt-2 h-3 w-3/4 rounded" />
      <div className="skeleton mt-1.5 h-2 w-1/2 rounded" />
    </div>
  );
}

export function GridSkeleton({ count = 10, className }) {
  return (
    <div className={`grid gap-3 ${className || ""}`}>
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function Spinner({ className }) {
  return <div className={`h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent ${className || ""}`} />;
}

export function EmptyState({ title, desc, icon, action, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-20 text-center fade-in">
      <div className="flex h-18 w-18 animate-float items-center justify-center rounded-3xl bg-gradient-to-br from-accent/20 to-caramel/10 text-accent ring-1 ring-accent/20">
        <span className="flex h-16 w-16 items-center justify-center">{icon || <FilmIcon size={30} />}</span>
      </div>
      <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
      {desc && <p className="mt-1.5 max-w-sm text-sm text-muted">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-300">
        <AlertIcon size={26} />
      </div>
      <h3 className="mt-3 font-bold text-rose-200">Terjadi kesalahan</h3>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent2">Coba lagi</button>
      )}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "default" }) {
  const tones = {
    default: "bg-elevated text-muted",
    accent: "bg-accent/15 text-accent2 ring-1 ring-accent/25",
    green: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25",
    amber: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25",
    sky: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone] || tones.default}`}>
      {children}
    </span>
  );
}

export function Btn({ children, onClick, variant = "primary", type = "button", className, disabled }) {
  const variants = {
    primary: "bg-accent text-white hover:bg-accent2 glow-accent",
    ghost: "bg-elevated text-ink hover:bg-line",
    outline: "border border-line text-ink hover:bg-elevated",
    danger: "bg-rose-600/90 text-white hover:bg-rose-600",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${className || ""}`}>
      {children}
    </button>
  );
}

export const gridCols = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
