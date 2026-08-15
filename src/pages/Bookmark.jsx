import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uid } from '../lib/client';
import { AnimeCard, EmptyState, CardSkeleton } from '../components/ui/index';
import Shell, { PageHeader } from '../components/Shell';
import { BookmarkIcon, XIcon } from '../components/icons';

export default function Bookmark() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/bookmarks/${uid()}`);
      setItems(Array.isArray(d) ? d : []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (animeId) => {
    try {
      await api(`/bookmarks`, 'POST', { userId: uid(), animeId });
      setItems(p => p.filter(it => (it.anime_id || it.id) !== animeId));
    } catch {}
  };

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Bookmark" subtitle="Anime yang kamu tandai untuk ditonton nanti" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader title="Bookmark" subtitle="Anime yang kamu tandai untuk ditonton nanti" />

      {items.length === 0 && (
        <EmptyState icon={<BookmarkIcon size={32} />} title="Belum ada bookmark" subtitle="Tandai anime favoritmu agar mudah ditemukan" />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(items.length > 0 ? items : []).map(item => {
          const animeId = item.anime_id || item.id;
          const anime = { ...(item.anime || item), id: animeId };
          return (
            <div key={animeId} data-testid="bookmark-item" className="group relative">
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
    </Shell>
  );
}

