import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uid } from '../lib/client';
import { AnimeCard, CardSkeleton, EmptyState, ErrorState } from '../components/ui/index';
import Shell, { PageHeader } from '../components/Shell';
import { BookmarkPlusIcon, XIcon } from '../components/icons';

export default function WatchlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api(`/watchlist/${uid()}`);
      setItems(d?.items || d || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (animeId) => {
    try {
      await api(`/watchlist/${uid()}/${animeId}`, 'POST', { status: 'remove' });
      setItems(p => p.filter(it => (it.anime_id || it.id) !== animeId));
    } catch {}
  };

  if (error) return <Shell><ErrorState message={error} onRetry={load} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Watchlist" subtitle="Pantau progres anime yang kamu tonton" />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<BookmarkPlusIcon size={44} />} title="Belum ada anime" desc="Tambahkan anime ke watchlist untuk mulai memantau.">
          <Link to="/browse" className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-bold text-white">
            Jelajahi Anime
          </Link>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map(item => {
            const anime = item.anime || item;
            const animeId = anime.id || item.anime_id;
            return (
              <div key={animeId} className="group relative">
                <AnimeCard anime={anime} overlay={
                  <button onClick={() => remove(animeId)}
                    className="absolute right-1.5 top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 transition hover:bg-red/80 hover:text-white group-hover:opacity-100">
                    <XIcon size={12} />
                  </button>
                } />
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
