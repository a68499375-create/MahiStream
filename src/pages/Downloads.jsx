import { Link, useNavigate } from 'react-router-dom';
import { Btn, EmptyState, Poster } from '../components/ui/index';
import Shell, { PageHeader } from '../components/Shell';
import { DownloadIcon, PlayIcon, TrashIcon, AlertIcon, CheckCircleIcon, XIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';
import { useDownloads, removeDownload, cancelDownload, fmtBytes, totalDownloadedBytes } from '../lib/offlineStore';

export default function Downloads() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm } = useDialog();
  const downloads = useDownloads();

  const total = totalDownloadedBytes();

  const handleDelete = async (d) => {
    if (!await confirm(`Hapus unduhan "Episode ${d.epNumber}" dari ${d.animeTitle}?`)) return;
    await removeDownload(d.key);
    toast('Unduhan dihapus', 'success');
  };

  const statusLabel = (d) => {
    if (d.status === 'done') return 'Siap ditonton';
    if (d.status === 'downloading') return 'Mengunduh…';
    if (d.status === 'queued') return 'Dalam antrian…';
    if (d.status === 'error') return 'Gagal';
    if (d.status === 'canceled') return 'Dibatalkan';
    return d.status;
  };

  return (
    <Shell>
      <PageHeader
        title="Unduhan Offline"
        subtitle={downloads.length > 0 ? `${downloads.length} episode tersimpan · ${fmtBytes(total)}` : "Simpan episode untuk ditonton tanpa internet"}
        action={
          downloads.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-muted">
              <DownloadIcon size={14} /> {fmtBytes(total)}
            </span>
          )
        }
      />

      {downloads.length === 0 ? (
        <EmptyState
          icon={<DownloadIcon size={32} />}
          title="Belum Ada Unduhan"
          description="Buka halaman video lalu tekan tombol unduh di samping judul anime"
        />
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {downloads.slice().sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)).map(d => {
            const pct = d.totalSize > 0 ? Math.min(100, Math.round((d.done / d.totalSize) * 100)) : 0;
            return (
              <div key={d.key} className="group relative flex overflow-hidden rounded-2xl border border-line bg-surface p-2.5 transition hover:border-accent/40">
                <button
                  onClick={() => navigate(`/video/${d.animeId}?ep=${d.epNumber}`)}
                  className="flex flex-1 gap-3 text-left"
                >
                  <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl bg-elevated">
                    {d.poster ? (
                      <img src={d.poster} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Poster title={d.animeTitle} />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-md">
                        <PlayIcon size={14} className="ml-0.5 fill-white" />
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                    <div>
                      <h4 className="line-clamp-1 text-sm font-bold text-ink transition group-hover:text-accent">{d.animeTitle}</h4>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                        <span className="font-semibold text-accent/90">Episode {d.epNumber}</span>
                        <span>·</span>
                        <span>{d.label}</span>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      {(d.status === 'downloading' || d.status === 'queued') && (
                        <>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="mt-1 block text-[10px] font-medium text-muted2">
                            {fmtBytes(d.done)}{d.totalSize > 0 ? ` / ${fmtBytes(d.totalSize)}` : ''} · {pct}%
                          </span>
                        </>
                      )}
                      {d.status === 'error' && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-red">
                          <AlertIcon size={11} /> {d.error || 'Gagal mengunduh'}
                        </span>
                      )}
                      {d.status === 'canceled' && (
                        <span className="text-[10px] font-medium text-muted2">Dibatalkan</span>
                      )}
                      {d.status === 'done' && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                          <CheckCircleIcon size={11} /> {statusLabel(d)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => d.status === 'downloading' || d.status === 'queued' ? cancelDownload(d.key) : handleDelete(d)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 transition hover:bg-red hover:text-white"
                  aria-label={d.status === 'downloading' || d.status === 'queued' ? 'Batalkan' : 'Hapus'}
                >
                  {d.status === 'downloading' || d.status === 'queued' ? <XIcon size={12} /> : <TrashIcon size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {downloads.length > 0 && (
        <div className="mt-6 text-center">
          <Btn variant="danger" size="sm" icon={<TrashIcon size={14} />} onClick={async () => {
            if (!await confirm('Hapus SEMUA unduhan?')) return;
            for (const d of downloads) await removeDownload(d.key);
            toast('Semua unduhan dihapus', 'success');
          }}>
            Hapus Semua
          </Btn>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-surface/60 p-4 text-xs leading-relaxed text-muted">
        <p className="mb-1 font-semibold text-ink">Tips</p>
        <p>Episode yang sudah diunduh akan diputar otomatis dari file lokal saat kamu membukanya, tanpa butuh internet.</p>
        <p className="mt-2">
          <Link to="/browse" className="font-semibold text-accent hover:underline">Jelajahi anime lain →</Link>
        </p>
      </div>
    </Shell>
  );
}
