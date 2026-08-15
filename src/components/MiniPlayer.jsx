import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMiniPlayer, clearMiniPlayer, updateMiniPlayer } from '../lib/miniPlayerStore';
import { PlayIcon, PauseIcon, XIcon, MaximizeIcon } from './icons';
import { cx } from './ui/index';

export default function MiniPlayer() {
  const mp = useMiniPlayer();
  const navigate = useNavigate();
  const location = useLocation();
  const vRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [ready, setReady] = useState(false);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    const wasVideo = prevPath.current.startsWith('/video');
    const isVideo = location.pathname.startsWith('/video');
    if (mp && isVideo && !wasVideo) {
      const v = vRef.current;
      if (v) { v.pause(); v.src = ''; }
      clearMiniPlayer();
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  const onLoaded = useCallback(() => {
    const v = vRef.current;
    if (!v || !mp) return;
    setDur(v.duration || 0);
    if (mp.currentTime > 0 && Math.abs((v.currentTime || 0) - mp.currentTime) > 1) {
      try { v.currentTime = mp.currentTime; } catch {}
    }
    setReady(true);
    if (mp.playing !== false) {
      v.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [mp]);

  useEffect(() => {
    if (!mp) { setReady(false); setPlaying(false); setCur(0); setDur(0); }
  }, [mp]);

  useEffect(() => {
    const v = vRef.current;
    if (!v || !mp) return;
    const onTime = () => {
      setCur(v.currentTime || 0);
      if (Math.floor(v.currentTime) % 2 === 0) updateMiniPlayer({ currentTime: v.currentTime, duration: v.duration });
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { updateMiniPlayer({ playing: false }); };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnd);
    };
  }, [mp, ready]);

  const togglePlay = useCallback((e) => {
    e?.stopPropagation();
    const v = vRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const handleClose = useCallback((e) => {
    e?.stopPropagation();
    const v = vRef.current;
    if (v) { v.pause(); v.src = ''; }
    clearMiniPlayer();
  }, []);

  const handleExpand = useCallback((e) => {
    e?.stopPropagation();
    const v = vRef.current;
    const t = v ? Math.floor(v.currentTime || 0) : (mp?.currentTime || 0);
    if (v) v.pause();
    if (mp) {
      navigate(`/video/${mp.animeId}?ep=${mp.ep}${t > 3 ? `&t=${t}` : ''}`);
    }
    clearMiniPlayer();
  }, [mp, navigate]);

  if (!mp) return null;

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="fixed bottom-16 right-2 z-[60] w-[280px] sm:bottom-4 sm:right-4 sm:w-[340px] animate-[slideUp_0.2s_ease-out]">
      <div className="overflow-hidden rounded-xl bg-surface shadow-2xl ring-1 ring-white/10">
        <div className="relative aspect-video w-full bg-black" onClick={handleExpand}>
          <video
            ref={vRef}
            src={mp.src}
            poster={mp.poster}
            className="h-full w-full bg-black object-contain"
            preload="auto"
            playsInline
            onLoadedMetadata={onLoaded}
            onClick={(e) => e.stopPropagation()}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="h-7 w-7 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Jeda' : 'Putar'}
            className="absolute inset-0 flex items-center justify-center bg-black/0 transition group"
          >
            <span className={cx("flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition", playing ? "opacity-0 group-hover:opacity-100" : "opacity-100")}>
              {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </span>
          </button>
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button onClick={handleExpand} aria-label="Perbesar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-black/80">
              <MaximizeIcon size={15} />
            </button>
            <button onClick={handleClose} aria-label="Tutup"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-rose-600">
              <XIcon size={15} />
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-white/10">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <button onClick={togglePlay} aria-label={playing ? 'Jeda' : 'Putar'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-white">{mp.title || 'Memutar'}</div>
            <div className="truncate text-[10px] text-white/60">
              {mp.ep ? `EP ${mp.ep} · ` : ''}{fmt(cur)} / {fmt(dur)}
            </div>
          </div>
          <button onClick={handleExpand} aria-label="Buka player"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20">
            <MaximizeIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}
