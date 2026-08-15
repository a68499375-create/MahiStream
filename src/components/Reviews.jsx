import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, uid } from "../lib/client";
import { Btn, Spinner, cx } from "./ui/index";
import { MessageIcon, StarIcon, TrashIcon } from "./icons";

export default function Reviews({ animeId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api(`/reviews?animeId=${animeId}`)
      .then(d => {
        const arr = Array.isArray(d) ? d : (d?.items || []);
        const avg = arr.length ? arr.reduce((s, r) => s + (r.rating || 0), 0) / arr.length : 0;
        setData({ items: arr, count: arr.length, average: avg });
        const mine = arr.find(r => r.user_id === uid());
        if (mine) { setMyRating(Math.round(mine.rating / 2)); setComment(mine.text || ""); }
      }).catch(() => {}).finally(() => setLoading(false));
  }, [animeId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (myRating === 0) return;
    setSubmitting(true);
    try {
      await api("/reviews", {
        method: "POST",
        body: JSON.stringify({ userId: uid(), animeId, rating: myRating * 2, text: comment.trim() || undefined }),
      });
      load();
    } catch {} finally { setSubmitting(false); }
  };

  const remove = async () => {
    setMyRating(0); setComment("");
    await api(`/reviews`, "DELETE", { userId: uid(), animeId }).catch(() => {});
    load();
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-ink">
        <MessageIcon size={20} className="text-accent" /> Ulasan & Rating
      </h2>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[200px_1fr]">
          <div className="flex flex-row items-center gap-4 md:flex-col md:items-start md:gap-1">
            <div className="text-5xl font-extrabold text-ink">{data && data.count > 0 ? Number(Number(data.average) || 0).toFixed(1) : "—"}</div>
            <div>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon key={i} size={16}
                    className={data && i < Math.round((data.average || 0) / 2) ? "text-accent fill-accent" : "text-line"} />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{data?.count ?? 0} ulasan</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl bg-elevated p-3">
              <p className="mb-2 text-xs font-medium text-muted">Beri rating kamu</p>
              <div className="mb-2 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const val = i + 1;
                  return (
                    <button key={i} onMouseEnter={() => setHover(val)} onMouseLeave={() => setHover(0)} onClick={() => setMyRating(val)} aria-label={`${val} bintang`}>
                      <StarIcon size={26} className={`transition ${(hover || myRating) >= val ? "text-accent fill-accent" : "text-line"}`} />
                    </button>
                  );
                })}
              </div>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
                placeholder="Tulis ulasan (opsional)..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
              <div className="mt-2 flex gap-2">
                <Btn onClick={submit} disabled={submitting || myRating === 0}>{submitting ? "Menyimpan..." : "Kirim Ulasan"}</Btn>
                {myRating > 0 && (
                  <button onClick={remove} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-muted hover:text-rose-400">
                    <TrashIcon size={14} /> Hapus
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {data && data.count > 0 ? data.items.map(r => (
                <div key={r.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-caramel text-[11px] font-bold text-white">
                        {r.author?.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-ink">{r.author}</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-bold text-accent">
                      <StarIcon size={12} className="fill-accent" />{Number(Number(r.rating) / 2 || 0).toFixed(1)}
                    </span>
                  </div>
                  {r.text && <p className="mt-2 text-sm leading-relaxed text-muted">{r.text}</p>}
                  <p className="mt-1.5 text-[11px] text-muted/70">{fmtDate(r.created_at)}</p>
                </div>
              )) : (
                <p className="py-4 text-center text-sm text-muted">Jadilah yang pertama memberi ulasan.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
