import { useState, useEffect } from 'react';
import { api, adminHeaders, compressPosterImage } from '../lib/client';
import { ACCENTS } from '../lib/prefs';
import Shell from '../components/Shell';
import { PlusIcon, TrashIcon, WrenchIcon, CheckIcon, XIcon, FilmIcon, LayersIcon, BellIcon, CalendarIcon, LockIcon, ListIcon, AlertIcon, CheckCircleIcon, EyeIcon, SettingsIcon, ClockIcon, SendIcon, MessageIcon } from '../components/icons';
import GDriveLinksEditor, { pipeToJson, jsonToPipe } from '../components/GDriveLinksEditor';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';

const PW = "adminbaikbanget";

const reqStatusConfig = {
  pending: { icon: ClockIcon, label: 'Menunggu', color: '#eaa84e', bg: 'rgba(234,168,78,0.1)', dot: '#eaa84e' },
  process: { icon: AlertIcon, label: 'Proses', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', dot: '#fbbf24' },
  done: { icon: CheckCircleIcon, label: 'Selesai', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', dot: '#22C55E' },
};

export default function Admin() {
  const [authed, setAuthed] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem('mahi-user') || '{}').role; return r === 'dev' || r === 'admin'; } catch { return false; }
  });
  const [pw, setPw] = useState('');
  const [tab, setTab] = useState('anime');
  const [stats, setStats] = useState(null);
  const [maintenance, setMaintenance] = useState(false);
  const { toast } = useToast();

  const fetchMaintenance = async () => {
    try { const d = await api('/admin/maintenance', 'GET', null, adminHeaders(PW)); setMaintenance(d.maintenance); } catch {}
  };

  const toggleMaintenance = async () => {
    try { const d = await api('/admin/maintenance', 'POST', { maintenance: !maintenance }, adminHeaders(PW)); setMaintenance(d.maintenance); toast(d.maintenance ? 'Maintenance diaktifkan' : 'Maintenance dinonaktifkan', 'success'); } catch { toast('Gagal', 'error'); }
  };

  useEffect(() => {
    if (authed) {
      api('/admin/stats', 'GET', null, adminHeaders(PW)).then(s => setStats(s)).catch(() => {});
      fetchMaintenance();
    }
  }, []);

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('mahi-user') || '{}').role;
      if (r === 'user') window.location.href = '/';
    } catch {}
  }, []);

  if (!authed) {
    const currentRole = (() => {
      try { return JSON.parse(localStorage.getItem('mahi-user') || '{}').role || null; } catch { return null; }
    })();
    if (currentRole === 'user') {
      return null;
    }
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: '#0c0a0f' }}>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/20">
            <LockIcon size={36} className="text-accent" />
          </div>
          <h1 className="mb-2 text-xl font-extrabold tracking-tight text-ink">Admin Panel</h1>
          <p className="mb-6 text-sm text-muted">Masukkan password admin</p>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)}
            placeholder="Password" autoFocus
            className="mb-4 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-sm font-medium text-ink outline-none placeholder:text-muted" />
          <button onClick={async () => {
            if (pw === PW) {
              setAuthed(true); toast("Berhasil login", "success");
              try { const s = await api('/admin/stats', 'GET', null, adminHeaders(PW)); setStats(s); } catch {}
              fetchMaintenance();
            } else toast("Password salah", "error");
          }}
            className="w-full rounded-full bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/30 transition hover:brightness-110">
            Masuk
          </button>
      </div>
    </div>
  );
}

// ── Report Manager (bug/laporan dari user) ──────────────────────
function ReportManager({ toast }) {
  const [reports, setReports] = useState([]);
  const load = () => api('/admin/reports', 'GET', null, adminHeaders(PW)).then(d => setReports(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try { await api(`/admin/reports/${id}`, 'PUT', { status }, adminHeaders(PW)); load(); toast("Status diperbarui", "success"); }
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

// ── Ticket Manager (chat tiket dari user) ────────────────────────
function TicketManager({ toast }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => api('/admin/chat/list', 'GET', null, adminHeaders(PW)).then(d => setTickets(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const openTicket = async (t) => {
    setSelected(t);
    try {
      const msgs = await api(`/chat/${t.id}/messages?userId=${t.user_id}`, 'GET', null, adminHeaders(PW));
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch { setMessages([]); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selected) return;
    setSending(true);
    try {
      await api(`/chat/${selected.id}/message`, 'POST', { userId: selected.user_id, text: input.trim(), sender: 'admin' }, adminHeaders(PW));
      setInput('');
      const msgs = await api(`/chat/${selected.id}/messages?userId=${selected.user_id}`, 'GET', null, adminHeaders(PW));
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch { toast("Gagal kirim", "error"); }
    finally { setSending(false); }
  };

  const closeTicket = async () => {
    if (!selected) return;
    try { await api(`/admin/chat/${selected.id}/close`, 'PUT', null, adminHeaders(PW)); toast("Tiket ditutup", "success"); load(); setSelected(null); setMessages([]); }
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
              className="rounded-xl bg-accent px-4 text-xs font-bold text-white transition hover:bg-accent/80 disabled:opacity-60">
              {sending ? '...' : 'Kirim'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Admin Panel</h1>
        <p className="text-xs text-muted">Kelola konten</p>
      </div>

      {/* Maintenance */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <WrenchIcon size={16} className="text-accent" />
          <span className="text-xs font-semibold text-ink">Maintenance</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${maintenance ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
            {maintenance ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>
        <button onClick={toggleMaintenance} className="text-xs font-bold text-accent hover:text-accent/80 transition">
          {maintenance ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
      </div>

      {/* Stats */}
      {stats && <div className="mb-5 grid grid-cols-4 gap-2">
        {[
          { label: 'Anime', value: stats.animeCount },
          { label: 'Episode', value: stats.episodeCount },
          { label: 'Request', value: stats.pendingRequests },
          { label: 'Khusus', value: stats.khususCount },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-line/60 bg-elevated/80 py-2.5 text-center">
            <p className="text-base font-extrabold text-ink">{s.value}</p>
            <p className="text-[10px] text-muted2">{s.label}</p>
          </div>
        ))}
      </div>}

      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto border-b border-line pb-3">
        {[
          ['anime', 'Anime', FilmIcon],
          ['episodes', 'Episode', LayersIcon],
          ['schedule', 'Jadwal', CalendarIcon],
          ['announcements', 'Pengumuman', BellIcon],
          ['requests', 'Request', ListIcon],
          ['reports', 'Laporan', AlertIcon],
          ['tickets', 'Tiket', MessageIcon],
          ['khusus', 'Khusus', LockIcon],
          ['notif', 'Notifikasi', SendIcon],
        ].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition ${tab === k ? 'bg-accent text-white' : 'bg-elevated text-muted hover:text-ink'}`}>
            <Icon size={14} /> {l}
          </button>
        ))}
      </div>

      {tab === 'anime' && <AnimeManager toast={toast} />}
      {tab === 'episodes' && <EpisodeManager toast={toast} />}
      {tab === 'schedule' && <ScheduleManager toast={toast} />}
      {tab === 'announcements' && <AnnouncementManager toast={toast} />}
      {tab === 'requests' && <RequestManager toast={toast} />}
      {tab === 'reports' && <ReportManager toast={toast} />}
      {tab === 'tickets' && <TicketManager toast={toast} />}
      {tab === 'khusus' && <KhususManager toast={toast} />}
      {tab === 'notif' && <NotifManager toast={toast} />}
    </Shell>
  );
}

// ── Request Manager ──────────────────────────────────────────────
function RequestManager({ toast }) {
  const [requests, setRequests] = useState([]);
  const load = () => api('/requests').then(d => setRequests(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try { await api(`/admin/requests/${id}`, 'POST', { status }, adminHeaders(PW)); load(); toast("Status diperbarui", "success"); }
    catch { toast("Gagal", "error"); }
  };

  return (
    <div className="space-y-1.5">
      {requests.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Belum ada request</p>
      ) : requests.map(r => {
        const cfg = reqStatusConfig[r.status] || reqStatusConfig.pending;
        const Icon = cfg.icon;
        return (
          <div key={r.id} className="rounded-xl border border-line/50 bg-elevated/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-muted">{r.title}</h4>
                {r.notes && <p className="mt-0.5 text-xs text-muted2">{r.notes}</p>}
                {r.created_at && <p className="mt-1 text-[10px] text-muted2">{new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>}
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: cfg.bg, color: cfg.color }}>
                <Icon size={11} /> {cfg.label}
              </span>
            </div>
            {r.status !== 'done' && (
              <div className="mt-2 flex gap-1.5">
                {r.status === 'pending' && <button onClick={() => updateStatus(r.id, 'process')} className="rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/30">Proses</button>}
                <button onClick={() => updateStatus(r.id, 'done')} className="rounded-full bg-green-500/20 px-3 py-1 text-[10px] font-semibold text-green-400 hover:bg-green-500/30">Selesai</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Anime Manager ────────────────────────────────────────────────
function AnimeManager({ toast }) {
  const { confirm } = useDialog();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ id: '', title: '', title_jp: '', alt_titles: '', poster: '', synopsis: '', genre: '', rating: 0, year: '', type: 'TV', status: 'ongoing', gdrive_links: '', featured: false });
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = () => api('/anime?limit=100').then(d => setList(d.animeList || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const handlePoster = async (e) => {
    const f = e.target.files[0];
    if (f) {
      try {
        const compressed = await compressPosterImage(f);
        setForm(p => ({ ...p, poster: compressed }));
      } catch {
        toast("Gagal memproses gambar poster", "error");
      }
    }
  };

  const fetchEpisodes = async (animeId) => {
    try {
      const eps = await api(`/episodes/${animeId}`);
      if (!Array.isArray(eps) || eps.length === 0) return '';
      const lines = [];
      for (const ep of eps) {
        const links = typeof ep.gdrive_links === 'string' ? JSON.parse(ep.gdrive_links) : (ep.gdrive_links || []);
        for (const link of links) {
          lines.push(`${ep.number}|${link.label || '1080p'}|${link.url}`);
        }
      }
      return lines.join('\n');
    } catch { return ''; }
  };

  const save = async () => {
    if (!form.title) return toast("Judul wajib diisi", "error");
    const slug = form.id || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    try {
      await api('/admin/anime', 'POST', { ...form, id: slug, year: form.year ? parseInt(form.year) : null, rating: parseFloat(form.rating) || 0, alt_titles: form.alt_titles || '', gdrive_links: form.gdrive_links || '' }, adminHeaders(PW));
      toast("Anime tersimpan", "success");
      setForm({ id: '', title: '', title_jp: '', alt_titles: '', poster: '', synopsis: '', genre: '', rating: 0, year: '', type: 'TV', status: 'ongoing', gdrive_links: '', featured: false });
      setEditing(false);
      load();
    } catch (e) { toast(e?.message || "Gagal menyimpan", "error"); }
  };

  const remove = async (id) => {
    if (!await confirm({ message: "Hapus anime ini?", tone: "danger" })) return;
    try { await api(`/admin/anime/${id}`, 'DELETE', null, adminHeaders(PW)); toast("Dihapus", "success"); load(); }
    catch { toast("Gagal hapus", "error"); }
  };

  const edit = async (a) => {
        setForm({ id: a.id, title: a.title, title_jp: a.title_jp || '', alt_titles: a.alt_titles || '', poster: a.poster || '', synopsis: a.synopsis || '', genre: a.genre || (a.genres || []).join(', '), rating: a.rating || 0, year: a.year || '', type: a.type || 'TV', status: a.status || 'ongoing', gdrive_links: '', featured: a.featured || false, aired_from: a.aired_from || '', aired_to: a.aired_to || '' });
    setEditing(true);
    const links = await fetchEpisodes(a.id);
    setForm(p => ({ ...p, gdrive_links: links }));
    setFormKey(k => k + 1);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-bold text-muted">{editing ? 'Edit Anime' : 'Tambah Anime Baru'}</h2>
        <span className="text-[11px] text-muted2">{list.length} total</span>
      </div>

      <div className="mb-5 rounded-2xl border border-line/60 bg-elevated/80 p-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul *" className="input" />
          <input value={form.title_jp} onChange={e => setForm({ ...form, title_jp: e.target.value })} placeholder="Judul Jepang" className="input" />
          <input value={form.alt_titles} onChange={e => setForm({ ...form, alt_titles: e.target.value })} placeholder="Judul Alternatif" className="input" />
          <input value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} placeholder="Genre (koma pisah)" className="input" />
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line/50 bg-elevated px-4 py-2 text-xs text-muted">
            <input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} className="accent-accent" />
            Featured (tampil di Hero)
          </label>
          <div className="flex gap-2">
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input flex-1">
              <option value="ongoing">Ongoing</option><option value="completed">Completed</option>
            </select>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input flex-1">
              <option value="TV">TV</option><option value="Movie">Movie</option><option value="OVA">OVA</option><option value="Special">Special</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input type="number" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} placeholder="Rating" min="0" max="10" step="0.1" className="input" />
            <input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="Tahun" className="input" />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <input type="date" value={form.aired_from || ''} onChange={e => setForm({ ...form, aired_from: e.target.value })} title="Tanggal mulai tayang" className="input flex-1" />
            <input type="date" value={form.aired_to || ''} onChange={e => setForm({ ...form, aired_to: e.target.value })} title="Tanggal selesai tayang" className="input flex-1" />
          </div>
          <div className="sm:col-span-2">
            <textarea value={form.synopsis} onChange={e => setForm({ ...form, synopsis: e.target.value })} placeholder="Sinopsis" rows={3} className="input w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-semibold text-muted">Link GDrive & Episode</label>
            <GDriveLinksEditor key={formKey} value={form.gdrive_links} onChange={(v) => setForm({ ...form, gdrive_links: v })} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line/50 bg-elevated px-4 py-3 text-xs text-muted hover:border-accent/50">
              <FilmIcon size={14} />
              {form.poster ? 'Poster terpilih ✓' : 'Upload Poster (opsional)'}
              <input type="file" accept="image/*" onChange={handlePoster} className="hidden" />
            </label>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={save} className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-bold text-white shadow-lg shadow-accent/30 transition hover:brightness-110">
            <CheckIcon size={14} /> {editing ? 'Update' : 'Simpan Anime'}
          </button>
          {editing && <button onClick={() => { setForm({ id: '', title: '', title_jp: '', alt_titles: '', poster: '', synopsis: '', genre: '', rating: 0, year: '', type: 'TV', status: 'ongoing', gdrive_links: '', featured: false }); setEditing(false); setFormKey(k => k + 1); }}
            className="flex items-center gap-1.5 rounded-full border border-line/50 bg-elevated px-5 py-2 text-xs font-bold text-muted"><XIcon size={14} /> Batal</button>}
        </div>
      </div>

      <div className="space-y-1.5">
        {list.map(a => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line/50 bg-elevated/60 p-2.5">
            <div className="h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-elevated">
              {a.poster ? <img src={a.poster} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-base text-muted">{a.title?.[0]}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold text-muted">{a.title}</p>
              <p className="text-[11px] text-muted2">{a.episode_count || 0} ep · {a.rating || '-'} ★</p>
            </div>
            <button onClick={() => edit(a)} className="rounded-lg p-1.5 text-muted2 hover:text-accent"><WrenchIcon size={14} /></button>
            <button onClick={() => remove(a.id)} className="rounded-lg p-1.5 text-muted2 hover:text-rose-400"><TrashIcon size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Episode Manager ──────────────────────────────────────────────
function EpisodeManager({ toast }) {
  const { confirm } = useDialog();
  const [animeList, setAnimeList] = useState([]);
  const [selectedAnime, setSelectedAnime] = useState('');
  const [episodes, setEpisodes] = useState([]);
  const [form, setForm] = useState({ number: '', title: '', gdrive_links: '', duration: '' });

  useEffect(() => { api('/anime?limit=100').then(d => setAnimeList(d.animeList || [])).catch(() => {}); }, []);

  const loadEps = () => {
    if (!selectedAnime) return;
    api(`/episodes/${selectedAnime}`).then(setEpisodes).catch(() => {});
  };
  useEffect(() => { loadEps(); }, [selectedAnime]);

  const save = async () => {
    if (!selectedAnime || !form.number) return toast("Pilih anime & nomor episode", "error");
    const links = form.gdrive_links.trim() ? form.gdrive_links.split('\n').filter(Boolean).map((url, i) => ({ url: url.trim(), label: `${1080 - i * 360}p` })) : [];
    try {
      await api('/admin/episodes', 'POST', {
        anime_id: selectedAnime, number: parseInt(form.number), title: form.title,
        gdrive_links: JSON.stringify(links), duration: parseInt(form.duration) || 0,
      }, adminHeaders(PW));
      toast("Episode tersimpan", "success");
      setForm({ number: '', title: '', gdrive_links: '', duration: '' });
      loadEps();
    } catch (e) { toast(e?.message || "Gagal menyimpan", "error"); }
  };

  const remove = async (id) => {
    if (!await confirm({ message: "Hapus episode?", tone: "danger" })) return;
    try { await api(`/admin/episodes/${id}`, 'DELETE', null, adminHeaders(PW)); toast("Dihapus", "success"); loadEps(); }
    catch { toast("Gagal", "error"); }
  };

  return (
    <div>
      <select value={selectedAnime} onChange={e => setSelectedAnime(e.target.value)} className="input mb-4 w-full">
        <option value="">Pilih Anime...</option>
        {animeList.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
      </select>

          {selectedAnime && (
        <>
          <div className="mb-5 rounded-2xl border border-line/60 bg-elevated/80 p-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <input type="number" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="Nomor Episode *" className="input" />
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul Episode" className="input" />
              <input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="Durasi (detik)" className="input" />
              <div className="sm:col-span-2">
                <textarea value={form.gdrive_links} onChange={e => setForm({ ...form, gdrive_links: e.target.value })} placeholder="Link Google Drive (1 baris per resolusi)" rows={3} className="input w-full" />
              </div>
            </div>
            <button onClick={save} className="mt-3 flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-bold text-white shadow-lg shadow-accent/30 transition hover:brightness-110">
              <CheckIcon size={15} /> Simpan Episode
            </button>
          </div>

          <div className="space-y-1">
            {episodes.map(ep => (
              <div key={ep.id} className="flex items-center justify-between rounded-xl border border-line/50 bg-elevated/60 px-3 py-2">
                <div>
                  <span className="text-xs font-bold text-accent">Ep {ep.number}</span>
                  <span className="ml-2 text-xs text-muted">{ep.title}</span>
                </div>
                <button onClick={() => remove(ep.id)} className="rounded-lg p-1 text-muted2 hover:text-rose-400"><TrashIcon size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Schedule Manager ─────────────────────────────────────────────
function ScheduleManager({ toast }) {
  const [list, setList] = useState([]);
  const [animeList, setAnimeList] = useState([]);
  const [form, setForm] = useState({ day_of_week: 'Senin', title: '', time: '', anime_id: '' });

  const load = () => Promise.all([
    api('/schedule').then(setList),
    api('/anime?limit=200').then(d => setAnimeList(d.animeList || []))
  ]).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title) return;
    try {
      await api('/admin/schedule', 'POST', form, adminHeaders(PW));
      toast("Jadwal tersimpan", "success");
      setForm({ day_of_week: 'Senin', title: '', time: '', anime_id: '' });
      load();
    } catch { toast("Gagal", "error"); }
  };

  const remove = async (id) => {
    try { await api(`/admin/schedule/${id}`, 'DELETE', null, adminHeaders(PW)); load(); }
    catch {}
  };

  const selectAnime = (id) => {
    const a = animeList.find(x => x.id === id);
    setForm({ ...form, anime_id: id, title: a ? a.title : form.title });
  };

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-line/60 bg-elevated/80 p-4">
        <div className="grid gap-2.5 sm:grid-cols-4">
          <select value={form.day_of_week} onChange={e => setForm({ ...form, day_of_week: e.target.value })} className="input">
            {['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d => <option key={d}>{d}</option>)}
          </select>
          <select value={form.anime_id} onChange={e => selectAnime(e.target.value)} className="input">
            <option value="">Pilih Anime</option>
            {animeList.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul Anime" className="input" />
          <input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} placeholder="Jam (contoh: 17:30)" className="input" />
        </div>
        <button onClick={save} className="mt-3 flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-bold text-white"><PlusIcon size={14} /> Tambah</button>
      </div>
      <div className="space-y-1">
        {list.map(s => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl border border-line/50 bg-elevated/60 px-3 py-2">
            {s.poster && <img src={s.poster} alt="" className="h-10 w-7 shrink-0 rounded-lg object-cover" />}
            <span className="text-[11px] font-semibold text-muted2 w-14">{s.day_of_week}</span>
            <span className="flex-1 text-xs font-medium text-muted line-clamp-1">{s.title}</span>
            <span className="text-[11px] font-bold text-accent">{s.time}</span>
            <button onClick={() => remove(s.id)} className="ml-1 rounded-lg p-1 text-muted2 hover:text-rose-400"><TrashIcon size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Announcements ───────────────────────────────────────────────
function AnnouncementManager({ toast }) {
  const { confirm } = useDialog();
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);

  const load = () => api('/admin/announcements', 'GET', null, adminHeaders(PW)).then(d => setList(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!text.trim()) return;
    try {
      if (editingId) {
        await api(`/admin/announcements/${editingId}`, 'PUT', { content: text.trim() }, adminHeaders(PW));
      } else {
        await api('/admin/announcements', 'POST', { content: text.trim() }, adminHeaders(PW));
      }
      setText(''); setEditingId(null); toast("Tersimpan", "success"); load();
    } catch { toast("Gagal", "error"); }
  };

  const edit = (a) => { setText(a.content); setEditingId(a.id); };

  const remove = async (id) => {
    if (!await confirm({ message: "Hapus pengumuman?", tone: "danger" })) return;
    try { await api(`/admin/announcements/${id}`, 'DELETE', null, adminHeaders(PW)); toast("Dihapus", "success"); load(); }
    catch { toast("Gagal hapus", "error"); }
  };

  const toggle = async (a) => {
    try { await api(`/admin/announcements/${a.id}`, 'PUT', { active: !a.active }, adminHeaders(PW)); load(); }
    catch {}
  };

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-line/60 bg-elevated/80 p-4">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Tulis pengumuman..." rows={3} className="input w-full" />
        <div className="mt-3 flex gap-2">
          <button onClick={save} className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-bold text-white"><BellIcon size={14} /> {editingId ? 'Update' : 'Kirim'}</button>
          {editingId && <button onClick={() => { setText(''); setEditingId(null); }}
            className="flex items-center gap-1.5 rounded-full border border-line/50 bg-elevated px-4 py-2 text-xs font-bold text-muted"><XIcon size={14} /> Batal</button>}
        </div>
      </div>
      <div className="space-y-1.5">
        {list.map(a => (
          <div key={a.id} className={`rounded-xl border p-3 text-sm ${a.active ? 'border-line/50 bg-elevated/60 text-muted' : 'border-line/20 bg-elevated/30 text-muted2 line-through'}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex-1">{a.content}</span>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => toggle(a)} className="rounded p-1 text-muted2 hover:text-accent">{a.active ? <SettingsIcon size={13} /> : <EyeIcon size={13} />}</button>
                <button onClick={() => edit(a)} className="rounded p-1 text-muted2 hover:text-accent"><WrenchIcon size={13} /></button>
                <button onClick={() => remove(a.id)} className="rounded p-1 text-muted2 hover:text-rose-400"><TrashIcon size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Khusus Manager ──────────────────────────────────────────────
function KhususManager({ toast }) {
  const { confirm } = useDialog();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ id: '', title: '', poster: '', gdrive_links: '', description: '', synopsis: '' });
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = () => api('/khusus').then(d => setList(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const handlePoster = async (e) => {
    const f = e.target.files[0];
    if (f) {
      try {
        const compressed = await compressPosterImage(f);
        setForm(p => ({ ...p, poster: compressed }));
      } catch {
        toast("Gagal memproses gambar poster", "error");
      }
    }
  };

  const save = async () => {
    if (!form.title) return toast("Judul wajib", "error");
    const slug = form.id || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    try {
      await api('/admin/khusus', 'POST', { id: slug, title: form.title, poster: form.poster, gdrive_links: pipeToJson(form.gdrive_links), description: form.synopsis || form.description }, adminHeaders(PW));
      toast("Tersimpan", "success");
      setForm({ id: '', title: '', poster: '', gdrive_links: '', description: '', synopsis: '' });
      setEditing(false);
      setFormKey(k => k + 1);
      load();
    } catch { toast("Gagal", "error"); }
  };

  const remove = async (id) => {
    if (!await confirm({ message: "Hapus?", tone: "danger" })) return;
    try { await api(`/admin/khusus/${id}`, 'DELETE', null, adminHeaders(PW)); load(); }
    catch {}
  };

  const edit = (k) => {
    setForm({ id: k.id, title: k.title, poster: k.poster || '', gdrive_links: jsonToPipe(k.gdrive_links), description: k.description || '', synopsis: k.description || '' });
    setEditing(true);
    setFormKey(k => k + 1);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-bold text-muted">{editing ? 'Edit Konten Khusus' : 'Tambah Konten Khusus Baru'}</h2>
        <span className="text-[11px] text-muted2">{list.length} total</span>
      </div>
      <div className="mb-5 rounded-2xl border border-line/60 bg-elevated/80 p-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul *" className="input sm:col-span-2" />
          <div className="sm:col-span-2">
            <textarea value={form.synopsis} onChange={e => setForm({ ...form, synopsis: e.target.value })} placeholder="Sinopsis / Deskripsi" rows={3} className="input w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-semibold text-muted">Link GDrive & Episode</label>
            <GDriveLinksEditor key={formKey} value={form.gdrive_links} onChange={(v) => setForm({ ...form, gdrive_links: v })} />
          </div>
          <div className="sm:col-span-2">
            <input value={form.poster} onChange={e => setForm({ ...form, poster: e.target.value })} placeholder="URL Poster" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line/50 bg-elevated px-4 py-3 text-xs text-muted hover:border-accent/50">
              <FilmIcon size={14} /> {form.poster ? 'Poster terpilih ✓' : 'Upload Poster (opsional)'}
              <input type="file" accept="image/*" onChange={handlePoster} className="hidden" />
            </label>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={save} className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-bold text-white"><CheckIcon size={14} /> {editing ? 'Update' : 'Simpan'}</button>
          {editing && <button onClick={() => { setForm({ id: '', title: '', poster: '', gdrive_links: '', description: '', synopsis: '' }); setEditing(false); setFormKey(k => k + 1); }}
            className="flex items-center gap-1.5 rounded-full border border-line/50 bg-elevated px-4 py-2 text-xs font-bold text-muted"><XIcon size={14} /> Batal</button>}
        </div>
      </div>
      <div className="space-y-1.5">
        {list.map(k => (
          <div key={k.id} className="flex items-center gap-3 rounded-xl border border-line/50 bg-elevated/60 p-2.5">
            <div className="h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-elevated">
              {k.poster ? <img src={k.poster} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-base text-muted">{k.title?.[0]}</div>}
            </div>
            <p className="flex-1 text-sm font-semibold text-muted line-clamp-1">{k.title}</p>
            <p className="text-[11px] text-muted2">{k.description?.slice(0, 40)}</p>
            <button onClick={() => edit(k)} className="rounded-lg p-1.5 text-muted2 hover:text-accent"><WrenchIcon size={14} /></button>
            <button onClick={() => remove(k.id)} className="rounded-lg p-1.5 text-muted2 hover:text-rose-400"><TrashIcon size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifManager({ toast }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [target, setTarget] = useState('all');
  const [list, setList] = useState([]);
  const [sending, setSending] = useState(false);
  const { confirm } = useDialog();

  const load = () => api('/notifications', 'GET', null, {}).then(d => setList(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!title.trim() && !body.trim()) { toast('Isi judul atau pesan', 'error'); return; }
    setSending(true);
    try {
      await api('/admin/notify', 'POST', { title: title.trim(), body: body.trim(), type, target }, adminHeaders(PW));
      toast('Notifikasi dikirim', 'success');
      setTitle(''); setBody('');
      load();
    } catch { toast('Gagal kirim', 'error'); }
    finally { setSending(false); }
  };

  const remove = async (id) => {
    if (!await confirm({ message: 'Hapus notifikasi?', tone: 'danger' })) return;
    try { await api(`/admin/notifications/${id}`, 'DELETE', null, adminHeaders(PW)); load(); toast('Dihapus', 'success'); } catch {}
  };

  return (
    <div className="space-y-4">
      <h2 className="mb-2 text-xs font-bold text-muted">Kirim Notifikasi ke Semua User</h2>
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted2">Judul</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul" maxLength={100}
            className="input w-full h-9 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted2">Pesan</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Isi pesan..." rows={3} maxLength={500}
            className="input w-full resize-none text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted2">Tipe</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input w-full h-9 text-sm">
              <option value="info">Info</option>
              <option value="success">Sukses</option>
              <option value="warning">Peringatan</option>
              <option value="error">Error</option>
              <option value="announcement">Pengumuman</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted2">Target</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="input w-full h-9 text-sm">
              <option value="all">Semua User</option>
              <option value="online">Online</option>
              <option value="admins">Admin/Dev</option>
            </select>
          </div>
        </div>
        <button onClick={send} disabled={sending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent/80 disabled:opacity-60">
          {sending ? 'Mengirim...' : 'Kirim'}
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="mb-3 text-xs font-bold text-muted">Riwayat ({list.length})</h3>
        {list.length === 0 ? (
          <p className="text-center text-xs text-muted2 py-4">Belum ada notifikasi</p>
        ) : (
          <div className="space-y-2">
            {list.slice(0, 20).map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-xl border border-line/60 bg-elevated/40 p-3">
                <div className="min-w-0 flex-1">
                  {n.title && <p className="text-sm font-semibold text-ink">{n.title}</p>}
                  {n.body && <p className="text-xs text-muted line-clamp-2">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-muted2">
                    {n.type} · {n.target} · {new Date(n.created_at || Date.now()).toLocaleString('id-ID')}
                  </p>
                </div>
                <button onClick={() => remove(n.id)} className="text-muted2 hover:text-rose-400">
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
