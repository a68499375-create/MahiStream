import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, uid } from "../lib/client";
import { getProfile } from "../lib/prefs";
import { Btn, Spinner } from "./ui/index";
import { MessageIcon, SendIcon, TrashIcon, ThumbsUpIcon, ThumbsDownIcon } from "./icons";

export default function Comments({ animeId, episode }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("Penonton");
  const [sending, setSending] = useState(false);
  const [filterEp, setFilterEp] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const ep = (episode && filterEp) ? `&episode=${episode}` : "";
    api(`/comments?animeId=${animeId}${ep}`)
      .then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [animeId, episode, filterEp]);

  useEffect(() => { setAuthor(getProfile().displayName || "Penonton"); load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const c = await api("/comments", {
        method: "POST",
        body: JSON.stringify({ userId: uid(), animeId, text: body.trim(), author, episode: filterEp ? episode : null }),
      });
      setItems(p => [c, ...p]);
      setBody("");
    } catch {} finally { setSending(false); }
  };

  const submitReply = async (parentId) => {
    if (!replyBody.trim()) return;
    try {
      const c = await api("/comments", {
        method: "POST",
        body: JSON.stringify({ userId: uid(), animeId, text: replyBody.trim(), author, episode: filterEp ? episode : null, parentId }),
      });
      setItems(p => [...p, c]);
      setReplyBody("");
      setReplyTo(null);
    } catch {}
  };

  const remove = async (id) => {
    setItems(p => p.filter(c => c.id !== id && c.parent_id !== id));
    await api(`/comments/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const react = async (c, type) => {
    setItems(p => p.map(x => {
      if (x.id !== c.id) return x;
      const likes = (x.likes || []).filter(u => u !== uid());
      const dislikes = (x.dislikes || []).filter(u => u !== uid());
      if (type === "like") likes.push(uid());
      else if (type === "dislike") dislikes.push(uid());
      return { ...x, likes, dislikes };
    }));
    await api(`/comments/${c.id}/react`, { method: "PUT", body: JSON.stringify({ userId: uid(), type }) }).catch(() => {});
  };

  const topLevel = items.filter(c => !c.parent_id);
  const repliesOf = (id) => items.filter(c => c.parent_id === id);

  const renderComment = (c, isReply = false) => {
    const mine = c.user_id === uid();
    const myLike = (c.likes || []).includes(uid());
    const myDis = (c.dislikes || []).includes(uid());
    return (
      <div key={c.id} className={isReply ? "ml-12 mt-3" : "mt-3"}>
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-caramel text-xs font-bold text-white">
            {c.author?.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-xl rounded-tl-sm bg-elevated px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{c.author}</span>
                  {c.episode && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent2">EP {c.episode}</span>
                  )}
                </div>
                {mine && (
                  <button onClick={() => remove(c.id)} className="text-muted transition hover:text-rose-400" aria-label="Hapus komentar">
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink/90">{c.text}</p>
            </div>
            <div className="mt-1 flex items-center gap-3 pl-1 text-[11px] text-muted/70">
              <span>{fmtDate(c.created_at)}</span>
              <button onClick={() => react(c, "like")} className={cx("flex items-center gap-1 transition", myLike ? "text-accent2 font-semibold" : "hover:text-ink")}>
                <ThumbsUpIcon size={12} /> {(c.likes || []).length}
              </button>
              <button onClick={() => react(c, "dislike")} className={cx("flex items-center gap-1 transition", myDis ? "text-rose font-semibold" : "hover:text-ink")}>
                <ThumbsDownIcon size={12} /> {(c.dislikes || []).length}
              </button>
              {!isReply && (
                <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="flex items-center gap-1 hover:text-ink">
                  <ReplyIcon size={12} /> Balas
                </button>
              )}
            </div>
            {replyTo === c.id && (
              <div className="mt-2 flex gap-2">
                <input value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Balas komentar..." maxLength={500}
                  onKeyDown={e => { if (e.key === "Enter") submitReply(c.id); }}
                  className="flex-1 rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
                <Btn onClick={() => submitReply(c.id)} disabled={!replyBody.trim()}><SendIcon size={14} /></Btn>
                <Btn onClick={() => { setReplyTo(null); setReplyBody(""); }} variant="ghost">Batal</Btn>
              </div>
            )}
            {repliesOf(c.id).map(r => renderComment(r, true))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-ink">
        <MessageIcon size={20} className="text-accent" />
        Diskusi
        {items.length > 0 && <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">{items.length}</span>}
      </h2>

      {episode && (
        <div className="mb-4 flex gap-1.5">
          <button onClick={() => setFilterEp(false)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${!filterEp ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>
            Semua Episode
          </button>
          <button onClick={() => setFilterEp(true)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${filterEp ? "bg-accent text-white" : "bg-elevated text-muted hover:text-ink"}`}>
            Hanya EP {episode}
          </button>
        </div>
      )}

      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input value={body} onChange={e => setBody(e.target.value)} placeholder={filterEp && episode ? `Komentar untuk EP ${episode}...` : "Tulis komentar..."} maxLength={500}
          className="flex-1 rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        <Btn type="submit" disabled={sending || !body.trim()}><SendIcon size={16} /></Btn>
      </form>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : topLevel.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Jadilah yang pertama berkomentar.</p>
      ) : (
        <div className="space-y-1">
          {topLevel.map(c => renderComment(c))}
        </div>
      )}
    </div>
  );
}

function cx(...args) {
  return args.filter(Boolean).join(" ");
}

function ReplyIcon({ size = 16, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 5 5v6" />
    </svg>
  );
}
