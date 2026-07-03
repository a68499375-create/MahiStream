import { useState, useEffect, useRef } from 'react';
import { Users, Copy, X, MessageCircle, Send, LogOut } from 'lucide-react';
import {
  watchPartyCreate,
  watchPartyJoin,
  watchPartyState,
  watchPartyUpdate,
  watchPartyChat,
  watchPartyLeave,
  getCurrentUserId,
} from '../services/api';

// Panel "Nonton Bareng" untuk berbagi room dan sinkronkan posisi video.
// Pemakaian:
//   <WatchPartyControls
//     anime={anime}
//     currentEpisode={currentEpisode}
//     activeSource={activeSource}
//     playerRef={playerRef}
//     onEpisodeIdChange={(id) => switchToEpisodeId(id)}
//   />
// Komponen ini SELF-CONTAINED: state polling & sync ada di sini, supaya
// VideoPlayer.jsx tidak makin tebal. Polling pendek (~1.5s) cukup karena
// sumber kebenaran ada di host: tamu hanya catch-up bila drift > 1.5 detik.
export default function WatchPartyControls({ anime, currentEpisode, activeSource, playerRef, onEpisodeIdChange }) {
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(null); // { roomId, isHost }
  const [state, setState] = useState(null);
  const [joinId, setJoinId] = useState('');
  const [chatMsg, setChatMsg] = useState('');
  const [error, setError] = useState('');
  const lastSentRef = useRef(0);
  const userId = getCurrentUserId();
  const userName = (userId.split?.('@')?.[0] || 'User').slice(0, 16);

  // Polling state. Dijalankan hanya bila room aktif. Setiap tick juga
  // mensinkronkan video lokal (untuk tamu) atau mengirim posisi terbaru
  // (untuk host).
  useEffect(() => {
    if (!room) return;
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const s = await watchPartyState(room.roomId, userId);
        if (!alive) return;
        setState(s);
        const v = playerRef?.current;
        if (room.isHost && v) {
          // Host: kirim posisi sekarang ke server (throttled).
          const now = Date.now();
          if (now - lastSentRef.current >= 800) {
            lastSentRef.current = now;
            try {
              await watchPartyUpdate(room.roomId, {
                userId,
                positionSec: v.currentTime || 0,
                isPlaying: !v.paused,
                episodeId: currentEpisode?.id,
              });
            } catch (_e) { /* ignore tick */ }
          }
        } else if (v) {
          // Guest: catch-up posisi dan play/pause.
          if (Math.abs((v.currentTime || 0) - (s.positionSec || 0)) > 1.5) {
            try { v.currentTime = s.positionSec || 0; } catch (_e) { /* ignore */ }
          }
          if (s.isPlaying && v.paused) v.play().catch(() => {});
          if (!s.isPlaying && !v.paused) v.pause();
          if (s.episodeId && currentEpisode?.id && s.episodeId !== currentEpisode.id && typeof onEpisodeIdChange === 'function') {
            onEpisodeIdChange(s.episodeId);
          }
        }
      } catch (_e) { /* ignore */ }
      if (alive) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [room, userId, currentEpisode?.id, playerRef, onEpisodeIdChange]);

  const create = async () => {
    setError('');
    if (!anime?.id) {
      setError('Belum ada anime aktif.');
      return;
    }
    try {
      const out = await watchPartyCreate({
        userId,
        name: userName,
        videoId: anime.id,
        source: activeSource,
        episodeId: currentEpisode?.id,
      });
      setRoom({ roomId: out.roomId, isHost: true });
    } catch (e) {
      setError('Gagal membuat room.');
    }
  };

  const join = async () => {
    setError('');
    const id = joinId.trim().toUpperCase();
    if (!id) { setError('Masukkan kode room.'); return; }
    try {
      const out = await watchPartyJoin({ roomId: id, userId, name: userName });
      setRoom({ roomId: out.roomId, isHost: !!out.isHost });
    } catch (e) {
      setError('Room tidak ditemukan.');
    }
  };

  const leave = async () => {
    if (!room) return;
    try { await watchPartyLeave(room.roomId, userId); } catch (_e) { /* ignore */ }
    setRoom(null);
    setState(null);
  };

  const copyId = async () => {
    if (!room?.roomId) return;
    try { await navigator.clipboard.writeText(room.roomId); } catch (_e) { /* ignore */ }
  };

  const sendChat = async (e) => {
    e?.preventDefault?.();
    const msg = chatMsg.trim();
    if (!msg || !room) return;
    setChatMsg('');
    try { await watchPartyChat(room.roomId, userId, msg); } catch (_e) { /* ignore */ }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="watchparty-open-btn"
        className="inline-flex items-center gap-2 px-5 py-3 bg-surface hover:bg-surface-highlight text-text border border-border rounded-2xl font-bold shadow-sm active:scale-95 transition-all text-[13px]"
      >
        <Users size={16} className="text-primary" />
        {room ? `Room · ${room.roomId}` : 'Nonton Bareng'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-surface border border-border rounded-t-3xl md:rounded-3xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-text flex items-center gap-2">
                <Users size={16} className="text-primary" /> Nonton Bareng
              </h3>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text" aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            {!room ? (
              <div className="space-y-4">
                <p className="text-xs text-text-secondary leading-relaxed">
                  Buat room baru untuk dibagikan ke teman, atau masukkan kode room untuk bergabung. Host yang mengontrol play/pause/seek; tamu otomatis ikut sinkron.
                </p>
                <button
                  onClick={create}
                  data-testid="watchparty-create-btn"
                  className="w-full bg-primary hover:bg-accent text-white font-bold py-3 rounded-xl shadow-md transition active:scale-95 text-sm"
                >
                  Buat Room Baru
                </button>
                <div className="flex items-center gap-2 text-text-muted text-[10px] uppercase font-bold tracking-wider">
                  <span className="flex-1 h-px bg-border" />
                  atau gabung
                  <span className="flex-1 h-px bg-border" />
                </div>
                <div className="flex gap-2">
                  <input
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                    placeholder="KODE ROOM"
                    maxLength={6}
                    data-testid="watchparty-join-input"
                    className="flex-1 bg-surface-highlight border border-border rounded-xl px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/50 text-sm font-mono tracking-widest text-center"
                  />
                  <button
                    onClick={join}
                    data-testid="watchparty-join-btn"
                    className="px-5 bg-text text-white font-bold rounded-xl shadow-md transition active:scale-95 text-sm"
                  >
                    Gabung
                  </button>
                </div>
                {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto">
                <div className="bg-surface-highlight border border-border rounded-2xl p-4">
                  <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-1">Kode Room</p>
                  <div className="flex items-center justify-between gap-2">
                    <span data-testid="watchparty-room-id" className="text-2xl font-black text-text font-mono tracking-widest">{room.roomId}</span>
                    <button onClick={copyId} className="px-3 py-2 bg-surface border border-border rounded-lg text-xs font-bold text-text-secondary hover:text-text">
                      <Copy size={14} />
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted mt-2">
                    {room.isHost ? 'Kamu adalah host. Bagikan kode ini ke teman.' : 'Kamu adalah tamu. Posisi video mengikuti host.'}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-2">
                    Peserta ({state?.participants?.length || 1})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(state?.participants || [{ userId, name: userName }]).map((p) => (
                      <span key={p.userId} className="px-2.5 py-1 bg-primary/10 text-accent border border-primary/20 rounded-full text-[11px] font-bold">
                        {p.name}{p.userId === state?.hostId ? ' (host)' : ''}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-2 flex items-center gap-1">
                    <MessageCircle size={12} /> Chat
                  </p>
                  <div data-testid="watchparty-chat-list" className="bg-surface-highlight border border-border rounded-2xl p-3 max-h-44 overflow-y-auto space-y-2">
                    {(state?.chat || []).map((m, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-bold text-primary mr-1">{m.name}:</span>
                        <span className="text-text-secondary">{m.msg}</span>
                      </div>
                    ))}
                    {(!state?.chat || state.chat.length === 0) && (
                      <p className="text-[11px] text-text-muted">Belum ada chat.</p>
                    )}
                  </div>
                  <form onSubmit={sendChat} className="mt-2 flex gap-2">
                    <input
                      value={chatMsg}
                      onChange={(e) => setChatMsg(e.target.value)}
                      placeholder="Tulis pesan..."
                      maxLength={300}
                      className="flex-1 bg-surface-highlight border border-border rounded-xl px-4 py-2 text-text outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <button type="submit" className="px-3 bg-primary text-white rounded-xl shadow-md">
                      <Send size={14} />
                    </button>
                  </form>
                </div>

                <button
                  onClick={leave}
                  data-testid="watchparty-leave-btn"
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2"
                >
                  <LogOut size={14} /> Keluar Room
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
