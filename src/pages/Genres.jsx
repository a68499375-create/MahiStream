import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/client";
import { EmptyState, ErrorState, Spinner, cx, gradFor } from "../components/ui/index";
import Shell from "../components/Shell";
import { TagIcon } from "../components/icons";

export default function GenresPage() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/genres-stats").then(setStats).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  return (
    <Shell>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-caramel text-white shadow-lg shadow-accent/30">
          <TagIcon size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Jelajahi Genre</h1>
          <p className="text-sm text-muted">Temukan anime berdasarkan genre favoritmu</p>
        </div>
      </div>

      {error ? <ErrorState message={error} /> : loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : stats.length === 0 ? <EmptyState title="Belum ada genre" /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {stats.map(g => (
            <Link key={g.genre} to={`/browse?genre=${encodeURIComponent(g.genre)}`}
              className="card-hover group relative flex h-28 flex-col justify-between overflow-hidden rounded-2xl border border-line p-4">
              <div className={`absolute inset-0 bg-gradient-to-br opacity-15 transition-opacity group-hover:opacity-30 ${gradFor(g.genre)}`} />
              <div className="relative"><h3 className="text-base font-bold text-ink">{g.genre}</h3></div>
              <div className="relative flex items-end justify-between">
                <span className="text-2xl font-extrabold text-accent">{g.count}</span>
                <span className="text-xs text-muted">anime</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
