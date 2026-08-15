import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '../lib/playerContext.jsx';
import { PlayIcon, PauseIcon, XIcon, MaximizeIcon } from './icons';

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function PlayerShell() {
  const { epInfo, minimized, savedTime, savedSrc, close, expand } = usePlayer();
  const navigate = useNavigate();
  const location = useLocation();
  const localRef = useRef(null);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    const wasVideo = prevPath.current.startsWith('/video');
    const nowVideo = location.pathname.startsWith('/video');
    if (!wasVideo && nowVideo && epInfo) {
      expand();
    }
    prevPath.current = location.pathname;
  }, [location.pathname, epInfo, expand]);

  useEffect(() => {
    const v = localRef.current;
    if (!v || !epInfo || !minimized) return;
    const src = savedSrc?.current;
    const t = savedTime?.current;
    if (src && !v.src) {
      v.src = src;
      v.load();
      const onLoad = () => {
        if (t > 1) v.currentTime = t;
        v.play().catch(() => {});
        v.removeEventListener('loadedmetadata', onLoad);
      };
      v.addEventListener('loadedmetadata', onLoad);
      return () => v.removeEventListener('loadedmetadata', onLoad);
    }
  }, [epInfo, minimized, savedSrc, savedTime]);

  useEffect(() => {
    const v = localRef.current;
    if (!v || !epInfo || !minimized) return;
    const onTime = () => setCur(v.currentTime || 0);
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onMeta = () => { setDur(v.duration || 0); setReady(true); };
    const onEnd = () => setPaused(true);
    const onWaiting = () => setReady(false);
    const onCanPlay = () => setReady(true);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('ended', onEnd);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('canplay', onCanPlay);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('canplay', onCanPlay);
    };
  }, [epInfo, minimized]);

  if (!epInfo || !minimized) return null;

  const togglePlay = (e) => {
    e?.stopPropagation();
    const v = localRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const handleClose = (e) => {
    e?.stopPropagation();
    const v = localRef.current;
    if (v) { v.pause(); v.src = ''; }
    close();
  };

  const handleExpand = (e) => {
    e?.stopPropagation();
    const v = localRef.current;
    const t = v ? Math.floor(v.currentTime || 0) : 0;
    if (v) savedTime.current = v.currentTime || 0;
    expand();
    navigate(`/video/${epInfo.animeId}?ep=${epInfo.ep}${t > 3 ? `&t=${t}` : ''}`);
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="fixed z-[55] bottom-16 right-2 w-[280px] sm:bottom-4 sm:right-4 sm:w-[340px]">
      <div className="relative h-full w-full bg-black overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
        <video ref={localRef} className="h-full w-full bg-black object-contain" preload="auto" playsInline />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="h-8 w-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {!paused && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-10">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="absolute inset-0 z-10" onClick={handleExpand} />
      <div className="absolute right-1.5 top-1.5 flex gap-1 z-20">
        <button onClick={handleExpand} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur hover:bg-black/80">
          <MaximizeIcon size={15} />
        </button>
        <button onClick={handleClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur hover:bg-rose-600">
          <XIcon size={15} />
        </button>
      </div>
      <div className="h-1 z-20 bg-white/10">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div className="z-20 flex items-center gap-2 bg-surface px-2.5 py-2">
        <button onClick={togglePlay} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">{epInfo.title || 'Memutar'}</div>
          <div className="truncate text-[10px] text-white/60">
            {epInfo.ep ? `EP ${epInfo.ep} · ` : ''}{fmt(cur)} / {fmt(dur)}
          </div>
        </div>
        <button onClick={handleExpand} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20">
          <MaximizeIcon size={15} />
        </button>
      </div>
    </div>
  );
}
