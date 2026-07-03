import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, ThumbsUp, Trash2, CornerDownRight } from 'lucide-react';
import { listComments, createComment, likeComment, deleteComment, subscribeCommentsSSE } from '../services/api';

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

export default CommentSection;
