import { ArrowLeft, Play, Pause, Maximize, Share2, Download, Bookmark, Star, Database, Lock, Unlock, SkipBack, SkipForward, CloudOff, CheckCircle2, Clock, List, LayoutGrid, Heart, RotateCcw, RotateCw, MessageCircle, Send, ThumbsUp, Trash2, CornerDownRight, Gauge, ChevronRight, ChevronDown, Search, Filter, FastForward, AlertTriangle, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { fetchSourceAnimeDetails, fetchSourceStreamUrl, searchAnimeAggregate, saveHistory, fetchSourceEpisodeDetails, API_BASE_URL, getCurrentUserId, listComments, createComment, likeComment, deleteComment, subscribeCommentsSSE } from '../services/api';
import { startDownload as startBackgroundDownloadNative } from '../services/downloadManager';
import { getPreference, subscribePreference } from '../utils/preferences';
import WatchPartyControls from '../components/WatchPartyControls';
import Hls from 'hls.js';
import './VideoPlayer.css';

// Extract the real episode number. Kuramanime IDs look like
// "1570/yuru-camp-movie/episode/12" where a naive \d+ match grabs the anime ID (1570).
// Komponen sinopsis dengan tombol "Selengkapnya" untuk teks panjang.
// Sebelumnya sinopsis di banner detail dipotong dengan line-clamp/truncate
// jadi user tidak bisa baca lengkap. Sekarang clamp default 5 baris dan
// expand penuh kalau user klik tombol.
function SynopsisBlock({ text }) {
  const [expanded, setExpanded] = useState(false);
  const content = (text && text.trim()) || 'Sinopsis tidak tersedia untuk seri ini.';
  // Anggap perlu tombol expand kalau teks > ~280 karakter (kira-kira 5 baris).
  const needsToggle = content.length > 280;
  return (
    <div className="mb-8">
      <p
        className={`text-sm text-text-secondary font-medium leading-relaxed whitespace-pre-line ${
          !expanded && needsToggle ? 'line-clamp-5' : ''
        }`}
      >
        {content}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 px-4 py-2 rounded-full bg-surface-highlight hover:bg-border text-text font-bold text-xs transition active:scale-95"
        >
          {expanded ? 'Tampilkan lebih sedikit' : 'Selengkapnya'}
        </button>
      )}
    </div>
  );
}

const extractEpisodeNumber = (ep) => {
  const rawId = ep.episodeId || ep.id || "";
  const epMatch = rawId.match(/\/episode\/(\d+)/);
  if (epMatch) return epMatch[1];
  if (ep.number) return String(ep.number);
  const titleMatch = (ep.title || "").match(/\d+/);
  if (titleMatch) return titleMatch[0];
  const idMatch = rawId.match(/\d+/);
  return idMatch ? idMatch[0] : "1";
};

const formatEpisodeTitle = (epTitle, animeTitle) => {
  if (!epTitle) return '';
  const match = epTitle.match(/(Episode|Ep|OVA|OAD|Special|Batch)\s*\d+(\.\d+)?/i);
  if (match) {
    let str = match[0];
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  let clean = epTitle;
  if (animeTitle) {
    const escapedTitle = animeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTitle, 'gi');
    clean = clean.replace(regex, '');
  }
  clean = clean.replace(/Subtitle Indonesia/gi, '')
               .replace(/Sub Indo/gi, '')
               .replace(/Subtitle/gi, '')
               .replace(/Indo/gi, '');
  clean = clean.replace(/^[-\s:,|()]+/, '').replace(/[-\s:,|()]+$/, '');
  clean = clean.trim();
  return clean || `Episode ${(epTitle.match(/\d+/) || ['?'])[0]}`;
};

// Ambil angka resolusi dari sebuah judul/kualitas, mis. "720p" -> 720,
// "Mp4 1080" -> 1080, "HD" -> 0 (tak diketahui). Dipakai untuk memilih
// resolusi TERTINGGI yang tersedia, bukan default 720p.
const resolutionScore = (label = '') => {
  const s = String(label).toLowerCase();
  // Eksplisit: jika ada angka 360/480/720/1080/2160/4320 + opsional 'p'.
  const m = s.match(/(2160|1440|1080|720|480|360|240)\s*p?/);
  if (m) return parseInt(m[1], 10);
  // Alias tanpa angka.
  if (/\b(4k|uhd|ultra\s*hd)\b/.test(s)) return 2160;
  if (/\b(2k|qhd)\b/.test(s)) return 1440;
  if (/\b(fhd|full\s*hd|fullhd)\b/.test(s)) return 1080;
  if (/\b(hd)\b/.test(s)) return 720;
  if (/\b(sd)\b/.test(s)) return 480;
  // Fallback: angka 3-4 digit pertama (kadang formatnya "Mp4 1080").
  const any = s.match(/(\d{3,4})/);
  return any ? parseInt(any[1], 10) : 0;
};

// Pilih item dengan resolusi tertinggi dari sebuah daftar. `getLabel`
// mengembalikan teks yang mengandung angka resolusi untuk tiap item.
const pickHighest = (list = [], getLabel = (x) => x?.title || x?.quality || '') => {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.reduce((best, cur) =>
    resolutionScore(getLabel(cur)) > resolutionScore(getLabel(best)) ? cur : best
  , list[0]);
};

// Urutkan server Nekopoi: dahulukan 720p (paling diminta user), lalu vidnest
// (host .mp4), kemudian server generik, dan terakhir streamruby/streampoi yang
// token-nya sering dikunci ke sesi embed.
const orderNekopoiServers = (servers = []) => {
  if (!Array.isArray(servers)) return [];
  const rank = (srv = {}) => {
    const haystack = `${srv.serverId || ''} ${srv.serverName || ''} ${srv.title || ''} ${srv.quality || ''}`.toLowerCase();
    if (haystack.includes('720p') || haystack.includes('720 p')) return 0;
    if (haystack.includes('vidnest')) return 1;
    if (haystack.includes('streamruby') || haystack.includes('streampoi')) return 3;
    return 2;
  };
  return [...servers].sort((a, b) => rank(a) - rank(b));
};

// Daftar series — list season/movie/special yang punya judul "akar" sama.
// Cara kerja ala nanimeid: tampilkan sebagai list vertikal (poster mini di
// kiri, judul + tag tipe TV/Movie/OVA/Special + tahun di kanan), item yang
// sedang dibuka di-highlight dengan border + chip "Saat ini". Diurutkan
// ASC by tahun rilis supaya user bisa menonton dari yang terlama ke yang
// terbaru — auto-next antar season memakai urutan yang sama.
function SeriesList({ currentTitle, currentId, activeSource, navigate }) {
  const [items, setItems] = useState(null); // null = loading, [] = empty

  // Klasifikasi tipe item (TV / Movie / OVA / Special / Recap) — sama dgn
  // logika `seasonKey` di player tapi return label baca-manusia.
  const classify = (title = '') => {
    const t = String(title).toLowerCase();
    if (/\bmovie\b|gekijouban/.test(t)) return 'Movie';
    if (/\bspecial\b|\bsp\b/.test(t)) return 'Special';
    if (/\bova\b/.test(t)) return 'OVA';
    if (/\boad\b/.test(t)) return 'OAD';
    if (/\brecap\b|compile/.test(t)) return 'Recap';
    return 'TV';
  };

  useEffect(() => {
    if (!currentTitle) return;
    let cancelled = false;
    const rootTitle = String(currentTitle)
      .replace(/\b(season|s)\s*\d+\b/gi, '')
      .replace(/\bpart\s*\d+\b/gi, '')
      .replace(/\b(2nd|3rd|4th|5th)\s*season\b/gi, '')
      .replace(/\b(movie|gekijouban|special|sp|ova|oad|recap)\b/gi, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!rootTitle || rootTitle.length < 3) {
      setItems([]);
      return undefined;
    }
    const normalize = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const rootNorm = normalize(rootTitle);
    (async () => {
      try {
        const res = await searchAnimeAggregate(rootTitle);
        if (cancelled) return;
        if (!Array.isArray(res)) { setItems([]); return; }
        const list = res
          .filter((it) => {
            const t = normalize(it.title);
            if (!t) return false;
            if (!t.includes(rootNorm) && !rootNorm.includes(t)) return false;
            // Filter ketat: hanya tampilkan series yang ada di SOURCE
            // saat ini (Kurama hanya Kurama, Nekopoi hanya Nekopoi, dst).
            // Sebelumnya kita ikutkan Otakudesu/Kurama digabung yang
            // memicu user-complaint "daftar series jangan digabung".
            const itemSources = Array.isArray(it.availableSources)
              ? it.availableSources
              : [it._source || 'otakudesu'];
            return itemSources.includes(activeSource);
          })
          .map((it) => ({
            id: (it.sourceIds && it.sourceIds[activeSource]) || it.id,
            title: it.title,
            year: it.year || it.releaseYear || it.season || null,
            poster: it.poster_url || it.posterUrl || it.poster || '',
            source: activeSource,
            sourceIds: it.sourceIds || { [activeSource]: it.id },
            type: classify(it.title),
          }))
          .filter((it) => it.id);
        list.sort((a, b) => {
          const ya = parseInt(String(a.year || '').match(/\d{4}/)?.[0] || '0', 10) || 9999;
          const yb = parseInt(String(b.year || '').match(/\d{4}/)?.[0] || '0', 10) || 9999;
          return ya - yb;
        });
        // Sertakan entry "saat ini" di urutan yang benar — pakai metadata
        // dari currentTitle. Kalau API tidak balik item yang cocok, kita
        // tetap render placeholder supaya user lihat anime aktif.
        const hasCurrent = list.some((it) => it.id === currentId);
        if (!hasCurrent && currentId) {
          list.push({
            id: currentId,
            title: currentTitle,
            year: null,
            poster: '',
            source: activeSource,
            sourceIds: { [activeSource]: currentId },
            type: classify(currentTitle),
          });
          list.sort((a, b) => {
            const ya = parseInt(String(a.year || '').match(/\d{4}/)?.[0] || '0', 10) || 9999;
            const yb = parseInt(String(b.year || '').match(/\d{4}/)?.[0] || '0', 10) || 9999;
            return ya - yb;
          });
        }
        setItems(list.slice(0, 20));
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTitle, currentId, activeSource]);

  if (!items) {
    return (
      <section className="bg-surface border border-border rounded-2xl p-4">
        <h3 className="text-[14px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2.5 mb-3">
          <span className="w-1.5 h-5 rounded-full bg-primary" />
          Daftar Series
        </h3>
        <div className="flex flex-col gap-2">
          {[0,1,2].map(i => (
            <div key={i} className="h-16 rounded-xl bg-surface-highlight animate-pulse" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length <= 1) return null;

  // Type → palette badge ala nanimeid (warna pakai token tetap, identitas
  // brand Mahiru).
  const typePalette = (t) => {
    if (t === 'Movie') return 'bg-red-500/15 text-red-500 border-red-500/30';
    if (t === 'Special') return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
    if (t === 'OVA') return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
    if (t === 'OAD') return 'bg-teal-500/15 text-teal-600 border-teal-500/30';
    if (t === 'Recap') return 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30';
    return 'bg-primary/15 text-primary border-primary/30';
  };

  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <h3 className="text-[14px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2.5">
          <span className="w-1.5 h-5 rounded-full bg-primary" />
          Daftar Series
          <span className="ml-1 inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary/15 text-primary text-[11px] font-black normal-case tracking-normal border border-primary/25">
            {items.length}
          </span>
        </h3>
        <span className="text-[11px] text-text-muted font-bold uppercase tracking-wider">
          Urut · Tahun
        </span>
      </header>
      <div className="flex flex-col divide-y divide-border max-h-[480px] overflow-y-auto no-scrollbar">
        {items.map((it) => {
          const isCurrent = it.id === currentId;
          return (
            <button
              key={`${it.source}-${it.id}`}
              type="button"
              onClick={() => {
                if (isCurrent) return;
                const src = it.source;
                const id = (it.sourceIds && it.sourceIds[src]) || it.id;
                const qs = src && src !== 'otakudesu' ? `?source=${src}` : '';
                navigate(`/video/${id}${qs}`);
              }}
              className={`group flex items-center gap-3 px-3 py-2.5 text-left transition ${
                isCurrent
                  ? 'bg-primary/8 border-l-4 border-primary cursor-default'
                  : 'hover:bg-surface-highlight border-l-4 border-transparent'
              }`}
            >
              <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-surface-highlight border border-border shrink-0">
                {it.poster ? (
                  <img
                    src={it.poster}
                    alt={it.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const fb = `https://placehold.co/60x80/18181b/c68a4e?text=${encodeURIComponent((it.title || '?').slice(0,2))}`;
                      if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-text-muted font-black text-lg">
                    {(it.title || '?').slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-bold leading-snug line-clamp-2 transition-colors ${
                  isCurrent ? 'text-primary' : 'text-text group-hover:text-primary'
                }`}>
                  {it.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${typePalette(it.type)}`}>
                    {it.type}
                  </span>
                  {it.year && (
                    <span className="text-[10.5px] font-bold text-text-muted">
                      {String(it.year).match(/\d{4}/)?.[0] || it.year}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-primary text-white">
                      Saat ini
                    </span>
                  )}
                </div>
              </div>
              {!isCurrent && (
                <ChevronRight size={14} className="text-text-muted shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Komentar realtime per anime/episode. Subscribe SSE saat mounted supaya
// post baru / like dari user lain langsung muncul tanpa refresh. State lokal
// pakai array flat untuk top-level + map untuk replies (mirror struktur
// payload backend yang sudah grouped). Optimistic-friendly: setelah post,
// SSE broadcast bawa row final, lalu kita merge.
function CommentSection({ animeId, episode, userId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null); // top-level comment id
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const seenRef = useRef(new Set()); // dedup id supaya SSE tidak double-insert

  // Load awal + subscribe realtime tiap ganti anime / episode.
  useEffect(() => {
    if (!animeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    seenRef.current = new Set();
    listComments(animeId, { episode })
      .then((rows) => {
        if (cancelled) return;
        rows.forEach((c) => seenRef.current.add(c.id));
        setComments(rows);
      })
      .catch((e) => !cancelled && setError(e?.message || 'Gagal memuat komentar'))
      .finally(() => !cancelled && setLoading(false));

    const unsubscribe = subscribeCommentsSSE(animeId, episode, (ev) => {
      if (!ev || cancelled) return;
      if (ev.type === 'new' && ev.comment) {
        const c = ev.comment;
        if (seenRef.current.has(c.id)) return;
        seenRef.current.add(c.id);
        setComments((prev) => {
          if (c.parent_id) {
            // sisipkan ke replies dari parent
            return prev.map((p) => (p.id === c.parent_id ? { ...p, replies: [...(p.replies || []), c] } : p));
          }
          return [{ ...c, replies: [] }, ...prev];
        });
      } else if (ev.type === 'like' && ev.commentId != null) {
        setComments((prev) => prev.map((p) => {
          if (p.id === ev.commentId) return { ...p, likes: ev.likes };
          if (p.replies?.length) {
            return { ...p, replies: p.replies.map((r) => (r.id === ev.commentId ? { ...r, likes: ev.likes } : r)) };
          }
          return p;
        }));
      } else if (ev.type === 'delete' && ev.commentId != null) {
        setComments((prev) => prev
          .filter((p) => p.id !== ev.commentId)
          .map((p) => p.replies?.length ? { ...p, replies: p.replies.filter((r) => r.id !== ev.commentId) } : p)
        );
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [animeId, episode]);

  const handlePost = async () => {
    const body = text.trim();
    if (!body || posting) return;
    if (!userId) {
      setError('Login dulu untuk berkomentar.');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await createComment({ userId, animeId, episode, parentId: replyTarget, body });
      // Tunggu SSE menyusun row final supaya konsisten dengan user lain.
      setText('');
      setReplyTarget(null);
    } catch (e) {
      setError(e?.message || 'Gagal mengirim komentar');
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (commentId) => {
    if (!userId) {
      setError('Login dulu untuk like komentar.');
      return;
    }
    // Optimistic toggle locally; SSE akan sync ke nilai final.
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId); else next.add(commentId);
      return next;
    });
    try { await likeComment(commentId, userId); } catch { /* SSE akan rekonsiliasi */ }
  };

  const handleDelete = async (commentId) => {
    if (!userId) return;
    if (!window.confirm('Hapus komentar ini?')) return;
    try { await deleteComment(commentId, userId); } catch (e) { setError(e?.message || 'Gagal menghapus'); }
  };

  const total = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  return (
    <section className="border-t border-border pt-6 mt-6" data-testid="comments-section">
      <div className="flex items-center gap-2.5 mb-5">
        <span className="w-1.5 h-5 rounded-full bg-primary" />
        <h2 className="text-[15px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2">
          <MessageCircle size={16} /> Komentar
          <span className="text-[11px] text-text-muted normal-case tracking-normal font-bold">· {total}</span>
        </h2>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-3 mb-5">
        {replyTarget && (
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-2">
            <CornerDownRight size={12} /> Membalas komentar
            <button onClick={() => setReplyTarget(null)} className="ml-auto text-primary font-bold">batal</button>
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={userId ? 'Tulis komentar...' : 'Login dulu untuk berkomentar'}
          disabled={!userId || posting}
          rows={2}
          maxLength={2000}
          className="w-full bg-transparent text-[14px] text-text placeholder:text-text-muted resize-none focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
          <span className="text-[10px] text-text-muted font-semibold">{text.length}/2000</span>
          <button
            onClick={handlePost}
            disabled={!text.trim() || !userId || posting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-white text-[12px] font-bold disabled:opacity-40 active:scale-95 transition"
          >
            <Send size={13} /> Kirim
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[12px] text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center text-[13px] text-text-secondary py-8 bg-surface-highlight rounded-2xl border border-border">
          Belum ada komentar. Jadilah yang pertama.
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="bg-surface border border-border rounded-2xl p-4">
              <CommentRow
                comment={c}
                userId={userId}
                liked={likedIds.has(c.id)}
                onLike={() => handleLike(c.id)}
                onReply={() => setReplyTarget(c.id)}
                onDelete={() => handleDelete(c.id)}
              />
              {c.replies?.length > 0 && (
                <ul className="mt-3 pl-4 border-l-2 border-border space-y-3">
                  {c.replies.map((r) => (
                    <li key={r.id} className="pt-1">
                      <CommentRow
                        comment={r}
                        userId={userId}
                        liked={likedIds.has(r.id)}
                        onLike={() => handleLike(r.id)}
                        onReply={() => setReplyTarget(c.id)}
                        onDelete={() => handleDelete(r.id)}
                        isReply
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentRow({ comment, userId, liked, onLike, onReply, onDelete, isReply }) {
  const own = userId && comment.user_id === userId;
  const name = comment.user_name || comment.user_id || 'anon';
  const initial = String(name).trim().charAt(0).toUpperCase() || '?';
  const time = comment.created_at ? new Date(comment.created_at.replace(' ', 'T') + 'Z') : null;
  const timeLabel = time && !isNaN(time.getTime()) ? time.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return (
    <div className="flex gap-3">
      {comment.user_picture ? (
        <img src={comment.user_picture} alt="" className={`shrink-0 rounded-full object-cover ${isReply ? 'w-7 h-7' : 'w-9 h-9'}`} />
      ) : (
        <div className={`shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center font-black ${isReply ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-[13px]'}`}>
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold text-text truncate max-w-[160px]">{name}</span>
          {comment.episode && <span className="text-[10px] uppercase tracking-wider bg-surface-highlight border border-border rounded-full px-2 py-0.5 text-text-muted font-bold">Ep {comment.episode}</span>}
          <span className="text-[11px] text-text-muted">{timeLabel}</span>
        </div>
        <p className="text-[13.5px] text-text leading-relaxed whitespace-pre-wrap break-words mt-1">{comment.body}</p>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={onLike}
            className={`inline-flex items-center gap-1 text-[11px] font-bold transition active:scale-95 ${liked ? 'text-primary' : 'text-text-muted hover:text-text'}`}
          >
            <ThumbsUp size={12} /> {comment.likes || 0}
          </button>
          {!isReply && (
            <button onClick={onReply} className="text-[11px] font-bold text-text-muted hover:text-text">Balas</button>
          )}
          {own && (
            <button onClick={onDelete} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-text-muted hover:text-red-500">
              <Trash2 size={12} /> Hapus
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VideoPlayer() {
  const navigate = useNavigate();
  const params = useParams();
  const id = params['*']; 
  
  const [sourcesCache, setSourcesCache] = useState({
    otakudesu: null,
    kuramanime: null
  });
  const [searchParams] = useSearchParams();
  const initialSource = searchParams.get('source') || 'otakudesu';
  const [activeSource, setActiveSource] = useState(initialSource);
  const [sourceIds, setSourceIds] = useState({
    otakudesu: initialSource === 'otakudesu' ? id : null,
    kuramanime: initialSource === 'kuramanime' ? id : null
  });
  
  const [anime, setAnime] = useState(null);
  const [currentEpisode, setCurrentEpisode] = useState(null);

  // Player state
  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const initialTimeRef = useRef(parseInt(searchParams.get('t') || '0'));
  const [isLocked, setIsLocked] = useState(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const lastTapRef = useRef(0);
  const singleTapTimeoutRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(null);
  const [seeking, setSeeking] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Gesture: swipe vertikal sisi KANAN = volume, sisi KIRI = kecerahan.
  // brightness disimulasikan dengan overlay hitam transparan di atas video
  // (1 = normal, 0.2 = paling gelap). volume mengikuti elemen <video>.
  // Toggle bisa di-disable user via Settings → Pengaturan Video Player.
  const [brightness, setBrightness] = useState(1);
  const [volumeLevel, setVolumeLevel] = useState(1);
  const [gestureHint, setGestureHint] = useState(null);
  const gestureRef = useRef({ active: false, side: null, startY: 0, startVal: 0 });
  const gestureHintTimeoutRef = useRef(null);
  const [volumeSwipeEnabled, setVolumeSwipeEnabled] = useState(() => getPreference('volumeSwipe'));
  const [brightnessSwipeEnabled, setBrightnessSwipeEnabled] = useState(() => getPreference('brightnessSwipe'));
  const [fullscreenProgressEnabled, setFullscreenProgressEnabled] = useState(() => getPreference('fullscreenProgress'));

  useEffect(() => {
    const unsubs = [
      subscribePreference('volumeSwipe', setVolumeSwipeEnabled),
      subscribePreference('brightnessSwipe', setBrightnessSwipeEnabled),
      subscribePreference('fullscreenProgress', setFullscreenProgressEnabled),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, []);
  
  // Custom API states
  const [streamUrl, setStreamUrl] = useState('');
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [episodeDetails, setEpisodeDetails] = useState(null);
  const [activeResolution, setActiveResolution] = useState('720p');
  const [activeServerId, setActiveServerId] = useState(null); 
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  // Download BATCH (full series) — terpisah dari download per-episode.
  // batchOptions: null = belum fetch, [] = tidak tersedia, [items] = sudah dapat.
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchOptions, setBatchOptions] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [downloadStartedToast, setDownloadStartedToast] = useState(null);
  
  // Action states
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  // Advanced Features states
  const [hasStartedPlaying, setHasStartedPlaying] = useState(searchParams.get('play') === 'true');
  const [introSkipped, setIntroSkipped] = useState(false);
  const [outroSkipped, setOutroSkipped] = useState(false);
  const [showEpisodeOverlay, setShowEpisodeOverlay] = useState(false);
  // Tab di bawah player ala nanimeid: 'info' atau 'comments'.
  const [playerTab, setPlayerTab] = useState('info');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState('');

  // Auto-open download modal saat URL punya ?download=1 (unduh episode aktif)
  // atau ?batch=1 (unduh batch / full series). Dibuka SETELAH episodeDetails
  // siap supaya daftar resolusi langsung muncul.
  useEffect(() => {
    if (!anime || !currentEpisode) return;
    if (searchParams.get('download') === '1' && episodeDetails) {
      setShowDownloadModal(true);
    }
    if (searchParams.get('batch') === '1') {
      handleDownloadBatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime, currentEpisode, episodeDetails]);

  // Detail View Config States
  const [episodeLayout, setEpisodeLayout] = useState('horizontal'); // 'horizontal' or 'vertical'
  const [episodeSort, setEpisodeSort] = useState('asc'); // 'asc' or 'desc'
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [skipIntroDismissed, setSkipIntroDismissed] = useState(false);
  const [isVideoBookmarked, setIsVideoBookmarked] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  
  const controlsTimeoutRef = useRef(null);
  const lastSavedTimeRef = useRef(0);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowResolutionMenu(false);
      setShowSpeedMenu(false);
    }, 3000);
  };

  const triggerControlsVisibility = () => {
    setShowControls(prev => {
      const next = !prev;
      if (next) {
        resetControlsTimeout();
      } else {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
      return next;
    });
  };

  const handleMouseMove = () => {
    if (isLocked) return;
    setShowControls(true);
    resetControlsTimeout();
  };

  const saveCurrentProgress = async (timeToSave) => {
    if (!anime || !currentEpisode || !hasStartedPlaying) return;
    const userId = getCurrentUserId();

    lastSavedTimeRef.current = timeToSave;
    await saveHistory(userId, {
      id: anime.id,
      title: anime.title,
      poster: anime.poster || "",
      episode: currentEpisode.number || (currentEpisode.title?.match(/\d+/) || ['1'])[0],
      source: activeSource,
      progressSeconds: Math.floor(timeToSave),
      durationSeconds: Math.floor(duration || 0),
    });
  };

  const togglePlay = () => {
    if (isLocked) return;
    if (playerRef.current) {
      if (playing) {
        playerRef.current.pause();
        saveCurrentProgress(playerRef.current.currentTime);
      } else {
        playerRef.current.play().catch(e => console.warn("Play error:", e));
      }
    }
  };

  const playNextEpisode = () => {
    if (!anime || !currentEpisode) return;
    const currentIndex = anime.episodes.findIndex(ep => ep.id === currentEpisode.id);
    if (currentIndex !== -1 && currentIndex < anime.episodes.length - 1) {
      const nextEp = anime.episodes[currentIndex + 1];
      setCurrentEpisode(nextEp);
      showToast(`Memutar ${formatEpisodeTitle(nextEp.title, anime?.title)}`);
    } else {
      showToast("Ini adalah episode terakhir.");
    }
  };

  const playPrevEpisode = () => {
    if (!anime || !currentEpisode) return;
    const currentIndex = anime.episodes.findIndex(ep => ep.id === currentEpisode.id);
    if (currentIndex > 0) {
      const prevEp = anime.episodes[currentIndex - 1];
      setCurrentEpisode(prevEp);
      showToast(`Memutar ${formatEpisodeTitle(prevEp.title, anime?.title)}`);
    } else {
      showToast("Ini adalah episode pertama.");
    }
  };

  const hasNextEpisode = () => {
    if (!anime || !currentEpisode) return false;
    const currentIndex = anime.episodes.findIndex(ep => ep.id === currentEpisode.id);
    return currentIndex !== -1 && currentIndex < anime.episodes.length - 1;
  };

  const hasPrevEpisode = () => {
    if (!anime || !currentEpisode) return false;
    const currentIndex = anime.episodes.findIndex(ep => ep.id === currentEpisode.id);
    return currentIndex > 0;
  };

  const [currentTime, setCurrentTime] = useState(0);

  const handleProgress = (state) => {
    if (!seeking && playerRef.current) {
      setPlayed(state.played);
      const currTime = playerRef.current.currentTime;
      setCurrentTime(currTime);

      // Save throttled progress (every 5 seconds)
      if (Math.abs(currTime - lastSavedTimeRef.current) >= 5) {
        saveCurrentProgress(currTime);
      }

      // Fitur auto-skip intro dihapus sesuai permintaan: dulu skip otomatis
      // ke detik ke-90 saat OP standar 1m30s. Sekarang user mengontrol seek
      // sendiri lewat tombol fast-forward atau timeline.

      // Auto-next fallback: kalau video sudah hampir selesai (1 detik tersisa)
      // tapi onEnded belum trigger (sering terjadi di HLS/proxy stream),
      // trigger handler manual.
      if (duration > 0 && currTime >= duration - 0.5 && !introSkipped && hasStartedPlaying) {
        // pakai introSkipped sebagai mark generic untuk hindari double-trigger
        // dalam frame yang sama; flag asli akan di-reset di episode change effect.
      }
      // CATATAN: jangan auto-pindah episode di sini. Auto-next harus tunggu
      // sampai detik terakhir (handler onEnded). Mem-skip outro lebih awal
      // membuat episode terganti sebelum credit selesai.
    }
  };

  const handleSeekChange = (e) => {
    const newPlayed = parseFloat(e.target.value);
    setPlayed(newPlayed);
    if (playerRef.current && duration > 0) {
      setCurrentTime(newPlayed * duration);
    }
  };

  const handleSeekMouseUp = (e) => {
    setSeeking(false);
    const newPlayed = parseFloat(e.target.value);
    if (playerRef.current && duration > 0) {
      playerRef.current.currentTime = newPlayed * duration;
      saveCurrentProgress(newPlayed * duration);
    }
  };

  const handleVideoEnd = () => {
    setPlaying(false);
    // Auto next aktif secara default. Dipicu HANYA oleh native `onEnded`
    // <video>, jadi pasti menunggu sampai detik paling terakhir baru
    // berganti episode (bukan lebih cepat dari itu).
    const autoNextSetting = getPreference('autoNext');
    if (autoNextSetting && hasNextEpisode()) {
      playNextEpisode();
    } else {
      showToast("Episode selesai.");
    }
  };

  const showGestureHint = (type, value) => {
    setGestureHint({ type, value });
    if (gestureHintTimeoutRef.current) clearTimeout(gestureHintTimeoutRef.current);
    gestureHintTimeoutRef.current = setTimeout(() => setGestureHint(null), 800);
  };

  const handleTouchStart = (e) => {
    if (isLocked || !e.touches || e.touches.length !== 1) return;
    // Hormati toggle pengaturan: jika kedua gestur dinonaktifkan, jangan
    // mulai sesi gestur (biar tap & double-tap tetap berfungsi normal).
    if (!volumeSwipeEnabled && !brightnessSwipeEnabled) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const rawSide = x < rect.width / 2 ? 'brightness' : 'volume';
    // Jika sisi yang diminta sedang di-disable, batalkan.
    if (rawSide === 'volume' && !volumeSwipeEnabled) return;
    if (rawSide === 'brightness' && !brightnessSwipeEnabled) return;
    gestureRef.current = {
      active: true,
      side: rawSide,
      startY: touch.clientY,
      startVal: rawSide === 'volume' ? volumeLevel : brightness,
      height: rect.height,
    };
  };

  const handleTouchMove = (e) => {
    const g = gestureRef.current;
    if (!g.active || isLocked || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = g.startY - touch.clientY; // ke atas = positif
    const change = deltaY / (g.height || 300);
    if (Math.abs(deltaY) < 6) return; // abaikan getaran kecil agar tap tetap jalan
    const next = Math.min(1, Math.max(0, g.startVal + change));
    if (g.side === 'volume') {
      setVolumeLevel(next);
      if (playerRef.current) {
        playerRef.current.volume = next;
        playerRef.current.muted = next === 0;
      }
      showGestureHint('volume', next);
    } else {
      const b = Math.max(0.2, next);
      setBrightness(b);
      showGestureHint('brightness', b);
    }
  };

  const handleTouchEnd = () => {
    gestureRef.current = { active: false, side: null, startY: 0, startVal: 0 };
  };

  const handlePlayerClick = (e) => {
    if (isLocked) {
      triggerControlsVisibility();
      return;
    }
    
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      if (playerRef.current) {
        if (x < width / 2) {
          playerRef.current.currentTime = Math.max(0, playerRef.current.currentTime - 10);
          showToast("-10 Detik");
        } else {
          playerRef.current.currentTime = Math.min(duration, playerRef.current.currentTime + 10);
          showToast("+10 Detik");
        }
      }
    } else {
      lastTapRef.current = now;
      singleTapTimeoutRef.current = setTimeout(() => {
        triggerControlsVisibility();
      }, DOUBLE_PRESS_DELAY);
    }
  };

  useEffect(() => {
    if (playing) {
      resetControlsTimeout();
    } else {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      setShowControls(true);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      if (gestureHintTimeoutRef.current) clearTimeout(gestureHintTimeoutRef.current);
    };
  }, [playing]);

  const getIframeUrl = () => {
    if (!streamUrl) return '';
    if (activeSource === 'kuramanime') {
      return `${API_BASE_URL}/kuramanime/iframe-proxy?url=${encodeURIComponent(streamUrl)}`;
    }
    if (activeSource === 'nekopoi') {
      // Pendekatan baru: load embed URL Nekopoi (playmogo/streampoi/vidnest)
      // langsung di iframe TANPA lewat backend iframe-proxy. Alasan:
      //
      // 1. Server backend kena 403 saat fetch playmogo/streampoi karena IP
      //    VPS-nya di-block sumber upstream. Sehingga proxy server-side
      //    selalu menghasilkan halaman error.
      // 2. Android WebView punya User-Agent browser asli + IP rumah user, jadi
      //    sumber upstream tidak block; embed video play normal.
      // 3. Player bawaan embed (playmogo/streampoi) sudah punya tombol
      //    fullscreen yang otomatis mendeteksi device — kita tidak perlu
      //    inject CSS/script tambahan.
      //
      // Iframe element di JSX punya `allowFullScreen` + `allow="autoplay;
      // fullscreen; encrypted-media"` sehingga semua kontrol native
      // berfungsi langsung.
      const isDirect = streamUrl.includes('.mp4') || streamUrl.includes('.m3u8') || streamUrl.includes('/proxy/stream') || streamUrl.includes('stream-proxy');
      if (isDirect) return streamUrl;
      // Embed URL → langsung. WebView memuat sebagai halaman penuh.
      return streamUrl;
    }
    return streamUrl;
  };

  // Catatan: buildNekopoiStreamUrl tidak dipakai lagi — kita memang sengaja
  // membiarkan pemain embed bawaan Nekopoi mengurus playback-nya sendiri.
  // Fungsi dipertahankan agar tidak memecahkan import/usage lama, tapi selalu
  // mengembalikan string kosong.
  const buildNekopoiStreamUrl = async () => '';

  // Untuk Otakudesu: SELALU ekstrak halaman embed jadi .m3u8/.mp4
  // via /extract-stream lalu salurkan lewat stream-proxy supaya player
  // kustom (HTML5 <video>) yang memutar — bukan iframe. User minta player
  // kustom wajib untuk Otakudesu. Timeout dinaikkan ke 25s supaya extract
  // punya cukup waktu (Puppeteer cold-start 10-20s).
  //
  // Untuk Kuramanime: SENGAJA TIDAK lewat /extract-stream. Endpoint itu pakai
  // Puppeteer untuk membuka halaman embed dan menunggu video src muncul, yang
  // di VPS bisa makan 30-90 detik (bahkan timeout). Kuramanime selalu
  // diputar lewat <iframe> ke /kuramanime/iframe-proxy yang sudah di-cache
  // Resolve embed URL ke direct stream (mp4/m3u8) via backend.
  // - Kurama/Nekopoi default-nya iframe-friendly tetapi player kustom
  //   butuh URL direct. Selama URL belum berakhiran .mp4/.m3u8 dan belum
  //   melalui proxy, lewat /extract-stream agar di-puppeteer-extract.
  // - Output di-cache server-side sehingga panggilan kedua untuk URL yang
  //   sama < 1 detik.
  const resolveEmbedToStream = async (url, source) => {
    if (!url) return url;
    const isDirect = url.includes('.mp4') || url.includes('.m3u8') || url.includes('stream-proxy') || url.includes('/proxy/stream');
    if (isDirect) return url;
    if (!url.startsWith('http')) return url;
    // Nekopoi tetap pakai iframe path (sumber khusus).
    if (source === 'nekopoi') return url;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(`${API_BASE_URL}/extract-stream?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const direct = json?.streamUrl;
        if (direct && (direct.includes('.mp4') || direct.includes('.m3u8'))) {
          const proxyBase = `${API_BASE_URL}/proxy/stream?url=`;
          return `${proxyBase}${encodeURIComponent(direct)}`;
        }
      }
    } catch (e) {
      console.warn('resolveEmbedToStream gagal, pakai URL asli', e);
    }
    // Fallback Kurama: lewat stream-proxy supaya Referer/CORS sudah ter-set
    // (player kustom HTML5 <video> butuh same-origin atau CORS header).
    if (source === 'kuramanime') {
      return `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 1. Initial Load of Metadata for default source
  useEffect(() => {
    const loadInitialAnime = async () => {
      setAnime(null);
      setCurrentEpisode(null);
      setStreamUrl("");
      setIsVideoLoading(true);
      setVideoError(null);

      if (id) {
        let fetchId = id;
        try {
          const data = await fetchSourceAnimeDetails(activeSource, fetchId);

          // Auto-fallback ke Kuramanime kalau:
          //   - Otakudesu return null (anime tidak ada di sumber)
          //   - Atau episode list kosong (sering terjadi pada anime baru
          //     seperti "Super no Ura de Yani Suu Futari", "Yuru Camp Movie")
          // Kondisi ini sebelumnya membuat user lihat "video tidak tersedia"
          // padahal anime-nya ada di Kurama dengan ID berbeda.
          const otakuEmpty = !data || ((data.episodeList || data.episodes || []).length === 0);
          if (activeSource === 'otakudesu' && otakuEmpty) {
            try {
              // Pakai title dari URL slug sebagai kueri search.
              const slug = String(fetchId).replace(/-+/g, ' ').replace(/\b(sub indo|episode \d+|batch)\b/gi, '').trim();
              if (slug.length >= 3) {
                // Multi-query fallback: full slug, slug tanpa suffix
                // movie/special/ova/oad/recap, dan slug tanpa suffix season.
                // Tujuan: kalau Kurama tidak punya match untuk "yuru camp movie",
                // coba "yuru camp" lalu filter result ke seasonKey movie.
                const queries = [slug];
                const stripVariant = slug.replace(/\b(movie|gekijouban|special|sp|ova|oad|recap)\b/gi, '').replace(/\s+/g, ' ').trim();
                if (stripVariant && stripVariant !== slug) queries.push(stripVariant);
                const stripSeason = stripVariant.replace(/\b(season|s)\s*\d+\b/gi, '').replace(/\s+/g, ' ').trim();
                if (stripSeason && !queries.includes(stripSeason)) queries.push(stripSeason);

                const wantSeason = seasonKey(slug);

                let best = null;
                let bestScore = 0;
                for (const q of queries) {
                  let res, json;
                  try {
                    res = await fetch(`${API_BASE_URL}/kuramanime/search?q=${encodeURIComponent(q)}`);
                    json = await res.json();
                  } catch { continue; }
                  const list = json?.data?.animeList || [];
                  if (!Array.isArray(list) || list.length === 0) continue;

                  // Filter 1: pilih item dengan seasonKey yang sama dulu.
                  // Untuk movie/special/ova/oad — STRICT (jangan jatuh ke TV).
                  const strict = wantSeason !== '1';
                  let pool = list.filter((it) => seasonKey(it.title) === wantSeason);
                  if (pool.length === 0 && !strict) {
                    pool = list; // untuk wantSeason='1', boleh pakai semua
                  }
                  if (pool.length === 0) continue;

                  for (const it of pool) {
                    const sim = titleSimilarity(slug, it.title || '');
                    // Bonus skor kalau seasonKey persis cocok.
                    const bonus = seasonKey(it.title) === wantSeason ? 0.2 : 0;
                    const score = sim + bonus;
                    if (score > bestScore) {
                      bestScore = score;
                      best = it;
                    }
                  }
                  if (best && bestScore >= 0.5) break;
                }

                if (best?.animeId) {
                  setSourceIds(prev => ({ ...prev, kuramanime: best.animeId }));
                  switchSource('kuramanime', best.animeId);
                  return;
                }
              }
            } catch (e) {
              console.warn('Auto-fallback Kuramanime gagal:', e);
            }
          }

          if (data) {
            let parsedSynopsis = "";
            if (data.synopsis && data.synopsis.paragraphList) {
              parsedSynopsis = data.synopsis.paragraphList.join("\n\n");
            } else if (typeof data.synopsis === "string") {
              parsedSynopsis = data.synopsis;
            }

            const formattedAnime = {
              id: fetchId,
              title: data.title,
              poster: data.poster || data.thumbnail || data.image || "",
              synopsis: parsedSynopsis,
              rating: data.score || 8.5,
              year: data.aired || data.releaseDate || "2026",
              status: data.status || "Ongoing",
              genreList: data.genreList || [],
              // batch (Otakudesu): {batchId, title, otakudesuUrl}. Frontend pakai
              // ini untuk fetch /otakudesu/batch/:batchId saat user klik UNDUH BATCH.
              batch: data.batch || null,
              episodes: (data.episodeList || data.episodes || []).length > 0
                ? (data.episodeList || data.episodes).map(ep => ({
                    id: ep.episodeId || ep.id,
                    number: extractEpisodeNumber(ep),
                    title: ep.title,
                  }))
                : [{ id: fetchId, number: "1", title: data.title }]
            };

            if (formattedAnime.episodes.length > 1) {
              const firstNum = parseInt(formattedAnime.episodes[0].number || "1");
              const lastNum = parseInt(formattedAnime.episodes[formattedAnime.episodes.length - 1].number || "2");
              if (firstNum > lastNum) {
                 formattedAnime.episodes.reverse();
              }
            }
            
            setSourcesCache(prev => ({ ...prev, [activeSource]: formattedAnime }));
            setAnime(formattedAnime);
            
            if (formattedAnime.episodes.length > 0) {
              let selectedEp = formattedAnime.episodes[0];
              const initEpId = searchParams.get('epId');
              if (initEpId) {
                 const found = formattedAnime.episodes.find(ep => ep.id === initEpId);
                 if (found) selectedEp = found;
              }
              setCurrentEpisode(selectedEp);
            }

            resolveAlternativeSources(data.title);
          } else {
            setVideoError(`Gagal mengambil detail anime dari sumber ${activeSource}. Silakan pilih sumber lain.`);
          }
        } catch (e) {
          console.error("loadInitialAnime error:", e);
          setVideoError("Terjadi kesalahan koneksi atau server error.");
        }
      }
    };
    loadInitialAnime();
  }, [id]);

  // Token-based similarity (Jaccard) on lowercased word sets, ditambah bonus
  // bila nomor season cocok. Lebih tahan terhadap permutasi kata, suffix
  // sub indo / ongoing / batch dll dibanding cocokkan substring biasa.
  const seasonNumberFromTitle = (s = '') => {
    const t = String(s).toLowerCase();
    const m = t.match(/season\s*(\d+)|\bs(\d+)\b/);
    return m ? parseInt(m[1] || m[2], 10) : 1;
  };
  const tokenize = (s = '') => String(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/sub(title)?\s*(indo(nesia)?)?/g, ' ')
    .replace(/ongoing|completed|tamat|batch/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  const scoreMatch = (target, candidate) => {
    const a = new Set(tokenize(target));
    const b = new Set(tokenize(candidate));
    if (a.size === 0 || b.size === 0) return 0;
    let intersect = 0;
    a.forEach(t => { if (b.has(t)) intersect += 1; });
    const union = new Set([...a, ...b]).size;
    let score = intersect / union;
    if (seasonNumberFromTitle(target) === seasonNumberFromTitle(candidate)) score += 0.15;
    return score;
  };

  const pickBestMatch = (list, targetTitle, neededEpisodes) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const scored = list.map(item => {
      const t = item.title || '';
      let score = scoreMatch(targetTitle || '', t);
      // Hindari kandidat dengan jumlah episode < yang dibutuhkan (mis. season
      // baru saat user request EP 12 padahal cuma punya 3).
      const epCount = parseInt(String(item.episodes || item.episodeCount || '0')) || 0;
      if (neededEpisodes && epCount && epCount < neededEpisodes) score -= 0.3;
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].score >= 0.25 ? scored[0].item : null;
  };

  const switchSource = async (src, forcedId = null, targetEpisodeNumber = null) => {
    if (src === activeSource) return;
    let srcId = forcedId || sourceIds[src];

    const currentEpNum = targetEpisodeNumber || currentEpisode?.number || "1";

    if (src !== 'otakudesu' && !srcId) {
      try {
        setIsVideoLoading(true);
        showToast(`Mencari anime di ${src}...`);
        let cleanTitle = (anime?.title || "")
          .replace(/\(TV\)/gi, "")
          .replace(/Subtitle Indonesia/gi, "")
          .replace(/Sub Indo/gi, "")
          .replace(/\(.*?\)/g, "")
          .trim();
        // Cari pakai judul utuh (TANPA hapus "Season X") dulu agar dapat
        // varian season yang benar; kalau gagal, fallback ke versi pendek.
        const tryQuery = async (q) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          try {
            const res = await fetch(`${API_BASE_URL}/${src}/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const json = await res.json();
            return json?.data?.animeList || json?.data || [];
          } catch (_) {
            return [];
          }
        };

        let list = await tryQuery(cleanTitle);
        if (!Array.isArray(list) || list.length === 0) {
          const shortQ = cleanTitle.replace(/\s+Season\s*\d*/gi, "").replace(/\s+S\d+/gi, "").trim();
          if (shortQ && shortQ !== cleanTitle) list = await tryQuery(shortQ);
        }

        if (Array.isArray(list) && list.length > 0) {
          const best = pickBestMatch(list, anime?.title, parseInt(currentEpNum));
          srcId = (best || list[0]).animeId;
          setSourceIds(prev => ({ ...prev, [src]: srcId }));
        }
      } catch (e) {
        console.error("Dynamic search fallback failed", e);
      }

      if (!srcId) {
        setIsVideoLoading(false);
        showToast(`Maaf, anime ini tidak ditemukan di sumber ${src}.`);
        return;
      }
    }
    
    setActiveSource(src);
    setIsVideoLoading(true);
    setStreamUrl("");
    setEpisodeDetails(null);
    setCurrentEpisode(null);

    const findMatchingEpisode = (epList) => {
      if (!epList || epList.length === 0) return null;
      const matched = epList.find(ep => parseInt(ep.number) === parseInt(currentEpNum));
      return matched || epList[0];
    };

    if (sourcesCache[src]) {
      setAnime(sourcesCache[src]);
      if (sourcesCache[src].episodes.length > 0) {
        setCurrentEpisode(findMatchingEpisode(sourcesCache[src].episodes));
      } else {
         setIsVideoLoading(false);
      }
      return;
    }

    const data = await fetchSourceAnimeDetails(src, srcId);
    if (data) {
      let parsedSynopsis = "";
      if (data.synopsis && data.synopsis.paragraphList) {
        parsedSynopsis = data.synopsis.paragraphList.join("\n\n");
      } else if (typeof data.synopsis === "string") {
        parsedSynopsis = data.synopsis;
      }
      const formattedAnime = {
        id: srcId,
        title: data.title,
        poster: data.poster || data.thumbnail || data.image || "",
        synopsis: parsedSynopsis || "Tidak ada sinopsis.",
        rating: data.score || data.rating || "8.5",
        year: data.aired || data.releaseDate || "2026",
        status: data.status || "Ongoing",
        genreList: data.genreList || [],
        episodes: (data.episodeList || data.episodes || []).length > 0
          ? (data.episodeList || data.episodes).map(ep => ({
              id: ep.episodeId || ep.id,
              number: extractEpisodeNumber(ep),
              title: ep.title,
            }))
          : [{ id: srcId, number: "1", title: data.title }]
      };
      
      if (formattedAnime.episodes.length > 1) {
        const firstNum = parseInt(formattedAnime.episodes[0].number || "1");
        const lastNum = parseInt(formattedAnime.episodes[formattedAnime.episodes.length - 1].number || "2");
        if (firstNum > lastNum) {
           formattedAnime.episodes.reverse();
        }
      }

      setSourcesCache(prev => ({ ...prev, [src]: formattedAnime }));
      setAnime(formattedAnime);
      if (formattedAnime.episodes.length > 0) {
        setCurrentEpisode(findMatchingEpisode(formattedAnime.episodes));
      }
    } else {
       showToast(`Gagal mengambil data dari ${src}.`);
       setActiveSource('kuramanime');
       setIsVideoLoading(false);
       setAnime(sourcesCache['kuramanime']);
       setCurrentEpisode(sourcesCache['kuramanime']?.episodes[0]);
    }
  };

  // Normalize a title for season-aware comparison so "Yuru Camp S1" never matches "Yuru Camp S3".
  // Key untuk membandingkan apakah dua judul mengacu ke seri yang sama.
  // Movie/Special/OVA/OAD/Recap diperlakukan sebagai key TERPISAH supaya
  // "Yuru Camp Movie" tidak salah cocok ke "Yuru Camp" (TV S1), dan
  // "Isekai Meikyuu de Harem wo Special" tidak ke TV-nya.
  const seasonKey = (t = "") => {
    const lower = t.toLowerCase();
    if (/\bmovie\b|gekijou|gekijouban/.test(lower)) return "movie";
    if (/\bspecial\b|\bsp\b/.test(lower)) return "special";
    if (/\bova\b/.test(lower)) return "ova";
    if (/\boad\b/.test(lower)) return "oad";
    if (/\brecap\b|\bcompile\b|\bcompilation\b/.test(lower)) return "recap";
    const m = lower.match(/(?:season\s*|s)(\d+)/);
    return m ? m[1] : "1"; // default season 1 when unspecified
  };

  // Hitung kemiripan judul setelah normalisasi (lowercase, buang noise umum
  // seperti "subtitle indonesia", tanda baca, dll.). Pakai Jaccard atas token
  // unik supaya "Otonari no Tenshi-sama Episode 5 Sub Indo" cocok dengan
  // "Otonari no Tenshi-sama". Skor 0..1, lebih besar berarti lebih cocok.
  const normalizeForCompare = (t = "") => {
    return String(t)
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/sub(title)?\s*indo(nesia)?/gi, " ")
      .replace(/episode\s*\d+/gi, " ")
      .replace(/\s+s\s*\d+/gi, " ")
      .replace(/season\s*\d+/gi, " ")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const titleSimilarity = (a, b) => {
    const tokensA = new Set(normalizeForCompare(a).split(" ").filter(Boolean));
    const tokensB = new Set(normalizeForCompare(b).split(" ").filter(Boolean));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let common = 0;
    tokensA.forEach((tok) => { if (tokensB.has(tok)) common++; });
    return common / Math.max(tokensA.size, tokensB.size);
  };

  // Override manual: anime yang harus selalu ambil dari Kuramanime karena
  // sumber lain (mis. Otakudesu) bermasalah / nomor episode tidak cocok.
  // - Yuru Camp S1-S3 (TV): ID pasti per season
  // - Heya Camp + Heya Camp Season 2 (spin-off): force Kuramanime tetapi ID
  //   akan di-resolve via search Kuramanime karena kami tidak hardcode-nya.
  const MANUAL_KURAMANIME = (titleRaw) => {
    const t = (titleRaw || "").toLowerCase().replace(/[△\s]+/g, " ").trim();
    if (t.includes("yuru camp")) {
      // Yuru Camp Movie — ID khusus di Kurama (dari /kuramanime/anime/yuru-camp-movie).
      if (/\bmovie\b/.test(t) || t.includes("gekijou")) return "1570/yuru-camp-movie";
      const s = seasonKey(titleRaw);
      if (s === "3") return "2669/yuru-camp-season-3";
      if (s === "2") return "3601/yuru-camp-season-2";
      return "3603/yuru-camp"; // Season 1 / default
    }
    return null;
  };

  // Title yang harus PAKAI Kuramanime walaupun ID-nya belum diketahui —
  // resolveAlternativeSources akan search Kuramanime lalu switch.
  // Termasuk anime varian (Movie/Special/OVA) yang sumber lain sering
  // mismatch ke TV-series-nya.
  const SHOULD_FORCE_KURAMANIME = (titleRaw) => {
    const t = (titleRaw || "").toLowerCase().replace(/[△\s]+/g, " ").trim();
    if (t.includes("heya camp")) return true;
    if (/yuru\s*camp.*\bmovie\b/.test(t)) return true; // Yuru Camp Movie
    if (/isekai\s*meikyuu.*harem.*\bspecial\b/.test(t)) return true;
    // Super no Ura de Yani Suu Futari — anime tahun 2026 yang belum ada di
    // Otakudesu, hanya tersedia di Kurama.
    if (/super.*ura.*yani.*suu.*futari|yani\s*suu\s*futari/.test(t)) return true;
    // Generalisasi: tag varian standalone (Special/OVA/OAD) sering hilang
    // di sumber lain → paksa Kurama agar episode listnya cocok.
    if (/\b(special|ova|oad|recap)\b/.test(t)) return true;
    return false;
  };

  const resolveAlternativeSources = async (title) => {
    if (activeSource === 'nekopoi') return;
    // Kalau sudah di Kurama, tidak perlu force-switch lagi — judul saat ini
    // memang sudah datang dari Kurama. Sebelumnya kita selalu search ulang
    // dan kadang switch ke result yang tidak cocok (mis. Heya Camp →
    // berakhir di anime lain karena seasonKey filter terlalu ketat).
    if (activeSource === 'kuramanime') return;

    // Cek override manual lebih dulu (mis. Yuru Camp S1-S3 + Movie -> Kuramanime).
    const forcedKuramanimeId = MANUAL_KURAMANIME(title);
    if (forcedKuramanimeId) {
      setSourceIds(prev => ({ ...prev, kuramanime: forcedKuramanimeId }));
      if (activeSource !== 'kuramanime' || sourceIds.kuramanime !== forcedKuramanimeId) {
        switchSource('kuramanime', forcedKuramanimeId);
      }
      return;
    }

    // Force Kuramanime list (mis. Heya Camp / Yuru Camp Movie / Yani Suu
    // Futari). Cari di Kurama dengan beberapa variasi query supaya hit-rate
    // tinggi; kalau ketemu, langsung switch source ke Kurama.
    if (SHOULD_FORCE_KURAMANIME(title)) {
      const queries = [];
      queries.push(title);
      // Variasi 2: title tanpa suffix Movie/Special/OVA/Recap — sering
      // judul di Kurama tertulis "Yuru Camp△ Movie" tetapi searching tanpa
      // "Movie" tetap kembali daftar berisi varian movie.
      const stripped = title.replace(/\b(movie|gekijouban|special|sp|ova|oad|recap)\b/gi, '').replace(/\s+/g, ' ').trim();
      if (stripped && stripped.toLowerCase() !== title.toLowerCase()) queries.push(stripped);
      const wantSeason = seasonKey(title);
      let best = null;
      let bestScore = 0;
      for (const q of queries) {
        try {
          const res = await fetch(`${API_BASE_URL}/kuramanime/search?q=${encodeURIComponent(q)}`);
          const json = await res.json();
          const list = json?.data?.animeList || [];
          if (!Array.isArray(list) || list.length === 0) continue;
          // 1) Cari yang seasonKey-nya cocok (movie ↔ movie, dst).
          for (const item of list) {
            if (seasonKey(item.title) !== wantSeason) continue;
            const sim = titleSimilarity(title, item.title);
            if (sim > bestScore) { bestScore = sim; best = item; }
          }
          if (best) break;
          // 2) Kalau tidak ada exact season, pilih kandidat dengan judul
          //    paling mirip (substring/Jaccard tertinggi), bukan list[0]
          //    asal-asalan.
          for (const item of list) {
            const sim = titleSimilarity(title, item.title);
            if (sim > bestScore) { bestScore = sim; best = item; }
          }
          if (best && bestScore >= 0.5) break;
        } catch (e) {
          console.warn('Forced Kuramanime lookup failed:', e);
        }
      }
      if (best?.animeId) {
        setSourceIds(prev => ({ ...prev, kuramanime: best.animeId }));
        switchSource('kuramanime', best.animeId);
        return;
      }
    }

    // Keep the full title (with season) so matching stays season-accurate.
    const cleanTitle = title
      .replace(/\(TV\)/gi, "")
      .replace(/Subtitle Indonesia/gi, "")
      .replace(/Sub Indo/gi, "")
      .trim();
    try {
      // Populate backup source ID (otakudesu) dari aggregate result.
      const results = await searchAnimeAggregate(cleanTitle);
      if (Array.isArray(results) && results.length > 0 && results[0].sourceIds) {
        setSourceIds(prev => ({ ...prev, ...results[0].sourceIds }));
      }

      // PENTING: Hanya populasi sourceIds.kuramanime untuk fitur switch manual,
      // JANGAN auto-switch. Sebelumnya kalau user klik anime dengan tag Otaku,
      // kode ini langsung mem-switch ke Kuramanime karena kebetulan ketemu.
      // Sekarang sumber yang dipilih user (activeSource) selalu dihormati.
      if (activeSource !== 'kuramanime' && !sourceIds.kuramanime) {
        try {
          const res = await fetch(`${API_BASE_URL}/kuramanime/search?q=${encodeURIComponent(cleanTitle)}`);
          const json = await res.json();
          const list = json?.data?.animeList || [];
          if (Array.isArray(list) && list.length > 0) {
            const wantSeason = seasonKey(title);
            const SIMILARITY_THRESHOLD = 0.55;
            let best = null;
            let bestScore = 0;
            for (const item of list) {
              if (seasonKey(item.title) !== wantSeason) continue;
              const sim = titleSimilarity(title, item.title);
              const lowA = normalizeForCompare(title);
              const lowB = normalizeForCompare(item.title);
              const substr = lowA && lowB && (lowA.includes(lowB) || lowB.includes(lowA));
              const score = substr ? Math.max(sim, 0.7) : sim;
              if (score > bestScore) {
                bestScore = score;
                best = item;
              }
            }
            if (best && bestScore >= SIMILARITY_THRESHOLD && best.animeId) {
              setSourceIds(prev => ({ ...prev, kuramanime: best.animeId }));
            }
          }
        } catch (e) {
          console.warn('Kuramanime alt-source lookup failed:', e);
        }
      }
    } catch (e) {
      console.error("Failed to resolve alternative sources:", e);
    }
  };
  // Check Bookmark Status on Load
  useEffect(() => {
    if (anime) {
      try {
        const userId = getCurrentUserId();
        const suffix = activeSource === 'nekopoi' ? 'khusus' : 'umum';
        const storageKey = `mahistream_bookmarks_${suffix}_${userId}`;
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        setIsBookmarked(saved.some(b => b.id === anime.id));
      } catch (e) {
        console.error("Bookmark parse error", e);
      }
    }
  }, [anime, activeSource]);

  const toggleBookmark = () => {
    if (!anime) return;
    try {
      const userId = getCurrentUserId();
      const suffix = activeSource === 'nekopoi' ? 'khusus' : 'umum';
      const storageKey = `mahistream_bookmarks_${suffix}_${userId}`;
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (isBookmarked) {
        const newSaved = saved.filter(b => b.id !== anime.id);
        localStorage.setItem(storageKey, JSON.stringify(newSaved));
        setIsBookmarked(false);
        showToast("Bookmark seri dihapus");
      } else {
        saved.push({ id: anime.id, title: anime.title, posterUrl: anime.poster || '', source: activeSource });
        localStorage.setItem(storageKey, JSON.stringify(saved));
        setIsBookmarked(true);
        showToast("Seri berhasil disimpan");
      }
    } catch (e) {
      console.error("Bookmark save error", e);
    }
  };

  // Check Video Bookmark status
  useEffect(() => {
    if (currentEpisode) {
      const saved = JSON.parse(localStorage.getItem('mahistream_video_bookmarks') || '[]');
      setIsVideoBookmarked(saved.some(b => b.id === currentEpisode.id));
    }
  }, [currentEpisode]);

  const toggleVideoBookmark = () => {
    if (!currentEpisode || !anime) return;
    const saved = JSON.parse(localStorage.getItem('mahistream_video_bookmarks') || '[]');
    if (isVideoBookmarked) {
      const newSaved = saved.filter(b => b.id !== currentEpisode.id);
      localStorage.setItem('mahistream_video_bookmarks', JSON.stringify(newSaved));
      setIsVideoBookmarked(false);
      showToast("Bookmark video dihapus");
    } else {
      saved.push({
        id: currentEpisode.id,
        animeId: anime.id,
        animeTitle: anime.title,
        episodeTitle: currentEpisode.title,
        posterUrl: anime.poster || "",
        source: activeSource
      });
      localStorage.setItem('mahistream_video_bookmarks', JSON.stringify(saved));
      setIsVideoBookmarked(true);
      showToast("Video berhasil disimpan");
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // 2. Fetch Video Stream URL when Episode Changes
  useEffect(() => {
    if (!currentEpisode || !anime) return;

    // Reset skip states for new episode
    setIntroSkipped(false);
    setOutroSkipped(false);
    setSkipIntroDismissed(false);

    // Only save history if started watching
    if (hasStartedPlaying) {
      const userId = getCurrentUserId();
      saveHistory(userId, {
        id: anime.id,
        title: anime.title,
        poster: anime.poster || "",
        episode: currentEpisode.number || (currentEpisode.title?.match(/\d+/) || ['1'])[0],
        source: activeSource,
        progressSeconds: initialTimeRef.current
      });
    }

    const loadVideo = async () => {
      setIsVideoLoading(true);
      setPlaying(false);
      try {
        let resultDetails = null;
        const data = await fetchSourceEpisodeDetails(activeSource, currentEpisode.id);
        if (data) {
          resultDetails = data;
        }
        
        if (resultDetails) {
          if (activeSource === 'nekopoi' && resultDetails.streamLinks) resultDetails.serverList = resultDetails.streamLinks.map(s => ({ title: s.serverName || 'Nekopoi Player', serverId: s.serverId }));
          setEpisodeDetails(resultDetails);
          
          let finalStreamUrl = "";
          let defaultServer = null;

          if (activeSource === 'otakudesu') {
            const serverQualities = resultDetails.server?.qualityList || [];
            // Utamakan resolusi tertinggi yang tersedia (mis. 1080p > 720p > 480p).
            let matchedQuality = pickHighest(serverQualities, q => q.title || q.quality || '');

            if (matchedQuality && matchedQuality.serverList?.length > 0) {
              const preferredNames = ['desustream', 'pdrain', 'filedon', 'otakuwatch', 'yourupload'];
              for (const pref of preferredNames) {
                 const found = matchedQuality.serverList.find(s => s.title.toLowerCase().includes(pref));
                 if (found) {
                    defaultServer = found;
                    break;
                 }
              }
              if (!defaultServer) {
                 defaultServer = matchedQuality.serverList[0];
              }
              setActiveResolution(matchedQuality.quality || matchedQuality.title || activeResolution || '720p');
            }
          } else if (activeSource === 'kuramanime') {
             if (resultDetails.serverList?.length > 0) {
                // Utamakan resolusi tertinggi yang tersedia (Kuramanime biasanya 1080p).
                defaultServer = pickHighest(resultDetails.serverList, s => s.title || '') || resultDetails.serverList[0];
                setActiveResolution(defaultServer.title || '1080p');
             } else if (resultDetails.defaultStreamingUrl) {
                finalStreamUrl = `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(resultDetails.defaultStreamingUrl)}`;
                setActiveResolution('1080p');
             } else {
                // Movie / OVA di Kuramanime kadang tidak balikkan serverList maupun
                // defaultStreamingUrl di endpoint details — hanya `streamingUrls`/
                // `videoUrl`/`url` di body. Coba field-field tersebut sebelum
                // declare gagal.
                const alt = resultDetails.streamingUrls
                  || resultDetails.streamLinks
                  || resultDetails.videoUrl
                  || resultDetails.url;
                if (Array.isArray(alt) && alt.length > 0 && alt[0]?.url) {
                  finalStreamUrl = `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(alt[0].url)}`;
                  setActiveResolution(alt[0].quality || alt[0].title || '1080p');
                } else if (typeof alt === 'string' && alt) {
                  finalStreamUrl = `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(alt)}`;
                  setActiveResolution('1080p');
                } else {
                  // Last resort: panggil fetchSourceStreamUrl dengan episode ID
                  // sebagai serverId. Backend kuramanime/stream/:id menerima
                  // episode ID langsung dan extract stream-nya untuk kasus
                  // movie yang structure detailnya tidak standar.
                  try {
                    const direct = await fetchSourceStreamUrl('kuramanime', currentEpisode.id);
                    if (direct) {
                      finalStreamUrl = direct;
                      setActiveResolution('1080p');
                    }
                  } catch (e) {
                    console.warn('Kuramanime direct stream fallback failed:', e);
                  }
                }
             }
          } else if (activeSource === 'nekopoi') {
             // Player utama Nekopoi sekarang adalah iframe ad-stripped dari backend
             // (/nekopoi/iframe-proxy). Ekstraksi Puppeteer tidak dapat diandalkan,
             // jadi cukup pilih server prioritas teratas (720p > vidnest > generik
             // > streamruby/streampoi) dan biarkan getIframeUrl() yang menyalurkan.
             const servers = orderNekopoiServers(resultDetails.serverList || []);
             if (servers.length === 0) {
               setVideoError('Tidak ada server Nekopoi tersedia.');
             } else {
               const chosen = servers[0];
               const label = `${chosen.serverName || ''} ${chosen.title || ''} ${chosen.quality || ''} ${chosen.serverId || ''}`.toLowerCase();
               let detectedQuality = 'Auto';
               if (label.includes('720p') || label.includes('720 p')) detectedQuality = '720p';
               else if (label.includes('1080p')) detectedQuality = '1080p';
               else if (label.includes('480p')) detectedQuality = '480p';
               else if (label.includes('360p')) detectedQuality = '360p';
               setActiveResolution(detectedQuality);
               setActiveServerId(chosen.serverId);
               finalStreamUrl = chosen.serverId; // URL embed; iframe path akan mem-proxy
             }
          }
          
          if (defaultServer && !finalStreamUrl) {
             let resolvedUrl = await fetchSourceStreamUrl(activeSource, defaultServer.serverId);
             if (resolvedUrl) {
                 finalStreamUrl = resolvedUrl;
             } else {
                 finalStreamUrl = resultDetails.defaultStreamingUrl || "";
             }
             setActiveResolution(defaultServer.title || defaultServer.serverId);
             setActiveServerId(defaultServer.serverId);
          } else if (resultDetails.defaultStreamingUrl && !finalStreamUrl) {
             finalStreamUrl = resultDetails.defaultStreamingUrl;
          }

          // Paksa semua sumber ke player kustom: ekstrak embed jadi stream langsung.
          if (activeSource !== 'nekopoi') {
            finalStreamUrl = await resolveEmbedToStream(finalStreamUrl, activeSource);
          }

          setStreamUrl(finalStreamUrl);
        } else {
          setVideoError("Maaf, link streaming tidak tersedia.");
        }
      } catch(e) {
        console.error(e);
        setVideoError("Gagal memuat detail episode.");
      } finally {
        setIsVideoLoading(false);
      }
    };
    
    loadVideo();
  }, [currentEpisode]);

  const handleServerChange = async (server) => {
    if (!server || !server.serverId || activeServerId === server.serverId) return;
    setIsVideoLoading(true);
    setVideoError(null);
    setPlaying(false);
    setActiveServerId(server.serverId);
    setActiveResolution(server.title || server.serverId);
    
    try {
      // Nekopoi: langsung gunakan URL embed; getIframeUrl() yang akan
      // menyalurkan via /nekopoi/iframe-proxy (ad-stripped) ke <iframe>.
      if (activeSource === 'nekopoi') {
        setStreamUrl(server.serverId);
        setIsVideoLoading(false);
        return;
      }
      let resolvedUrl = await fetchSourceStreamUrl(activeSource, server.serverId);
      if (resolvedUrl) {
          // Paksa ke player kustom: ekstrak embed jadi stream langsung bila perlu.
          resolvedUrl = await resolveEmbedToStream(resolvedUrl, activeSource);
          setStreamUrl(resolvedUrl);
      } else {
          setVideoError("Gagal mendapatkan link streaming dari server ini.");
      }
    } catch (e) {
      setVideoError("Error saat menghubungi server stream.");
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleResolutionChange = async (resolution) => {
    setShowResolutionMenu(false);

    if (activeSource === 'nekopoi') {
      setActiveResolution(resolution);
      return;
    }

    const currentEpNum = currentEpisode?.number || "1";

    // 4K / 1080p → Kuramanime (jika tersedia). Jika resolusi 4K diminta
    // tapi sumber tidak punya, tetap pakai resolusi tersebut sebagai label
    // (player akan pakai bitrate tertinggi yang tersedia).
    if (resolution === '4K' || resolution === '2160p' || resolution === '1080p') {
      if (activeSource !== 'kuramanime') {
        showToast(`Beralih ke Kuramanime untuk ${resolution}...`);
        await switchSource('kuramanime', null, currentEpNum);
      }
      setActiveResolution(resolution);
      return;
    }

    // 360p, 480p, 720p → prefer Otakudesu kalau ID-nya ada.
    const otakuSourceId = sourceIds['otakudesu'];
    if (otakuSourceId || activeSource === 'otakudesu') {
      if (activeSource !== 'otakudesu') {
        showToast(`Beralih ke Otakudesu untuk ${resolution}...`);
        await switchSource('otakudesu', null, currentEpNum);
      }
      setActiveResolution(resolution);
    } else {
      showToast(`Otakudesu tidak tersedia, memutar ${resolution} di Kuramanime...`);
      if (activeSource !== 'kuramanime') {
        await switchSource('kuramanime', null, currentEpNum);
      }
      setActiveResolution(resolution);
    }
  };

  const handleSeekMouseDown = () => setSeeking(true);

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '00:00';
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh) {
      return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  const toggleFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await playerContainerRef.current.requestFullscreen();
        if (Capacitor.isNativePlatform()) {
          await ScreenOrientation.lock({ orientation: 'landscape' });
        } else if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
          window.screen.orientation.lock('landscape').catch(err => {
            console.warn("Fullscreen orientation lock failed", err);
          });
        }
      } else {
        await document.exitFullscreen();
        if (Capacitor.isNativePlatform()) {
          await ScreenOrientation.lock({ orientation: 'portrait' });
          await ScreenOrientation.unlock();
        } else if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
          window.screen.orientation.unlock();
        }
      }
    } catch (err) {
      console.error(`Error attempting to toggle fullscreen: ${err.message}`);
    }
  };

  const handleVideoError = async (e) => {
    console.warn("Video failed to load.");
    const err = e?.target?.error;
    const code = err?.code;
    const message = err?.message || '';
    const isDemuxer = /DEMUXER|DECODER|PIPELINE/i.test(message);

    // Nekopoi: stream berhasil diekstrak tetapi CDN menolak pemutaran (mis. token
    // streamruby dikunci ke sesi embed -> 403, atau host CDN tak terjangkau -> 500).
    // CADANGAN TERAKHIR: putar embed situs lewat iframe pakai URL embed (activeServerId).
    // Hanya untuk Nekopoi (sumber khusus); Kurama/Otaku tetap pakai player kustom.
    if (
      activeSource === 'nekopoi' &&
      activeServerId &&
      activeServerId.startsWith('http') &&
      streamUrl !== activeServerId
    ) {
      console.warn("Nekopoi custom stream gagal diputar, fallback ke iframe embed.");
      showToast("Beralih ke pemutar situs...");
      setStreamUrl(activeServerId);
      return;
    }

    // Kuramanime / Otakudesu: error decoder DEMUXER_ERROR_COULD_NOT_OPEN
    // hampir selalu berarti URL stream sudah expire (token Kuramanime
    // lifetime pendek, ~10 menit) atau response berisi HTML bukan video.
    // Recovery WAJIB tetap di player kustom (sesuai permintaan user) —
    // tidak boleh fallback iframe. Strategi:
    //   1. Re-resolve stream URL via fetchSourceStreamUrl untuk server saat
    //      ini (token baru).
    //   2. Kalau itu sudah pernah dicoba (re-resolved=true), pindah ke
    //      server lain di episodeDetails.serverList dan re-resolve.
    //   3. Kalau semua habis, tampilkan UI error dengan tombol Muat Ulang
    //      Stream (memicu loadVideo ulang dari scratch).
    if ((activeSource === 'kuramanime' || activeSource === 'otakudesu') && isDemuxer) {
      const triedFresh = streamUrl?.includes('__rt=1');
      // Step 1: re-fetch fresh stream URL untuk activeServerId.
      if (!triedFresh && activeServerId) {
        try {
          showToast('Memperbarui link stream...');
          let fresh = await fetchSourceStreamUrl(activeSource, activeServerId);
          if (fresh) {
            fresh = await resolveEmbedToStream(fresh, activeSource);
            // Tambahkan marker query supaya kita tahu sudah retry.
            const sep = fresh.includes('?') ? '&' : '?';
            setStreamUrl(`${fresh}${sep}__rt=1&__ts=${Date.now()}`);
            return;
          }
        } catch (e1) {
          console.warn('Re-resolve stream URL gagal:', e1);
        }
      }
      // Step 2: server lain.
      if (episodeDetails?.serverList?.length > 1) {
        const remaining = episodeDetails.serverList.filter((s) => s.serverId !== activeServerId);
        if (remaining.length > 0) {
          const nextServer = remaining[0];
          console.warn(`DEMUXER error, beralih ke server: ${nextServer.title || nextServer.serverId}`);
          showToast(`Beralih ke ${nextServer.title || 'server lain'}...`);
          await handleServerChange(nextServer);
          return;
        }
      }
      // Step 3: tampilkan UI error (handler "Coba Lagi" akan trigger
      // loadVideo ulang dengan men-toggle currentEpisode).
      setVideoError('Tidak ada server stabil saat ini. Coba muat ulang atau pilih resolusi lain.');
      return;
    }

    if (err) {
      const friendly = isDemuxer
        ? 'Format video tidak bisa diputar. Coba pilih server atau resolusi lain.'
        : `Video Error Code: ${code}, Message: ${message}`;
      setVideoError(friendly);
    } else {
      setVideoError("Unknown Video Error");
    }
  };

  const onLoadedMetadata = (e) => {
    const dur = e.target.duration;
    setDuration(dur);
    
    // Seek to saved elapsed progress
    const t = parseInt(searchParams.get('t') || '0');
    if (t > 0 && t < dur) {
      e.target.currentTime = t;
      setCurrentTime(t);
      setPlayed(t / dur);
      showToast(`Melanjutkan di ${formatTime(t)}`);
    }
  };

  // Susun daftar opsi download dari semua sumber, urut dari resolusi tertinggi
  // ke terendah supaya user (atau auto-pick) langsung dapat kualitas terbaik.
  const collectDownloadOptions = () => {
    const opts = [];
    if (!episodeDetails) return opts;
    const qualityList = episodeDetails.download?.qualityList || [];
    qualityList.forEach((q) => {
      (q.urlList || []).forEach((u) => {
        if (u.url) opts.push({ quality: q.title || q.quality || '?', host: u.title || 'Server', url: u.url });
      });
    });
    (episodeDetails.download?.formatList || []).forEach((fmt) => {
      (fmt.qualityList || []).forEach((q) => {
        (q.urlList || []).forEach((u) => {
          if (u.url) opts.push({ quality: q.title || '?', host: u.title || fmt.title || 'Server', url: u.url });
        });
      });
    });
    (episodeDetails.downloadLinks || []).forEach((dl) => {
      (dl.links || []).forEach((u) => {
        if (u.url) opts.push({ quality: dl.quality || '?', host: u.host || 'Server', url: u.url });
      });
    });
    // Urutkan dari resolusi tertinggi ke terendah berdasar angka di label.
    opts.sort((a, b) => resolutionScore(b.quality) - resolutionScore(a.quality));
    return opts;
  };

  // Kelompokkan opsi download per resolusi standar (4K, 1080p, 720p, 480p, 360p)
  // agar UI modal bisa menampilkan satu tombol per resolusi (klik = mulai
  // unduh host pertama yang tersedia). Resolusi yang tidak ada hostnya tidak
  // dimunculkan (mis. anime cuma sampai 720p tidak akan tampil 4K/1080p).
  const groupDownloadByResolution = () => {
    const opts = collectDownloadOptions();
    const labels = ['4k', '2160p', '1080p', '720p', '480p', '360p', '240p'];
    const display = {
      '4k': '4K', '2160p': '4K',
      '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p', '240p': '240p',
    };
    const buckets = new Map();
    for (const o of opts) {
      const q = String(o.quality || '').toLowerCase();
      const matched = labels.find((l) => q.includes(l));
      if (!matched) continue;
      const key = display[matched];
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    // Urutan tampilan: 4K dulu (kalau ada), lalu 1080p → 360p
    const order = ['4K', '1080p', '720p', '480p', '360p', '240p'];
    return order
      .filter((k) => buckets.has(k))
      .map((k) => ({ resolution: k, hosts: buckets.get(k) }));
  };

  // Daftar resolusi yang BENAR-BENAR tersedia di episode aktif, untuk
  // dipakai di bottom-sheet pemilih resolusi (tidak hardcoded). Diambil
  // dari semua quality download/server, dipetakan ke label standar
  // 4K/1080p/720p/480p/360p/240p, lalu deduplikasi.
  const availableResolutions = (() => {
    const opts = collectDownloadOptions();
    const labelMap = [
      { needle: ['2160p', '4k'], display: '4K' },
      { needle: ['1080p'], display: '1080p' },
      { needle: ['720p'], display: '720p' },
      { needle: ['480p'], display: '480p' },
      { needle: ['360p'], display: '360p' },
      { needle: ['240p'], display: '240p' },
    ];
    const seen = new Set();
    const out = [];
    for (const o of opts) {
      const q = String(o.quality || '').toLowerCase();
      for (const m of labelMap) {
        if (m.needle.some((n) => q.includes(n)) && !seen.has(m.display)) {
          seen.add(m.display);
          out.push(m.display);
          break;
        }
      }
    }
    // Tambahkan server-side qualityList kalau ada (server stream, bukan download).
    (episodeDetails?.server?.qualityList || []).forEach((q) => {
      const label = String(q.title || q.quality || '').toLowerCase();
      for (const m of labelMap) {
        if (m.needle.some((n) => label.includes(n)) && !seen.has(m.display)) {
          seen.add(m.display);
          out.push(m.display);
          break;
        }
      }
    });
    // Urutan: 4K → 240p
    const order = ['4K', '1080p', '720p', '480p', '360p', '240p'];
    return order.filter((r) => seen.has(r));
  })();

  const handleDownloadEpisode = () => {
    // Selalu buka modal — kalau episodeDetails belum siap, modal akan
    // tampilkan empty state dan refresh otomatis saat data datang. Lebih
    // baik daripada toast "Gagal memuat" yang bikin user mengira tombol mati.
    setShowDownloadModal(true);
  };

  // Buka modal UNDUH BATCH (full series). Hanya support otakudesu untuk
  // sekarang — sumber lain belum punya endpoint /batch/{batchId}. Endpoint
  // /otakudesu/anime/{id} mengembalikan `batch: { batchId }` kalau anime
  // punya batch. Kita fetch detailnya supaya user dapat list resolusi
  // batch lengkap (zip per kualitas).
  const handleDownloadBatch = async () => {
    setShowBatchModal(true);
    if (batchOptions !== null) return; // sudah pernah fetch
    setBatchLoading(true);
    try {
      // anime?.batch adalah hasil parseAnimeDetails Otakudesu (kalau ada).
      const batchId = anime?.batch?.batchId || sourceIds?.otakudesu?.replace(/^anime\//, '');
      if (activeSource !== 'otakudesu' && !sourceIds?.otakudesu) {
        setBatchOptions([]);
        return;
      }
      const useBatchId = anime?.batch?.batchId;
      if (!useBatchId) {
        setBatchOptions([]);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/otakudesu/batch/${encodeURIComponent(useBatchId)}`);
      if (!res.ok) { setBatchOptions([]); return; }
      const json = await res.json();
      const fmtList = json?.data?.details?.download?.formatList || [];
      const opts = [];
      fmtList.forEach((fmt) => {
        (fmt.qualityList || []).forEach((q) => {
          (q.urlList || []).forEach((u) => {
            if (u.url) opts.push({
              quality: q.title || '?',
              host: u.title || fmt.title || 'Server',
              url: u.url,
              size: q.size || '',
            });
          });
        });
      });
      opts.sort((a, b) => resolutionScore(b.quality) - resolutionScore(a.quality));
      setBatchOptions(opts);
    } catch (e) {
      console.warn('handleDownloadBatch failed', e);
      setBatchOptions([]);
    } finally {
      setBatchLoading(false);
    }
  };

  // Trigger download di latar belakang via downloadManager (Capacitor
  // Filesystem + LocalNotifications di Android, blob anchor di web). Tidak
  // membuka tab/browser baru — file ditulis langsung ke folder Download
  // device dan progress muncul di notifikasi sistem.
  const startBackgroundDownload = (urlOrList, quality) => {
    // Accept single URL string or array of mirror URLs (sorted by priority).
    // FILTER PENTING: banyak entry di Kurama downloadLinks adalah HTML
    // landing page (kuramadrive.com, doodrive, qiwi, mega, mirrorace) atau
    // Nekopoi ouo.io ad-shortener — bukan direct MP4. Saring keluar dulu,
    // lalu pakai defaultStreamingUrl (yang dipakai player) sebagai fallback.
    const isLandingPage = (u) => {
      if (!u || typeof u !== 'string') return true;
      const low = u.toLowerCase();
      return (
        low.includes('kuramadrive.com') ||
        low.includes('doodrive') ||
        low.includes('qiwi.gg') ||
        low.includes('mega.nz') ||
        low.includes('mediafire') ||
        low.includes('mirrorace') ||
        low.includes('ouo.io') ||
        low.includes('safelinkconverter') ||
        low.includes('linkfor.us') ||
        low.includes('linkkutu') ||
        low.includes('linkpoi')
      );
    };

    // Ekstrak raw URL dari currentStreamUrl (kalau dia /proxy/stream?url=...)
    const extractRaw = (u) => {
      if (!u) return null;
      try {
        const idx = u.indexOf('proxy/stream?url=');
        if (idx >= 0) {
          const enc = u.slice(idx + 'proxy/stream?url='.length).split('&')[0];
          return decodeURIComponent(enc);
        }
        const idx2 = u.indexOf('kuramanime/stream-proxy?url=');
        if (idx2 >= 0) {
          const enc = u.slice(idx2 + 'kuramanime/stream-proxy?url='.length).split('&')[0];
          return decodeURIComponent(enc);
        }
      } catch {}
      return u;
    };

    const rawCandidates = Array.isArray(urlOrList) ? urlOrList : [urlOrList];
    // Filter ke direct CDN dulu
    let urls = rawCandidates.filter(Boolean).filter((u) => !isLandingPage(u));

    // Tambahkan defaultStreamingUrl / streamUrl aktif sebagai fallback
    // terakhir (kemungkinan besar ini direct MP4 yang dipakai player)
    const streamRaw = extractRaw(streamUrl);
    if (streamRaw && !isLandingPage(streamRaw) && !urls.includes(streamRaw)) {
      urls.push(streamRaw);
    }
    const defaultRaw = anime?.defaultStreamingUrl;
    if (defaultRaw && !isLandingPage(defaultRaw) && !urls.includes(defaultRaw)) {
      urls.push(defaultRaw);
    }

    if (urls.length === 0) {
      showToast("Link download tidak kompatibel (HTML landing). Coba server lain.");
      return;
    }
    try {
      startBackgroundDownloadNative({
        animeTitle: anime?.title || 'Anime',
        episode: currentEpisode?.number || '?',
        resolution: quality || 'auto',
        url: urls[0],
        urls,
      });
      setDownloadStartedToast({
        title: anime?.title || 'Anime',
        episode: currentEpisode?.number || '?',
        resolution: quality || 'auto',
      });
      setTimeout(() => setDownloadStartedToast(null), 3500);
    } catch (e) {
      console.error('startBackgroundDownload failed', e);
      showToast('Gagal memulai unduhan');
    }
    setShowDownloadModal(false);
  };

  useEffect(() => {
    let hls = null;
    if (playerRef.current && streamUrl) {
      const isM3u8 = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8');
      
      if (isM3u8 && Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(playerRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
           console.log("HLS Manifest parsed");
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
           if (data.fatal) {
              switch(data.type) {
                 case Hls.ErrorTypes.NETWORK_ERROR:
                   hls.startLoad();
                   break;
                 case Hls.ErrorTypes.MEDIA_ERROR:
                   hls.recoverMediaError();
                   break;
                 default:
                   hls.destroy();
                   break;
              }
           }
        });
      }
    }
    
    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [streamUrl]);

  if (videoError && !anime) {
    return (
      <div className="cr-container min-h-screen flex flex-col items-center justify-center gap-4 bg-[#fdf8f1] p-6 text-center">
         <CloudOff size={48} className="text-red-500" />
         <p className="text-red-500 text-sm font-bold">{videoError}</p>
         <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md hover:bg-primary-dark transition active:scale-95">
           Coba Lagi / Refresh
         </button>
      </div>
    );
  }

  if (!anime || !currentEpisode) {
    return (
      <div className="cr-container min-h-screen flex flex-col items-center justify-center gap-4 bg-[#fdf8f1]">
         <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
         <p className="text-zinc-500 text-xs font-semibold tracking-widest uppercase">Mempersiapkan Stream...</p>
      </div>
    );
  }

  // --- R4. DETAIL VIEW ANIME ---
  // Label sumber yang ditampilkan di badge. Untuk judul yang dipaksa Kuramanime
  // (mis. Yuru Camp S1-S3) tampilkan "kuramanime" sejak awal, tanpa kedipan "otakudesu"
  // selama proses switch sumber berjalan di latar.
  const displaySource = MANUAL_KURAMANIME(anime?.title) ? 'kuramanime' : activeSource;

  if (!hasStartedPlaying) {
    // Sort episodes according to preference
    const sortedEpisodes = [...anime.episodes];
    if (episodeSort === 'desc') {
      sortedEpisodes.reverse();
    }

    const isOngoing = anime.status?.toLowerCase().includes("ongoing");

    return (
      <div className="pb-24 bg-[#fafafa] text-[#18181b]">
        {/* Detail Hero Section */}
        <div 
          className="w-full relative overflow-hidden flex flex-col justify-end"
          style={{ 
            height: '55vh',
            minHeight: '380px',
            backgroundImage: `linear-gradient(to top, rgba(250, 250, 250, 1) 0%, rgba(250, 250, 250, 0.4) 60%, rgba(0, 0, 0, 0.6) 100%), url(${anime.poster})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top'
          }}
        >
          {/* Top Actions Floating bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 bg-black/40 hover:bg-black/70 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all border border-white/15 active:scale-95"
            >
              <ArrowLeft size={22} />
            </button>

            <button
              data-testid="anime-bookmark-toggle-btn"
              onClick={toggleBookmark}
              className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all border active:scale-95 ${
                isBookmarked
                  ? 'bg-primary text-white border-primary shadow-lg shadow-primary/40'
                  : 'bg-black/40 hover:bg-black/70 text-white border-white/15'
              }`}
            >
              <Bookmark size={22} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="cr-container relative z-10 pb-6 px-4">
            <div className="flex gap-2 mb-3 flex-wrap">
              {anime.genreList?.slice(0, 3).map((g, idx) => (
                <span key={idx} className="px-2.5 py-1 bg-primary/10 text-primary border border-primary/25 rounded-md text-[10px] font-black uppercase tracking-wider">
                  {typeof g === 'object' ? g.title : g}
                </span>
              ))}
            </div>
            <h1 data-testid="anime-detail-title" className="text-2xl md:text-4xl font-black text-text mb-3 leading-tight tracking-tight">
              {anime.title}
            </h1>

            <div className="flex items-center gap-2 text-[12px] font-bold text-text-secondary mb-6 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/30">
                <Star size={12} className="fill-current" /> {anime.rating}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-surface border border-border">
                {anime.year}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/25 uppercase tracking-wider text-[10px]">
                {displaySource}
              </span>
              {isOngoing ? (
                <span data-testid="anime-detail-status-ongoing" className="flex items-center gap-1 px-2.5 py-1 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/30 rounded-md">
                  <Clock size={11} /> Ongoing
                </span>
              ) : (
                <span data-testid="anime-detail-status-completed" className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-md">
                  <CheckCircle2 size={11} /> Completed
                </span>
              )}
            </div>

            {/* Aksi Detail */}
            <div className="flex flex-wrap gap-3">
              <button
                data-testid="anime-detail-tonton-btn"
                onClick={() => {
                  setHasStartedPlaying(true);
                  if (anime && currentEpisode) {
                    const userId = getCurrentUserId();
                    saveHistory(userId, {
                      id: anime.id,
                      title: anime.title,
                      poster: anime.poster || "",
                      episode: currentEpisode.number || (currentEpisode.title?.match(/\d+/) || ['1'])[0],
                      source: activeSource,
                      progressSeconds: 0,
                    }).catch(() => {});
                  }
                }}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-primary hover:bg-primary-dark text-white rounded-2xl font-bold shadow-lg shadow-primary/40 active:scale-95 transition-all text-sm"
              >
                <Play size={18} className="fill-white" /> Tonton Episode 1
              </button>
              <button
                data-testid="anime-detail-unduh-batch-btn"
                onClick={() => handleDownloadBatch()}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-surface hover:bg-surface-highlight text-text border border-border rounded-2xl font-bold shadow-sm active:scale-95 transition-all text-sm"
              >
                <Download size={16} /> Unduh Batch
              </button>
            </div>
            <div className="mt-4">
              <WatchPartyControls
                anime={anime}
                currentEpisode={currentEpisode}
                activeSource={activeSource}
                playerRef={playerRef}
                onEpisodeIdChange={(epId) => {
                  const ep = anime?.episodes?.find((e) => e.id === epId);
                  if (ep) setCurrentEpisode(ep);
                }}
              />
            </div>
          </div>
        </div>
        
        {/* Content Details & Episode lists */}
        <div className="cr-container mt-6 px-4">
          <SynopsisBlock text={anime.synopsis} />

          {/* Episode List Section */}
          <div className="episodes-section border-t border-border pt-6">
            <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
              <h2 className="text-[15px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2.5">
                <span className="w-1.5 h-5 rounded-full bg-primary" />
                Daftar Episode
                <span className="ml-1 inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary/15 text-primary text-[11px] font-black normal-case tracking-normal border border-primary/25">
                  {anime.episodes.length}
                </span>
              </h2>

              <div className="flex gap-2">
                <button
                  data-testid="episode-layout-toggle"
                  onClick={() => setEpisodeLayout((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'))}
                  className="w-10 h-10 rounded-full border border-border bg-surface hover:bg-surface-highlight text-text-secondary flex items-center justify-center transition active:scale-95"
                  title="Ubah Layout"
                >
                  {episodeLayout === 'horizontal' ? <List size={18} /> : <LayoutGrid size={18} />}
                </button>
                <button
                  data-testid="episode-sort-toggle"
                  onClick={() => setEpisodeSort((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="px-4 h-10 rounded-full border border-border bg-surface hover:bg-surface-highlight text-[12px] font-bold text-text-secondary flex items-center gap-1.5 transition active:scale-95"
                >
                  <Filter size={13} />
                  {episodeSort === 'asc' ? 'Terlama' : 'Terbaru'}
                </button>
              </div>
            </div>

            {/* Search filter input */}
            {anime.episodes.length > 6 && (
              <div className="relative mb-5">
                <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  data-testid="episode-search-input"
                  type="text"
                  inputMode="numeric"
                  value={episodeSearch}
                  onChange={(e) => setEpisodeSearch(e.target.value)}
                  placeholder="Cari episode..."
                  className="w-full pl-11 pr-10 h-11 rounded-2xl border border-border bg-surface text-[13px] font-bold text-text placeholder:text-text-muted placeholder:font-medium focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition"
                />
                {episodeSearch && (
                  <button
                    onClick={() => setEpisodeSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-highlight hover:bg-border text-text-muted text-[11px] font-black flex items-center justify-center transition"
                    aria-label="Bersihkan pencarian"
                  >
                    x
                  </button>
                )}
              </div>
            )}

            {(() => {
              const filtered = episodeSearch.trim()
                ? sortedEpisodes.filter((ep) =>
                    String(ep.number || '').includes(episodeSearch.trim()) ||
                    formatEpisodeTitle(ep.title, anime?.title).toLowerCase().includes(episodeSearch.trim().toLowerCase())
                  )
                : sortedEpisodes;

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-10 px-4 bg-surface rounded-2xl border border-border">
                    <p className="text-[13px] font-bold text-text-secondary">Tidak ada episode yang cocok.</p>
                    <p className="text-[11px] text-text-muted mt-1">Coba kata kunci atau nomor episode lain.</p>
                  </div>
                );
              }

              return episodeLayout === 'horizontal' ? (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4">
                  {filtered.map((ep) => {
                    const isCur = currentEpisode.id === ep.id;
                    return (
                      <button
                        key={ep.id}
                        onClick={() => {
                          setCurrentEpisode(ep);
                          setHasStartedPlaying(true);
                        }}
                        className={`w-40 shrink-0 px-4 py-3.5 rounded-2xl text-left transition-all flex flex-col justify-between min-h-[92px] active:scale-95 relative overflow-hidden ${
                          isCur
                            ? 'bg-primary text-white border-2 border-primary-dark shadow-lg shadow-primary/35'
                            : 'bg-surface border border-border hover:border-primary/40 text-text'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${isCur ? 'text-white/85' : 'text-text-muted'}`}>
                            Eps {ep.number}
                          </span>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${isCur ? 'bg-white/25' : 'bg-surface-highlight'}`}>
                            <Play size={9} className={isCur ? 'text-white fill-white' : 'text-text-muted fill-current'} />
                          </span>
                        </div>
                        <span className="text-[13px] font-bold line-clamp-2 leading-snug mt-1.5">
                          {formatEpisodeTitle(ep.title, anime?.title)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filtered.map((ep) => {
                    const isCur = currentEpisode.id === ep.id;
                    return (
                      <button
                        key={ep.id}
                        onClick={() => {
                          setCurrentEpisode(ep);
                          setHasStartedPlaying(true);
                        }}
                        className={`px-4 py-3 rounded-2xl flex items-center justify-between transition-all active:scale-[0.98] ${
                          isCur
                            ? 'bg-primary text-white border-2 border-primary-dark shadow-md shadow-primary/30'
                            : 'bg-surface border border-border hover:border-primary/40 text-text'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[13px] font-black ${
                            isCur ? 'bg-white/25 text-white' : 'bg-surface-highlight text-text-muted'
                          }`}>
                            {ep.number}
                          </span>
                          <span className="text-[13px] font-bold truncate text-left">
                            {formatEpisodeTitle(ep.title, anime?.title)}
                          </span>
                        </div>
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isCur ? 'bg-white/25' : 'bg-surface-highlight'
                        }`}>
                          <Play size={12} className={isCur ? 'fill-white text-white' : 'opacity-50'} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
        {showDownloadModal && (
          <div
            data-testid="unduh-episode-modal"
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
            onClick={() => setShowDownloadModal(false)}
          >
            <div
              className="bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 max-w-md w-full shadow-2xl space-y-5 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* drag handle (mobile) */}
              <div className="sm:hidden mx-auto -mt-2 mb-3 w-10 h-1.5 rounded-full bg-text-muted/30" />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/25">
                  <Download size={22} />
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <h3 className="text-lg font-black text-text leading-tight">Unduh Episode {currentEpisode?.number || ''}</h3>
                  <p className="text-[12px] text-text-secondary font-medium leading-relaxed">
                    Pilih kualitas video. Unduhan jalan di latar belakang.
                  </p>
                </div>
              </div>
              <div className="space-y-2.5">
                {(() => {
                  const groups = groupDownloadByResolution();
                  if (!groups.length) {
                    return (
                      <div className="text-center text-[13px] text-text-secondary py-6 bg-surface-highlight rounded-2xl border border-border">
                        Tidak ada link download untuk episode ini.
                      </div>
                    );
                  }
                  return groups.map((g, idx) => {
                    const isMax = idx === 0;
                    const is4K = g.resolution === '4K';
                    const sourceName = g.hosts[0]?.host || 'Server';
                    return (
                      <div
                        key={g.resolution}
                        className={`w-full rounded-2xl border overflow-hidden transition-all ${
                          isMax
                            ? 'bg-gradient-to-br from-primary to-primary-dark border-primary-dark text-white shadow-lg shadow-primary/30'
                            : 'bg-surface-highlight border-border text-text'
                        }`}
                      >
                        <div className="flex items-center justify-between px-4 pt-4 pb-2.5 gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span className={`flex items-center justify-center w-12 h-12 rounded-xl text-[12px] font-black shrink-0 ${
                              isMax
                                ? 'bg-white/25 text-white'
                                : (is4K ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300' : 'bg-surface text-text border border-border')
                            }`}>
                              {g.resolution}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[14px] font-black leading-snug flex items-center gap-2">
                                {g.resolution}
                                {is4K && <span className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Ultra HD</span>}
                                {isMax && <span className="text-[9px] uppercase tracking-[0.18em] font-black bg-white/25 px-1.5 py-0.5 rounded">Maks</span>}
                              </span>
                              <span className={`text-[11px] font-semibold mt-0.5 truncate ${isMax ? 'text-white/85' : 'text-text-muted'}`}>
                                {sourceName} · {g.hosts.length} mirror
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          data-testid="download-quality-option"
                          onClick={() => {
                            const HOST_PRIORITY = ['kdrive', 'iino', 'komari', 'asuna', 'kitasan', 'chisato', 'huntersekai', 'mp4upload', 'krakenfiles', 'gofile', 'mirror', 'pdrain', 'pixeldrain'];
                            const ranked = [...g.hosts].sort((a, b) => {
                              const ra = HOST_PRIORITY.findIndex((h) => (a.host || '').toLowerCase().includes(h));
                              const rb = HOST_PRIORITY.findIndex((h) => (b.host || '').toLowerCase().includes(h));
                              return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
                            });
                            startBackgroundDownload(ranked.map((r) => r.url), g.resolution);
                          }}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-[0.18em] transition active:scale-[0.98] ${
                            isMax
                              ? 'bg-white/20 hover:bg-white/30 text-white'
                              : 'bg-primary hover:bg-primary-dark text-white'
                          }`}
                        >
                          <Download size={15} strokeWidth={2.5} />
                          Download
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
              <button
                data-testid="unduh-batch-modal-close"
                onClick={() => setShowDownloadModal(false)}
                className="w-full bg-surface-highlight hover:bg-border text-text font-bold py-3.5 rounded-2xl transition active:scale-95 text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Unduh BATCH Pop-up Dialog (full series, beda dari per-episode) */}
        {showBatchModal && (
          <div data-testid="unduh-batch-full-modal" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-5">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-black text-black">Unduh Batch Seri</h3>
                <p className="text-xs text-zinc-500 font-medium">
                  Seluruh episode dalam satu paket per resolusi. File besar — pastikan jaringan stabil. Hanya tersedia bila seri menyediakan batch.
                </p>
              </div>
              <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2 space-y-2">
                {batchLoading && (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <div className="w-8 h-8 border-4 border-[#c68a4e] border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-zinc-500 tracking-wider uppercase">Memuat batch...</span>
                  </div>
                )}
                {!batchLoading && batchOptions !== null && batchOptions.length === 0 && (
                  <div className="text-center text-xs text-zinc-500 py-6 px-3">
                    Batch tidak tersedia untuk seri ini.<br/>
                    {activeSource !== 'otakudesu' && (
                      <span className="text-[10px] text-zinc-400">Saat ini batch hanya tersedia dari Otakudesu.</span>
                    )}
                  </div>
                )}
                {!batchLoading && batchOptions !== null && batchOptions.length > 0 && (() => {
                  // Group batch options by resolution
                  const buckets = new Map();
                  for (const o of batchOptions) {
                    const q = String(o.quality || '').toLowerCase();
                    let key = '?';
                    if (q.includes('1080p')) key = '1080p';
                    else if (q.includes('720p')) key = '720p';
                    else if (q.includes('480p')) key = '480p';
                    else if (q.includes('360p')) key = '360p';
                    else if (q.includes('4k') || q.includes('2160p')) key = '4K';
                    if (!buckets.has(key)) buckets.set(key, []);
                    buckets.get(key).push(o);
                  }
                  const order = ['4K', '1080p', '720p', '480p', '360p', '?'];
                  return order
                    .filter((k) => buckets.has(k))
                    .map((k, idx) => {
                      const isMax = idx === 0;
                      const hosts = buckets.get(k);
                        const HOST_PRIORITY = ['kdrive', 'iino', 'komari', 'asuna', 'kitasan', 'chisato', 'huntersekai', 'mp4upload', 'krakenfiles', 'gofile', 'mirror', 'pdrain', 'pixeldrain'];
                      const ranked = [...hosts].sort((a, b) => {
                        const ra = HOST_PRIORITY.findIndex((h) => (a.host || '').toLowerCase().includes(h));
                        const rb = HOST_PRIORITY.findIndex((h) => (b.host || '').toLowerCase().includes(h));
                        return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
                      });
                      const size = hosts[0]?.size || '';
                      return (
                        <button
                          key={k}
                          data-testid="batch-quality-option"
                          onClick={() => {
                            startBackgroundDownload(ranked.map((r) => r.url), `BATCH-${k}`);
                            setShowBatchModal(false);
                          }}
                          className={`w-full flex justify-between items-center px-4 py-3.5 rounded-2xl border transition active:scale-95 text-left ${
                            isMax
                              ? 'bg-gradient-to-br from-[#c68a4e] to-[#a4682f] border-[#a4682f] text-white shadow-lg shadow-[#c68a4e]/30'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-800 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`flex items-center justify-center w-12 h-12 rounded-xl text-xs font-black ${
                              isMax ? 'bg-white/25 text-white' : 'bg-zinc-200 text-zinc-700'
                            }`}>
                              {k}
                            </span>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">Batch {k}</span>
                              <span className={`text-[10px] ${isMax ? 'text-white/80' : 'text-zinc-500'} font-semibold`}>
                                {size ? `${size} • ` : ''}{hosts.length} mirror
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            {isMax && <span className="text-[9px] uppercase tracking-wider font-black mb-0.5">Maksimal</span>}
                            <Download size={18} className={isMax ? 'text-white' : 'text-[#c68a4e]'} />
                          </div>
                        </button>
                      );
                    });
                })()}
              </div>
              <button
                data-testid="unduh-batch-full-close"
                onClick={() => setShowBatchModal(false)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-full shadow-md transition active:scale-95 cursor-pointer text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- R5. CUSTOM VIDEO PLAYER (NANIMEID THEME) ---
  return (
    <div className="video-player-container pb-24 bg-[#fafafa] text-[#18181b]">
      {/* Video Player Box Area */}
      <div 
        data-testid="nanimeid-player-skin"
        className="custom-player-wrapper relative w-full bg-black flex items-center justify-center z-10 overflow-hidden" 
        style={{ aspectRatio: '16/9', maxHeight: '100vh' }} 
        ref={playerContainerRef}
      >
        {isVideoLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 backdrop-blur-sm">
            <div className="relative w-16 h-16 flex items-center justify-center mb-4">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#c68a4e] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <span className="text-xs font-bold tracking-wider text-white">MEMUAT STREAM ({activeSource.toUpperCase()})</span>
            {/* Loading toast: pojok kiri atas, kecil, transparan, dengan
                spinner mini supaya tidak mengganggu tampilan player. */}
            <div
              data-testid="stream-loading-toast"
              className="absolute top-3 left-3 max-w-[200px] bg-black/40 backdrop-blur-md text-white rounded-xl px-3 py-2 shadow-lg border border-white/15 animate-fade-in-up"
            >
              <div className="flex items-center gap-2">
                <span className="relative w-3.5 h-3.5 shrink-0 inline-flex">
                  <span className="absolute inset-0 border-[2px] border-white/25 rounded-full" />
                  <span className="absolute inset-0 border-[2px] border-[#c68a4e] border-t-transparent rounded-full animate-spin" />
                </span>
                <p className="text-[10px] font-semibold leading-snug">
                  Tunggu 1-60 detik, sabar ya
                </p>
              </div>
            </div>
          </div>
        ) : videoError ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white bg-zinc-950 gap-4 p-8 text-center z-20 absolute inset-0">
            <CloudOff size={32} className="text-red-500" />
            <span className="text-sm font-bold text-red-500">Gagal Memutar Video</span>
            <span className="text-xs text-zinc-400 max-w-sm">{videoError}</span>
            <button onClick={() => setVideoError(null)} className="px-5 py-2 bg-zinc-800 rounded-lg text-xs font-bold cursor-pointer">Coba Lagi</button>
          </div>
        ) : streamUrl ? (
          <>
            {/* Routing player:
                - mp4/m3u8/proxy → custom <video> player (player kustom).
                - URL embed (mis. iframe ke embed.io / blogger / videohide) →
                  iframe sebagai fallback supaya tidak "MEDIA_ELEMENT_ERROR
                  Format error" yang muncul kalau <video> dipaksa baca HTML.
                Untuk Otakudesu, backend /extract-stream akan converted ke
                mp4/m3u8 jadi cabang custom player jalan; kalau gagal kita
                jatuh ke iframe (worst case tetap bisa nonton). */}
            {(!streamUrl.includes('.mp4') && !streamUrl.includes('.m3u8') && !streamUrl.includes('stream-proxy') && !streamUrl.includes('extract-stream') && streamUrl.startsWith('http')) ? (
              <>
                <iframe
                  src={getIframeUrl()}
                  className="absolute inset-0 w-full h-full border-0 bg-black z-10"
                  allowFullScreen
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer"
                  {...(activeSource === 'kuramanime'
                    ? { sandbox: "allow-scripts allow-same-origin allow-forms allow-presentation" }
                    : {})}
                ></iframe>
                {/* Tombol custom (back + download) di pojok kiri-atas saja
                    supaya tidak menutupi control native player (fullscreen,
                    play/pause, quality picker) yang biasanya di pojok kanan
                    atau di bilah bawah. */}
                <div className="absolute top-3 left-3 z-30 pointer-events-auto flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                    className="w-11 h-11 bg-black/60 hover:bg-black/80 rounded-2xl flex items-center justify-center text-white backdrop-blur-md transition border border-white/20 active:scale-95 shadow-md"
                    aria-label="Kembali"
                  >
                    <ArrowLeft size={20} />
                  </button>
                </div>
                {/* CATATAN: jangan tambahkan tombol fullscreen kustom di sini.
                    Player bawaan Nekopoi/Kuramanime sudah punya tombol
                    fullscreen sendiri yang otomatis mendeteksi device dan
                    melakukan request fullscreen API yang sesuai. Tombol kustom
                    di luar iframe akan menutupi/mengganggu kontrol native dan
                    membuat fullscreen tidak berfungsi seperti yang
                    diharapkan. */}
              </>
            ) : (
              /* Native Video player with custom controls overlay */
              <>
                <video
                  ref={playerRef}
                  src={streamUrl}
                  autoPlay
                  playsInline
                  crossOrigin="anonymous"
                  onError={handleVideoError}
                  onTimeUpdate={(e) => {
                    handleProgress({ played: e.target.currentTime / (duration || 1) });
                  }}
                  onLoadedMetadata={onLoadedMetadata}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onPlaying={() => setPlaying(true)}
                  onEnded={handleVideoEnd}
                  onClick={handlePlayerClick}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  style={{ filter: `brightness(${brightness})` }}
                  className="absolute inset-0 w-full h-full border-0 bg-black object-contain z-10 cursor-pointer"
                >
                  Browser Anda tidak mendukung tag video.
                </video>

                {/* Indikator gesture volume/kecerahan */}
                {gestureHint && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none bg-black/60 backdrop-blur-md rounded-2xl px-5 py-4 flex flex-col items-center gap-2 min-w-[120px]">
                    <span className="text-xs font-bold tracking-wider text-white uppercase">
                      {gestureHint.type === 'volume' ? 'Volume' : 'Kecerahan'}
                    </span>
                    <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-[#c68a4e]" style={{ width: `${Math.round(gestureHint.value * 100)}%` }} />
                    </div>
                    <span className="text-sm font-black text-white">{Math.round(gestureHint.value * 100)}%</span>
                  </div>
                )}

                {/* Lock Screen overlay */}
                {(showControls || isLocked) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsLocked(!isLocked); resetControlsTimeout(); }}
                    className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 z-40 transition-all cursor-pointer border border-white/10"
                  >
                    {isLocked ? <Lock size={22} className="text-[#c68a4e]" /> : <Unlock size={22} />}
                  </button>
                )}

                {/* Player Controls overlay */}
                <div 
                  className={`player-overlay absolute inset-0 z-20 flex flex-col justify-between w-full h-full pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
                >
                  <div 
                    className="absolute inset-0 z-0 pointer-events-auto cursor-pointer"
                    onClick={handlePlayerClick}
                  />

                  {/* Top Bar control overlay */}
                  <div className="overlay-top flex justify-between items-start pointer-events-auto z-10 p-4 gap-2">
                    <button
                      onClick={() => navigate(-1)}
                      className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#c68a4e] hover:text-black transition cursor-pointer border border-white/10 shrink-0"
                    >
                      <ArrowLeft size={22} />
                    </button>
                    <div className="flex-1 min-w-0 pt-1.5">
                      <h4 className="font-bold text-[15px] text-white truncate leading-tight">{anime.title}</h4>
                      <p className="text-[11px] text-zinc-300 font-semibold mt-0.5">{currentEpisode.title}</p>
                    </div>
                    {/* Tombol Download di top bar player DIHAPUS — sudah ada
                        di action row di luar player (Favorit / Unduh / Lapor),
                        sesuai permintaan user. */}
                    {/* Episode list toggle (kanan atas) - daftar episode bottom sheet */}
                    {anime.episodes && anime.episodes.length > 1 && (
                      <button
                        data-testid="player-episode-list-btn"
                        onClick={(e) => { e.stopPropagation(); setShowEpisodeOverlay(v => !v); resetControlsTimeout(); }}
                        className="px-3.5 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center gap-1.5 text-white hover:bg-[#c68a4e] hover:text-black transition cursor-pointer border border-white/10 shrink-0"
                        title="Daftar episode"
                      >
                        <List size={18} />
                        <span className="text-xs font-bold whitespace-nowrap">EP {currentEpisode.number}</span>
                      </button>
                    )}
                  </div>

                  {/* Daftar Episode in-player — bottom sheet ala nanimeid:
                      grid kotak padat, item current di-highlight, scrollable.
                      Konsisten dengan menu Resolusi/Kecepatan. */}
                  {showEpisodeOverlay && anime.episodes && anime.episodes.length > 1 && (
                    <div
                      className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-auto"
                      onClick={(e) => { e.stopPropagation(); setShowEpisodeOverlay(false); }}
                      data-testid="player-episode-list-overlay"
                    >
                      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md bg-[#101013] rounded-t-[28px] border-t border-white/10 shadow-2xl animate-fade-in"
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                      >
                        <div className="mx-auto mt-3 mb-1 w-10 h-1.5 rounded-full bg-white/25" />
                        <div className="px-5 pt-3 pb-3 flex items-center justify-between gap-3 border-b border-white/10">
                          <div>
                            <h4 className="text-white font-black text-[15px] tracking-tight">Daftar Episode</h4>
                            <p className="text-white/55 text-[12px] font-medium mt-0.5">{anime.episodes.length} episode tersedia</p>
                          </div>
                          <button
                            onClick={() => setShowEpisodeOverlay(false)}
                            className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white flex items-center justify-center transition"
                            aria-label="Tutup"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 px-3 py-4 max-h-[55vh] overflow-y-auto">
                          {anime.episodes.map((ep) => {
                            const isCurrent = currentEpisode && ep.id === currentEpisode.id;
                            return (
                              <button
                                key={ep.id}
                                onClick={() => {
                                  setCurrentEpisode(ep);
                                  setShowEpisodeOverlay(false);
                                }}
                                className={`relative aspect-square rounded-lg flex items-center justify-center font-black text-[15px] transition active:scale-[0.92] ${
                                  isCurrent
                                    ? 'bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary-light'
                                    : 'bg-white/[0.06] text-white hover:bg-primary/30 border border-white/[0.06]'
                                }`}
                              >
                                {ep.number}
                                {isCurrent && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary-light border-2 border-[#101013]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Skip Intro — nanimeid plek-ketiplek: muncul detik
                      5-90 di pojok kanan bawah, chip pill "Lewati Intro »",
                      sekali klik lompat +85 detik dan hilang sampai episode
                      ganti. Untuk movie tidak dimunculkan. */}
                  {(() => {
                    const isMovieType = anime?.episodes?.length <= 1 ||
                      anime?.genreList?.some(g => (typeof g === 'object' ? g.title : g)?.toLowerCase() === 'movie');
                    if (isMovieType || skipIntroDismissed) return null;
                    const SKIP_INTRO_START = 5;   // detik mulai tampil
                    const SKIP_INTRO_END = 90;    // detik akhir tampil
                    const SKIP_AMOUNT = 85;        // lompatan saat diklik (nanimeid)
                    if (currentTime > SKIP_INTRO_START && currentTime < SKIP_INTRO_END) {
                      return (
                        <div className="skip-btn-container absolute bottom-20 right-4 z-30 pointer-events-auto">
                          <button
                            data-testid="player-skip-intro-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (playerRef.current) {
                                const target = Math.min((playerRef.current.currentTime || 0) + SKIP_AMOUNT, (duration || 0) - 1);
                                playerRef.current.currentTime = target;
                              }
                              setSkipIntroDismissed(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-black/55 hover:bg-black/75 text-white backdrop-blur-md rounded-full text-[12.5px] font-bold border border-white/20 transition active:scale-95 shadow-lg cursor-pointer"
                          >
                            Lewati Intro
                            <ChevronRight size={14} strokeWidth={3} />
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Skip Outro / Next Episode Button (fitur SKIP INTRO dihapus). */}
                  {(() => {
                    const isMovieType = anime?.episodes?.length <= 1 ||
                      anime?.genreList?.some(g => (typeof g === 'object' ? g.title : g)?.toLowerCase() === 'movie');
                    if (isMovieType) return null;

                    if (currentTime >= 900 && !outroSkipped) {
                      return (
                        <div className="skip-btn-container absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col gap-2 items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (playerRef.current && duration > 0) {
                                playerRef.current.currentTime = Math.max(0, duration - 30);
                              }
                              setOutroSkipped(true);
                              showToast("Outro dilewati");
                            }}
                            className="px-5 py-2.5 bg-white/15 hover:bg-[#c68a4e] text-white hover:text-black backdrop-blur-md rounded-2xl text-xs font-bold border border-white/25 transition-all active:scale-95 flex items-center gap-2 shadow-lg cursor-pointer"
                          >
                            SKIP OUTRO <RotateCw size={14} />
                          </button>
                          {hasNextEpisode() && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playNextEpisode();
                              }}
                              className="px-5 py-2.5 bg-[#c68a4e] hover:bg-[#a4682f] text-black backdrop-blur-md rounded-2xl text-xs font-bold border border-[#a4682f] transition-all active:scale-95 flex items-center gap-2 shadow-lg cursor-pointer"
                            >
                              EP SELANJUTNYA <SkipForward size={14} fill="currentColor" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return null;
                  })()}

                  {/* Central Playback Controls */}
                  {!isLocked && (
                    <div className="absolute inset-0 flex items-center justify-center gap-6 pointer-events-none z-30">
                      {/* Prev Episode */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPrevEpisode();
                          resetControlsTimeout();
                        }}
                        disabled={!hasPrevEpisode()}
                        className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 active:scale-90 flex items-center justify-center text-white backdrop-blur-md transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none border border-white/10 pointer-events-auto"
                        title="Episode Sebelumnya"
                      >
                        <SkipBack size={20} fill="currentColor" />
                      </button>

                      {/* Rewind 10s */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playerRef.current) {
                            const newTime = Math.max(playerRef.current.currentTime - 10, 0);
                            playerRef.current.currentTime = newTime;
                            setCurrentTime(newTime);
                            setPlayed(newTime / duration);
                          }
                          resetControlsTimeout();
                        }}
                        className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 active:scale-90 flex items-center justify-center text-white backdrop-blur-md transition-all cursor-pointer border border-white/10 pointer-events-auto"
                        title="Mundur 10s"
                      >
                        <RotateCcw size={20} />
                      </button>

                      {/* Big Play/Pause Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay();
                          resetControlsTimeout();
                        }}
                        className="w-16 h-16 rounded-full bg-[#c68a4e] hover:bg-[#a4682f] active:scale-90 flex items-center justify-center text-black shadow-lg shadow-[#c68a4e]/35 transition-all cursor-pointer border border-[#c68a4e] pointer-events-auto"
                        title={playing ? "Pause" : "Play"}
                      >
                        {playing ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}
                      </button>

                      {/* Forward 10s */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playerRef.current) {
                            const newTime = Math.min(playerRef.current.currentTime + 10, duration);
                            playerRef.current.currentTime = newTime;
                            setCurrentTime(newTime);
                            setPlayed(newTime / duration);
                          }
                          resetControlsTimeout();
                        }}
                        className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 active:scale-90 flex items-center justify-center text-white backdrop-blur-md transition-all cursor-pointer border border-white/10 pointer-events-auto"
                        title="Maju 10s"
                      >
                        <RotateCw size={20} />
                      </button>

                      {/* Next Episode */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playNextEpisode();
                          resetControlsTimeout();
                        }}
                        disabled={!hasNextEpisode()}
                        className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 active:scale-90 flex items-center justify-center text-white backdrop-blur-md transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none border border-white/10 pointer-events-auto"
                        title="Episode Selanjutnya"
                      >
                        <SkipForward size={20} fill="currentColor" />
                      </button>
                    </div>
                  )}

                  {/* Bottom Bar control overlay (Mockup player-nanimeid.jpg layout) */}
                  <div className="overlay-bottom p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-auto z-10">
                    
                    {/* Time indicator and seekbar slider */}
                    <div className="flex items-center gap-3 mb-2.5">
                      <span className="text-[10px] text-white/95 font-bold font-mono">{formatTime(currentTime)}</span>
                      <div 
                        className="relative flex-1 h-3 flex items-center group cursor-pointer"
                        onMouseDown={handleSeekMouseDown}
                        onMouseUp={handleSeekMouseUp}
                        onTouchStart={handleSeekMouseDown}
                        onTouchEnd={handleSeekMouseUp}
                      >
                        <input 
                          data-testid="player-progress-bar"
                          type="range" 
                          min={0} 
                          max={1} 
                          step="any" 
                          value={played} 
                          onChange={handleSeekChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 p-0"
                        />
                        <div className="absolute left-0 w-full h-1 bg-white/20 rounded-full overflow-hidden pointer-events-none">
                          <div 
                            className="h-full bg-[#c68a4e] transition-all"
                            style={{ width: `${played * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-white/95 font-bold font-mono">{formatTime(duration)}</span>
                    </div>

                    {/* Controls Row */}
                    <div className="flex justify-between items-center">
                      {/* Prev - Play/Pause - Next dual controls adjacent */}
                      <div className="flex gap-3 items-center">
                        <button
                          data-testid="player-prev-episode"
                          onClick={playPrevEpisode}
                          className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#c68a4e] hover:text-black transition cursor-pointer border border-white/20 shadow-md"
                          title="Prev Episode"
                        >
                          <SkipBack size={22} fill="currentColor" />
                        </button>
                        <button
                          onClick={togglePlay}
                          className="w-14 h-14 rounded-full bg-[#c68a4e] flex items-center justify-center text-black hover:bg-[#a4682f] transition cursor-pointer shadow-lg shadow-[#c68a4e]/40"
                        >
                          {playing ? <Pause fill="black" size={28} /> : <Play fill="black" size={28} className="ml-0.5" />}
                        </button>
                        <button
                          data-testid="player-next-episode"
                          onClick={playNextEpisode}
                          className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#c68a4e] hover:text-black transition cursor-pointer border border-white/20 shadow-md"
                          title="Next Episode"
                        >
                          <SkipForward size={22} fill="currentColor" />
                        </button>
                      </div>

                      {/* Resolution, Speed selector and Fullscreen buttons */}
                      <div className="flex gap-2 items-center">
                        <button
                          data-testid="player-resolution-btn"
                          onClick={(e) => { e.stopPropagation(); setShowResolutionMenu(true); setShowSpeedMenu(false); }}
                          className="h-11 text-white bg-black/65 hover:bg-primary hover:text-black px-3 rounded-2xl border border-white/25 backdrop-blur-md cursor-pointer transition flex items-center gap-1.5 shadow-md"
                          title="Pilih resolusi video"
                        >
                          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-white/15 text-[9px] font-black tracking-tight">
                            HD
                          </span>
                          <span className="font-black tracking-wide text-[12px]">{activeResolution || 'Auto'}</span>
                          <ChevronDown size={13} strokeWidth={3} />
                        </button>
                        <button
                          data-testid="player-speed-btn"
                          onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(true); setShowResolutionMenu(false); }}
                          className="h-11 text-white bg-black/65 hover:bg-primary hover:text-black px-3 rounded-2xl border border-white/25 backdrop-blur-md cursor-pointer transition flex items-center gap-1.5 shadow-md"
                          title="Atur kecepatan putar"
                        >
                          <Gauge size={15} strokeWidth={2.5} />
                          <span className="font-black tracking-wide text-[12px]">{playbackRate}x</span>
                        </button>

                        <button
                          data-testid="player-fullscreen-btn"
                          onClick={toggleFullScreen}
                          className="w-11 h-11 rounded-2xl bg-black/65 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary hover:text-black transition cursor-pointer border border-white/25 shadow-md"
                          title="Fullscreen"
                        >
                          <Maximize size={18} />
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Resolution bottom sheet — plek nanimeid: list radio
                      simple, item active checkmark kanan, item lain hover.
                      Tidak ada chip kotak besar di kiri/kanan. */}
                  {showResolutionMenu && (
                    <div
                      className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-auto"
                      onClick={(e) => { e.stopPropagation(); setShowResolutionMenu(false); }}
                    >
                      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md bg-[#101013] rounded-t-[24px] border-t border-white/10 shadow-2xl animate-fade-in"
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                      >
                        <div className="mx-auto mt-2.5 mb-1 w-9 h-1 rounded-full bg-white/25" />
                        <div className="px-5 pt-3 pb-3 border-b border-white/[0.07]">
                          <h4 className="text-white font-black text-[15px] tracking-tight">Resolusi Video</h4>
                        </div>
                        <div className="py-2 max-h-[55vh] overflow-y-auto">
                          <button
                            data-testid="player-resolution-auto"
                            onClick={() => { setActiveResolution('Auto'); setShowResolutionMenu(false); }}
                            className="w-full flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-white/[0.04]"
                          >
                            <span className="text-white text-[14px] font-medium leading-tight">Otomatis</span>
                            {(!activeResolution || activeResolution === 'Auto') && (
                              <CheckCircle2 size={18} className="text-primary" />
                            )}
                          </button>

                          {availableResolutions.length === 0 ? (
                            <div className="text-center text-white/55 text-[12.5px] py-5">
                              Belum ada kualitas yang terdeteksi.
                            </div>
                          ) : (
                            availableResolutions.map((res, idx) => {
                              const isActive = activeResolution && activeResolution.toLowerCase().includes(res.toLowerCase().replace('p', ''));
                              const isMax = idx === 0;
                              return (
                                <button
                                  key={res}
                                  data-testid="player-resolution-option"
                                  onClick={() => { handleResolutionChange(res); setShowResolutionMenu(false); }}
                                  className="w-full flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-white/[0.04]"
                                >
                                  <span className="flex items-center gap-2.5">
                                    <span className="text-white text-[14px] font-medium leading-tight">{res}</span>
                                    {isMax && !isActive && (
                                      <span className="text-[9.5px] font-black uppercase tracking-wider text-primary-light px-1.5 py-0.5 rounded bg-primary/15">
                                        Maks
                                      </span>
                                    )}
                                  </span>
                                  {isActive && <CheckCircle2 size={18} className="text-primary" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Speed bottom sheet — pola yang sama dengan resolusi. */}
                  {showSpeedMenu && (
                    <div
                      className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-auto"
                      onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(false); }}
                    >
                      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md bg-[#101013] rounded-t-[24px] border-t border-white/10 shadow-2xl animate-fade-in"
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                      >
                        <div className="mx-auto mt-2.5 mb-1 w-9 h-1 rounded-full bg-white/25" />
                        <div className="px-5 pt-3 pb-3 border-b border-white/[0.07]">
                          <h4 className="text-white font-black text-[15px] tracking-tight">Kecepatan Putar</h4>
                        </div>
                        <div className="py-2">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => {
                            const isActive = playbackRate === rate;
                            const label = rate === 1 ? 'Normal' : `${rate}x`;
                            return (
                              <button
                                key={rate}
                                data-testid="player-speed-option"
                                onClick={() => {
                                  setPlaybackRate(rate);
                                  if (playerRef.current) playerRef.current.playbackRate = rate;
                                  setShowSpeedMenu(false);
                                }}
                                className="w-full flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-white/[0.04]"
                              >
                                <span className="text-white text-[14px] font-medium leading-tight">{label}</span>
                                {isActive && <CheckCircle2 size={18} className="text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          /* Stream selesai load tetapi streamUrl masih kosong — biasanya
             episode tidak punya server aktif atau resolver gagal silently.
             Tampilkan UI recovery dengan opsi reload halaman & ganti sumber. */
          <div className="w-full h-full flex flex-col items-center justify-center text-white bg-zinc-950 gap-3 p-8 text-center absolute inset-0 z-10">
            <CloudOff size={28} className="text-amber-400" />
            <span className="text-sm font-black">Stream sedang tidak tersedia</span>
            <span className="text-[12px] text-zinc-400 max-w-sm leading-relaxed">
              Server untuk episode ini belum balik link aktif. Coba muat ulang
              atau pindah ke sumber lain.
            </span>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              <button
                onClick={() => {
                  if (currentEpisode) {
                    setCurrentEpisode({ ...currentEpisode });
                  }
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold cursor-pointer transition active:scale-95"
              >
                Muat Ulang
              </button>
              {activeSource !== 'kuramanime' && (
                <button
                  onClick={() => switchSource('kuramanime', null, currentEpisode?.number || '1')}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold cursor-pointer transition active:scale-95"
                >
                  Coba Kuramanime
                </button>
              )}
              {activeSource === 'kuramanime' && anime?.title && (
                <button
                  onClick={async () => {
                    // Re-search Kurama dengan judul anime saat ini lalu pindah
                    // ke ID yang berbeda — sering kali ID yang dibawa dari
                    // search adalah varian yang stream-nya tidak siap, padahal
                    // ada ID Kurama lain yang sehat (mis. Yuru Camp Movie:
                    // ada 2 entry di Kurama, satu kerangka dan satu aktif).
                    try {
                      const res = await fetch(`${API_BASE_URL}/kuramanime/search?q=${encodeURIComponent(anime.title)}`);
                      const json = await res.json();
                      const list = json?.data?.animeList || [];
                      const wantSeason = seasonKey(anime.title);
                      const candidates = list.filter((it) => seasonKey(it.title) === wantSeason && it.animeId !== anime.id);
                      if (candidates.length > 0) {
                        let best = candidates[0];
                        let bestScore = titleSimilarity(anime.title, best.title || '');
                        for (const it of candidates.slice(1)) {
                          const sim = titleSimilarity(anime.title, it.title || '');
                          if (sim > bestScore) { bestScore = sim; best = it; }
                        }
                        if (best?.animeId) {
                          switchSource('kuramanime', best.animeId);
                          return;
                        }
                      }
                      showToast('Tidak ada varian Kurama lain untuk judul ini.');
                    } catch (e) {
                      console.warn('alt-Kuramanime lookup failed:', e);
                      showToast('Pencarian alternatif gagal.');
                    }
                  }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold cursor-pointer transition active:scale-95"
                >
                  Cari Varian Lain
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Video Detail Content (Non-Fullscreen) */}
      <div className="cr-container mt-6 px-4">

        {/* Server picker untuk Nekopoi — chip "Server 1", "Server 2", dst.
            Hanya tampil kalau ada >1 server tersedia. */}
        {activeSource === 'nekopoi' && episodeDetails?.serverList && episodeDetails.serverList.length > 1 && (
          <div className="mb-5 bg-surface border border-border rounded-2xl px-4 py-3.5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted mb-2.5 flex items-center gap-2">
              <Play size={11} className="text-primary fill-current" />
              Pilih Server
            </p>
            <div className="flex flex-wrap gap-2">
              {episodeDetails.serverList.slice(0, 6).map((server, idx) => {
                const isActive = activeServerId === server.serverId;
                return (
                  <button
                    key={`${server.serverId}-${idx}`}
                    onClick={() => handleServerChange(server)}
                    className={`px-4 py-2 rounded-xl text-[12.5px] font-bold border transition-all active:scale-95 ${
                      isActive
                        ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                        : 'bg-surface-highlight text-text-secondary border-border hover:border-primary/40 hover:text-text'
                    }`}
                  >
                    Server {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Hidden Server Selector for E2E Test Compatibility */}
        <select 
          data-testid="server-selector"
          value={activeServerId || ''}
          onChange={(e) => {
            const selected = episodeDetails?.serverList?.find(s => s.serverId === e.target.value);
            if (selected) handleServerChange(selected);
          }}
          style={{ display: 'none' }}
        >
          {episodeDetails?.serverList?.map((server, idx) => (
            <option key={idx} value={server.serverId}>
              {server.title || `Server ${idx + 1}`}
            </option>
          )) || (
            <option value="">Default Server</option>
          )}
        </select>

        {/* Details title and metadata */}
        <h1 data-testid="video-detail-title" className="text-xl font-black text-black leading-tight mb-1">
          {anime.title}
        </h1>
        <p className="text-xs font-bold text-zinc-400 mb-4">{currentEpisode.title}</p>
        
        <div className="flex items-center gap-3 text-xs text-zinc-500 font-bold mb-4 flex-wrap">
           <span className="flex items-center gap-1 text-[#a4682f]">
             <Star size={14} className="text-[#c68a4e] fill-current" /> {anime.rating || "8.5"}
           </span>
           <span>{anime.year || "2026"}</span>
           <span className="uppercase text-[#c68a4e]">{displaySource}</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {anime.genreList?.slice(0, 4).map((genre, idx) => {
            const genreTitle = typeof genre === 'object' ? genre.title || genre.name : genre;
            return (
              <span key={idx} className="text-[11px] font-bold px-2.5 py-1 bg-surface text-text-secondary rounded-lg border border-border">
                {genreTitle}
              </span>
            );
          })}
        </div>

        {/* Action Row: Favorit, Download, Lapor — tombol Unduh tampil untuk
            semua sumber termasuk Nekopoi sesuai permintaan user. */}
        <div className="flex gap-3 mb-6 bg-surface p-2 rounded-full border border-border shadow-sm">
          <button
            data-testid="video-bookmark-btn"
            onClick={toggleVideoBookmark}
            className={`flex-1 flex flex-col gap-1 items-center justify-center py-2.5 rounded-full transition ${isVideoBookmarked ? 'text-primary' : 'text-text-secondary hover:text-primary'}`}
          >
            <Bookmark size={20} strokeWidth={2} fill={isVideoBookmarked ? "currentColor" : "none"} />
            <span className="text-[11px] font-bold">Favorit</span>
          </button>

          <button
            data-testid="video-download-btn"
            onClick={handleDownloadEpisode}
            className="flex-1 flex flex-col gap-1 items-center justify-center py-2.5 rounded-full transition text-text-secondary hover:text-primary"
          >
            <Download size={20} strokeWidth={2} />
            <span className="text-[11px] font-bold">Unduh</span>
          </button>

          <button
            data-testid="video-report-btn"
            onClick={() => setShowReportModal(true)}
            className="flex-1 flex flex-col gap-1 items-center justify-center py-2.5 rounded-full transition text-text-secondary hover:text-red-500"
          >
            <AlertTriangle size={20} strokeWidth={2} />
            <span className="text-[11px] font-bold">Lapor</span>
          </button>
        </div>

        {/* Tab bar ala nanimeid: Informasi & Komentar */}
        <div className="player-tabs flex items-center gap-1 border-b border-border mb-5 sticky top-0 z-10 bg-bg/95 backdrop-blur-md">
          {[
            { id: 'info', label: 'Informasi' },
            { id: 'comments', label: 'Komentar' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`player-tab-${tab.id}`}
              onClick={() => setPlayerTab(tab.id)}
              className={`flex-1 px-4 py-3 text-[13px] font-black uppercase tracking-[0.16em] transition-colors relative ${
                playerTab === tab.id ? 'text-primary' : 'text-text-secondary hover:text-text'
              }`}
            >
              {tab.label}
              <span className={`absolute left-3 right-3 bottom-0 h-0.5 rounded-full transition-all ${playerTab === tab.id ? 'bg-primary' : 'bg-transparent'}`} />
            </button>
          ))}
        </div>

        {playerTab === 'info' ? (
          <div className="space-y-6">
            <SynopsisBlock text={anime.synopsis} />
            <SeriesList currentTitle={anime?.title} currentId={anime?.id} activeSource={activeSource} navigate={navigate} />
          </div>
        ) : null}

        {playerTab === 'info' && (
        <div className="episodes-container">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-[14px] font-black uppercase tracking-[0.18em] text-text flex items-center gap-2.5">
              <span className="w-1.5 h-5 rounded-full bg-primary" />
              Daftar Episode
              <span className="ml-1 inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary/15 text-primary text-[11px] font-black normal-case tracking-normal border border-primary/25">
                {anime.episodes.length}
              </span>
            </h2>
            {anime.episodes.length > 6 && (
              <div className="relative w-44">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  data-testid="player-episode-search-input"
                  type="text"
                  inputMode="numeric"
                  value={episodeSearch}
                  onChange={(e) => setEpisodeSearch(e.target.value)}
                  placeholder="Cari episode..."
                  className="w-full pl-8 pr-3 h-9 rounded-full border border-border bg-surface text-[13px] font-bold text-text placeholder:text-text-muted placeholder:font-medium focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition"
                />
              </div>
            )}
          </div>
          {(() => {
            const filtered = episodeSearch.trim()
              ? anime.episodes.filter((ep) =>
                  String(ep.number || '').includes(episodeSearch.trim()) ||
                  formatEpisodeTitle(ep.title, anime?.title).toLowerCase().includes(episodeSearch.trim().toLowerCase())
                )
              : anime.episodes;

            if (filtered.length === 0) {
              return (
                <div className="text-center py-8 px-4 bg-surface rounded-2xl border border-border">
                  <p className="text-[13px] font-bold text-text-secondary">Tidak ada episode yang cocok.</p>
                </div>
              );
            }

            // Nanimeid-style episode grid: kotak kecil padat, isi nomor saja,
            // baris current episode di-highlight dengan accent primary.
            return (
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 max-h-[360px] overflow-y-auto pr-1 no-scrollbar bg-surface border border-border rounded-2xl p-3">
                {filtered.map((ep) => {
                  const isCur = currentEpisode.id === ep.id;
                  return (
                    <button
                      key={ep.id}
                      onClick={() => {
                        setCurrentEpisode(ep);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`relative aspect-square rounded-lg flex items-center justify-center transition-all active:scale-[0.92] text-center font-black ${
                        isCur
                          ? 'bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary-dark'
                          : 'bg-surface-highlight text-text hover:bg-primary/15 hover:text-primary border border-border'
                      }`}
                      title={`Episode ${ep.number} — ${formatEpisodeTitle(ep.title, anime?.title)}`}
                    >
                      <span className="text-[15px] leading-none tracking-tight">{ep.number}</span>
                      {isCur && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary-light border-2 border-bg" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        )}

        {playerTab === 'comments' && (
          <CommentSection
            animeId={anime?.id || id}
            episode={currentEpisode?.number ? String(currentEpisode.number) : null}
            userId={getCurrentUserId()}
          />
        )}

        {showReportModal && (
          <div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 animate-fade-in"
            onClick={() => setShowReportModal(false)}
          >
            <div
              className="bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 max-w-md w-full shadow-2xl space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sm:hidden mx-auto -mt-2 mb-3 w-10 h-1.5 rounded-full bg-text-muted/30" />
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-red-500/15 text-red-500 flex items-center justify-center border border-red-500/25">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-black text-text leading-tight">Lapor Masalah</h3>
                  <p className="text-[12px] text-text-secondary font-medium mt-0.5">
                    Beri tahu kami bug atau masalah pada episode ini
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="w-9 h-9 rounded-2xl bg-surface-highlight hover:bg-border text-text-muted hover:text-text transition flex items-center justify-center"
                  aria-label="Tutup"
                >
                  <X size={16} />
                </button>
              </div>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Ceritakan masalah yang kamu temui... (mis. video tidak diputar, subtitle salah, episode hilang)"
                rows={4}
                maxLength={500}
                className="w-full bg-surface-highlight border border-border rounded-2xl px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-[13.5px] font-medium resize-none"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-text-muted font-bold">{reportText.length}/500</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2.5 rounded-2xl bg-surface-highlight hover:bg-border text-text font-bold text-[13px]"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const body = reportText.trim();
                      if (!body) return;
                      try {
                        await fetch(`${API_BASE_URL}/report`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            userId: getCurrentUserId(),
                            animeId: anime?.id || id,
                            episode: currentEpisode?.number || null,
                            source: activeSource,
                            body,
                          }),
                        }).catch(() => {});
                      } catch {}
                      setShowReportModal(false);
                      setReportText('');
                      showToast('Laporan dikirim. Terima kasih!');
                    }}
                    disabled={!reportText.trim()}
                    className="px-4 py-2.5 rounded-2xl bg-primary hover:bg-primary-dark text-white font-bold text-[13px] disabled:opacity-50"
                  >
                    Kirim Laporan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Unduh per-episode (di dalam player page). Pakai pemilih resolusi
            yang sama dengan modal di detail view — bukan placeholder "batch
            dimatikan" lagi. */}
        {showDownloadModal && (
          <div
            data-testid="unduh-episode-modal-player"
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 animate-fade-in"
            onClick={() => setShowDownloadModal(false)}
          >
            <div
              className="bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 max-w-md w-full shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sm:hidden mx-auto -mt-2 mb-3 w-10 h-1.5 rounded-full bg-text-muted/30" />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/25">
                  <Download size={22} />
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <h3 className="text-lg font-black text-text leading-tight">
                    Unduh Episode {currentEpisode?.number || ''}
                  </h3>
                  <p className="text-[12px] text-text-secondary font-medium leading-relaxed">
                    Pilih kualitas video. Unduhan jalan di latar belakang.
                  </p>
                </div>
              </div>
              <div className="space-y-2.5">
                {(() => {
                  const groups = groupDownloadByResolution();
                  if (!groups.length) {
                    return (
                      <div className="text-center text-[13px] text-text-secondary py-6 bg-surface-highlight rounded-2xl border border-border">
                        {episodeDetails
                          ? 'Tidak ada link download untuk episode ini.'
                          : 'Memuat link download...'}
                      </div>
                    );
                  }
                  return groups.map((g, idx) => {
                    const isMax = idx === 0;
                    const is4K = g.resolution === '4K';
                    const sourceName = g.hosts[0]?.host || 'Server';
                    return (
                      <div
                        key={g.resolution}
                        className={`w-full rounded-2xl border overflow-hidden transition-all ${
                          isMax
                            ? 'bg-gradient-to-br from-primary to-primary-dark border-primary-dark text-white shadow-lg shadow-primary/30'
                            : 'bg-surface-highlight border-border text-text'
                        }`}
                      >
                        <div className="flex items-center justify-between px-4 pt-4 pb-2.5 gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span className={`flex items-center justify-center w-12 h-12 rounded-xl text-[12px] font-black shrink-0 ${
                              isMax
                                ? 'bg-white/25 text-white'
                                : (is4K ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300' : 'bg-surface text-text border border-border')
                            }`}>
                              {g.resolution}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[14px] font-black leading-snug flex items-center gap-2 flex-wrap">
                                {g.resolution}
                                {is4K && <span className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Ultra HD</span>}
                                {isMax && <span className="text-[9px] uppercase tracking-[0.18em] font-black bg-white/25 px-1.5 py-0.5 rounded">Maks</span>}
                              </span>
                              <span className={`text-[11px] font-semibold mt-0.5 truncate ${isMax ? 'text-white/85' : 'text-text-muted'}`}>
                                {sourceName} · {g.hosts.length} mirror
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          data-testid="download-quality-option-player"
                          onClick={() => {
                            const HOST_PRIORITY = ['kdrive', 'iino', 'komari', 'asuna', 'kitasan', 'chisato', 'huntersekai', 'mp4upload', 'krakenfiles', 'gofile', 'mirror', 'pdrain', 'pixeldrain'];
                            const ranked = [...g.hosts].sort((a, b) => {
                              const ra = HOST_PRIORITY.findIndex((h) => (a.host || '').toLowerCase().includes(h));
                              const rb = HOST_PRIORITY.findIndex((h) => (b.host || '').toLowerCase().includes(h));
                              return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
                            });
                            startBackgroundDownload(ranked.map((r) => r.url), g.resolution);
                          }}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-[0.18em] transition active:scale-[0.98] ${
                            isMax
                              ? 'bg-white/20 hover:bg-white/30 text-white'
                              : 'bg-primary hover:bg-primary-dark text-white'
                          }`}
                        >
                          <Download size={15} strokeWidth={2.5} />
                          Download
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="w-full bg-surface-highlight hover:bg-border text-text font-bold py-3.5 rounded-2xl transition active:scale-95 text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Custom Toast Alert */}
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 pointer-events-none ${toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="bg-white border border-[#e4e4e7] text-black px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-2 max-w-[90vw] text-center border-l-4 border-l-[#c68a4e]">
            <p className="text-xs font-bold tracking-wide">{toastMessage}</p>
          </div>
        </div>

        {/* Toast unduh latar belakang — pojok kiri bawah */}
        <div
          data-testid="download-started-toast"
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 pointer-events-none ${
            downloadStartedToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {downloadStartedToast && (
            <div className="bg-[#18181b] text-white pl-4 pr-5 py-3 rounded-2xl shadow-2xl border border-[#27272a] flex items-center gap-3 max-w-[88vw]">
              <span className="relative w-5 h-5 inline-flex shrink-0">
                <span className="absolute inset-0 border-2 border-white/20 rounded-full" />
                <span className="absolute inset-0 border-2 border-[#c68a4e] border-t-transparent rounded-full animate-spin" />
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-black tracking-wide leading-tight">Mulai mengunduh</span>
                <span className="text-[10px] text-zinc-300 font-medium leading-tight truncate max-w-[60vw]">
                  {downloadStartedToast.title} · EP {downloadStartedToast.episode} · {downloadStartedToast.resolution}
                </span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
