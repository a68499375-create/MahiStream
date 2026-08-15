import { useState, useEffect, useRef, useCallback } from 'react';
import { api, inputCls, uid, compressPosterImage, API_BASE } from '../lib/client';
import { ADMIN_KEY, adminFetch, adminPost, adminDel } from '../services/api';
import { io } from "socket.io-client";
import Shell, { PageHeader } from '../components/Shell';
import { Btn, Spinner, EmptyState, cx } from '../components/ui/index';
import GDriveLinksEditor, { pipeToJson, jsonToPipe } from '../components/GDriveLinksEditor';
import { useDialog } from '../components/DialogProvider';
import { useToast } from '../components/Toast';
import {
  LockIcon, LockOpenIcon, BarChartIcon, FilmIcon, SendIcon,
  BellIcon, CalendarIcon, TrashIcon, PlusIcon, WrenchIcon, XIcon, SearchIcon,
  PlayCircleIcon, HomeIcon, NotificationIcon, MessageIcon, AlertIcon, ExternalLinkIcon,
} from '../components/icons';

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-4 text-center">
      <div className="text-2xl font-extrabold text-accent">{value ?? '—'}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function Loc({ ip, resolve }) {
  const [loc, setLoc] = useState('—');
  useEffect(() => {
    if (!ip) { setLoc('—'); return; }
    let active = true;
    resolve(ip).then(l => { if (active) setLoc(l); });
    return () => { active = false; };
  }, [ip, resolve]);
  return <>{loc}</>;
}

function EpisodeManager({ selectedAnime, episodes, setEpisodes, loadData, adminFetch, adminPost, adminDel, confirm, episodeForm, setEpisodeForm }) {
  const reload = async () => {
    const d = await adminFetch(`/anime/${selectedAnime.id}`);
    setEpisodes(d.episodeList || []);
  };
  const addUrl = () => {
    const urls = [...(episodeForm.urls || []), { label: episodeForm.resolution || '1080p', url: '' }];
    setEpisodeForm({ ...episodeForm, urls });
  };
  const updateUrl = (i, field, val) => {
    const urls = [...(episodeForm.urls || [])];
    urls[i] = { ...urls[i], [field]: val };
    setEpisodeForm({ ...episodeForm, urls });
  };
  const removeUrl = (i) => {
    const urls = (episodeForm.urls || []).filter((_, idx) => idx !== i);
    setEpisodeForm({ ...episodeForm, urls });
  };
  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-ink">{selectedAnime.title}</h2>
      <p className="mb-4 text-xs text-muted">{episodes.length} episode</p>

      {/* Add episode */}
      <div className="mb-4 space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={episodeForm.number}
            onChange={(e) => setEpisodeForm({ ...episodeForm, number: e.target.value })}
            placeholder="Episode" className={inputCls + " w-full"} />
          <input type="text" value={episodeForm.title}
            onChange={(e) => setEpisodeForm({ ...episodeForm, title: e.target.value })}
            placeholder="Judul Episode" className={inputCls + " w-full"} />
        </div>

        {(episodeForm.urls || []).map((u, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border border-line/40 bg-elevated/40 p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted2">Resolusi</span>
              {i > 0 && (
                <button onClick={() => removeUrl(i)} className="ml-auto text-[10px] text-muted2 hover:text-red">Hapus URL ini</button>
              )}
            </div>
            <input value={u.label} onChange={(e) => updateUrl(i, 'label', e.target.value)}
              className={inputCls + " w-full text-[11px]"} placeholder="1080p / 720p / 480p" />
            <input value={u.url} onChange={(e) => updateUrl(i, 'url', e.target.value)}
              className={inputCls + " w-full text-[11px] border-accent/30"} placeholder="Link GDrive / Telegram / URL lain" />
          </div>
        ))}

        <button onClick={addUrl} className="text-[11px] font-semibold text-accent hover:text-accent/80">+ Tambah URL</button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted2">Skip Intro:</span>
          <input value={episodeForm.skip_intro || ''}
            onChange={(e) => setEpisodeForm({ ...episodeForm, skip_intro: e.target.value })}
            className={inputCls + " flex-1 text-[11px]"} placeholder="00:00-01:28" />
        </div>

        <Btn onClick={async () => {
          if (!episodeForm.number) return;
          const links = (episodeForm.urls || []).filter(l => l.url.trim()).map(l => ({ label: l.label || 'Default', url: l.url.trim() }));
          if (links.length === 0) return;
          await adminPost("/admin/episodes", {
            anime_id: selectedAnime.id,
            number: parseInt(episodeForm.number),
            title: episodeForm.title,
            gdrive_links: JSON.stringify(links),
            skip_intro: episodeForm.skip_intro || "",
            duration: parseInt(episodeForm.duration) || 0,
          });
          setEpisodeForm({ number: '', title: '', gdrive_links: '', resolution: '1080p', skip_intro: '', duration: '', urls: [{ label: '1080p', url: '' }] });
          await reload();
        }} className="w-full justify-center"><PlusIcon size={14} /> Tambah Episode</Btn>
      </div>

      {/* List */}
      <div className="space-y-2">
        {episodes.map(ep => {
          const eplinks = typeof ep.gdrive_links === 'string' ? JSON.parse(ep.gdrive_links || '[]') : (ep.gdrive_links || []);
          return (
            <div key={ep.id} className="rounded-xl border border-line bg-elevated p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-accent">Episode {ep.number}</span>
                <button onClick={async () => { if (await confirm({ message: "Hapus episode?", tone: "danger" })) { await adminDel(`/admin/episodes/${ep.id}`); await reload(); } }}
                  className="text-[11px] text-muted2 hover:text-red">Hapus</button>
              </div>
              {ep.title && <div className="mb-1 text-[11px] text-muted">{ep.title}</div>}
              {ep.skip_intro && <div className="mb-1 text-[11px] text-muted2">Skip Intro: {ep.skip_intro}</div>}
              {eplinks.map((l, i) => (
                <div key={i} className="text-[11px] text-muted2">Resolusi {l.label}: {l.url}</div>
              ))}
            </div>
          );
        })}
        {episodes.length === 0 && <p className="py-4 text-center text-sm text-muted">Belum ada episode</p>}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'anime', label: 'Anime', Icon: FilmIcon },
  { key: 'eps', label: 'Eps', Icon: PlayCircleIcon },
  { key: 'requests', label: 'Request', Icon: SendIcon },
  { key: 'stats', label: 'Statistik', Icon: BarChartIcon },
  { key: 'khusus', label: 'Khusus', Icon: LockIcon },
  { key: 'announcement', label: 'Pengumuman', Icon: BellIcon },
  { key: 'schedule', label: 'Jadwal Rilis', Icon: CalendarIcon },
  { key: 'home', label: 'Beranda', Icon: HomeIcon },
  { key: 'maintenance', label: 'Maintenance', Icon: WrenchIcon },
  { key: 'notifications', label: 'Notifikasi', Icon: NotificationIcon },
  { key: 'tiket', label: 'Tiket', Icon: MessageIcon },
  { key: 'reports', label: 'Laporan', Icon: AlertIcon },
  { key: 'community', label: 'Komunitas', Icon: ExternalLinkIcon },
];

export default function DevPanel() {
  const [authed, setAuthed] = useState(() => {
    try {
      const r = JSON.parse(localStorage.getItem('mahi-user') || '{}').role;
      return r === 'dev';
    } catch { return false; }
  });

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('mahi-user') || '{}').role;
      if (r === 'admin') {
        window.location.href = '/admin';
      } else if (r && r !== 'dev') {
        window.location.href = '/';
      }
    } catch {}
  }, []);
  const [pw, setPw] = useState('');
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [animeList, setAnimeList] = useState([]);
  const [requests, setRequests] = useState([]);
  const [savingReq, setSavingReq] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [annList, setAnnList] = useState([]);
  const [annEditId, setAnnEditId] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [khususList, setKhususList] = useState([]);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [episodeOnly, setEpisodeOnly] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [maintenance, setMaintenance] = useState(false);
  const [adminChats, setAdminChats] = useState([]);
  const [adminSelected, setAdminSelected] = useState(null);
  const [adminMsgs, setAdminMsgs] = useState([]);
  const [adminInput, setAdminInput] = useState("");
  const [adminSending, setAdminSending] = useState(false);
  const chatSocket = useRef(null);

  useEffect(() => {
    if (tab === 'maintenance') {
      adminFetch('/admin/maintenance').then(d => {
        if (d?.maintenance !== undefined) setMaintenance(d.maintenance);
      }).catch(() => {});
    }
  }, [tab]);

  const [form, setForm] = useState({ title: '', title_jp: '', alt_titles: '', poster: '', synopsis: '', genre: '', rating: 0, aired_from: '', aired_to: '', type: 'TV', status: 'ongoing', featured: false, trending: false });
  const [saveMsg, setSaveMsg] = useState('');
  const { confirm } = useDialog();
const { toast } = useToast();
  const [scheduleForm, setScheduleForm] = useState({ day_of_week: 'Senin', title: '', time: '', anime_id: '' });
  const [episodeForm, setEpisodeForm] = useState({ number: '', title: '', gdrive_links: '', resolution: '1080p', skip_intro: '', duration: '', urls: [{ label: '1080p', url: '' }] });
  const [khususForm, setKhususForm] = useState({ id: '', title: '', poster: '', gdrive_links: '', description: '' });
  const [khususFormKey, setKhususFormKey] = useState(0);
  const [homeSections, setHomeSections] = useState({ recommendations: true, genres: true, schedule: true, trending: true, latest: true });
  const [homeGenres, setHomeGenres] = useState([]);
  const [homeTrendingIds, setHomeTrendingIds] = useState([]);
  const [homeRecIds, setHomeRecIds] = useState([]);
  const [newGenre, setNewGenre] = useState('');
  const [trendSearch, setTrendSearch] = useState('');
  const [homeHeroIds, setHomeHeroIds] = useState([]);
  const [heroSearch, setHeroSearch] = useState('');
  const [recSearch, setRecSearch] = useState('');
  const [searchAnime, setSearchAnime] = useState('');
  const [searchReq, setSearchReq] = useState('');
  const resolveLoc = (ip) => {
    return Promise.resolve(ip || '');
  };

  const setRole = async (u, role) => {
    await adminPost('/admin/set-role', { userId: u.id, role });
    loadData();
  };

  // Real-time statistik: poll every 10s while on stats tab
  useEffect(() => {
    if (tab !== 'stats' || !authed) return;
    const poll = () => {
      adminFetch('/admin/user-stats').then(d => d && setUserStats(d)).catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => clearInterval(iv);
  }, [tab, authed]);

  // Admin chat: load tickets when tab is selected
  const loadAdminChats = useCallback(() => {
    adminFetch("/admin/chat/list").then(d => {
      if (Array.isArray(d)) setAdminChats(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'tiket' || !authed) return;
    loadAdminChats();

    const socket = io(API_BASE || window.location.origin, { query: { userId: uid() }, auth: { token: localStorage.getItem('mahi-token') || '' }, transports: ["websocket", "polling"] });
    chatSocket.current = socket;
    socket.on("chat:message", (msg) => {
      setAdminMsgs(prev => {
        if (adminSelected && msg.chat_id === adminSelected.id) return [...prev, msg];
        return prev;
      });
      loadAdminChats();
    });
    socket.on("chat:closed", ({ chatId }) => {
      if (adminSelected && adminSelected.id === chatId) {
        setAdminSelected(prev => prev ? { ...prev, status: "closed" } : null);
      }
      loadAdminChats();
    });
    return () => {
      socket.disconnect();
      chatSocket.current = null;
    };
  }, [tab, authed, adminSelected]);

  useEffect(() => {
    if (!adminSelected) { setAdminMsgs([]); return; }
    api(`/chat/${adminSelected.id}/messages?userId=${uid()}`).then(setAdminMsgs).catch(() => {});
    chatSocket.current?.emit("chat:join", adminSelected.id);
    return () => { chatSocket.current?.emit("chat:leave", adminSelected.id); };
  }, [adminSelected?.id]);

  const saveHomeConfig = async (key, val) => {
    await adminPost('/admin/home-sections', { [key]: val }).catch(() => {});
  };

  const addGenre = async () => {
    const g = newGenre.trim();
    if (!g || homeGenres.includes(g)) return;
    const next = [...homeGenres, g];
    setHomeGenres(next); setNewGenre('');
    await saveHomeConfig('genres', next);
  };
  const removeGenre = async (g) => {
    const next = homeGenres.filter(x => x !== g);
    setHomeGenres(next);
    await saveHomeConfig('genres', next);
  };
  const addTrendAnime = async (id) => {
    const next = [...homeTrendingIds, id];
    setHomeTrendingIds(next); setTrendSearch('');
    await saveHomeConfig('trendingIds', next);
  };
  const removeTrendAnime = async (id) => {
    const next = homeTrendingIds.filter(x => x !== id);
    setHomeTrendingIds(next);
    await saveHomeConfig('trendingIds', next);
  };
  const addRecAnime = async (id) => {
    const next = [...homeRecIds, id];
    setHomeRecIds(next); setRecSearch('');
    await saveHomeConfig('recommendationIds', next);
  };
  const removeRecAnime = async (id) => {
    const next = homeRecIds.filter(x => x !== id);
    setHomeRecIds(next);
    await saveHomeConfig('recommendationIds', next);
  };

  const handlePoster = async (e) => {
    const f = e.target.files[0];
    if (f) {
      try {
        const compressed = await compressPosterImage(f);
        if (selectedAnime === 'new') setForm(p => ({ ...p, poster: compressed }));
        else setSelectedAnime(p => ({ ...p, poster: compressed }));
      } catch {
        toast('Gagal memproses gambar poster HD', 'error');
      }
    }
  };

  const [animeGDrive, setAnimeGDrive] = useState('');

  const loadData = async () => {
    const s = await adminFetch("/admin/stats").catch(() => null);
    setStats(s);
    const us = await adminFetch("/admin/user-stats").catch(() => null);
    setUserStats(us);
    const a = await adminFetch("/anime?limit=100").catch(() => ({}));
    setAnimeList(a.animeList || []);
    const r = await adminFetch("/requests").catch(() => []);
    setRequests(r || []);
    const ann = await adminFetch("/announcements").catch(() => []);
    setAnnList(Array.isArray(ann) ? ann : []);
    setAnnouncement('');
    const sch = await adminFetch("/schedule").catch(() => []);
    setSchedule(Array.isArray(sch) ? sch : []);
    const kus = await adminFetch("/khusus").catch(() => []);
    setKhususList(Array.isArray(kus) ? kus : []);
    const hs = await adminFetch("/settings/home-sections").catch(() => null);
    if (hs) {
      setHomeSections(hs);
      if (hs.genres) setHomeGenres(hs.genres);
      if (hs.trendingIds) setHomeTrendingIds(hs.trendingIds);
      if (hs.recommendationIds) setHomeRecIds(hs.recommendationIds);
      if (hs.heroIds) setHomeHeroIds(hs.heroIds);
    }
  };

  const addHeroAnime = async (id) => {
    const next = [...homeHeroIds, id];
    setHomeHeroIds(next); setHeroSearch('');
    await saveHomeConfig('heroIds', next);
  };
  const removeHeroAnime = async (id) => {
    const next = homeHeroIds.filter(x => x !== id);
    setHomeHeroIds(next);
    await saveHomeConfig('heroIds', next);
  };

  const login = () => {
    if (pw === ADMIN_KEY) { setAuthed(true); loadData(); return; }
  };

  useEffect(() => { if (authed) loadData(); }, []);

  if (!authed) {
    const currentRole = (() => {
      try { return JSON.parse(localStorage.getItem('mahi-user') || '{}').role || null; } catch { return null; }
    })();
    if (currentRole && currentRole !== 'dev') {
      return null;
    }
    return (
      <Shell nav={false}>
        <div className="flex min-h-[80vh] items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-accent/20">
              <LockIcon size={36} className="text-accent" />
            </div>
            <h1 className="mb-1 text-xl font-extrabold tracking-tight text-ink">Panel Developer</h1>
            <p className="mb-6 text-sm text-muted">Masukkan admin key untuk mengakses</p>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder="Admin Key" autoFocus autoComplete="off"
              className={inputCls + " mb-3"} />
            <Btn onClick={login} className="w-full justify-center">
              <LockOpenIcon size={16} /> Buka Panel
            </Btn>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader title="Panel Dev" subtitle="Kelola konten MahiStream" />

      <div className="mb-6 flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition",
              tab === key ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink")}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* STATS */}
      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            <StatCard label="User Terdaftar" value={userStats?.totalRegisteredUsers ?? userStats?.totalUsers ?? userStats?.users?.length ?? 0} />
            <StatCard label="User Online" value={userStats?.users?.filter(u => u.online).length ?? 0} />
            <StatCard label="Total Anime" value={stats?.animeCount ?? 0} />
            <StatCard label="Total Episode" value={stats?.episodeCount ?? 0} />
            <StatCard label="Request" value={stats?.requestCount ?? 0} />
            <StatCard label="Konten Khusus" value={stats?.khususCount ?? 0} />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink">Pengguna Terdaftar ({userStats?.totalRegisteredUsers ?? userStats?.users?.length ?? 0})</h3>
            <span className="text-xs text-muted font-medium">Aktif Real-time</span>
          </div>

          {userStats ? (
            <div className="space-y-3">
              {userStats.users?.map(u => (
                <div key={u.id} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-line bg-elevated">
                        {u.picture ? (
                          <img
                            src={u.picture}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className="flex h-full items-center justify-center text-sm font-bold text-accent"
                          style={{ display: u.picture ? 'none' : 'flex' }}
                        >
                          {u.display_name?.[0] || u.username?.[0] || 'U'}
                        </div>
                        <span className={cx("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface", u.online ? "bg-green-500" : "bg-muted2")} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-ink">{u.display_name || u.username}</p>
                          <span className={cx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", u.online ? "bg-green-500/15 text-green-400" : "bg-muted2/15 text-muted2")}>
                            {u.online ? "Online" : "Offline"}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted">{u.email || u.username}</p>
                      </div>
                    </div>
                    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      u.role === 'dev' ? "bg-accent/20 text-accent" :
                      u.role === 'admin' ? "bg-amber-500/15 text-amber-300" :
                      "bg-elevated text-muted")}>{u.role || 'user'}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-line/50 bg-elevated/50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <span className="block text-[10px] font-semibold text-muted2">SEDANG NONTON</span>
                      <span className={cx("font-bold", u.watching && u.watching !== 'Tidak sedang menonton' ? "text-accent" : "text-muted")}>{u.watching || 'Tidak sedang menonton'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold text-muted2">TOTAL WAKTU TONTON</span>
                      <span className="font-bold text-ink">{u.total_hours || (u.total_minutes ? (u.total_minutes/60).toFixed(1) : 0)} Jam ({u.total_minutes || 0} menit)</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold text-muted2">ANIME DITONTON / SELESAI</span>
                      <span className="font-bold text-ink">{u.total_anime || 0} Anime ({u.finished_count || u.finished?.length || 0} Selesai)</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold text-muted2">PERANGKAT & LOKASI</span>
                      <span className="font-medium text-muted">{u.last_device || 'Web'} · <Loc ip={u.last_ip} resolve={resolveLoc} /></span>
                    </div>
                  </div>

                  {u.finished?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[10px] font-bold text-muted2">Selesai Nonton:</span>
                      {u.finished.map(f => (
                        <span key={f} className="rounded-md border border-line bg-elevated px-2 py-0.5 text-[11px] text-muted">{f}</span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    {u.role !== 'admin' && (
                      <button onClick={() => setRole(u, 'admin')}
                        className="rounded-lg bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/25 transition">Jadikan Admin</button>
                    )}
                    {u.role !== 'user' && (
                      <button onClick={() => setRole(u, 'user')}
                        className="rounded-lg bg-elevated px-3 py-1 text-xs font-bold text-muted hover:bg-line transition">Jadikan User Biasa</button>
                    )}
                  </div>
                </div>
              ))}
              {userStats.users?.length === 0 && <p className="py-4 text-center text-sm text-muted">Belum ada pengguna terdaftar</p>}
            </div>
          ) : (
            <div className="flex justify-center py-6"><Spinner /></div>
          )}
        </div>
      )}

      {/* ANIME */}
      {tab === 'anime' && !selectedAnime && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Daftar Anime</h2>
            <button onClick={() => setSelectedAnime('new')}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white">
              <PlusIcon size={14} /> Tambah
            </button>
          </div>
          <div className="mb-3">
            <div className="relative">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={searchAnime} onChange={e => setSearchAnime(e.target.value)}
                placeholder="Cari anime..." className={inputCls + " w-full pl-8"} />
            </div>
          </div>
          <div className="space-y-2">
            {animeList.filter(a => !searchAnime || a.title?.toLowerCase().includes(searchAnime.toLowerCase())).map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-elevated p-3">
                {a.poster ? <img src={a.poster} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover" />
                  : <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs text-muted">—</div>}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-ink">{a.title}</h3>
                  <p className="text-xs text-muted">{a.episode_count || 0} episode</p>
                </div>
                <button onClick={() => { setSelectedAnime(a); adminFetch(`/anime/${a.id}`).then(d => { setSelectedAnime(d); setEpisodes(d.episodeList || []); }); }}
                  className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-bold text-accent">Edit</button>
                <button onClick={async () => { if (await confirm({ message: "Hapus anime ini?", tone: "danger" })) { await adminDel(`/admin/anime/${a.id}`); loadData(); } }}
                  className="text-red"><TrashIcon size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'anime' && selectedAnime && (
        <div>
          <button onClick={() => { setSelectedAnime(null); setEpisodeOnly(false); }} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-ink">
            ← Kembali
          </button>
          {selectedAnime !== 'new' && episodeOnly && (
            <EpisodeManager selectedAnime={selectedAnime} episodes={episodes} setEpisodes={setEpisodes} loadData={loadData} adminFetch={adminFetch} adminPost={adminPost} adminDel={adminDel} confirm={confirm} episodeForm={episodeForm} setEpisodeForm={setEpisodeForm} />
          )}
          {!episodeOnly && (
          <>
          <h2 className="mb-4 text-lg font-bold text-ink">
            {selectedAnime === 'new' ? 'Tambah Anime Baru' : selectedAnime.title}
          </h2>

          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            {[
              { key: 'title', label: 'Judul' },
              { key: 'title_jp', label: 'Judul Jepang' },
              { key: 'alt_titles', label: 'Judul Alternatif (pisah baris)', textarea: true },
              { key: 'synopsis', label: 'Sinopsis', textarea: true },
              { key: 'genre', label: 'Genre (pisah koma)' },
            ].map(({ key, label, textarea }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>
                {textarea ? (
                  <textarea value={(selectedAnime === 'new' ? form : selectedAnime)[key] || ''}
                    onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, [key]: e.target.value }) : setSelectedAnime({ ...selectedAnime, [key]: e.target.value })}
                    className={inputCls} rows={3} />
                ) : (
                  <input type="text" value={(selectedAnime === 'new' ? form : selectedAnime)[key] || ''}
                    onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, [key]: e.target.value }) : setSelectedAnime({ ...selectedAnime, [key]: e.target.value })}
                    className={inputCls} />
                )}
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Poster</label>
              <div className="flex gap-2">
                <input type="text" value={(selectedAnime === 'new' ? form : selectedAnime).poster || ''}
                  onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, poster: e.target.value }) : setSelectedAnime({ ...selectedAnime, poster: e.target.value })}
                  placeholder="URL Poster (atau upload)" className={inputCls + " flex-1"} />
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line bg-elevated px-3 py-2 text-xs text-muted hover:border-accent/50 whitespace-nowrap">
                  Upload
                  <input type="file" accept="image/*" onChange={handlePoster} className="hidden" />
                </label>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Rating</label>
                <input type="number" value={(selectedAnime === 'new' ? form : selectedAnime).rating || ''}
                  onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, rating: parseFloat(e.target.value) || 0 }) : setSelectedAnime({ ...selectedAnime, rating: parseFloat(e.target.value) || 0 })}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Tayang Dari</label>
                <input type="date" value={(selectedAnime === 'new' ? form : selectedAnime).aired_from || ''}
                  onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, aired_from: e.target.value }) : setSelectedAnime({ ...selectedAnime, aired_from: e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Tayang Sampai (opsional)</label>
                <input type="date" value={(selectedAnime === 'new' ? form : selectedAnime).aired_to || ''}
                  onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, aired_to: e.target.value }) : setSelectedAnime({ ...selectedAnime, aired_to: e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Tipe</label>
                <input type="text" value={(selectedAnime === 'new' ? form : selectedAnime).type || 'TV'}
                  onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, type: e.target.value }) : setSelectedAnime({ ...selectedAnime, type: e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Status</label>
                <select value={(selectedAnime === 'new' ? form : selectedAnime).status || 'ongoing'}
                  onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, status: e.target.value }) : setSelectedAnime({ ...selectedAnime, status: e.target.value })}
                  className={inputCls}>
                  <option value="ongoing">Ongoing</option>
                  <option value="complete">Complete</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              {['featured', 'trending'].map(f => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(selectedAnime === 'new' ? form : selectedAnime)[f] || false}
                    onChange={(e) => selectedAnime === 'new' ? setForm({ ...form, [f]: e.target.checked }) : setSelectedAnime({ ...selectedAnime, [f]: e.target.checked })} />
                  <span className="text-xs font-semibold text-ink">{f === 'featured' ? 'Featured' : 'Trending'}</span>
                </label>
              ))}
            </div>
            {selectedAnime === 'new' ? (
              <Btn onClick={async () => {
                try {
                  const payload = { ...form, alt_titles: form.alt_titles ? form.alt_titles.split('\n').map(s => s.trim()).filter(Boolean) : [] };
                  await adminPost("/admin/anime", payload);
                  setSaveMsg('Berhasil disimpan');
                  setForm({ title: '', title_jp: '', alt_titles: '', poster: '', synopsis: '', genre: '', rating: 0, aired_from: '', aired_to: '', type: 'TV', status: 'ongoing', featured: false, trending: false });
                  loadData(); setSelectedAnime(null);
                } catch (e) { setSaveMsg('Gagal: ' + (e.message || 'cek koneksi')); }
              }}
                className="w-full justify-center">Simpan</Btn>
            ) : (
              <Btn onClick={async () => {
                try {
                  const a = selectedAnime;
                  const payload = { ...a, alt_titles: typeof a.alt_titles === 'string' ? a.alt_titles.split('\n').map(s => s.trim()).filter(Boolean) : (a.alt_titles || []) };
                  await adminPost("/admin/anime", payload);
                  setSaveMsg('Berhasil diperbarui');
                  loadData();
                } catch (e) { setSaveMsg('Gagal: ' + (e.message || 'cek koneksi')); }
              }}
                className="w-full justify-center">Simpan Perubahan</Btn>
            )}
            {saveMsg && <p className={`mt-2 text-center text-xs font-semibold ${saveMsg.startsWith('Berhasil') ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</p>}
          </div>

          {selectedAnime !== 'new' && !episodeOnly && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-bold text-ink">Episode</h3>
              <EpisodeManager selectedAnime={selectedAnime} episodes={episodes} setEpisodes={setEpisodes} loadData={loadData} adminFetch={adminFetch} adminPost={adminPost} adminDel={adminDel} confirm={confirm} episodeForm={episodeForm} setEpisodeForm={setEpisodeForm} />
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* EPS */}
      {tab === 'eps' && (
        <div>
          {selectedAnime && episodeOnly ? (
            <div>
              <button onClick={() => { setSelectedAnime(null); setEpisodeOnly(false); }} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-ink">
                ← Pilih Anime Lain
              </button>
              <EpisodeManager selectedAnime={selectedAnime} episodes={episodes} setEpisodes={setEpisodes} loadData={loadData} adminFetch={adminFetch} adminPost={adminPost} adminDel={adminDel} confirm={confirm} episodeForm={episodeForm} setEpisodeForm={setEpisodeForm} />
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink">Pilih Anime</h2>
              </div>
              <div className="space-y-2">
                {animeList.map(a => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-elevated p-3">
                    {a.poster ? <img src={a.poster} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover" />
                      : <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs text-muted">—</div>}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-ink">{a.title}</h3>
                      <p className="text-xs text-muted">{a.episode_count || 0} episode</p>
                    </div>
                    <button onClick={() => { setEpisodeOnly(true); adminFetch(`/anime/${a.id}`).then(d => { setSelectedAnime(d); setEpisodes(d.episodeList || []); }); }}
                      className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-bold text-accent">Kelola</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* REQUESTS */}
      {tab === 'requests' && (
        <div>
          <h2 className="mb-4 text-lg font-bold text-ink">Daftar Request</h2>
          <div className="mb-3">
            <div className="relative">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={searchReq} onChange={e => setSearchReq(e.target.value)}
                placeholder="Cari request..." className={inputCls + " w-full pl-8"} />
            </div>
          </div>
          {requests.length === 0 ? (
            <EmptyState title="Belum ada request" />
          ) : (
            <div className="space-y-3">
              {requests.filter(r => !searchReq || r.title?.toLowerCase().includes(searchReq.toLowerCase()) || r.notes?.toLowerCase().includes(searchReq.toLowerCase())).map(r => (
                <div key={r.id} className="rounded-xl border border-line bg-elevated p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{r.title}</h3>
                    <span className={cx("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      r.status === 'done' ? "bg-emerald-500/15 text-emerald-300" :
                      r.status === 'process' ? "bg-amber-500/15 text-amber-300" :
                      "bg-elevated text-muted")}>{r.status || 'pending'}</span>
                  </div>
                  {r.notes && <p className="mb-2 text-xs text-muted">{r.notes}</p>}
                  <p className="mb-1 text-[11px] text-muted/60">Dari: {r.user_name || r.user_id || 'Pengguna'}{r.user_email ? ` (${r.user_email})` : ''} · {new Date(r.created_at).toLocaleDateString('id-ID')}</p>
                  <div className="flex items-center gap-2">
                    {r.status !== 'done' && (
                      <>
                        {r.status !== 'process' && (
                          <button disabled={savingReq === r.id}
                            onClick={async () => { setSavingReq(r.id); await adminPost(`/admin/requests/${r.id}`, { status: 'process' }); await loadData(); setSavingReq(null); }}
                            className="rounded-lg bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 transition disabled:opacity-50">Proses</button>
                        )}
                        <button disabled={savingReq === r.id}
                          onClick={async () => { setSavingReq(r.id); await adminPost(`/admin/requests/${r.id}`, { status: 'done' }); await loadData(); setSavingReq(null); }}
                          className="rounded-lg bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25 transition disabled:opacity-50">Selesai</button>
                      </>
                    )}
                    {r.status === 'done' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                        Selesai ✓
                      </span>
                    )}
                    {savingReq === r.id && <span className="self-center text-[11px] text-muted">menyimpan...</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ANNOUNCEMENT */}
      {tab === 'announcement' && (
        <div>
          <h2 className="mb-4 text-lg font-bold text-ink">Pengumuman</h2>
          <div className="mb-5 rounded-2xl border border-line/60 bg-elevated/80 p-4">
            <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
              className={inputCls + " mb-3"} rows={3} placeholder="Tulis pengumuman..." />
            <div className="flex gap-2">
              <button onClick={async () => {
                if (!announcement.trim()) return;
                if (annEditId) {
                  await adminPost(`/admin/announcements/${annEditId}`, { content: announcement.trim() }, 'PUT').catch(() => {});
                } else {
                  await adminPost("/admin/announcements", { content: announcement.trim() });
                }
                setAnnouncement(''); setAnnEditId(null); loadData();
              }} className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-bold text-white">
                <BellIcon size={14} /> {annEditId ? 'Update' : 'Kirim'}
              </button>
              {annEditId && (
                <button onClick={() => { setAnnouncement(''); setAnnEditId(null); }}
                  className="flex items-center gap-1.5 rounded-full border border-line/50 bg-elevated px-4 py-2 text-xs font-bold text-muted">
                  <XIcon size={14} /> Batal
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            {(Array.isArray(annList) ? annList : []).map(a => (
              <div key={a.id} className={`rounded-xl border p-3 text-sm ${a.active ? 'border-line/50 bg-elevated/60 text-muted' : 'border-line/20 bg-elevated/30 text-muted2 line-through'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1">{a.content}</span>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={async () => {
                      await adminPost(`/admin/announcements/${a.id}`, { active: !a.active }, 'PUT').catch(() => {});
                      loadData();
                    }} className="rounded p-1 text-muted2 hover:text-accent">
                      {a.active ? <WrenchIcon size={13} /> : <XIcon size={13} />}
                    </button>
                    <button onClick={() => { setAnnouncement(a.content); setAnnEditId(a.id); }}
                      className="rounded p-1 text-muted2 hover:text-accent">
                      <WrenchIcon size={13} />
                    </button>
                    <button onClick={async () => {
                      if (!await confirm({ message: "Hapus pengumuman?", tone: "danger" })) return;
                      await adminDel(`/admin/announcements/${a.id}`).catch(() => {});
                      loadData();
                    }} className="rounded p-1 text-muted2 hover:text-red">
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {annList.length === 0 && <p className="py-4 text-center text-sm text-muted">Belum ada pengumuman</p>}
          </div>
        </div>
      )}

      {/* SCHEDULE */}
      {tab === 'schedule' && (
        <div>
          <h2 className="mb-4 text-lg font-bold text-ink">Tambah Jadwal</h2>
          <div className="mb-6 space-y-2 rounded-2xl border border-line bg-surface p-5">
            <div className="grid grid-cols-2 gap-2">
              <select value={scheduleForm.day_of_week} onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}
                className={inputCls}>
                {['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select value={scheduleForm.anime_id} onChange={(e) => {
                const id = e.target.value;
                const a = animeList.find(x => x.id === id);
                setScheduleForm({ ...scheduleForm, anime_id: id, title: a ? a.title : scheduleForm.title });
              }} className={inputCls}>
                <option value="">Pilih Anime</option>
                {animeList.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                placeholder="Judul" className={inputCls} />
              <input type="text" value={scheduleForm.time} onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                placeholder="Waktu (opsional)" className={inputCls} />
            </div>
            <Btn onClick={async () => {
              if (!scheduleForm.title) return;
              await adminPost("/admin/schedule", scheduleForm);
              setScheduleForm({ day_of_week: 'Senin', title: '', time: '', anime_id: '' });
              loadData();
            }} className="w-full justify-center"><PlusIcon size={14} /> Tambah Jadwal</Btn>
          </div>

          <h3 className="mb-3 text-lg font-bold text-ink">Daftar Jadwal</h3>
          <div className="space-y-3">
            {['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(day => {
              const items = schedule.filter(s => s.day_of_week === day);
              if (items.length === 0) return null;
              return (
                <div key={day} className="rounded-xl border border-line bg-elevated p-3">
                  <p className="mb-2 text-xs font-bold uppercase text-accent">{day}</p>
                  <div className="space-y-2">
                    {items.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        {s.poster && <img src={s.poster} alt="" className="h-9 w-6 shrink-0 rounded object-cover" />}
                        <span className="flex-1 text-ink">{s.title}{s.time && <span className="ml-2 text-xs text-muted">{s.time}</span>}</span>
                        <button onClick={async () => { await adminDel(`/admin/schedule/${s.id}`); loadData(); }} className="text-red"><TrashIcon size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KHUSUS */}
      {tab === 'khusus' && (
        <div>
          <h2 className="mb-4 text-lg font-bold text-ink">Konten Khusus</h2>
          <div className="mb-6 rounded-2xl border border-line/60 bg-elevated/80 p-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <input type="text" value={khususForm.title} onChange={(e) => setKhususForm({ ...khususForm, title: e.target.value })}
                placeholder="Judul *" className="input sm:col-span-2" />
              <textarea value={khususForm.description} onChange={(e) => setKhususForm({ ...khususForm, description: e.target.value })}
                placeholder="Deskripsi" className="input sm:col-span-2" rows={3} />
              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-semibold text-muted">Link GDrive & Episode</label>
                <GDriveLinksEditor key={khususFormKey} value={khususForm.gdrive_links} onChange={(v) => setKhususForm({ ...khususForm, gdrive_links: v })} />
              </div>
              <div className="sm:col-span-2">
                <input type="text" value={khususForm.poster} onChange={(e) => setKhususForm({ ...khususForm, poster: e.target.value })}
                  placeholder="URL Poster" className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line/50 bg-elevated px-4 py-3 text-xs text-muted hover:border-accent/50">
                  <FilmIcon size={14} /> {khususForm.poster ? 'Poster terpilih ✓' : 'Upload Poster (opsional)'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async (e) => { const f = e.target.files[0]; if (f) { try { const compressed = await compressPosterImage(f); setKhususForm(p => ({ ...p, poster: compressed })); } catch {} } }} />
                </label>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={async () => {
                if (!khususForm.title) return;
                const body = { ...khususForm };
                if (body.gdrive_links && body.gdrive_links.trim()) {
                  body.gdrive_links = pipeToJson(body.gdrive_links);
                }
                await adminPost("/admin/khusus", body);
                setKhususForm({ id: '', title: '', poster: '', gdrive_links: '', description: '' });
                setKhususFormKey(k => k + 1);
                loadData();
              }} className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-bold text-white">{khususForm.id ? 'Update' : 'Simpan'}</button>
              {khususForm.id && (
                <button onClick={() => { setKhususForm({ id: '', title: '', poster: '', gdrive_links: '', description: '' }); setKhususFormKey(k => k + 1); }}
                  className="flex items-center gap-1.5 rounded-full border border-line/50 bg-elevated px-4 py-2 text-xs font-bold text-muted">Batal</button>
              )}
            </div>
          </div>

          <h3 className="mb-3 text-lg font-bold text-ink">Daftar Konten</h3>
          <div className="space-y-2">
            {khususList.map(k => (
              <div key={k.id} className="flex items-center gap-3 rounded-xl border border-line bg-elevated p-3">
                {k.poster ? <img src={k.poster} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover" />
                  : <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs text-muted">—</div>}
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-bold text-ink">{k.title}</h4>
                  <p className="text-xs text-muted">{k.description?.slice(0, 60)}</p>
                </div>
                <button onClick={() => { setKhususForm({ id: k.id, title: k.title, poster: k.poster, gdrive_links: jsonToPipe(k.gdrive_links), description: k.description || '' }); setKhususFormKey(x => x + 1); }}
                   className="text-sm text-accent"><WrenchIcon size={14} /></button>
                <button onClick={async () => { if (await confirm({ message: "Hapus konten?", tone: "danger" })) { await adminDel(`/admin/khusus/${k.id}`); loadData(); } }}
                  className="text-red"><TrashIcon size={14} /></button>
              </div>
            ))}
            {khususList.length === 0 && <p className="py-4 text-center text-sm text-muted">Belum ada konten khusus</p>}
          </div>
        </div>
      )}

      {/* BERANDA */}
      {tab === 'home' && (
        <div>
          <h2 className="mb-2 text-lg font-bold text-ink">Pengaturan Beranda</h2>
          <p className="mb-4 text-xs text-muted">Toggle section + atur konten yang tampil.</p>

          {/* Section toggles */}
          <div className="mb-5 space-y-2 rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-2 text-sm font-bold text-ink">Section Aktif</h3>
            {[
              { key: 'recommendations', label: 'Rekomendasi' },
              { key: 'genres', label: 'Genre Populer' },
              { key: 'schedule', label: 'Jadwal Rilis' },
              { key: 'trending', label: 'Trending' },
              { key: 'latest', label: 'Anime Terbaru' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between rounded-xl border border-line/60 bg-elevated/60 px-4 py-3">
                <span className="text-sm font-semibold text-ink">{label}</span>
                <button role="switch" aria-checked={!!homeSections[key]}
                  onClick={async () => {
                    const nextVal = !homeSections[key];
                    setHomeSections(p => ({ ...p, [key]: nextVal }));
                    await saveHomeConfig(key, nextVal);
                  }}
                  className={`relative h-6 w-11 rounded-full transition ${homeSections[key] ? 'bg-accent' : 'bg-line'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${homeSections[key] ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </label>
            ))}
          </div>

          {/* Hero Section */}
          <div className="mb-5 rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Hero Section (Banner)</h3>
            <p className="mb-3 text-xs text-muted">Pilih anime untuk ditampilkan di banner hero (kosongkan = otomatis featured).</p>
            <div className="mb-3 flex gap-2">
              <select value={heroSearch} onChange={e => { setHeroSearch(e.target.value); if (e.target.value) addHeroAnime(e.target.value); }}
                className={inputCls + " flex-1"}>
                <option value="">+ Tambah anime...</option>
                {animeList.filter(a => !homeHeroIds.includes(a.id)).map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              {(Array.isArray(homeHeroIds) ? homeHeroIds : []).map(id => {
                const a = animeList.find(x => x.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg border border-line/60 bg-elevated/60 px-3 py-2">
                    <span className="flex-1 text-sm text-ink">{a?.title || id}</span>
                    <button onClick={() => removeHeroAnime(id)} className="text-muted2 hover:text-red"><TrashIcon size={13} /></button>
                  </div>
                );
              })}
              {homeHeroIds.length === 0 && <p className="text-xs text-muted">Menggunakan anime featured otomatis</p>}
            </div>
          </div>

          {/* Genre Populer editor */}
          <div className="mb-5 rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Genre Populer</h3>
            <div className="mb-3 flex gap-2">
              <input type="text" value={newGenre} onChange={e => setNewGenre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGenre()}
                placeholder="Nama genre..." className={inputCls + " flex-1"} />
              <Btn onClick={addGenre} className="shrink-0"><PlusIcon size={14} /> Tambah</Btn>
            </div>
            <div className="flex flex-wrap gap-1.5">
               {(Array.isArray(homeGenres) ? homeGenres : []).map(g => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full border border-line bg-elevated px-3 py-1 text-xs font-medium text-ink">
                  {g}
                  <button onClick={() => removeGenre(g)} className="ml-1 text-muted2 hover:text-red">
                    <XIcon size={11} />
                  </button>
                </span>
              ))}
              {homeGenres.length === 0 && <p className="text-xs text-muted">Belum ada genre ditambahkan</p>}
            </div>
          </div>

          {/* Pinned anime: Trending */}
          <div className="mb-5 rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Anime Trending</h3>
            <p className="mb-3 text-xs text-muted">Pilih anime spesifik untuk trending (kosongkan = otomatis by rating).</p>
            <div className="mb-3 flex gap-2">
              <select value={trendSearch} onChange={e => { setTrendSearch(e.target.value); if (e.target.value) addTrendAnime(e.target.value); }}
                className={inputCls + " flex-1"}>
                <option value="">+ Tambah anime...</option>
                {animeList.filter(a => !homeTrendingIds.includes(a.id)).map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              {(Array.isArray(homeTrendingIds) ? homeTrendingIds : []).map(id => {
                const a = animeList.find(x => x.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg border border-line/60 bg-elevated/60 px-3 py-2">
                    <span className="flex-1 text-sm text-ink">{a?.title || id}</span>
                    <button onClick={() => removeTrendAnime(id)} className="text-muted2 hover:text-red"><TrashIcon size={13} /></button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pinned anime: Recommendations */}
          <div className="mb-5 rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">Rekomendasi Pinned</h3>
            <p className="mb-3 text-xs text-muted">Rekomendasi spesifik (kosongkan = API otomatis).</p>
            <div className="mb-3 flex gap-2">
              <select value={recSearch} onChange={e => { setRecSearch(e.target.value); if (e.target.value) addRecAnime(e.target.value); }}
                className={inputCls + " flex-1"}>
                <option value="">+ Tambah anime...</option>
                {animeList.filter(a => !homeRecIds.includes(a.id)).map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              {(Array.isArray(homeRecIds) ? homeRecIds : []).map(id => {
                const a = animeList.find(x => x.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg border border-line/60 bg-elevated/60 px-3 py-2">
                    <span className="flex-1 text-sm text-ink">{a?.title || id}</span>
                    <button onClick={() => removeRecAnime(id)} className="text-muted2 hover:text-red"><TrashIcon size={13} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MAINTENANCE */}
      {tab === 'maintenance' && (
        <div className="space-y-4">
          <h2 className="mb-2 text-lg font-bold text-ink">Mode Maintenance</h2>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-ink">Status Maintenance</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${maintenance ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                  {maintenance ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <button
                onClick={async () => {
                  try {
                    const d = await adminPost('/admin/maintenance', { maintenance: !maintenance });
                    setMaintenance(d.maintenance);
                  } catch {}
                }}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/80"
              >
                {maintenance ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Saat aktif, semua user (kecuali admin/dev) akan melihat halaman maintenance.
            </p>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {tab === 'notifications' && (
        <NotificationManager adminPost={adminPost} adminFetch={adminFetch} toast={toast} confirm={confirm} />
      )}

      {/* REPORTS */}
      {tab === 'reports' && (
        <ReportManagerDev adminFetch={adminFetch} toast={toast} />
      )}

      {/* TIKET */}
      {tab === 'tiket' && (
        <TicketManagerDev adminFetch={adminFetch} adminPost={adminPost} toast={toast} />
      )}

      {/* COMMUNITY */}
      {tab === 'community' && <CommunitySection adminFetch={adminFetch} adminPost={adminPost} toast={toast} />}
    </Shell>
  );
}

function NotificationManager({ adminPost, adminFetch, toast, confirm }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [target, setTarget] = useState('all');
  const [list, setList] = useState([]);
  const [sending, setSending] = useState(false);

  const load = () => adminFetch('/notifications').then(d => setList(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!title.trim() && !body.trim()) { toast('Isi judul atau pesan', 'error'); return; }
    setSending(true);
    try {
      await adminPost('/admin/notify', { title: title.trim(), body: body.trim(), type, target });
      toast('Notifikasi dikirim', 'success');
      setTitle(''); setBody('');
      load();
    } catch (e) {
      toast('Gagal kirim notifikasi', 'error');
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (!await confirm({ message: 'Hapus notifikasi ini?', tone: 'danger' })) return;
    try { await adminDel(`/admin/notifications/${id}`); load(); toast('Dihapus', 'success'); } catch {}
  };

  return (
    <div className="space-y-4">
      <h2 className="mb-2 text-lg font-bold text-ink">Kirim Notifikasi</h2>

      {/* Compose form */}
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Judul</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul notifikasi" className={inputCls + ' w-full'} maxLength={100} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Pesan</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Isi pesan..." rows={3} className={inputCls + ' w-full resize-none'} maxLength={500} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Tipe</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls + ' w-full'}>
              <option value="info">Info</option>
              <option value="success">Sukses</option>
              <option value="warning">Peringatan</option>
              <option value="error">Error</option>
              <option value="announcement">Pengumuman</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Target</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls + ' w-full'}>
              <option value="all">Semua User</option>
              <option value="online">Online Sekarang</option>
              <option value="admins">Admin/Dev</option>
            </select>
          </div>
        </div>
        <button onClick={send} disabled={sending}
          className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent/80 disabled:opacity-60">
          {sending ? 'Mengirim...' : 'Kirim Notifikasi'}
        </button>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="mb-3 text-sm font-bold text-ink">Riwayat Notifikasi ({list.length})</h3>
        {list.length === 0 ? (
          <p className="text-center text-xs text-muted py-4">Belum ada notifikasi terkirim</p>
        ) : (
          <div className="space-y-2">
            {list.slice(0, 20).map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-xl border border-line/60 bg-elevated/40 p-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  n.type === 'error' ? 'bg-red-500/20 text-red-500' :
                  n.type === 'warning' ? 'bg-amber-500/20 text-amber-500' :
                  n.type === 'success' ? 'bg-green-500/20 text-green-500' :
                  n.type === 'announcement' ? 'bg-accent/20 text-accent' :
                  'bg-blue-500/20 text-blue-500'
                }`}>!</span>
                <div className="min-w-0 flex-1">
                  {n.title && <p className="text-sm font-semibold text-ink">{n.title}</p>}
                  {n.body && <p className="text-xs text-muted line-clamp-2">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-muted2">
                    {n.target || 'all'} · {new Date(n.created_at || n.timestamp || Date.now()).toLocaleString('id-ID')}
                  </p>
                </div>
                <button onClick={() => remove(n.id)} className="text-muted2 hover:text-red transition">
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Report Manager (DevPanel) ────────────────────────────────────
function ReportManagerDev({ adminFetch, toast }) {
  const [reports, setReports] = useState([]);
  const load = () => adminFetch('/admin/reports').then(d => setReports(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try { await adminPost(`/admin/reports/${id}`, { status }); load(); toast("Status diperbarui", "success"); }
    catch { toast("Gagal", "error"); }
  };

  return (
    <div className="space-y-1.5">
      <p className="mb-3 text-xs text-muted">Laporan bug & masalah dari user</p>
      {reports.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Belum ada laporan</p>
      ) : reports.map(r => (
        <div key={r.id} className="rounded-xl border border-line/50 bg-elevated/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-ink">{r.title}</h4>
              {r.description && <p className="mt-0.5 text-xs text-muted2">{r.description}</p>}
              {r.anime_id && <p className="mt-0.5 text-[10px] text-muted2">Anime: {r.anime_id} {r.episode ? `Ep ${r.episode}` : ''}</p>}
              {r.created_at && <p className="mt-1 text-[10px] text-muted2">{new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${r.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : r.status === 'resolved' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {r.status === 'pending' ? 'Menunggu' : r.status === 'resolved' ? 'Selesai' : r.status}
            </span>
          </div>
          {r.status === 'pending' && (
            <div className="mt-2 flex gap-1.5">
              <button onClick={() => updateStatus(r.id, 'process')} className="rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/30">Proses</button>
              <button onClick={() => updateStatus(r.id, 'resolved')} className="rounded-full bg-green-500/20 px-3 py-1 text-[10px] font-semibold text-green-400 hover:bg-green-500/30">Selesai</button>
            </div>
          )}
          {r.status === 'process' && (
            <div className="mt-2 flex gap-1.5">
              <button onClick={() => updateStatus(r.id, 'resolved')} className="rounded-full bg-green-500/20 px-3 py-1 text-[10px] font-semibold text-green-400 hover:bg-green-500/30">Selesai</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Ticket Manager (DevPanel) ────────────────────────────────────
function TicketManagerDev({ adminFetch, adminPost, toast }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => adminFetch('/admin/chat/list').then(d => setTickets(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const openTicket = async (t) => {
    setSelected(t);
    try {
      const msgs = await adminFetch(`/chat/${t.id}/messages?userId=${t.user_id}`);
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch { setMessages([]); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selected) return;
    setSending(true);
    try {
      await adminPost(`/chat/${selected.id}/message`, { userId: selected.user_id, text: input.trim(), sender: 'admin' });
      setInput('');
      const msgs = await adminFetch(`/chat/${selected.id}/messages?userId=${selected.user_id}`);
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch { toast("Gagal kirim", "error"); }
    finally { setSending(false); }
  };

  const closeTicket = async () => {
    if (!selected) return;
    try { await adminPost(`/admin/chat/${selected.id}/close`, {}); toast("Tiket ditutup", "success"); load(); setSelected(null); setMessages([]); }
    catch { toast("Gagal", "error"); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-3 text-xs text-muted">Tiket chat dari user</p>
        {tickets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Belum ada tiket</p>
        ) : tickets.map(t => (
          <div key={t.id} onClick={() => openTicket(t)}
            className={`mb-2 cursor-pointer rounded-xl border p-3 transition ${selected?.id === t.id ? 'border-accent/50 bg-accent/5' : 'border-line/50 bg-elevated/60 hover:border-line'}`}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-bold text-ink line-clamp-1">{t.subject}</h4>
              <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">#{t.id}</span>
            </div>
            {t.lastMessage && <p className="mt-1 text-[10px] text-muted2 line-clamp-1">{t.lastMessage.text}</p>}
            <p className="mt-1 text-[10px] text-muted2">{new Date(t.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · {t.messageCount || 0} pesan</p>
          </div>
        ))}
      </div>

      {selected && (
        <div className="flex flex-col rounded-xl border border-line/50 bg-elevated/60">
          <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">{selected.subject}</p>
              <p className="text-[10px] text-muted2">Tiket #{selected.id}</p>
            </div>
            <button onClick={closeTicket} className="rounded-full bg-red-500/20 px-3 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/30">Tutup</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4 max-h-80">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">Belum ada pesan</p>
            ) : messages.map(m => (
              <div key={m.id} className={`flex ${m.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.sender === 'admin' ? 'bg-accent text-white' : 'bg-surface text-ink'}`}>
                  <p>{m.text}</p>
                  <p className="mt-0.5 text-[10px] opacity-60">{new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-line/50 p-3">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Balas pesan..." className="input flex-1" />
            <button onClick={sendMessage} disabled={sending || !input.trim()}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{sending ? '...' : 'Kirim'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunitySection({ adminFetch, adminPost, toast }) {
  const [settings, setSettings] = useState({ telegram_label: '', telegram_link: '', wa_label: '', wa_link: '', discord_label: '', discord_link: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch('/settings/community').then(d => { if (d) setSettings(d); }).catch(() => {});
  }, []);

  const fields = [
    { key: 'telegram_label', label: 'Label Telegram' },
    { key: 'telegram_link', label: 'Link Telegram' },
    { key: 'wa_label', label: 'Label WhatsApp' },
    { key: 'wa_link', label: 'Link WhatsApp' },
    { key: 'discord_label', label: 'Label Discord' },
    { key: 'discord_link', label: 'Link Discord' },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-ink">Popup Komunitas</h2>
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>
            <input type="text" value={settings[key] || ''}
              onChange={e => setSettings({ ...settings, [key]: e.target.value })}
              className={inputCls + ' w-full'} placeholder={key.includes('_link') ? 'https://...' : label} />
          </div>
        ))}
        <button onClick={async () => {
          setSaving(true);
          try { await adminPost('/admin/community', settings); toast('Pengaturan komunitas disimpan', 'success'); }
          catch { toast('Gagal menyimpan', 'error'); }
          setSaving(false);
        }} disabled={saving}
          className="flex w-full items-center justify-center rounded-xl bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent/80 disabled:opacity-60">
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>
    </div>
  );
}
