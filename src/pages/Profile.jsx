import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { api, uid, fmtDate } from '../lib/client';
import { getProfile, setProfile } from '../lib/prefs';
import { AnimeCard, EmptyState, Spinner, cx, Poster } from '../components/ui/index';
import Shell from '../components/Shell';
import { useToast } from '../components/Toast';
import {
  BarChartIcon, BookmarkIcon, ClockIcon, FilmIcon, HeartIcon,
  LogOutIcon, PlayIcon, StarIcon, SettingsIcon, EditIcon, XIcon,
  TrophyIcon, FlameIcon, MessageIcon, DownloadIcon,
} from '../components/icons';

const BADGE_ICONS = {
  play: PlayIcon, film: FilmIcon, fire: FlameIcon, trophy: TrophyIcon,
  bookmark: BookmarkIcon, clock: ClockIcon, star: StarIcon, chat: MessageIcon, heart: HeartIcon,
};

function fmtMin(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} jam ${m % 60} mnt`;
}

export default function Profile() {
  const { toast } = useToast();
  const [tab, setTab] = useState("history");
  const [hist, setHist] = useState([]);
  const [bm, setBm] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Penonton");
  const [loggedIn, setLoggedIn] = useState(() => Boolean(typeof localStorage !== "undefined" && localStorage.getItem("mahi-user")));
  const [profileData, setProfileData] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api(`/history?userId=${uid()}`).catch(() => []),
      api(`/bookmarks/${uid()}`).catch(() => []),
    ]).then(([h, b]) => {
      const raw = Array.isArray(h) ? h : [];
      const seen = {};
      raw.forEach(item => {
        const key = item.anime_id || item.animeId;
        if (!key || !seen[key] || new Date(item.watched_at) > new Date(seen[key].watched_at)) seen[key] = item;
      });
      setHist(Object.values(seen));
      setBm(Array.isArray(b) ? b : []);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api(`/user/profile?userId=${uid()}`).then(d => {
      setProfileData(d);
      setName(d?.display_name || getProfile().displayName || "Penonton");
    }).catch(() => {});
  }, []);

  const watchTime = profileData?.total_watch_seconds || 0;
  const animeCompleted = profileData?.anime_completed || 0;
  const genreCount = {};
  hist.forEach(h => { (h.genres || h.anime?.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; }); });
  const topGenre = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  const stats = [
    { label: "Anime Selesai", value: animeCompleted, Icon: FilmIcon },
    { label: "Waktu Tonton", value: fmtMin(watchTime), Icon: ClockIcon },
    { label: "Bookmark", value: bm.length, Icon: BookmarkIcon },
    { label: "Genre Favorit", value: topGenre, Icon: HeartIcon },
  ];

  useEffect(() => {
    setName(getProfile().displayName || "Penonton");
    setLoggedIn(Boolean(localStorage.getItem("mahi-user")));
  }, []);

  const logout = () => {
    localStorage.removeItem("mahi-token");
    localStorage.removeItem("mahi-user");
    setLoggedIn(false);
    try { window.location.reload(); } catch {}
  };

  const toBase64 = (file) => new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(file);
  });

  const saveProfileServer = async (patch) => {
    setSaving(true);
    try {
      const d = await api("/user/profile", "POST", { userId: uid(), ...patch }).catch(() => null);
      if (d?.user || d?.profile) {
        const u = d.user || d.profile;
        if (u.display_name) setName(u.display_name);
        if (u.bio !== undefined) setProfileData(p => ({ ...p, ...u }));
      }
      toast("Profil disimpan");
    } catch {
      toast("Gagal menyimpan profil");
    } finally {
      setSaving(false);
    }
  };

  const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

  const onAvatar = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_AVATAR_SIZE) {
      toast(`Ukuran foto terlalu besar (maks. 2 MB)`, 'error');
      e.target.value = '';
      return;
    }
    const b64 = await toBase64(f);
    setProfileData(p => ({ ...p, picture: b64 }));
    await saveProfileServer({ picture: b64 });
  };

  const raw = JSON.parse(localStorage.getItem("mahi-user") || "{}");
  const user = raw.user || raw;

  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated sm:h-20 sm:w-20">
            {profileData?.picture ? (
              <img src={profileData.picture} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{name}</h1>
            <p className="truncate text-xs text-muted">{user?.username || "—"}</p>
            {user?.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
            {profileData?.bio ? (
              <p className="mt-1.5 line-clamp-2 text-sm text-muted">{profileData.bio}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button onClick={() => { setNameDraft(name); setBioDraft(profileData?.bio || ""); setEditOpen(true); }}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold text-ink transition hover:bg-elevated sm:h-10 sm:text-sm"
            aria-label="Edit Profil">
            <EditIcon size={14} /> <span className="whitespace-nowrap">Edit</span>
          </button>
          <Link to="/downloads"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:text-ink sm:h-10 sm:w-10"
            aria-label="Unduhan Offline">
            <DownloadIcon size={16} />
          </Link>
          <Link to="/settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:text-ink sm:h-10 sm:w-10"
            aria-label="Pengaturan">
            <SettingsIcon size={16} />
          </Link>
          {!loggedIn ? (
            <Link to="/login"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-accent bg-accent px-3 text-xs font-semibold text-white sm:h-10 sm:text-sm">
              Masuk
            </Link>
          ) : (
            <button onClick={logout}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:text-ink sm:h-10 sm:w-10"
              aria-label="Keluar">
              <LogOutIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* edit profile modal (one place: name + bio + avatar) */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Edit Profil</h2>
              <button onClick={() => setEditOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted"><XIcon size={14} /></button>
            </div>
            <label className="relative mx-auto mb-4 flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-elevated">
              {profileData?.picture ? (
                <img src={profileData.picture} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                </svg>
              )}
              <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white">
                <EditIcon size={12} />
              </span>
              <input type="file" accept="image/*" onChange={onAvatar} className="hidden" />
            </label>
            <label className="mb-1 block text-xs font-semibold text-muted">Nama Tampilan</label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="input mb-3 h-10 w-full text-sm text-ink"
              placeholder="Nama tampilan"
            />
            <label className="mb-1 block text-xs font-semibold text-muted">Deskripsi Akun</label>
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              rows={3}
              className="input mb-4 w-full resize-none text-sm text-ink"
              placeholder="Ceritakan sedikit tentang akun kamu"
            />
            <div className="flex gap-2">
              <button onClick={() => setEditOpen(false)}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-line text-sm font-semibold text-muted">
                Batal
              </button>
              <button onClick={() => {
                const next = { ...getProfile(), displayName: nameDraft.trim() || "Penonton" };
                setProfile(next); setName(next.displayName);
                setProfileData(p => ({ ...p, bio: bioDraft }));
                setEditOpen(false);
                saveProfileServer({ display_name: next.displayName, bio: bioDraft });
              }}
                disabled={saving}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-accent bg-accent text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* stats */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-3 sm:rounded-2xl sm:p-4">
            <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent sm:mb-2 sm:h-9 sm:w-9 sm:rounded-xl">
              <Icon size={16} />
            </div>
            <div className="truncate text-base font-extrabold text-ink sm:text-lg">{value}</div>
            <div className="truncate text-[10px] text-muted sm:text-xs">{label}</div>
          </div>
        ))}
      </div>

      {/* badges */}
      {profileData?.badges?.length > 0 && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink sm:mb-4 sm:text-base">
            <TrophyIcon size={16} className="text-accent sm:size-4" /> Lencana
          </h2>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {profileData.badges.map(b => {
              const BIcon = BADGE_ICONS[b.icon] || TrophyIcon;
              return (
                <div key={b.id} className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-2.5 py-1.5 sm:px-3 sm:py-2" title={b.desc}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent sm:h-8 sm:w-8">
                    <BIcon size={14} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-ink sm:text-xs">{b.name}</p>
                    <p className="text-[9px] text-muted sm:text-[10px]">{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* genre insights */}
      {Object.keys(genreCount).length > 0 && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink sm:mb-4 sm:text-base">
            <BarChartIcon size={16} className="text-accent" /> Genre Paling Ditonton
          </h2>
          <div className="space-y-2.5">
            {Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([genre, count]) => {
              const max = Object.values(genreCount).sort((a, b) => b - a)[0] || 1;
              const pct = Math.round((count / max) * 100);
              return (
                <div key={genre}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{genre}</span>
                    <span className="text-muted">{count} kali</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-caramel" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-5 flex gap-2 rounded-xl border border-line bg-surface p-1">
        {["history", "bookmark"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition", tab === t ? "bg-accent text-white glow-accent" : "text-muted")}>
            {t === "history" ? <><ClockIcon size={15} /> Riwayat</> : <><BookmarkIcon size={15} /> Bookmark</>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tab === "history" ? (
        hist.length ? (
          <div className="space-y-2">
            {hist.map((h, i) => (
              <Link key={h.id || i} to={`/video/${h.anime_id}`}
                className="card-hover flex gap-3 rounded-2xl border border-line bg-surface p-2.5">
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-elevated">
                  <Poster title={h.title} poster={h.poster_url} />
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="line-clamp-1 text-sm font-semibold text-ink">{h.title}</p>
                  <p className="text-xs text-muted">Episode {h.episode} · {fmtDate(h.watched_at)}</p>
                </div>
                <span className="flex self-center text-accent"><PlayIcon size={16} className="ml-0.5 fill-current" /></span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="Belum ada riwayat" icon={<ClockIcon size={28} />} />
        )
      ) : bm.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {bm.map((b) => <AnimeCard key={b.anime_id || b.id} anime={b.anime || b} />)}
        </div>
      ) : (
        <EmptyState title="Belum ada bookmark" icon={<BookmarkIcon size={28} />} />
      )}
    </Shell>
  );
}
