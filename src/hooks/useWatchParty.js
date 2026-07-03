import { useEffect, useRef, useState, useCallback } from 'react';
import {
  watchPartyCreate,
  watchPartyJoin,
  watchPartyState,
  watchPartyUpdate,
  watchPartyChat,
  watchPartyLeave,
} from '../services/api';
import { getCurrentUserId } from '../services/api';

// Hook React untuk fitur "nonton bareng".
// - Host: kirim state ke server setiap kali play/pause/seek/episode-change.
// - Guest: setiap ~1.5 detik tarik state terbaru dari server, lalu sinkronkan
//          posisi & status play video lokal kalau drift > 1.5 detik.
// Polling pendek dipilih supaya backend tetap stateless & gampang dideploy
// (tanpa WebSocket / Redis). Cocok untuk grup teman, bukan ribuan user.
export default function useWatchParty(playerRef, episode, onEpisodeChange) {
  const [room, setRoom] = useState(null); // { roomId, isHost, ... }
  const [state, setState] = useState(null); // { positionSec, isPlaying, participants, chat }
  const [error, setError] = useState('');
  const lastSentRef = useRef(0);
  const userId = getCurrentUserId();
  const userName = (userId.split?.('@')?.[0] || 'User').slice(0, 16);

  const create = useCallback(async ({ videoId, source, episodeId }) => {
    setError('');
    try {
      const out = await watchPartyCreate({ userId, name: userName, videoId, source, episodeId });
      setRoom({ roomId: out.roomId, isHost: true });
      return out.roomId;
    } catch (e) {
      setError('Gagal membuat room.');
      return null;
    }
  }, [userId, userName]);

  const join = useCallback(async (roomId) => {
    setError('');
    try {
      const out = await watchPartyJoin({ roomId, userId, name: userName });
      setRoom({ roomId: out.roomId, isHost: !!out.isHost, ...out });
      return out;
    } catch (e) {
      setError('Room tidak ditemukan.');
      return null;
    }
  }, [userId, userName]);

  const leave = useCallback(async () => {
    if (!room) return;
    try { await watchPartyLeave(room.roomId, userId); } catch (_e) { /* ignore */ }
    setRoom(null);
    setState(null);
  }, [room, userId]);

  const sendChat = useCallback(async (msg) => {
    if (!room) return;
    try { await watchPartyChat(room.roomId, userId, msg); } catch (_e) { /* ignore */ }
  }, [room, userId]);

  // Host: kirim state ke server (throttled).
  const pushState = useCallback(async (override = {}) => {
    if (!room?.isHost) return;
    const now = Date.now();
    if (now - lastSentRef.current < 700 && !override.force) return;
    lastSentRef.current = now;
    try {
      await watchPartyUpdate(room.roomId, {
        userId,
        positionSec: override.positionSec ?? (playerRef?.current?.currentTime || 0),
        isPlaying: override.isPlaying,
        episodeId: override.episodeId,
      });
    } catch (_e) { /* ignore */ }
  }, [room, userId, playerRef]);

  // Polling state untuk semua peserta.
  useEffect(() => {
    if (!room) return;
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const s = await watchPartyState(room.roomId, userId);
        if (!alive) return;
        setState(s);

        // Sync video lokal kalau bukan host.
        if (!room.isHost && playerRef?.current) {
          const v = playerRef.current;
          if (Math.abs((v.currentTime || 0) - (s.positionSec || 0)) > 1.5) {
            try { v.currentTime = s.positionSec || 0; } catch (_e) { /* ignore */ }
          }
          if (s.isPlaying && v.paused) v.play().catch(() => {});
          if (!s.isPlaying && !v.paused) v.pause();
          // Episode change diteruskan ke parent supaya bisa swap currentEpisode.
          if (s.episodeId && episode?.id && s.episodeId !== episode.id && typeof onEpisodeChange === 'function') {
            onEpisodeChange(s.episodeId);
          }
        }
      } catch (_e) { /* ignore tick errors */ }
      if (alive) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [room, userId, playerRef, episode?.id, onEpisodeChange]);

  return { room, state, error, create, join, leave, sendChat, pushState };
}
