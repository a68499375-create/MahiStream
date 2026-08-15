import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api, uid, API_BASE } from '../lib/client';
import { GENRES } from '../lib/types';
import { Badge, Btn, cx } from '../components/ui/index';
import Shell from '../components/Shell';
import {
  ACCENTS, getAccent, getPlayback, getProfile, getReduceMotion, getTheme,
  setAccent as saveAccent, setPlayback as savePlayback, setProfile as saveProfile,
  setReduceMotion as saveReduceMotion, setTheme as saveTheme,
} from '../lib/prefs';
import {
  CheckIcon, ExternalLinkIcon, FilmIcon, InfoIcon, MoonIcon, PaletteIconInline, PlayIcon,
  SendIcon, SunIcon, TrashIcon, UserIcon, NotificationIcon, SettingsIcon, AlertIcon, MessageIcon
} from '../components/icons';
import { io } from "socket.io-client";
import { useDialog } from '../components/DialogProvider';
import { useAuth } from '../context/AuthContext';

const STATUS_TONE = { pending: "amber", process: "sky", done: "green" };
const STATUS_LABEL = { pending: "Menunggu", process: "Diproses", done: "Selesai" };

function isCapacitor() {
  try { return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(); } catch { return false; }
}

function Toggle({ checked, onChange, label }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line")}>
      <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Section({ title, desc, icon, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">{icon}</div>
        <div>
          <h2 className="font-bold text-ink">{title}</h2>
          {desc && <p className="text-xs text-muted">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { confirm } = useDialog();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const [theme, setT] = useState("dark");
  const [accent, setAcc] = useState("gold");
  const [pb, setPb] = useState(() => getPlayback());
  const [profile, setProf] = useState(() => getProfile());
  const [reduceMotion, setRM] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [reqs, setReqs] = useState([]);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [reports, setReports] = useState([]);
  const [myChats, setMyChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatConnected, setChatConnected] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubject, setCreateSubject] = useState("");
  const [createSending, setCreateSending] = useState(false);
  const [adminChats, setAdminChats] = useState([]);
  const [adminSelected, setAdminSelected] = useState(null);
  const [adminMsgs, setAdminMsgs] = useState([]);
  const [adminInput, setAdminInput] = useState("");
  const [adminSending, setAdminSending] = useState(false);
  const [chatInit, setChatInit] = useState(false);
  const [community, setCommunity] = useState(null);

  useEffect(() => {
    api('/settings/community').then(d => { if (d) setCommunity(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    setT(getTheme());
    setAcc(getAccent());
    setPb(getPlayback());
    setProf(getProfile());
    setRM(getReduceMotion());
  }, []);

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(""), 1800); };
  const loadReqs = useCallback(() => {
    api(`/requests?userId=${uid()}`).then(setReqs).catch(() => {});
  }, []);
  useEffect(() => { loadReqs(); }, [loadReqs]);
  const loadReports = useCallback(() => {
    api(`/reports?userId=${uid()}`).then(setReports).catch(() => {});
  }, []);
  useEffect(() => { loadReports(); }, [loadReports]);

  const changeTheme = (t) => { saveTheme(t); setT(t); showToast(t === "dark" ? "Tema gelap aktif" : "Tema terang aktif"); };
  const changeAccent = (k) => { saveAccent(k); setAcc(k); showToast("Warna aksen diterapkan"); };
  const updatePb = (patch) => { const next = { ...pb, ...patch }; setPb(next); savePlayback(next); };
  const updateProfile = (patch) => { const next = { ...profile, ...patch }; setProf(next); saveProfile(next); };
  const toggleGenre = (g) => {
    const has = profile.favoriteGenres.includes(g);
    updateProfile({ favoriteGenres: has ? profile.favoriteGenres.filter(x => x !== g) : [...profile.favoriteGenres, g] });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSending(true); setMsg("");
    try {
      await api("/requests", "POST", { title: title.trim(), notes: note, userId: uid() });
      setTitle(""); setNote(""); setMsg("Request berhasil dikirim.");
      loadReqs();
    } catch (err) { setMsg(err.message); }
    finally { setSending(false); }
  };

  const clearHistory = async () => {
    if (!await confirm({ message: "Hapus seluruh riwayat tontonan?", tone: "danger" })) return;
    await api(`/history/${uid()}/clear`, { method: "DELETE" }).catch(() => {});
    showToast("Riwayat dibersihkan");
  };

  const clearBookmarks = async () => {
    const b = await api(`/bookmarks/${uid()}`).catch(() => []);
    if (Array.isArray(b)) {
      for (const x of b) {
        await api(`/bookmarks/${uid()}/${x.anime_id}`, "DELETE").catch(() => {});
      }
    }
    showToast("Bookmark dibersihkan");
  };

  const clearLocal = async () => {
    if (!await confirm({ message: "Reset semua preferensi lokal ke default?", tone: "danger" })) return;
    localStorage.removeItem("mahi-playback");
    localStorage.removeItem("mahi-profile");
    localStorage.removeItem("mahi-reduce-motion");
    setPb(getPlayback());
    setProf(getProfile());
    setRM(false);
    showToast("Preferensi direset");
  };

  const testNotif = async () => {
    try {
      const audio = new Audio('/MahiStream-notif.mp3');
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch {}

    if (isCapacitor()) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          const req = await LocalNotifications.requestPermissions();
          if (req.display !== 'granted') {
            showToast("Izin notifikasi belum diberikan di HP.");
            return;
          }
        }
        await LocalNotifications.createChannel({
          id: 'mahistream_notif_channel',
          name: 'Notifikasi MahiStream',
          description: 'Notifikasi update anime dan pesan MahiStream',
          importance: 5,
          visibility: 1,
          sound: 'mahistream_notif',
          vibration: true,
        }).catch(() => {});

        await LocalNotifications.schedule({
          notifications: [{
            title: 'MahiStream',
            body: 'Notifikasi Android kamu berfungsi dengan baik!',
            id: Math.floor(Math.random() * 1000000) + 1,
            channelId: 'mahistream_notif_channel',
            sound: 'mahistream_notif',
            smallIcon: 'ic_stat_mahistream',
            schedule: { at: new Date(Date.now() + 100), allowWhileIdle: true },
          }]
        });
        showToast("Notifikasi tes terkirim!");
        return;
      } catch (e) {
        console.warn('[testNotif error]:', e);
        showToast("Gagal mengirim notifikasi HP");
        return;
      }
    }

    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            showToast("Izin diberikan, mencoba kirim...");
            testNotif();
          } else showToast("Izin ditolak oleh browser.");
        }).catch(() => {});
        return;
      }

      if (Notification.permission === 'granted') {
        try {
          const n = new Notification('MahiStream', { 
            body: 'Notifikasi browser kamu berfungsi dengan baik!', 
            tag: 'test-notif-' + Date.now()
          });
          setTimeout(() => n.close(), 5000);
          showToast("Notifikasi dikirim!");
        } catch {
          showToast("Gagal mengirim notifikasi browser");
        }
      } else {
        showToast("Izin notifikasi tidak diberikan browser");
      }
    } else {
      showToast("Browser tidak mendukung notifikasi");
    }
  };
  const chatSocket = useRef(null);

  // Load user's chat tickets (lazy — only when chat section opened)
  const loadChats = useCallback(() => {
    if (!chatInit) return;
    api(`/chat/list?userId=${uid()}`).then(setMyChats).catch(() => {});
  }, [chatInit]);
  useEffect(() => { loadChats(); }, [loadChats]);

  // Check admin status (lazy)
  const loadAdminChats = useCallback(() => {
    if (!chatInit) return;
    api("/admin/chat/list").then(d => {
      if (Array.isArray(d)) setAdminChats(d);
    }).catch(() => {});
  }, [chatInit]);
  useEffect(() => { loadAdminChats(); }, [loadAdminChats]);

  // Socket connection — only when chat section is initialized
  useEffect(() => {
    if (!chatInit) return;
    const socket = io(API_BASE || window.location.origin, {
      query: { userId: uid() },
      auth: { token: localStorage.getItem('mahi-token') || '' },
      transports: ["websocket", "polling"]
    });
    chatSocket.current = socket;
    socket.on("connect", () => setChatConnected(true));
    socket.on("disconnect", () => setChatConnected(false));

    socket.on("chat:message", (msg) => {
      setChatMsgs(prev => {
        if (selectedChat && msg.chat_id === selectedChat.id) return [...prev, msg];
        return prev;
      });
      setAdminMsgs(prev => {
        if (adminSelected && msg.chat_id === adminSelected.id) return [...prev, msg];
        return prev;
      });
      loadChats();
    });

    socket.on("chat:closed", ({ chatId }) => {
      if (selectedChat && selectedChat.id === chatId) {
        setSelectedChat(prev => prev ? { ...prev, status: "closed" } : null);
      }
      if (adminSelected && adminSelected.id === chatId) {
        setAdminSelected(prev => prev ? { ...prev, status: "closed" } : null);
      }
      loadChats();
      loadAdminChats();
    });

    // Notification when admin replies to user's ticket
    socket.on("chat:notify", (data) => {
      showToast("Admin membalas: " + (data.subject || "Pesan baru"));
      loadChats();
    });

    // Notification when new ticket created (admin only)
    socket.on("chat:newTicket", (data) => {
      showToast("Tiket baru: " + (data.subject || ""));
      loadAdminChats();
    });

    return () => { socket.close(); };
  }, [loadChats, selectedChat, adminSelected, loadAdminChats]);

  // Load messages when selecting a chat
  useEffect(() => {
    if (!selectedChat) { setChatMsgs([]); return; }
    api(`/chat/${selectedChat.id}/messages?userId=${uid()}`).then(setChatMsgs).catch(() => {});
    // Join the chat room
    chatSocket.current?.emit("chat:join", selectedChat.id);
    return () => {
      chatSocket.current?.emit("chat:leave", selectedChat?.id);
    };
  }, [selectedChat?.id]);

  // Load messages when admin selects a chat
  useEffect(() => {
    if (!adminSelected) { setAdminMsgs([]); return; }
    api(`/chat/${adminSelected.id}/messages?userId=${uid()}`).then(setAdminMsgs).catch(() => {});
    chatSocket.current?.emit("chat:join", adminSelected.id);
    return () => {
      chatSocket.current?.emit("chat:leave", adminSelected?.id);
    };
  }, [adminSelected?.id]);

  return (
    <Shell>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-ink">Pengaturan</h1>
      <div className="space-y-5">

        <Section title="Tampilan" desc="Tema dan warna aksen aplikasi" icon={<PaletteIconInline size={18} />}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tema</div>
          <div className="mb-5 grid grid-cols-4 gap-2">
            {(["dark", "light", "amoled", "auto"]).map(t => (
              <button key={t} onClick={() => changeTheme(t)}
                className={cx("flex items-center justify-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition",
                  theme === t ? "border-accent bg-accent/10 text-accent2 glow-accent" : "border-line bg-elevated text-muted")}>
                {t === "dark" ? <MoonIcon size={16} /> : t === "light" ? <SunIcon size={16} /> : t === "amoled" ? <span className="text-sm">A</span> : <SettingsIcon size={16} />}
                {t === "dark" ? "Gelap" : t === "light" ? "Terang" : t === "amoled" ? "AMOLED" : "Auto"}
              </button>
            ))}
          </div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Warna Aksen</div>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map(a => (
              <button key={a.key} onClick={() => changeAccent(a.key)} aria-label={a.label}
                className={cx("flex h-10 w-10 items-center justify-center rounded-full ring-2 transition", accent === a.key ? "ring-white scale-110" : "ring-transparent")}
                style={{ backgroundColor: a.accent }}>
                {accent === a.key && <CheckIcon size={16} className="text-white" />}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-elevated px-3.5 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Kurangi animasi</p>
              <p className="text-xs text-muted">Minimalkan gerak halus</p>
            </div>
            <Toggle checked={reduceMotion} onChange={(v) => { setRM(v); saveReduceMotion(v); document.documentElement.classList.toggle("reduce-motion", v); }} label="Kurangi animasi" />
          </div>
        </Section>

        <Section title="Notifikasi" desc="Pengaturan notifikasi perangkat" icon={<NotificationIcon size={18} />}>
          <div className="space-y-2">
            <button onClick={testNotif}
              className="flex w-full items-center justify-between rounded-xl bg-elevated px-3.5 py-3 text-left transition hover:bg-line">
              <div>
                <span className="block text-sm font-medium text-ink">Test Notifikasi</span>
                <span className="block text-xs text-muted">Kirim notifikasi percobaan ke perangkat ini</span>
              </div>
              <NotificationIcon size={16} className="text-accent2" />
            </button>
          </div>
        </Section>

        <Section title="Pemutar" desc="Preferensi pemutaran video" icon={<PlayIcon size={18} />}>
          <div className="space-y-1">
            <div className="flex items-center justify-between rounded-xl px-1 py-2.5">
              <div>
                <p className="text-sm font-medium text-ink">Putar otomatis episode berikutnya</p>
                <p className="text-xs text-muted">Lanjut otomatis saat selesai</p>
              </div>
              <div data-testid="settings-auto-next-toggle">
                <Toggle checked={pb.autoplayNext} onChange={(v) => updatePb({ autoplayNext: v })} label="Autoplay berikutnya" />
              </div>
            </div>

            <div className="rounded-xl px-1 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Kualitas default</p>
                <span className="text-xs font-semibold text-accent2">{pb.defaultQuality}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {["360p", "480p", "720p", "1080p"].map(q => (
                  <button key={q} onClick={() => updatePb({ defaultQuality: q })}
                    className={cx("rounded-lg px-3 py-1.5 text-xs font-semibold transition", pb.defaultQuality === q ? "bg-accent text-white" : "bg-elevated text-muted")}>{q}</button>
                ))}
              </div>
            </div>

            <div className="rounded-xl px-1 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Kecepatan default</p>
                <span className="text-xs font-semibold text-accent2">{pb.defaultRate}x</span>
              </div>
              <input type="range" min={0.5} max={2} step={0.25} value={pb.defaultRate}
                onChange={(e) => updatePb({ defaultRate: Number(e.target.value) })} className="vol w-full" />
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>0.5x</span><span>1x</span><span>2x</span>
              </div>
            </div>

            <div className="rounded-xl px-1 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Volume default</p>
                <span className="text-xs font-semibold text-accent2">{Math.round(pb.defaultVolume * 100)}%</span>
              </div>
              <input type="range" min={0} max={1} step={0.05} value={pb.defaultVolume}
                onChange={(e) => updatePb({ defaultVolume: Number(e.target.value) })} className="vol w-full" />
            </div>

            <div className="rounded-xl px-1 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Tombol Lewati Intro</p>
                <span className="text-xs font-semibold text-accent2">{pb.skipIntroSeconds}s</span>
              </div>
              <input type="range" min={30} max={120} step={5} value={pb.skipIntroSeconds}
                onChange={(e) => updatePb({ skipIntroSeconds: Number(e.target.value) })} className="vol w-full" />
            </div>

            <div className="rounded-xl px-1 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Tombol Lewati Outro</p>
                <span className="text-xs font-semibold text-accent2">{pb.skipOutroSeconds ?? 90}s</span>
              </div>
              <input type="range" min={30} max={180} step={5} value={pb.skipOutroSeconds ?? 90}
                onChange={(e) => updatePb({ skipOutroSeconds: Number(e.target.value) })} className="vol w-full" />
            </div>
          </div>
        </Section>

        <Section title="Preferensi Konten" desc="Genre favorit untuk rekomendasi" icon={<FilmIcon size={18} />}>
          <div className="flex flex-wrap gap-2">
            {GENRES.map(g => {
              const on = profile.favoriteGenres.includes(g);
              return (
                <button key={g} onClick={() => toggleGenre(g)}
                  className={cx("rounded-full px-3 py-1.5 text-xs font-semibold transition", on ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink")}>{g}</button>
              );
            })}
          </div>
        </Section>

        <Section title="Request Anime" desc="Minta anime yang belum tersedia" icon={<SendIcon size={18} />}>
          <form onSubmit={submit} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul anime yang kamu inginkan"
              className="w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan (opsional)" rows={3}
              className="w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            <Btn type="submit" disabled={sending}>
              {sending ? "Mengirim..." : <><SendIcon size={16} /> Kirim Request</>}
            </Btn>
            {msg && (
              <p className={cx("flex items-center gap-1.5 text-sm", msg.includes("dikirim") ? "text-emerald-400" : "text-rose-400")}>
                <CheckIcon size={14} /> {msg}
              </p>
            )}
          </form>
        </Section>

        <Section title="Riwayat Request" desc={`${reqs.length} request`} icon={<SendIcon size={18} />}>
          {reqs.length ? (
            <div className="space-y-2">
              {reqs.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-elevated px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium text-ink">{r.title}</p>
                    {r.note && <p className="line-clamp-1 text-xs text-muted">{r.note}</p>}
                  </div>
                  <Badge tone={STATUS_TONE[r.status] || "default"}>{STATUS_LABEL[r.status] || r.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Belum ada request.</p>
          )}
        </Section>

        <Section title="Riwayat Laporan" desc={`${reports.length} laporan`} icon={<AlertIcon size={18} />}>
          {reports.length ? (
            <div className="space-y-2">
              {reports.map(r => (
                <div key={r.id} className="rounded-xl bg-elevated px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium text-ink">{r.title}</p>
                    <Badge tone={r.status === "process" ? "sky" : r.status === "done" ? "green" : "amber"}>{r.status === "process" ? "Diproses" : r.status === "done" ? "Selesai" : "Menunggu"}</Badge>
                  </div>
                  {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{r.description}</p>}
                  {r.episode && <p className="mt-0.5 text-[10px] text-muted">Episode {r.episode}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Belum ada laporan.</p>
          )}
        </Section>

        <Section title="Live Chat Admin" desc={chatInit ? (chatConnected ? "Terhubung" : "Menghubungkan...") : "Chat dengan admin"} icon={<MessageIcon size={18} />}>
          {!chatInit ? (
            <button onClick={() => setChatInit(true)}
              className="flex w-full items-center justify-between rounded-xl bg-elevated px-3.5 py-3 text-left transition hover:bg-line">
              <div>
                <span className="block text-sm font-medium text-ink">Buka Live Chat</span>
                <span className="block text-xs text-muted">Hubungi admin untuk bantuan</span>
              </div>
              <MessageIcon size={16} className="text-accent" />
            </button>
          ) : selectedChat ? (
            <div className="flex flex-col h-[450px]">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{selectedChat.subject}</p>
                  <p className="text-[10px] text-muted">
                    Tiket #{selectedChat.id} · {selectedChat.status === "closed" ? "Ditutup" : "Terbuka"}
                    {selectedChat.closed_at && ` · ${new Date(selectedChat.closed_at).toLocaleDateString("id-ID")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selectedChat.status === "open" && (
                    <button onClick={async () => {
                      await api(`/chat/${selectedChat.id}/close`, "PUT", { userId: uid() });
                      chatSocket.current?.emit("chat:close", selectedChat.id);
                      setSelectedChat(prev => prev ? { ...prev, status: "closed" } : null);
                      loadChats();
                    }}
                      className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink">
                      Tutup Tiket
                    </button>
                  )}
                  <button onClick={() => setSelectedChat(null)}
                    className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink">
                    Kembali
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 p-2 rounded-xl bg-elevated">
                {chatMsgs.length === 0 ? (
                  <p className="text-center text-xs text-muted py-8">Tidak ada pesan.</p>
                ) : (
                  chatMsgs.map(m => (
                    <div key={m.id} className={cx("flex", m.sender === "admin" ? "justify-start" : "justify-end")}>
                      <div className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", m.sender === "admin" ? "bg-line text-ink rounded-bl-sm" : "bg-accent text-white rounded-br-sm")}>
                        <p>{m.text}</p>
                        <p className={cx("text-[10px] mt-0.5", m.sender === "admin" ? "text-muted" : "text-white/60")}>
                          {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedChat.status === "open" ? (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim() || chatSending || !chatSocket.current) return;
                  setChatSending(true);
                  chatSocket.current.emit("chat:send", { chatId: selectedChat.id, text: chatInput.trim(), sender: "user" });
                  setChatInput("");
                  setChatSending(false);
                }} className="flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ketik pesan..."
                    className="flex-1 rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  />
                  <button type="submit" disabled={!chatInput.trim() || chatSending}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-50">
                    <SendIcon size={16} />
                  </button>
                </form>
              ) : (
                <p className="text-center text-xs text-muted py-2">Tiket ini sudah ditutup.</p>
              )}
            </div>
          ) : (
            <>
              {myChats.length > 0 && (
                <div className="space-y-2 mb-3">
                  {myChats.map(c => (
                    <button key={c.id} onClick={() => setSelectedChat(c)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-elevated px-3.5 py-2.5 text-left transition hover:bg-line">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium text-ink">{c.subject}</p>
                        <p className="text-[10px] text-muted">
                          Tiket #{c.id} · {c.status === "closed" ? "Ditutup" : "Terbuka"}
                          {c.closed_at && ` · ${new Date(c.closed_at).toLocaleDateString("id-ID")}`}
                        </p>
                      </div>
                      {c.status === "open" && <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setCreateOpen(true)}
                className="flex w-full items-center justify-between rounded-xl bg-elevated px-3.5 py-3 text-left transition hover:bg-line">
                <div>
                  <span className="block text-sm font-medium text-ink">Buat Tiket Baru</span>
                  <span className="block text-xs text-muted">Hubungi admin untuk bantuan</span>
                </div>
                <MessageIcon size={16} className="text-accent" />
              </button>

              {createOpen && (
                <div className="mt-3 border-t border-line pt-3">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!createSubject.trim() || createSending) return;
                    setCreateSending(true);
                    try {
                      const result = await api("/chat/create", "POST", { userId: uid(), subject: createSubject.trim() });
                      if (result) {
                        setCreateSubject("");
                        setCreateOpen(false);
                        loadChats();
                        setSelectedChat(result);
                      }
                    } catch {}
                    setCreateSending(false);
                  }} className="space-y-2">
                    <input value={createSubject} onChange={(e) => setCreateSubject(e.target.value)}
                      placeholder="Judul tiket (contoh: Link rusak, Pertanyaan, dll)"
                      className="w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCreateOpen(false)}
                        className="flex h-9 flex-1 items-center justify-center rounded-lg border border-line text-xs font-semibold text-muted">
                        Batal
                      </button>
                      <button type="submit" disabled={!createSubject.trim() || createSending}
                        className="flex h-9 flex-1 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-white disabled:opacity-60">
                        {createSending ? "Membuat..." : "Buat Tiket"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </Section>

        {chatInit && isAdmin && (
          <Section title="Admin - Tiket Masuk" desc={adminChats.length + " tiket terbuka"} icon={<MessageIcon size={18} />}>
            {adminSelected ? (
              <div className="flex flex-col h-[450px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{adminSelected.subject}</p>
                    <p className="text-[10px] text-muted">
                      Tiket #{adminSelected.id} · oleh {adminSelected.user_id?.slice(0, 8)}...
                      {adminSelected.status === "closed" ? " Ditutup" : " Terbuka"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {adminSelected.status === "open" && (
                      <button onClick={async () => {
                        await api(`/admin/chat/${adminSelected.id}/close`, "PUT");
                        chatSocket.current?.emit("chat:close", adminSelected.id);
                        setAdminSelected(prev => prev ? { ...prev, status: "closed" } : null);
                        loadAdminChats();
                      }}
                        className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink">
                        Tutup Tiket
                      </button>
                    )}
                    <button onClick={() => { setAdminSelected(null); setAdminMsgs([]); }}
                      className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink">
                      Kembali
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 mb-3 p-2 rounded-xl bg-elevated">
                  {adminMsgs.length === 0 ? (
                    <p className="text-center text-xs text-muted py-8">Tidak ada pesan.</p>
                  ) : (
                    adminMsgs.map(m => (
                      <div key={m.id} className={cx("flex", m.sender === "admin" ? "justify-end" : "justify-start")}>
                        <div className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", m.sender === "admin" ? "bg-accent text-white rounded-br-sm" : "bg-line text-ink rounded-bl-sm")}>
                          <p>{m.text}</p>
                          <p className={cx("text-[10px] mt-0.5", m.sender === "admin" ? "text-white/60" : "text-muted")}>
                            {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {adminSelected.status === "open" ? (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (!adminInput.trim() || adminSending || !chatSocket.current) return;
                    setAdminSending(true);
                    chatSocket.current.emit("chat:send", { chatId: adminSelected.id, text: adminInput.trim(), sender: "admin" });
                    setAdminInput("");
                    setAdminSending(false);
                  }} className="flex gap-2">
                    <input value={adminInput} onChange={(e) => setAdminInput(e.target.value)}
                      placeholder="Balas sebagai admin..."
                      className="flex-1 rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                    />
                    <button type="submit" disabled={!adminInput.trim() || adminSending}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-50">
                      <SendIcon size={16} />
                    </button>
                  </form>
                ) : (
                  <p className="text-center text-xs text-muted py-2">Tiket sudah ditutup.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {adminChats.length === 0 ? (
                  <p className="text-sm text-muted">Tidak ada tiket terbuka.</p>
                ) : (
                  adminChats.map(c => (
                    <button key={c.id} onClick={() => {
                      setAdminSelected(c);
                      chatSocket.current?.emit("chat:join", c.id);
                    }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-elevated px-3.5 py-2.5 text-left transition hover:bg-line">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium text-ink">{c.subject}</p>
                        <p className="text-[10px] text-muted">
                          Tiket #{c.id} · {c.user_id?.slice(0, 8)}... · {c.messageCount || 0} pesan
                        </p>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    </button>
                  ))
                )}
                <p className="text-[10px] text-muted text-center pt-1">Notifikasi tiket baru masuk secara realtime</p>
              </div>
            )}
          </Section>
        )}

        <Section title="Komunitas" desc="Gabung ke komunitas resmi MahiStream" icon={<ExternalLinkIcon size={18} />}>
          {community && (community.telegram_link || community.wa_link || community.discord_link) ? (
            <div className="space-y-3">
              {[
                community.telegram_link && { label: community.telegram_label || 'Telegram', link: community.telegram_link, color: 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 ring-1 ring-sky-500/25' },
                community.wa_link && { label: community.wa_label || 'WhatsApp', link: community.wa_link, color: 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/25' },
                community.discord_link && { label: community.discord_label || 'Discord', link: community.discord_link, color: 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 ring-1 ring-indigo-500/25' },
              ].filter(Boolean).map((l, i) => (
                <a key={i} href={l.link} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center justify-between rounded-2xl px-5 py-4 font-semibold transition ${l.color}`}>
                  <span className="text-sm">{l.label}</span>
                  <ExternalLinkIcon size={16} />
                </a>
              ))}
              <p className="text-xs text-muted">Info terbaru, update anime, dan diskusi seru di komunitas.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Belum ada link komunitas.</p>
          )}
        </Section>

        <Section title="Manajemen Data" desc="Kelola data yang tersimpan" icon={<TrashIcon size={18} />}>
          <div className="space-y-2">
            <button onClick={clearHistory}
              className="flex w-full items-center justify-between rounded-xl bg-elevated px-3.5 py-3 text-left transition hover:bg-line">
              <span className="text-sm font-medium text-ink">Bersihkan riwayat tonton</span>
              <TrashIcon size={16} className="text-muted" />
            </button>
            <button onClick={clearBookmarks}
              className="flex w-full items-center justify-between rounded-xl bg-elevated px-3.5 py-3 text-left transition hover:bg-line">
              <span className="text-sm font-medium text-ink">Hapus semua bookmark</span>
              <TrashIcon size={16} className="text-muted" />
            </button>
            <button onClick={clearLocal}
              className="flex w-full items-center justify-between rounded-xl bg-elevated px-3.5 py-3 text-left transition hover:bg-line">
              <span className="text-sm font-medium text-ink">Reset preferensi lokal</span>
              <TrashIcon size={16} className="text-muted" />
            </button>
          </div>
        </Section>

        <Section title="Tentang" desc="Informasi aplikasi" icon={<InfoIcon size={18} />}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Aplikasi</span>
              <span className="font-medium text-ink">MahiStream</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Versi</span>
              <span className="font-medium text-ink">2.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">ID Pengguna</span>
              <span className="max-w-[60%] truncate font-mono text-xs text-ink">{uid()}</span>
            </div>
          </div>
        </Section>

      </div>

      {toast && (
        <div className="fade-up fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-xl">
            <CheckIcon size={15} /> {toast}
          </div>
        </div>
      )}
    </Shell>
  );
}
