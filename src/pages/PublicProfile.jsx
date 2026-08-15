import { Link, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api, fmtDate } from '../lib/client';
import { AnimeCard, EmptyState, Spinner, cx, Poster } from '../components/ui/index';
import Shell from '../components/Shell';
import {
  BarChartIcon, BookmarkIcon, ClockIcon, FilmIcon, HeartIcon,
  PlayIcon, StarIcon, TrophyIcon, FlameIcon, MessageIcon, ArrowLeftIcon,
} from '../components/icons';

const BADGE_ICONS = {
  play: PlayIcon, film: FilmIcon, fire: FlameIcon, trophy: TrophyIcon,
  bookmark: BookmarkIcon, clock: ClockIcon, star: StarIcon, chat: MessageIcon, heart: HeartIcon,
};

function fmtMin(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} jam ${m % 60} mnt`;
}

export default function PublicProfile() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/user/public/${userId}`).then(d => {
      setData(d);
      setError(false);
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <Shell>
      <div className="flex justify-center py-16"><Spinner /></div>
    </Shell>
  );
  if (error || !data) return (
    <Shell>
      <EmptyState title="Profil tidak ditemukan" icon={<HeartIcon size={28} />} />
      <div className="text-center">
        <Link to="/" className="text-sm text-accent">Kembali ke beranda</Link>
      </div>
    </Shell>
  );

  const s = data.stats || {};
  const stats = [
    { label: "Anime Selesai", value: s.anime_completed || 0, Icon: FilmIcon },
    { label: "Waktu Tonton", value: fmtMin(s.total_watch_seconds || 0), Icon: ClockIcon },
    { label: "Bookmark", value: s.bookmark_count || 0, Icon: BookmarkIcon },
    { label: "Genre Favorit", value: s.top_genre || "—", Icon: HeartIcon },
  ];

  return (
    <Shell>
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeftIcon size={16} /> Beranda
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-elevated">
          {data.picture ? (
            <img src={data.picture} alt={data.display_name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{data.display_name}</h1>
          {data.bio ? <p className="mt-1.5 line-clamp-3 text-sm text-muted">{data.bio}</p> : null}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Icon size={18} />
            </div>
            <div className="truncate text-lg font-extrabold text-ink">{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>

      {data.badges?.length > 0 && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
            <TrophyIcon size={18} className="text-accent" /> Lencana
          </h2>
          <div className="flex flex-wrap gap-3">
            {data.badges.map(b => {
              const BIcon = BADGE_ICONS[b.icon] || TrophyIcon;
              return (
                <div key={b.id} className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2" title={b.desc}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
                    <BIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">{b.name}</p>
                    <p className="text-[10px] text-muted">{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.top10?.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
            <StarIcon size={18} className="text-accent" /> Top 10 Anime
          </h2>
          <div className="space-y-2">
            {data.top10.map((a, i) => (
              <Link key={a.id || i} to={`/anime/${a.id}`}
                className="card-hover flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
                <span className="w-6 text-center text-lg font-extrabold text-accent">{i + 1}</span>
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-elevated">
                  <Poster title={a.title} poster={a.poster_url} />
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="line-clamp-1 text-sm font-semibold text-ink">{a.title}</p>
                  <p className="text-xs text-muted">{(a.genres || []).join(", ")}{a.year ? " · " + a.year : ""}</p>
                </div>
                {a.score ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-accent">
                    <StarIcon size={14} /> {a.score}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
