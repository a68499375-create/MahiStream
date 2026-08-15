import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/client";
import { cx, Poster } from "./ui/index";
import { SearchIcon, HomeIcon, CompassIcon, ClockIcon, BookmarkIcon, TrophyIcon, SettingsIcon, ShuffleIcon, CommandIcon, XIcon, PlayIcon } from "./icons";

const NAV = [
  { label: "Beranda", hint: "Halaman utama", href: "/", Icon: HomeIcon },
  { label: "Jelajahi Anime", hint: "Browse semua anime", href: "/browse", Icon: CompassIcon },
  { label: "Peringkat Teratas", hint: "Top anime", href: "/ranking", Icon: TrophyIcon },
  { label: "Riwayat Tonton", hint: "History", href: "/history", Icon: ClockIcon },
  { label: "Bookmark", hint: "Tersimpan", href: "/bookmark", Icon: BookmarkIcon },
  { label: "Pengaturan", hint: "Settings", href: "/settings", Icon: SettingsIcon },
];

let _triggerPalette = null;

export function openPalette() {
  if (_triggerPalette) _triggerPalette();
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => { _triggerPalette = () => setOpen(o => !o); return () => { _triggerPalette = null; }; }, []);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setResults([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api(`/anime?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then(d => setResults(d.animeList || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const flat = useMemo(() => {
    const list = [];
    if (!q.trim()) {
      NAV.forEach(n => list.push({ kind: "nav", ...n }));
      list.push({ kind: "nav", label: "Anime Acak", hint: "Surprise me", href: "RANDOM", Icon: ShuffleIcon });
    } else {
      list.push(...NAV.map(n => ({ kind: "nav", ...n })));
      results.forEach(a => list.push({ kind: "anime", label: a.title, href: `/anime/${a.id}`, anime: a }));
    }
    return list;
  }, [q, results]);

  useEffect(() => setActive(0), [q]);

  const go = useCallback((href) => {
    setOpen(false);
    if (href === "RANDOM") {
      api("/random").then(a => { if (a && a.id) navigate(`/anime/${a.id}`); });
    } else {
      navigate(href);
    }
  }, [navigate]);

  const onKeyNav = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const item = flat[active]; if (item) go(item.href); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="fade-up w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon size={18} className="text-muted" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyNav}
            placeholder="Cari anime atau navigasi cepat..."
            className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted focus:outline-none focus:ring-0"
            style={{ WebkitTapHighlightColor: 'transparent' }} />
          <kbd className="hidden rounded bg-elevated px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {!q.trim() && <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Navigasi</div>}
          {flat.map((item, i) => (
            <button key={item.kind + item.href + i} onMouseEnter={() => setActive(i)} onClick={() => go(item.href)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${active === i ? "bg-accent/15" : "hover:bg-elevated"}`}>
              {item.kind === "nav" && item.Icon ? (
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active === i ? "bg-accent text-white" : "bg-elevated text-muted"}`}>
                  <item.Icon size={16} />
                </span>
              ) : item.anime ? (
                <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-elevated">
                  <Poster title={item.anime.title} poster={item.anime.poster} />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className={`line-clamp-1 text-sm font-medium ${active === i ? "text-accent2" : "text-ink"}`}>{item.label}</p>
                {item.hint && <p className="text-xs text-muted">{item.hint}</p>}
                {item.anime && <p className="text-xs text-muted">{item.anime.episode_count} ep · Rating {Number(item.anime.rating || 0).toFixed(1)}</p>}
              </div>
              {active === i && <span className="text-xs text-accent2">↵</span>}
            </button>
          ))}
          {q.trim() && !loading && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">Tidak ada anime untuk &ldquo;{q}&rdquo;</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><kbd className="rounded bg-elevated px-1 py-0.5">↑</kbd><kbd className="rounded bg-elevated px-1 py-0.5">↓</kbd> navigasi</span>
          <span className="flex items-center gap-1"><kbd className="rounded bg-elevated px-1 py-0.5">↵</kbd> pilih</span>
          <span className="flex items-center gap-1">⌘+K buka</span>
        </div>
      </div>
    </div>
  );
}
