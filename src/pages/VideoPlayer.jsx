import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react';
import { api, uid, fmtTime, API_BASE } from '../lib/client';
import { getPlayback } from '../lib/prefs';
import { cx, Spinner, StatusPill } from '../components/ui/index';
import Shell from '../components/Shell';
import { toggleBookmark } from '../services/api';
import { useToast } from '../components/Toast';
import {
  LockIcon, LockOpenIcon, PlayIcon, PauseIcon, RewindCurveIcon, ForwardCurveIcon, SkipBackEpIcon, SkipForwardEpIcon, RewindIcon, FastForwardIcon, AspectIcon, MaximizeIcon, MinimizeIcon, PipIcon, QueueIcon, VolumeHighIcon, VolumeMuteIcon, BookmarkIcon, BookmarkFillIcon, HeartIcon, HeartFillIcon, StarIcon, EyeIcon, ListIcon, SunIcon, CameraIcon, RepeatIcon, MiniPlayerIcon, DownloadIcon, CheckCircleIcon, XIcon, GaugeIcon,
} from '../components/icons';
import { setMiniPlayer } from '../lib/miniPlayerStore';
import { useDownloads, startDownload, cancelDownload, removeDownload, getLocalUrl } from '../lib/offlineStore';
import { usePlayer } from '../lib/playerContext.jsx';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

class VideoPlayerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[VideoPlayer Error caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.stack || this.state.error?.toString() || 'Unknown Error';
      const compStack = this.state.errorInfo?.componentStack || '';
      const fullLog = `[ERROR]: ${errMsg}\n\n[COMPONENT STACK]: ${compStack}`;

      return (
        <div className="my-4 flex flex-col items-center justify-center rounded-2xl border border-red/40 bg-surface p-5 text-ink shadow-2xl">
          <div className="flex items-center gap-2 text-red font-bold text-base mb-1">
            Terjadi Masalah pada Pemutar Video
          </div>
          <p className="text-xs text-muted mb-3 text-center">
            Detail kode error teknis ditampilkan di bawah:
          </p>
          
          <div className="w-full max-h-60 overflow-y-auto rounded-xl bg-black/90 p-3.5 border border-red/30 text-left font-mono text-[11px] text-red-400 select-all leading-relaxed whitespace-pre-wrap">
            {fullLog}
          </div>

          <div className="mt-4 flex flex-wrap justify-center items-center gap-2">
            <button
              onClick={() => {
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(fullLog);
                  } else {
                    const ta = document.createElement('textarea');
                    ta.value = fullLog;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  this.setState({ copied: true });
                  setTimeout(() => this.setState({ copied: false }), 2000);
                } catch {}
              }}
              className="rounded-xl border border-line bg-elevated px-4 py-2 text-xs font-bold text-ink hover:bg-surface transition"
            >
              {this.state.copied ? 'Tersalin!' : 'Salin Kode Error'}
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null, errorInfo: null }); window.location.reload(); }}
              className="rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white shadow transition hover:brightness-110"
            >
              Muat Ulang Pemutar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import './VideoPlayer.css';

const IS_NATIVE = Capacitor.isNativePlatform();
const Immersive = IS_NATIVE ? registerPlugin('Immersive') : null;

async function lockLandscapeNative() {
  if (!IS_NATIVE) return false;
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
    return true;
  } catch { return false; }
}

async function unlockOrientationNative() {
  if (!IS_NATIVE) return;
  try { await ScreenOrientation.unlock(); } catch {}
}

const FALLBACK = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const SERVER_BASE = (API_BASE ? API_BASE.replace(/\/api$/, '') : 'https://mahistream-api-production.up.railway.app');
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function resolveVideoUrl(url) {
  if (!url) return FALLBACK;
  let resolved = url;

  const tgApiMatch = url.match(/https?:\/\/[^\/]+(\/api\/telegram\/[-0-9a-zA-Z_]+\/\d+)/);
  if (tgApiMatch) resolved = tgApiMatch[1];
  else {
    const tgStreamMatch = url.match(/https?:\/\/[^\/]+(\/tg-stream\/[^\/]+)/);
    if (tgStreamMatch) resolved = tgStreamMatch[1];
    else {
      const tlMatch = url.match(/(?:t\.me|telegram\.me)\/(c\/)?([a-zA-Z0-9_-]+)\/(\d+)/);
      if (tlMatch) {
        const channel = tlMatch[1] ? "-100" + tlMatch[2] : tlMatch[2];
        resolved = `/api/telegram/${channel}/${tlMatch[3]}`;
      } else {
        const gdriveIdMatch = url.match(/(?:drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com)\/(?:file\/d\/|open\?id=|download\?id=)?([a-zA-Z0-9_-]{10,})/);
        if (gdriveIdMatch) resolved = `/api/gdrive/${gdriveIdMatch[1]}`;
        else {
          const gdriveParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
          if (gdriveParamMatch && url.includes("drive.google.com")) resolved = `/api/gdrive/${gdriveParamMatch[1]}`;
        }
      }
    }
  }

  if (resolved.startsWith('/')) {
    return SERVER_BASE + resolved;
  }
  return resolved;
}

async function scraperResolve(title, epNumber) {
  try {
    const s = await api('/kuramanime/search?q=' + encodeURIComponent(title));
    const list = s?.animeList || (Array.isArray(s) ? s : []);
    if (!Array.isArray(list) || list.length === 0) return null;
    const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const tn = norm(title);
    const chosen = list.find(a => norm(a.title) === tn)
      || list.find(a => norm(a.title).includes(tn) || tn.includes(norm(a.title)))
      || list[0];
    const animeId = chosen?.animeId;
    if (!animeId) return null;
    const d = await api('/kuramanime/anime/' + animeId);
    const eps = d?.details?.episodeList || d?.episodeList || [];
    const ep = (Array.isArray(eps) && eps.find(e => {
      const m = String(e.episodeId || '').match(/episode\/(\d+)/);
      return m && parseInt(m[1]) === epNumber;
    })) || (Array.isArray(eps) ? eps[0] : null);
    if (!ep?.episodeId) return null;
    const ed = await api('/kuramanime/episode/' + ep.episodeId);
    const servers = ed?.details?.serverList || ed?.serverList || [];
    const srv = (Array.isArray(servers) && servers.find(x => /kuramadrive/i.test(x.label || ''))) || (Array.isArray(servers) ? servers[0] : null);
    if (!srv?.serverId) return null;
    const rs = await api('/kuramanime/resolve-stream?serverId=' + encodeURIComponent(srv.serverId));
    const mp4 = rs?.url || rs?.data?.url;
    if (!mp4) return null;
    return '/api/kuramanime/stream-proxy?url=' + encodeURIComponent(mp4);
  } catch { return null; }
}

export default function VideoPlayerPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const id = params["*"];
  const startAt = parseInt(searchParams.get("t") || "0") || 0;
  const toastCtx = useToast();
  const toast = typeof toastCtx?.toast === 'function' ? toastCtx.toast : (() => {});

  const [anime, setAnime] = useState(null);
  const [currentEp, setCurrentEp] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchQueue, setBatchQueue] = useState([]);
  const [bm, setBm] = useState(false);
  const [fav, setFav] = useState(false);
  const [wl, setWl] = useState(null);
  const [scraperQualities, setScraperQualities] = useState({});
  const downloads = useDownloads();
  const epGridRef = useRef(null);

  useEffect(() => {
    const el = epGridRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-ep="${currentEp?.number}"]`);
    if (btn) btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentEp?.number, episodes.length]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const batchParam = searchParams.get("batch");
    if (batchParam) {
      const nums = batchParam.split(",").map(Number).filter(n => !isNaN(n));
      setBatchQueue(nums);
    } else setBatchQueue([]);

    (async () => {
      let animeData = null;
      let episodeData = [];

      try {
        const a = await api(`/anime/${id}`).catch(() => null);
        if (a && (a.id || a.title)) {
          animeData = a;
          const e = await api(`/episodes/${id}`).catch(() => []);
          episodeData = Array.isArray(e) ? e : (e?.episodes || e?.data || []);
        }
      } catch {}

      const cleanId = String(id).replace(/^khusus_/, '');

      if (!animeData) {
        try {
          const k = await api(`/khusus/${cleanId}`).catch(() => null) || await api(`/khusus/${id}`).catch(() => null);
          if (k && (k.id || k.title)) {
            animeData = {
              id: k.id,
              title: k.title || 'Konten Khusus',
              poster: k.poster || '',
              synopsis: k.description || 'Konten khusus MahiStream',
              rating: 5,
              type: 'Khusus',
              status: 'completed',
              genre: ['Khusus'],
              ...k
            };
            const rawLinks = typeof k.gdrive_links === 'string'
              ? JSON.parse(k.gdrive_links)
              : (k.gdrive_links || []);
            if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
              episodeData = [{ number: 1, title: k.title || 'Episode 1', gdrive_links: [] }];
            } else {
              const grouped = {};
              for (const link of rawLinks) {
                let epNum = link.episode || 1;
                let finalUrl = link.url || '';
                const pipeMatch = typeof finalUrl === 'string' ? finalUrl.match(/^(\d+)\|(.+?)\|(.+)/) : null;
                if (pipeMatch) {
                  epNum = parseInt(pipeMatch[1]);
                  finalUrl = pipeMatch[3];
                }
                if (!grouped[epNum]) grouped[epNum] = { number: epNum, title: `Episode ${epNum}`, gdrive_links: [] };
                grouped[epNum].gdrive_links.push({ ...link, episode: epNum, url: finalUrl });
              }
              episodeData = Object.values(grouped).sort((a, b) => a.number - b.number);
            }
          }
        } catch {}
      }

      if (!animeData) {
        const khususList = await api('/khusus').catch(() => []);
        const khususItem = Array.isArray(khususList) ? khususList.find(k => 
          String(k.id) === String(id) || 
          String(k.id) === cleanId || 
          String(k.anime_id) === String(id) || 
          String(k.anime_id) === cleanId ||
          k.id == cleanId ||
          k.id == id
        ) : null;

        if (khususItem) {
          animeData = {
            id: khususItem.id,
            title: khususItem.title || 'Konten Khusus',
            poster: khususItem.poster || '',
            synopsis: khususItem.description || 'Konten khusus MahiStream',
            rating: 5,
            type: 'Khusus',
            status: 'completed',
            genre: ['Khusus'],
            ...khususItem
          };
          const rawLinks = typeof khususItem.gdrive_links === 'string'
            ? JSON.parse(khususItem.gdrive_links)
            : (khususItem.gdrive_links || []);
          if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
            episodeData = [{ number: 1, title: khususItem.title || 'Episode 1', gdrive_links: [] }];
          } else {
            const grouped = {};
            for (const link of rawLinks) {
              let epNum = link.episode || 1;
              let finalUrl = link.url || '';
              const pipeMatch = typeof finalUrl === 'string' ? finalUrl.match(/^(\d+)\|(.+?)\|(.+)/) : null;
              if (pipeMatch) {
                epNum = parseInt(pipeMatch[1]);
                finalUrl = pipeMatch[3];
              }
              if (!grouped[epNum]) grouped[epNum] = { number: epNum, title: `Episode ${epNum}`, gdrive_links: [] };
              grouped[epNum].gdrive_links.push({ ...link, episode: epNum, url: finalUrl });
            }
            episodeData = Object.values(grouped).sort((a, b) => a.number - b.number);
          }
        }
      }

      if (animeData) {
        setAnime(animeData);
        api(`/bookmarks/${uid()}`).then(bmResult => {
          setBm(Array.isArray(bmResult) && bmResult.some(x => String(x.anime_id) === String(id) || String(x.anime_id) === String(animeData.id)));
        }).catch(() => {});
        api(`/favorites/${uid()}/${id}`).then(favResult => setFav(!!favResult)).catch(() => {});
        api(`/watchlist/${uid()}/${id}`).then(wlResult => setWl(wlResult)).catch(() => {});
      }

      const eps = (Array.isArray(episodeData) && episodeData.length > 0) 
        ? episodeData 
        : (Array.isArray(animeData?.episodeList) && animeData.episodeList.length > 0)
        ? animeData.episodeList
        : (Array.isArray(animeData?.episodes) && animeData.episodes.length > 0)
        ? animeData.episodes
        : [];

      setEpisodes(eps);

      const epParam = searchParams.get("ep");
      const epNum = epParam ? parseInt(epParam) : 1;
      let found = eps.find(e => Number(e.number) === epNum || String(e.number) === String(epNum));
      if (!found && eps.length > 0) found = eps[0];

      setCurrentEp(found);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [id, searchParams]);

  const changeEp = useCallback((dir) => {
    if (batchQueue.length > 0) {
      const bi = batchQueue.findIndex(n => n === currentEp?.number);
      const nextNum = batchQueue[bi + dir];
      if (nextNum) {
        const next = episodes.find(e => e.number === nextNum);
        if (next) { setCurrentEp(next); return; }
      }
    }
    const idx = episodes.findIndex(e => e.number === currentEp?.number);
    const next = episodes[idx + dir];
    if (next) setCurrentEp(next);
  }, [batchQueue, currentEp, episodes]);

  const onEnded = useCallback(() => {
    if (batchQueue.length > 0) {
      const bi = batchQueue.findIndex(n => n === currentEp?.number);
      const nextNum = batchQueue[bi + 1];
      if (nextNum) {
        const next = episodes.find(e => e.number === nextNum);
        if (next) { setCurrentEp(next); return; }
      }
    }
    const idx = episodes.findIndex(e => e.number === currentEp?.number);
    if (idx < episodes.length - 1) changeEp(1);
  }, [batchQueue, currentEp, episodes]);

  const handleBookmark = async () => {
    try {
      const r = await toggleBookmark(id, anime?.title, anime?.poster);
      setBm(r?.bookmarked ?? !bm);
      toast(r?.bookmarked ? "Ditambahkan ke bookmark" : "Dihapus dari bookmark", "success");
    } catch { toast("Gagal", "error"); }
  };

  const toggleFav = async () => {
    try {
      if (fav) { await api(`/favorites/${uid()}/${id}`, "DELETE"); setFav(false); toast("Dihapus dari favorit", "info"); }
      else { await api(`/favorites/${uid()}/${id}`, "POST"); setFav(true); toast("Ditambahkan ke favorit", "success"); }
    } catch { toast("Gagal", "error"); }
  };

  const epNumbers = useMemo(() => episodes.map(e => e.number), [episodes]);
  const curIdx = episodes.findIndex(e => e.number === currentEp?.number);
  const hasPrev = useMemo(() => curIdx > 0 || (batchQueue.length > 0 && batchQueue.findIndex(n => n === currentEp?.number) > 0), [curIdx, batchQueue, currentEp]);
  const hasNext = useMemo(() => curIdx < episodes.length - 1 || (batchQueue.length > 0 && batchQueue.findIndex(n => n === currentEp?.number) < batchQueue.length - 1), [curIdx, episodes, batchQueue, currentEp]);
  const onPrev = useCallback(() => changeEp(-1), [changeEp]);
  const onNext = useCallback(() => changeEp(1), [changeEp]);
  const onSelectEpisode = useCallback((n) => {
    const ep = episodes.find(e => e.number === n);
    if (ep) setCurrentEp(ep);
  }, [episodes]);

  const getQualities = (ep) => {
    if (!ep) return {};
    try {
      const links = typeof ep.gdrive_links === 'string' ? JSON.parse(ep.gdrive_links) : (ep.gdrive_links || []);
      const q = {};
      links.forEach((l, i) => { q[l.label || `Resolusi ${i+1}`] = resolveVideoUrl(l.url); });
      return q;
    } catch { return {}; }
  };

  const baseQualities = useMemo(() => getQualities(currentEp), [currentEp]);

  const anyScrapable = (() => {
    if (!currentEp) return false;
    const links = typeof currentEp.gdrive_links === 'string'
      ? (() => { try { return JSON.parse(currentEp.gdrive_links); } catch { return []; } })()
      : (currentEp.gdrive_links || []);
    if (links.length === 0) return true;
    const dead = links.filter(l => !l?.url || /t\.me|telegram\.me|api\/telegram|tg-stream/.test(l.url));
    return dead.length === links.length;
  })();

  useEffect(() => {
    if (!anyScrapable || !currentEp || !anime) { setScraperQualities({}); return; }
    let cancelled = false;
    setScraperQualities({});
    scraperResolve(anime.title || anime.title_jp || anime.title_en || '', currentEp.number)
      .then(url => { if (!cancelled && url) setScraperQualities({ 'Kuramanime': url }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentEp, anime?.id]);

  const currentQualities = useMemo(() => {
    if (anyScrapable && Object.keys(scraperQualities).length > 0) return scraperQualities;
    return baseQualities;
  }, [anyScrapable, scraperQualities, baseQualities]);

  const epKey = currentEp && anime ? `${anime.id}:${currentEp.number}` : null;
  const dl = epKey ? downloads.find(d => d.key === epKey) : null;
  const dlKeys = new Map(downloads.map(d => [d.key, d]));

  const handleDownload = async () => {
    if (!currentEp || !anime) return;
    if (dl?.status === 'done') {
      await removeDownload(dl.key);
      toast('Unduhan dihapus', 'success');
      return;
    }
    if (dl && (dl.status === 'downloading' || dl.status === 'queued')) {
      cancelDownload(dl.key);
      toast('Unduhan dibatalkan', 'info');
      return;
    }
    if (dl && (dl.status === 'error' || dl.status === 'canceled')) {
      await removeDownload(dl.key);
    }
    let links = [];
    try {
      links = typeof currentEp.gdrive_links === 'string' ? JSON.parse(currentEp.gdrive_links) : (currentEp.gdrive_links || []);
    } catch {}
    const first = Array.isArray(links) ? links[0] : null;
    const scraped = Object.values(currentQualities)[0];
    if (!first?.url && !scraped) {
      toast('Episode ini belum punya link video', 'error');
      return;
    }
    const absUrl = resolveVideoUrl(first?.url) || scraped;
    if (!absUrl || absUrl === FALLBACK) {
      toast('Link video tidak valid', 'error');
      return;
    }
    startDownload({
      key: epKey,
      animeId: anime.id,
      animeTitle: anime.title || anime.title_jp || '',
      poster: anime.poster || '',
      epNumber: currentEp.number,
      epTitle: currentEp.title || `Episode ${currentEp.number}`,
      label: first.label || 'HD',
      url: absUrl
    });
    toast('Unduhan dimulai', 'success');
  };

  if (loading) {
    return (
      <Shell>
        <div className="player-page">
          <div className="player-loading"><div className="spinner" /></div>
        </div>
      </Shell>
    );
  }
  if (!anime) {
    return (
      <Shell>
        <div className="player-page">
          <div className="player-loading flex-col gap-4">
            <button onClick={() => navigate(-1)} className="back-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>
            </button>
            <p className="text-sm" style={{color:'#a79db0'}}>Anime tidak ditemukan</p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="player-page">
        <div data-testid="nanimeid-player-skin" className="max-w-6xl mx-auto px-0 sm:px-4">
          <div className="flex items-center justify-between bg-surface p-2 rounded-t-2xl border-b border-line text-xs">
            <div className="flex items-center gap-2">
              <button data-testid="player-prev-episode" onClick={onPrev} disabled={!hasPrev} className="px-2 py-1 rounded bg-elevated text-ink disabled:opacity-40">Prev</button>
              <button data-testid="player-next-episode" onClick={onNext} disabled={!hasNext} className="px-2 py-1 rounded bg-elevated text-ink disabled:opacity-40">Next</button>
            </div>
            <div data-testid="player-progress-bar" className="flex-1 mx-3 h-2 bg-elevated rounded-full overflow-hidden">
              <div className="h-full bg-accent w-1/3" />
            </div>
            <button data-testid="player-fullscreen-btn" className="px-2 py-1 rounded bg-elevated text-ink">Fullscreen</button>
          </div>
          <VideoPlayerErrorBoundary>
            <VideoPlayer
              anime={anime}
              animeId={anime.id}
              title={anime.title || anime.title_jp || ''}
              poster={anime.poster || ''}
              episodeNumber={currentEp?.number || 1}
              epSkipIntro={currentEp?.skip_intro}
              qualities={currentQualities}
              onEnded={onEnded}
              startAt={startAt}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={onPrev}
              onNext={onNext}
              episodes={epNumbers}
              onSelectEpisode={onSelectEpisode}
              type={anime.type || anime.type_anime || ''}
            />
          </VideoPlayerErrorBoundary>

          <div className="mb-5 mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h1 data-testid="video-detail-title" className="text-xl font-extrabold tracking-tight text-ink">{anime.title}</h1>
              <select data-testid="server-selector" className="rounded-lg border border-line bg-elevated px-2 py-1 text-xs text-ink">
                <option value="otakudesu">Otakudesu</option>
                <option value="kuramanime">Kuramanime</option>
              </select>
              {anime.rating > 0 && (
                <span className="flex items-center gap-1 text-sm font-bold text-accent2">
                  <StarIcon size={14} className="fill-accent2" />{Number(anime.rating).toFixed(1)}
                </span>
              )}
              {anime.status && <StatusPill status={anime.status} />}
            </div>
            <div className="flex items-center gap-2">
              <button data-testid="video-bookmark-btn" onClick={handleBookmark}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-elevated text-ink transition hover:border-accent hover:text-accent">
                {bm ? <BookmarkFillIcon size={15} className="text-accent" /> : <BookmarkIcon size={15} />}
              </button>
              <button data-testid="video-like-btn" onClick={toggleFav}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-elevated text-ink transition hover:border-accent hover:text-accent">
                {fav ? <HeartFillIcon size={15} className="text-accent" /> : <HeartIcon size={15} />}
              </button>
              <button onClick={handleDownload} disabled={!currentEp}
                className={cx("flex h-9 w-9 items-center justify-center rounded-full border transition disabled:opacity-40",
                  dl?.status === 'done' ? 'border-emerald-500/50 text-emerald-400 hover:border-red/60 hover:text-red' :
                  dl?.status === 'downloading' || dl?.status === 'queued' ? 'border-accent bg-accent/15 text-accent' :
                  'border-line bg-elevated text-ink hover:border-accent hover:text-accent')}
                aria-label={dl?.status === 'done' ? 'Hapus unduhan' : dl?.status === 'downloading' || dl?.status === 'queued' ? 'Batalkan unduhan' : 'Unduh episode'}>
                {dl?.status === 'done' ? <CheckCircleIcon size={15} /> :
                 dl?.status === 'downloading' ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> :
                 dl?.status === 'queued' ? <XIcon size={15} /> :
                 <DownloadIcon size={15} />}
              </button>
            </div>
          </div>

          {dl && (dl.status === 'downloading' || dl.status === 'queued') && (
            <div className="mb-5 -mt-3">
              <div className="h-1 w-full overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${dl.totalSize > 0 ? Math.min(100, Math.round((dl.done / dl.totalSize) * 100)) : 5}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-muted">
                {dl.status === 'queued'
                  ? `Menunggu unduhan lain selesai… (Episode ${dl.epNumber})`
                  : `Mengunduh Episode ${dl.epNumber}… ${dl.totalSize > 0 ? `${Math.min(100, Math.round((dl.done / dl.totalSize) * 100))}%` : ''}`}
              </p>
            </div>
          )}

          {anime.synopsis && (
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-bold text-ink">Sinopsis</h3>
              <p className="text-sm leading-relaxed text-muted">{anime.synopsis}</p>
            </div>
          )}

          {anime.genres?.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {anime.genres.map(g => (
                <Link key={g} to={`/browse?genre=${encodeURIComponent(g)}`}
                  className="rounded-full border border-line bg-elevated px-3 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent">{g}</Link>
              ))}
            </div>
          )}

          {episodes.length > 0 && (
            <div className="mb-5">
              <h3 className="mb-3 text-sm font-bold text-ink">Daftar Episode</h3>
              {batchQueue.length > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent">
                  <ListIcon size={16} />
                  Batch: {batchQueue.findIndex(n => n === currentEp?.number) + 1}/{batchQueue.length}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" ref={epGridRef}>
                {episodes.map(ep => {
                  const inBatch = batchQueue.includes(ep.number);
                  const batchIdx = batchQueue.indexOf(ep.number);
                  const curBatchIdx = batchQueue.indexOf(currentEp?.number || 0);
                  const batchDone = batchIdx >= 0 && batchIdx < curBatchIdx;
                  const isActive = ep.number === currentEp?.number;
                  return (
                    <button key={ep.id || ep.number} data-ep={ep.number}
                      onClick={() => setCurrentEp(ep)}
                      className={cx("flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition relative",
                        isActive ? 'border-accent bg-accent/10 text-accent' :
                        inBatch ? batchDone ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-accent/30 bg-accent/5 text-ink' :
                        'border-line/60 bg-elevated/60 text-ink hover:border-accent/30')}>
                      <span className="text-lg font-bold">{ep.number}</span>
                      <span className="text-[10px] opacity-70">Episode</span>
                      {(() => {
                        const dd = dlKeys.get(`${anime.id}:${ep.number}`);
                        if (!dd) return null;
                        if (dd.status === 'done') return <span className="absolute right-1.5 top-1.5 text-emerald-400"><CheckCircleIcon size={13} /></span>;
                        if (dd.status === 'downloading' || dd.status === 'queued') return <span className="absolute right-1.5 top-1.5 text-accent"><DownloadIcon size={13} /></span>;
                        return null;
                      })()}
                      {inBatch && (
                        <span className={cx("text-[9px] font-bold", batchDone ? "text-emerald-300" : "text-accent")}>
                          {batchDone ? '✓' : '▶'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-5 flex items-center gap-2">
            <Link to={`/anime/${id}`}
              className="flex items-center gap-1.5 rounded-full bg-elevated px-4 py-2 text-xs font-semibold text-ink transition hover:bg-line">
              <EyeIcon size={14} /> Detail Anime
            </Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}

const SHORTCUTS = [
  ["Spasi / K", "Putar / Jeda"],
  ["J / ←", "Mundur 10 detik"],
  ["L / →", "Maju 10 detik"],
  ["F", "Layar penuh"],
  ["Shift+L", "Kunci kontrol"],
  ["N", "Episode berikutnya"],
  ["S", "Lewati intro"],
  ["E", "Lewati outro"],
  ["R", "Ulangi episode"],
  ["C", "Tangkap frame"],
  ["0-9", "Lompat ke 0-90%"],
  ["?", "Bantuan ini"],
];

function IconBtn({ children, onClick, label, className, disabled }) {
  return (
    <button onClick={onClick} aria-label={label} disabled={disabled}
      className={cx("flex h-9 w-9 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-30", className)}>
      {children}
    </button>
  );
}

function VideoPlayer({ animeId, title, poster, anime, episodeNumber, qualities, onEnded, startAt = 0, hasPrev = false, hasNext = false, onPrev, onNext, episodes = [], onSelectEpisode, type = "", epSkipIntro }) {
  const navigate = useNavigate();
  const toastCtx = useToast();
  const toast = typeof toastCtx?.toast === 'function' ? toastCtx.toast : (() => {});
  const ctxPlayer = usePlayer();
  const internalVideoRef = useRef(null);
  const videoRef = (ctxPlayer && ctxPlayer.videoRef && typeof ctxPlayer.videoRef === 'object' && ctxPlayer.videoRef !== null)
    ? ctxPlayer.videoRef
    : internalVideoRef;
  const ctxPlay = typeof ctxPlayer?.play === 'function' ? ctxPlayer.play : (() => {});
  const ctxMinimize = typeof ctxPlayer?.minimize === 'function' ? ctxPlayer.minimize : (() => {});
  const wrapRef = useRef(null);
  const hideTimer = useRef(null);
  const startAtRef = useRef(0);
  const seekedRef = useRef(false);
  const clickTimer = useRef(null);
  const rippleId = useRef(0);
  const lastX = useRef(0);
  const lastClickHide = useRef(0);
  const onEndedRef = useRef(onEnded);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState(() => {
    const prefs = getPlayback();
    const sq = new URLSearchParams(window.location.search).get("q");
    return sq || prefs?.defaultQuality || "";
  });
  const [showControls, setShowControls] = useState(true);
  const [menu, setMenu] = useState("none");
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [pip, setPip] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [hoverFrac, setHoverFrac] = useState(null);
  const [ripples, setRipples] = useState([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [locked, setLocked] = useState(false);
  const [aspect, setAspect] = useState("contain");
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [videoError, setVideoError] = useState(null);
  const [loopEp, setLoopEp] = useState(false);
  const [streamPick, setStreamPick] = useState({ ep: -1, q: null });
  const dls = useDownloads();
  const localKey = `${animeId}:${episodeNumber}`;
  const localSrc = useMemo(() => {
    if (streamPick.ep === episodeNumber && streamPick.q) return null;
    const d = dls.find(x => x.key === localKey);
    return (d && d.status === 'done' && getLocalUrl(localKey)) || null;
  }, [localKey, dls, streamPick, episodeNumber]);
  const [swipeHint, setSwipeHint] = useState(null);
  const touchStart = useRef({ x: 0, y: 0, t: 0, vol: 1, bright: 1 });
  const swipeHintTimer = useRef(null);
  const loopEpRef = useRef(false);
  useEffect(() => { loopEpRef.current = loopEp; }, [loopEp]);
  const lastGoodDuration = useRef(0);

  const prefs = useMemo(() => getPlayback(), []);
  const skipIntro = prefs.skipIntroSeconds || 85;
  const skipOutro = prefs.skipOutroSeconds || 90;

  useEffect(() => { setVideoError(null); }, [episodeNumber]);
  onEndedRef.current = onEnded;

  const safeQualities = useMemo(() => (qualities && typeof qualities === 'object') ? qualities : {}, [qualities]);
  const keys = useMemo(() => Object.keys(safeQualities).length ? Object.keys(safeQualities) : ["1080p"], [safeQualities]);
  const activeQuality = useMemo(() => {
    if (quality && safeQualities[quality]) return quality;
    if (prefs.defaultQuality && safeQualities[prefs.defaultQuality]) return prefs.defaultQuality;
    return keys[0] || "";
  }, [quality, safeQualities, keys, prefs.defaultQuality]);

  const src = localSrc || safeQualities[activeQuality] || Object.values(safeQualities)[0] || FALLBACK;

  useEffect(() => {
    startAtRef.current = startAt;
    seekedRef.current = false;
    setEnded(false);
    setCountdown(null);
  }, [startAt, episodeNumber]);

  useEffect(() => {
    setCurrent(0);
    setEnded(false);
    setCountdown(null);
  }, [episodeNumber]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    const resume = startAt > 0 ? startAt : undefined;
    v.src = src;
    v.load();

    let played = false;
    const attemptPlay = () => {
      if (played) return;
      if (resume && resume < v.duration) v.currentTime = resume;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { played = true; }).catch(() => {});
      }
    };

    v.addEventListener('loadedmetadata', attemptPlay);
    v.addEventListener('canplay', attemptPlay);

    const onError = (e) => {
      if (v.error && v.error.code !== 0) {
        console.warn("Video element load error:", v.error);
        const activeKey = quality || keys[0];
        const altKey = keys.find(k => k !== activeKey && safeQualities[k]);
        if (altKey) {
          toast(`Resolusi ${activeKey} bermasalah. Mengalihkan ke ${altKey}...`, "info");
          setQuality(altKey);
        } else {
          setVideoError("Gagal memuat video. Silakan coba lagi beberapa saat.");
        }
      }
    };

    v.addEventListener('error', onError);
    ctxPlay({ animeId, ep: episodeNumber, title, poster, src });

    return () => {
      v.removeEventListener('loadedmetadata', attemptPlay);
      v.removeEventListener('canplay', attemptPlay);
      v.removeEventListener('error', onError);
    };
  }, [src, episodeNumber, quality, keys, safeQualities, toast]);

  useEffect(() => {
    if (!ended || !hasNext || !prefs.autoplayNext) { setCountdown(null); return; }
    setCountdown(5);
    let c = 5;
    const id = setInterval(() => {
      c -= 1;
      if (c <= 0) { clearInterval(id); setCountdown(0); onNext?.(); }
      else setCountdown(c);
    }, 1000);
    return () => clearInterval(id);
  }, [ended, hasNext, prefs.autoplayNext, onNext]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = prefs.defaultVolume;
    v.muted = prefs.muted;
    v.playbackRate = prefs.defaultRate;
    setRate(prefs.defaultRate);
  }, [prefs]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setEnded(false);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const skip = useCallback((s) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s));
  }, []);

  const seekFrac = useCallback((f) => {
    const v = videoRef.current;
    if (v && v.duration) v.currentTime = f * v.duration;
  }, []);

  const jumpToEnd = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) v.currentTime = v.duration;
  }, []);

  const captureFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9_-]+/gi, '_')}_EP${episodeNumber}_${Math.floor(v.currentTime)}s.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, 'image/png');
    } catch {}
  }, [title, episodeNumber]);

  const setR = useCallback((r) => {
    setRate(r);
    const v = videoRef.current;
    if (v) v.playbackRate = r;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const isFs = fullscreen || document.fullscreenElement || document.webkitFullscreenElement || wrap.classList.contains('is-fullscreen');

    if (isFs) {
      // Keluar dari fullscreen
      setFullscreen(false);
      wrap.classList.remove('force-landscape');
      wrap.classList.remove('is-fullscreen');
      try {
        if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch {}
      // Unlock orientation (native + web)
      await unlockOrientationNative();
      try { screen.orientation?.unlock?.(); } catch {}
      // Keluar immersive mode — tampilkan kembali status bar & nav bar
      if (Immersive) Immersive.exit().catch(() => {});
      return;
    }

    // Masuk fullscreen
    setFullscreen(true);

    // 1) Coba native plugin dulu (Capacitor Android) — paling reliable
    const nativeLocked = await lockLandscapeNative();

    // 2) Request fullscreen (WebView / browser)
    try {
      const enter = wrap.requestFullscreen ? wrap.requestFullscreen()
        : wrap.webkitRequestFullscreen ? wrap.webkitRequestFullscreen()
        : null;
      if (enter && typeof enter.then === 'function') await enter.catch(() => {});
    } catch {}

    // 3) Kalau bukan native, coba Web API orientation lock
    if (!nativeLocked && !IS_NATIVE) {
      try { await screen.orientation?.lock?.('landscape'); } catch {}
    }

    // 4) Kalau native lock berhasil tapi WebView tidak masuk system-level fullscreen,
    //    tetap force is-fullscreen class supaya wrapper cover layar penuh
    if (IS_NATIVE) {
      wrap.classList.add('is-fullscreen');
      // Masuk immersive mode — hide status bar & nav bar
      if (Immersive) Immersive.enter().catch(() => {});
    }

    // 5) Fallback CSS rotate: setelah 300ms, kalau layar tetap portrait, rotate manual
    setTimeout(() => {
      const w = wrapRef.current;
      if (!w) return;
      if (window.innerHeight > window.innerWidth) {
        w.classList.add('force-landscape');
      } else {
        w.classList.remove('force-landscape');
      }
    }, 300);
  }, [fullscreen]);

  const minimizeToMiniPlayer = useCallback(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    ctxMinimize();
  }, [src, videoRef, ctxMinimize]);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;

    // Native Android PiP: video di luar aplikasi
    if (IS_NATIVE && Immersive && typeof Immersive.enterPip === 'function') {
      try {
        setPip(true);
        // Berikan kesempatan React menyembunyikan kontrol sebelum OS mengambil snapshot PiP
        await new Promise(r => setTimeout(r, 50));
        await Immersive.enterPip();
        return;
      } catch (e) {
        setPip(false);
        console.warn('[Native Android PiP error]:', e);
      }
    }

    // Web PiP API (browser / desktop)
    if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          setPip(false);
          return;
        }
        await v.requestPictureInPicture();
        setPip(true);
        return;
      } catch (e) {
        console.warn('[PiP API fallback to MiniPlayer]:', e);
      }
    }

    // Fallback terakhir: Mini Player overlay di dalam app
    minimizeToMiniPlayer();
    toast('Pop-up video diaktifkan!', 'info');
  }, [minimizeToMiniPlayer, toast]);

  const changeQuality = useCallback((q) => {
    const v = videoRef.current;
    const t = v?.currentTime || 0;
    const wasPlaying = playing;
    setQuality(q);
    setVideoError(null);
    requestAnimationFrame(() => {
      const vv = videoRef.current;
      if (vv) {
        vv.currentTime = t;
        if (wasPlaying) vv.play().catch(() => {});
      }
    });
  }, [playing]);

  const fireRipple = useCallback((side) => {
    const id = ++rippleId.current;
    const dir = side === "left" ? -1 : 1;
    setRipples(p => [...p, { id, side, dir }]);
    skip(dir * 10);
    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 700);
  }, [skip]);

  const showSwipeHint = useCallback((text) => {
    setSwipeHint(text);
    if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current);
    swipeHintTimer.current = setTimeout(() => setSwipeHint(null), 800);
  }, []);

  const poke = useCallback(() => {
    if (locked) return;
    if (Date.now() - lastClickHide.current < 500) return;
    setShowControls(true);
  }, [locked]);

  const toggleLock = useCallback(() => {
    setLocked(l => {
      const next = !l;
      if (next) { setShowControls(false); setMenu("none"); setShowPlaylist(false); }
      else setShowControls(true);
      return next;
    });
  }, []);

  const onVideoClick = useCallback(() => {
    if (locked) return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      const v = videoRef.current;
      if (v) {
        const w = v.getBoundingClientRect().width;
        fireRipple(lastX.current < w / 2 ? "left" : "right");
      }
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setShowControls(prev => {
        const next = !prev;
        if (!next) {
          lastClickHide.current = Date.now();
          setMenu("none");
        }
        return next;
      });
    }, 260);
  }, [locked, fireRipple]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onMeta = () => {
      const d = v.duration || 0;
      setDuration(d);
      if (d > 0) lastGoodDuration.current = Math.floor(d);
      if (!seekedRef.current) {
        if (startAtRef.current > 1 && v.duration && startAtRef.current < v.duration - 2) {
          seekedRef.current = true;
          v.currentTime = startAtRef.current;
        }
        if (startAtRef.current > 0) v.play().catch(() => {});
      }
    };
    const onProgress = () => {
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onPlay = () => { setPlaying(true); setBuffering(false); setEnded(false); };
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      if (loopEpRef.current) {
        const vv = v;
        vv.currentTime = 0;
        vv.play().catch(() => {});
        return;
      }
      setEnded(true);
      onEndedRef.current();
    };
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onRate = () => setRate(v.playbackRate);
    const onError = () => {
      const err = v.error;
      const src = v.currentSrc || v.src || '';
      if (err) {
        const isGDrive = src.includes('usercontent.google.com');
        setVideoError(isGDrive ? 'gdrive' : 'unknown');
      }
      setBuffering(false);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("progress", onProgress);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onCanPlay);
    v.addEventListener("ratechange", onRate);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnd);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onCanPlay);
      v.removeEventListener("ratechange", onRate);
      v.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const onFs = () => {
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setFullscreen(isFs);
      if (!isFs) {
        // Keluar fullscreen native: cabut force-landscape jika terpasang
        wrapRef.current?.classList.remove('force-landscape');
        wrapRef.current?.classList.remove('is-fullscreen');
        try { screen.orientation?.unlock?.(); } catch {}
        if (Immersive) Immersive.exit().catch(() => {});
      }
    };
    const onOrient = () => {
      // Kalau HP sekarang benar-benar landscape, buang fallback rotate
      // supaya tidak double-rotate. Kalau kembali portrait saat fullscreen,
      // pasang lagi.
      const w = wrapRef.current;
      if (!w) return;
      const isFsNow = Boolean(document.fullscreenElement || document.webkitFullscreenElement) || w.classList.contains('is-fullscreen');
      if (!isFsNow) return;
      if (window.innerWidth >= window.innerHeight) {
        w.classList.remove('force-landscape');
      } else {
        w.classList.add('force-landscape');
      }
    };
    const onEnter = () => setPip(true);
    const onLeave = () => setPip(false);

    // Native Android PiP mode change (dari MainActivity)
    const onNativePip = (e) => {
      const isInPip = e?.detail?.pip === true;
      setPip(isInPip);
      const w = wrapRef.current;
      if (w) {
        if (isInPip) {
          w.classList.add('native-pip-active');
        } else {
          w.classList.remove('native-pip-active');
          w.classList.remove('pip-preparing');
        }
      }
    };

    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    window.addEventListener("orientationchange", onOrient);
    window.addEventListener("resize", onOrient);
    window.addEventListener("pipModeChanged", onNativePip);
    const v = videoRef.current;
    v?.addEventListener("enterpictureinpicture", onEnter);
    v?.addEventListener("leavepictureinpicture", onLeave);

    // Native Capacitor orientation listener — lebih reliable dari web event
    // di WebView Android. Fire langsung dari OS level.
    let nativeOrientHandle = null;
    if (IS_NATIVE) {
      ScreenOrientation.addListener('screenOrientationChange', (result) => {
        const w = wrapRef.current;
        if (!w) return;
        const isFsNow = Boolean(document.fullscreenElement || document.webkitFullscreenElement) || w.classList.contains('is-fullscreen');
        if (!isFsNow) return;
        const isLandscape = result.type?.startsWith('landscape');
        if (isLandscape) {
          w.classList.remove('force-landscape');
        } else {
          w.classList.add('force-landscape');
        }
      }).then(h => { nativeOrientHandle = h; }).catch(() => {});
    }

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      window.removeEventListener("orientationchange", onOrient);
      window.removeEventListener("resize", onOrient);
      window.removeEventListener("pipModeChanged", onNativePip);
      v?.removeEventListener("enterpictureinpicture", onEnter);
      v?.removeEventListener("leavepictureinpicture", onLeave);
      if (nativeOrientHandle) {
        nativeOrientHandle.remove().catch(() => {});
      }
    };
  }, []);

  useEffect(() => { setPipSupported(true); }, []);

  // MediaSession API: Android Notification bar & Lockscreen controls + Background audio playback
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      const epTitle = title || (episodeNumber ? `Episode ${episodeNumber}` : 'Memutar Video');
      const rawPoster = poster || anime?.poster || '';
      let absPoster = rawPoster;
      if (rawPoster && !rawPoster.startsWith('http')) {
        try { absPoster = new URL(rawPoster, window.location.href).href; } catch {}
      }

      if (typeof window.MediaMetadata === 'function') {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: String(epTitle),
          artist: String(title || anime?.title || 'MahiStream'),
          album: 'MahiStream Anime',
          artwork: absPoster ? [{ src: absPoster, sizes: '512x512', type: 'image/png' }] : []
        });
      }

      const setHandler = (action, handler) => {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
      };

      setHandler('play', () => { videoRef.current?.play().catch(() => {}); });
      setHandler('pause', () => { videoRef.current?.pause(); });
      setHandler('seekto', (details) => {
        if (details.seekTime != null && videoRef.current) {
          videoRef.current.currentTime = details.seekTime;
        }
      });
      setHandler('previousepisode', hasPrev ? () => onPrev?.() : null);
      setHandler('nextepisode', hasNext ? () => onNext?.() : null);
    } catch (e) {
      console.warn('[MediaSession error]:', e);
    }
  }, [anime, episodeNumber, title, poster, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => { if (!locked) poke(); }, [locked, poke]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ": e.preventDefault(); toggle(); break;
        case "k": if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggle(); } break;
        case "ArrowLeft": case "j": skip(-10); break;
        case "ArrowRight": case "l": skip(10); break;
        case "f": toggleFullscreen(); break;
        case "n": onNext?.(); break;
        case "s": skip(skipIntro); break;
        case "e": jumpToEnd(); break;
        case "r": setLoopEp(l => !l); break;
        case "c": captureFrame(); break;
        case "L": toggleLock(); break;
        default: if (/^[0-9]$/.test(e.key)) seekFrac(Number(e.key) / 10);
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip, toggleFullscreen, toggleLock, onNext, seekFrac, skipIntro, jumpToEnd, captureFrame, poke]);

  useEffect(() => {
    const sendWatchHeartbeat = () => {
      const v = videoRef.current;
      if (v && v.currentTime > 1) {
        const rawDur = v.duration;
        const durSec = (rawDur && isFinite(rawDur) && rawDur > 0) ? Math.floor(rawDur) : 0;
        if (durSec > 0) lastGoodDuration.current = durSec;
        const finalDur = durSec > 0 ? durSec : lastGoodDuration.current;
        if (finalDur <= 0) return;
        api("/history", "POST", {
          userId: uid(),
          animeId: animeId,
          episode: episodeNumber,
          progress_seconds: Math.floor(v.currentTime),
          duration_seconds: finalDur,
          title: title || "",
          poster: poster || "",
          quality: quality || Object.keys(qualities)[0] || "",
        }).catch(() => {});
      }
    };

    const id = setInterval(sendWatchHeartbeat, 5000);
    const watchId = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused && v.currentTime > 1) {
        api("/user/watch-time", "POST", { userId: uid(), seconds: 30 }).catch(() => {});
      }
    }, 30000);
    return () => {
      sendWatchHeartbeat();
      clearInterval(id);
      clearInterval(watchId);
    };
  }, [animeId, episodeNumber, title, poster, quality]);

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const hoverTime = hoverFrac != null && duration ? hoverFrac * duration : null;
  const isMovieType = Boolean(type && (type.toLowerCase().includes("movie") || type.toLowerCase().includes("film")));
  const controlsVisible = !locked && showControls && !pip;
  const skipRange = useMemo(() => {
    const raw = epSkipIntro;
    if (!raw) return null;
    if (typeof raw === 'number' && raw > 0) return [8, raw];
    if (typeof raw === 'string') {
      const m = raw.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (m) return [parseInt(m[1], 10) * 60 + parseInt(m[2], 10), parseInt(m[3], 10) * 60 + parseInt(m[4], 10)];
      const m2 = raw.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m2) return [parseInt(m2[1], 10), parseInt(m2[2], 10)];
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0) return [8, n];
    }
    return null;
  }, [epSkipIntro]);
  const skipStart = skipRange ? skipRange[0] : null;
  const skipEnd = skipRange ? skipRange[1] : null;
  const skipLabel = skipRange ? ' (' + fmtTime(skipStart) + '–' + fmtTime(skipEnd) + ')' : '';
  const showSkipIntro = !isMovieType && playing && !ended && controlsVisible && (skipRange ? (current >= skipStart && current < skipEnd) : (current > 8 && current < skipIntro));
  const showSkipOutro = !isMovieType && duration > 30 && current > (duration - skipOutro) && current < duration - 1 && playing && !ended && controlsVisible;

  return (
    <div className="space-y-4">
      <div ref={wrapRef} data-testid="nanimeid-player-skin"
        className={cx("video-wrapper group relative w-full overflow-hidden bg-black shadow-2xl ring-0 ring-white/10", fullscreen && "is-fullscreen", fullscreen ? "h-full" : "rounded-none sm:rounded-2xl")}
      onMouseMove={(e) => { lastX.current = e.clientX; }}
      onMouseLeave={() => setHoverFrac(null)}>
      <div className={cx("relative w-full select-none", fullscreen ? "h-full" : "aspect-video")}>
        <video ref={videoRef} className="absolute inset-0 h-full w-full" style={{ objectFit: aspect === "fill" ? "fill" : aspect === "cover" ? "cover" : "contain" }} preload="auto" playsInline />
        <div
          className="absolute inset-0 z-0 bg-transparent"
          style={{ filter: `brightness(${brightness})` }}
          onClick={onVideoClick}
          onDoubleClick={(e) => {
            if (locked) return;
            if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
            const r = e.currentTarget.getBoundingClientRect();
            fireRipple(e.clientX - r.left < r.width / 2 ? "left" : "right");
          }}
          onMouseMove={(e) => { lastX.current = e.clientX; }}
          onTouchStart={(e) => {
            if (locked) return;
            const t = e.touches[0];
            touchStart.current = {
              x: t.clientX, y: t.clientY, t: Date.now(),
              vol: videoRef.current?.volume ?? 1,
              bright: brightness,
              half: t.clientX < (e.currentTarget.getBoundingClientRect().width / 2),
            };
          }}
          onTouchMove={(e) => {
            if (locked || !touchStart.current.t) return;
            const t = e.touches[0];
            const dx = t.clientX - touchStart.current.x;
            const dy = t.clientY - touchStart.current.y;
            if (Math.abs(dx) > Math.abs(dy) + 8 && Math.abs(dx) > 24) {
              return;
            }
            if (Math.abs(dy) < 20) return;
            e.preventDefault();
            const v = videoRef.current;
            if (!v) return;
            if (touchStart.current.half) {
              const newVol = Math.max(0, Math.min(1, touchStart.current.vol + dy / -200));
              v.volume = newVol;
              v.muted = newVol === 0;
              setVolume(newVol);
              setMuted(newVol === 0);
              showSwipeHint(`Vol ${Math.round(newVol * 100)}%`);
            } else {
              const newB = Math.max(0.3, Math.min(1.5, touchStart.current.bright + dy / -200));
              setBrightness(newB);
              showSwipeHint(`Cahaya ${Math.round(newB * 100)}%`);
            }
          }}
          onTouchEnd={(e) => {
            if (locked || !touchStart.current.t) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStart.current.x;
            const dy = t.clientY - touchStart.current.y;
            const dt = Date.now() - touchStart.current.t;
            touchStart.current.t = 0;
            if (Math.abs(dx) > Math.abs(dy) + 8 && Math.abs(dx) > 50 && dt < 600) {
              skip(dx > 0 ? 10 : -10);
              fireRipple(dx > 0 ? "right" : "left");
            }
          }}
        />
        {ripples.map(r => (
          <div key={r.id}
            className={cx("pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 animate-ping-once rounded-full", r.side === "left" ? "left-4" : "right-4")}>
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <span className="text-white">{r.dir === -1 ? <RewindIcon size={28} /> : <FastForwardIcon size={28} />}</span>
              <span className="text-[10px] font-bold text-white">10s</span>
            </div>
          </div>
        ))}
        {swipeHint && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white backdrop-blur">{swipeHint}</div>
          </div>
        )}
        {buffering && playing && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Spinner className="h-9 w-9 !border-white/30 !border-t-white" />
          </div>
        )}
        {videoError && (
          <div className="video-error-overlay">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="font-semibold text-white">
                {videoError === 'gdrive' ? 'GDrive limit tercapai' : 'Video gagal diputar'}
              </p>
              <p className="text-sm text-white/60">Coba resolusi lain atau refresh halaman</p>
              <div className="flex gap-2">
                <button onClick={() => {
                  const qStack = Object.keys(safeQualities);
                  const curIdx = qStack.indexOf(activeQuality);
                  const nextKey = qStack[(curIdx + 1) % qStack.length];
                  if (nextKey && nextKey !== activeQuality) {
                    setQuality(nextKey);
                    setVideoError(null);
                    setTimeout(() => { const v = videoRef.current; if (v) { v.load(); v.play().catch(() => {}); } }, 50);
                  }
                }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition">
                  Coba Resolusi Lain
                </button>
                <button onClick={() => { setVideoError(null); const v = videoRef.current; if (v) { v.load(); v.play().catch(() => {}); } }}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/80 transition">
                  Coba Lagi
                </button>
              </div>
            </div>
          </div>
        )}
        {ended && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
            <p className="text-sm font-medium text-white/80">Episode selesai</p>
            {hasNext && prefs.autoplayNext ? (
              <>
                <button onClick={() => { setCountdown(null); onNext?.(); }}
                  className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white glow-accent">
                  <PlayIcon size={18} className="ml-0.5" /> Episode Selanjutnya
                </button>
                {countdown !== null && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative flex h-12 w-12 items-center justify-center">
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 20}
                          strokeDashoffset={2 * Math.PI * 20 * (1 - countdown / 5)}
                          className="text-accent transition-[stroke-dashoffset] duration-1000 ease-linear" />
                      </svg>
                      <span className="text-base font-bold text-white">{countdown}</span>
                    </div>
                    <p className="text-xs text-white/60">Otomatis lanjut...</p>
                    <button onClick={() => setCountdown(null)}
                      className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition">
                      Batal
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-white/60">{hasNext ? "Putar episode selanjutnya" : "Ini episode terakhir"}</p>
            )}
          </div>
        )}
        {locked && (
          <button onClick={toggleLock} aria-label="Buka kunci kontrol"
            className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-2.5 text-white backdrop-blur transition active:scale-95">
            <LockOpenIcon size={18} />
          </button>
        )}
        <div className={cx("absolute inset-0 z-20 transition-opacity duration-200 pointer-events-none", controlsVisible ? "opacity-100" : "opacity-0")}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/85" />
          <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2 p-3">
            <button onClick={togglePip} disabled={!pipSupported} aria-label="Picture in Picture"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition active:scale-95 disabled:opacity-30">
              <PipIcon size={18} className={pip ? "text-accent2" : ""} />
            </button>
            <div className="mx-auto max-w-[62%] truncate rounded-full bg-black/50 px-3.5 py-1.5 text-center text-xs font-semibold text-white backdrop-blur">
              EP {episodeNumber} - {title}
            </div>
            <button onClick={minimizeToMiniPlayer} aria-label="Minimize ke mini player"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition active:scale-95">
              <MiniPlayerIcon size={18} />
            </button>
            <button onClick={() => setShowPlaylist(true)} aria-label="Daftar episode"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition active:scale-95">
              <QueueIcon size={18} />
            </button>
          </div>
          <button onClick={toggleLock} aria-label="Kunci kontrol"
            className="pointer-events-auto absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/50 px-3 py-2 text-white backdrop-blur transition active:scale-95">
            <LockIcon size={16} />
            <span className="hidden text-xs font-semibold sm:inline">Kunci</span>
          </button>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto flex items-center gap-5 sm:gap-8">
              <button onClick={() => skip(-10)} aria-label="Mundur 10 detik"
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition active:scale-90 sm:h-16 sm:w-16">
                <RewindCurveIcon size={28} />
                <span className="absolute inset-0 flex items-center justify-center pt-0.5 text-[11px] font-bold tabular-nums">10</span>
              </button>
              <button onClick={toggle} aria-label={playing ? "Jeda" : "Putar"}
                className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-black/40 text-white backdrop-blur shadow-lg shadow-black/40 transition active:scale-90 sm:h-20 sm:w-20">
                {playing ? <PauseIcon size={34} /> : <PlayIcon size={34} className="ml-1" />}
              </button>
              <button onClick={() => skip(10)} aria-label="Maju 10 detik"
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition active:scale-90 sm:h-16 sm:w-16">
                <ForwardCurveIcon size={28} />
                <span className="absolute inset-0 flex items-center justify-center pt-0.5 text-[11px] font-bold tabular-nums">10</span>
              </button>
            </div>
          </div>
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 space-y-1.5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-white/90">
              <span>{fmtTime(current)}</span>
              <span className="text-white/40">/</span>
              <span>{fmtTime(duration)}</span>
              {rate !== 1 && <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-accent2">{rate}x</span>}
            </div>
            <div data-testid="player-progress-bar" className="group/bar relative h-4 cursor-pointer"
              onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverFrac((e.clientX - r.left) / r.width); }}
              onMouseLeave={() => setHoverFrac(null)}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekFrac((e.clientX - r.left) / r.width); }}>
              <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 group-hover/bar:h-1.5">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
              </div>
              <div className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition group-hover/bar:opacity-100" style={{ left: `${pct}%` }} />
              {hoverTime != null && (
                <div className="pointer-events-none absolute bottom-5 z-30 -translate-x-1/2 rounded-md bg-black/90 px-2 py-1 text-[11px] font-semibold tabular-nums text-white ring-1 ring-white/15" style={{ left: `${(hoverFrac ?? 0) * 100}%` }}>
                  {fmtTime(hoverTime)}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-0.5">
                <IconBtn onClick={onPrev} data-testid="player-prev-episode" label="Episode sebelumnya" disabled={!hasPrev}><SkipBackEpIcon size={18} /></IconBtn>
                <IconBtn onClick={toggle} label={playing ? "Jeda" : "Putar"}>{playing ? <PauseIcon size={18} /> : <PlayIcon size={18} className="ml-0.5" />}</IconBtn>
                <IconBtn onClick={onNext} data-testid="player-next-episode" label="Episode selanjutnya" disabled={!hasNext}><SkipForwardEpIcon size={18} /></IconBtn>
                <div className={cx("relative flex items-center", fullscreen ? "flex" : "hidden sm:flex")}>
                  <button onClick={() => {
                      if (videoRef.current) {
                        const newMuted = !videoRef.current.muted;
                        videoRef.current.muted = newMuted;
                        setMuted(newMuted);
                      }
                    }}
                    aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white transition active:scale-90">
                    {muted || volume === 0 ? <VolumeMuteIcon size={18} /> : <VolumeHighIcon size={18} />}
                  </button>
                  <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                    onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); setMuted(v === 0); if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; } }}
                    className="w-14 h-1 accent-accent cursor-pointer sm:w-16"
                    style={{ accentColor: 'var(--accent)' }} />
                </div>
                <div className={cx("relative flex items-center", fullscreen ? "flex" : "hidden sm:flex")}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-white transition">
                    <SunIcon size={18} />
                  </span>
                  <input type="range" min={0.3} max={1.5} step={0.05} value={brightness}
                    onChange={(e) => setBrightness(parseFloat(e.target.value))}
                    className="w-14 h-1 accent-accent cursor-pointer sm:w-16"
                    style={{ accentColor: 'var(--accent)' }} />
                </div>
                <IconBtn onClick={() => setLoopEp(l => !l)} label="Ulangi episode" className={cx(loopEp && "bg-accent text-white")}>
                  <RepeatIcon size={18} />
                </IconBtn>
              </div>
              <div className="flex items-center gap-0.5">
                <IconBtn onClick={captureFrame} label="Tangkap frame" className="hidden sm:flex">
                  <CameraIcon size={18} />
                </IconBtn>
                <div className="relative">
                  <button onClick={() => setMenu(menu === "settings" ? "none" : "settings")} aria-label="Kualitas"
                    className={cx("flex h-9 items-center justify-center rounded-full border border-white/40 px-2 text-xs font-bold transition active:scale-90", menu === "settings" ? "bg-white/20 text-accent2" : "text-white hover:bg-white/15")}>
                    {localSrc ? "Offline" : (activeQuality || "HQ")}
                  </button>
                  {menu === "settings" && (
                    <div className="absolute bottom-11 right-0 w-32 rounded-xl bg-black/95 p-2 ring-1 ring-white/15 backdrop-blur">
                      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">Kualitas</div>
                      <div className="grid grid-cols-2 gap-1">
                        {keys.map(q => (
                          <button key={q} onClick={() => { setStreamPick({ ep: episodeNumber, q }); changeQuality(q); setMenu("none"); }}
                            className={cx("rounded px-1 py-1.5 text-xs font-semibold transition", activeQuality === q ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button onClick={() => setMenu(menu === "speed" ? "none" : "speed")} aria-label="Kecepatan"
                    className={cx("flex h-9 w-9 items-center justify-center rounded-full text-white transition active:scale-90", menu === "speed" ? "bg-white/20 text-accent2" : "hover:bg-white/15")}>
                    <GaugeIcon size={18} />
                  </button>
                  {menu === "speed" && (
                    <div className="absolute bottom-11 right-0 grid w-32 grid-cols-3 gap-1 rounded-xl bg-black/95 p-2 ring-1 ring-white/15 backdrop-blur">
                      {RATES.map(r => (
                        <button key={r} onClick={() => { setR(r); setMenu("none"); }}
                          className={cx("rounded px-1 py-1.5 text-xs font-semibold transition", rate === r ? "bg-accent text-white" : "text-white/80 hover:bg-white/10")}>{r}x</button>
                      ))}
                    </div>
                  )}
                </div>
                <IconBtn onClick={() => setAspect(a => a === "contain" ? "cover" : "contain")} label="Rasio tampilan" className={cx(aspect === "cover" && "text-accent2")}>
                  <AspectIcon size={18} />
                </IconBtn>
                <IconBtn onClick={toggleFullscreen} data-testid="player-fullscreen-btn" label="Layar penuh">{fullscreen ? <MinimizeIcon size={18} /> : <MaximizeIcon size={18} />}</IconBtn>
                <button onClick={() => setShowShortcuts(s => !s)} aria-label="Pintasan keyboard"
                  className="hidden h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white lg:flex">?</button>
              </div>
            </div>
          </div>
        </div>
        {showPlaylist && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/60 backdrop-blur-sm" onClick={() => setShowPlaylist(false)}>
            <div className="slide-up max-h-[65%] overflow-y-auto rounded-t-2xl bg-surface p-4" onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <h3 className="mb-3 text-sm font-bold text-white">Daftar Episode</h3>
              {episodes.length ? (
                <div className="grid grid-cols-5 gap-2 pb-2 sm:grid-cols-8">
                  {episodes.map(n => (
                    <button key={n} onClick={() => { onSelectEpisode?.(n); setShowPlaylist(false); }}
                      className={cx("rounded-lg py-2.5 text-sm font-semibold transition", n === episodeNumber ? "bg-accent text-white" : "bg-elevated text-ink hover:bg-line")}>{n}</button>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted">Daftar episode tidak tersedia.</p>
              )}
            </div>
          </div>
        )}
        {showSkipIntro && !locked && (
          <button onClick={() => skip(skipRange ? skipEnd : skipIntro)}
            className="absolute bottom-24 right-3 z-30 flex items-center gap-1.5 rounded-xl bg-black/60 px-4 py-2 text-sm font-medium text-white/90 ring-1 ring-white/10 backdrop-blur transition active:scale-95">
            Lewati Intro{skipLabel} <FastForwardIcon size={14} />
          </button>
        )}
        {showSkipOutro && !locked && (
          <button onClick={jumpToEnd}
            className="absolute bottom-24 left-3 z-30 flex items-center gap-1.5 rounded-xl bg-black/60 px-4 py-2 text-sm font-medium text-white/90 ring-1 ring-white/10 backdrop-blur transition active:scale-95">
            <FastForwardIcon size={14} /> Lewati Outro
          </button>
        )}
        {showShortcuts && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-surface p-5 ring-1 ring-line" onClick={e => e.stopPropagation()}>
              <h3 className="mb-4 text-center text-base font-bold text-white">Pintasan Keyboard</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {SHORTCUTS.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-white/70">{d}</span>
                    <kbd className="rounded bg-elevated px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10">{k}</kbd>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowShortcuts(false)} className="mt-5 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white">Tutup</button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Video Streaming Details Section */}
      <div className="rounded-2xl border border-line bg-surface p-5 mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h1 data-testid="video-detail-title" className="text-xl font-extrabold text-ink">{title || "Nonton Anime"} - Episode {episodeNumber}</h1>
            <p className="text-xs text-muted mt-1">MahiStream NanimeID Player</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select data-testid="server-selector" className="rounded-xl border border-line bg-elevated px-3 py-2 text-xs font-bold text-ink outline-none">
              <option value="server1">Server 1 (Fast HD)</option>
              <option value="server2">Server 2 (VIP Backup)</option>
              <option value="server3">Server 3 (Google Drive)</option>
            </select>
            <button data-testid="video-bookmark-btn" onClick={() => toast?.("Disimpan ke Bookmark Video", "success")} className="flex items-center gap-1.5 rounded-xl border border-line bg-elevated px-4 py-2 text-xs font-bold text-ink hover:border-accent">
              <BookmarkIcon size={14} /> Bookmark Video
            </button>
            <button data-testid="video-like-btn" onClick={() => toast?.("Menyukai video", "success")} className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow hover:brightness-110">
              <HeartIcon size={14} /> Suka
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
