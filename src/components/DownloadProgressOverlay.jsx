import { useEffect, useState } from 'react';
import { Download, X, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react';
import {
  subscribe,
  cancelDownload,
  removeDownload,
  clearFinished,
} from '../services/downloadManager';

/**
 * Floating panel di kanan-bawah yang menampilkan antrian download aktif.
 * Subscribe ke downloadManager - tidak ada state global lain yang dipakai.
 *
 * UI dirombak ke gaya premium: glass card dengan rounded-2xl, accent gold,
 * icon lucide, status chip per row, dan progress bar dengan glow halus.
 */
export default function DownloadProgressOverlay() {
  const [items, setItems] = useState([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const unsub = subscribe(setItems);
    return () => unsub();
  }, []);

  if (!items || items.length === 0) return null;

  const active = items.filter(
    (i) => i.status === 'downloading' || i.status === 'queued',
  );
  const finishedCount = items.length - active.length;
  const hasFinished = finishedCount > 0;

  // Collapsed badge
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Buka panel download (${items.length} item)`}
        className="fixed right-4 bottom-24 z-[9999] w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/40 active:scale-95 transition-transform flex flex-col items-center justify-center gap-0.5 border border-white/20"
      >
        <Download size={18} />
        <span className="text-[10px] font-black tracking-wider">
          {active.length > 0 ? `${active.length}↓` : items.length}
        </span>
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Download progress"
      className="fixed right-4 bottom-24 z-[9999] w-80 max-w-[calc(100vw-32px)] max-h-[60vh] overflow-hidden rounded-3xl bg-surface/95 backdrop-blur-xl border border-border shadow-2xl flex flex-col"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-highlight/80 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center border border-primary/25">
            <Download size={15} />
          </div>
          <div className="flex flex-col leading-tight">
            <strong className="text-[13px] font-black text-text">Unduhan</strong>
            <span className="text-[10px] text-text-muted font-bold">
              {active.length} aktif · {finishedCount} selesai
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {hasFinished && (
            <button
              type="button"
              onClick={clearFinished}
              className="text-[11px] font-bold text-text-secondary hover:text-text border border-border hover:border-primary/40 px-2.5 py-1 rounded-full transition-all active:scale-95"
            >
              Bersihkan
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Tutup panel"
            className="w-8 h-8 rounded-full text-text-secondary hover:text-text hover:bg-surface flex items-center justify-center transition active:scale-95"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <ul className="overflow-y-auto custom-scrollbar flex-1">
        {items.map((d) => (
          <DownloadRow key={d.id} item={d} />
        ))}
      </ul>
    </div>
  );
}

function DownloadRow({ item }) {
  const pct = Math.round((item.progress || 0) * 100);
  const isActive = item.status === 'downloading';
  const isQueued = item.status === 'queued';
  const isDone = item.status === 'completed';
  const isFail = item.status === 'failed';

  const statusIcon = isDone
    ? <CheckCircle2 size={12} />
    : isFail
      ? <AlertCircle size={12} />
      : isQueued
        ? <Clock size={12} />
        : <Loader2 size={12} className="animate-spin" />;

  const statusLabel = isDone ? 'Selesai' : isFail ? (item.error || 'Gagal') : isQueued ? 'Antri' : `${pct}%`;

  const chipClass = isDone
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    : isFail
      ? 'bg-red-500/10 text-red-500 border-red-500/30'
      : 'bg-primary/10 text-primary border-primary/25';

  return (
    <li className="px-4 py-3 border-b border-border last:border-0">
      <div className="flex justify-between items-start gap-2.5 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold text-text leading-snug truncate" title={item.filename}>
            {item.animeTitle}
          </p>
          <p className="text-[10.5px] text-text-muted font-semibold mt-0.5">
            EP {item.episode} · {item.resolution}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${chipClass}`}>
          {statusIcon}
          {statusLabel}
        </span>
      </div>

      {!isDone && !isFail && (
        <div className="h-1.5 w-full bg-surface-highlight rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary-light transition-[width] duration-200 shadow-[0_0_8px_rgba(198,138,78,0.5)]"
            style={{ width: `${isQueued ? 4 : pct}%` }}
          />
        </div>
      )}

      {(isActive || isDone || isFail) && (
        <div className="flex justify-end mt-2">
          {isActive ? (
            <button
              type="button"
              onClick={() => cancelDownload(item.id)}
              className="text-[10.5px] font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 transition"
            >
              Batal
            </button>
          ) : (
            <button
              type="button"
              onClick={() => removeDownload(item.id)}
              className="text-[10.5px] font-bold text-text-muted hover:text-text transition"
            >
              Hapus
            </button>
          )}
        </div>
      )}
    </li>
  );
}
