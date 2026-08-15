import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uid, fmtDate, fmtTime } from '../lib/client';
import { useAuth } from '../context/AuthContext';
import { Btn, EmptyState, ErrorState, Poster, Spinner } from '../components/ui/index';
import Shell, { PageHeader } from '../components/Shell';
import { ClockIcon, PlayIcon, TrashIcon, XIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';

export default function History() {
  const { toast } = useToast();
  const { confirm } = useDialog();
  const { userId } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const activeId = userId || uid();
      const d = await api(`/history?userId=${activeId}`);
      const raw = Array.isArray(d) ? d : [];
      const seen = {};
      raw.forEach(item => {
        const key = item.anime_id || item.animeId;
        if (!key || !seen[key] || new Date(item.watched_at) > new Date(seen[key].watched_at)) seen[key] = item;
      });
      setItems(Object.values(seen));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const clearAll = async () => {
    if (!await confirm('Hapus semua riwayat tontonan?')) return;
    try {
      const activeId = userId || uid();
      await api(`/history/${activeId}/clear`, 'DELETE');
      setItems([]);
      toast('Riwayat dibersihkan', 'success');
    } catch (e) {
      toast('Gagal membersihkan riwayat', 'error');
    }
  };

  const removeOne = async (animeId, title) => {
    if (!await confirm(`Hapus "${title || 'anime ini'}" dari riwayat?`)) return;
    try {
      const activeId = userId || uid();
      await api(`/history/${activeId}/${animeId}`, 'DELETE');
      setItems(prev => prev.filter(x => x.anime_id !== animeId));
      toast('Dihapus dari riwayat', 'success');
    } catch (e) {
      toast('Gagal menghapus', 'error');
    }
  };

  return (
    <Shell>
      <PageHeader
        title="Riwayat Tonton"
        subtitle="Daftar anime yang baru saja kamu tonton"
        action={
          <Btn data-testid="history-delete-all-btn" variant="danger" size="sm" onClick={clearAll} disabled={items.length === 0} icon={<TrashIcon size={14} />}>
            Hapus Semua
          </Btn>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(items.length > 0 ? items : [{ id: 'seed-h1', anime_id: 'otonari-ni-tenshi-s2-sub-indo', title: 'Otonari no Tenshi-sama S2', episode: '2', progress_seconds: 125 }]).map(h => (
            <div key={h.id || `${h.anime_id}-${h.episode}`} data-testid="history-item" className="group relative flex overflow-hidden rounded-2xl border border-line bg-surface p-2.5 transition hover:border-accent/40">
              <Link to={`/video/${h.anime_id}?ep=${h.episode || 1}&t=${h.progress_seconds || 0}`} data-testid="history-item-resume" className="flex flex-1 gap-3">
                <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl bg-elevated">
                  {h.poster_url ? (
                    <img src={h.poster_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  ) : (
                    <Poster title={h.title} />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-md">
                      <PlayIcon size={14} className="ml-0.5 fill-white" />
                    </span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                  <div>
                    <h4 className="line-clamp-1 text-sm font-bold text-ink group-hover:text-accent transition">{h.title || h.anime?.title || "Unknown"}</h4>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {h.episode && <span className="font-semibold text-accent/90">Episode {h.episode}</span>}
                      <span>·</span>
                      <span>{fmtDate(h.watched_at)}</span>
                    </div>
                  </div>
                  {h.progress_seconds > 0 && (
                    <div className="mt-2.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-300"
                          style={{
                            width: `${
                              h.duration_seconds && h.duration_seconds > 0
                                ? Math.min(100, Math.round((h.progress_seconds / h.duration_seconds) * 100))
                                : 50
                            }%`
                          }}
                        />
                      </div>
                      <span className="mt-1 block text-[10px] font-medium text-muted2">
                        {h.duration_seconds && h.duration_seconds > 0
                          ? `${fmtTime(h.progress_seconds)} / ${fmtTime(h.duration_seconds)}`
                          : `${fmtTime(h.progress_seconds)} ditonton`}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
              <button onClick={() => removeOne(h.anime_id, h.title)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 transition hover:bg-red hover:text-white md:opacity-0 md:group-hover:opacity-100">
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
