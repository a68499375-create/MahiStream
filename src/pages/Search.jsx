import { useState, useEffect, useRef } from "react";
import { api } from "../lib/client";
import { AnimeCard, EmptyState, GridSkeleton } from "../components/ui/index";
import Shell from "../components/Shell";
import { SearchIcon, XIcon, ClockIcon } from "../components/icons";

const HISTORY_KEY = "mahi-search-history";
const loadHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveHistory = (arr) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 100)));
  } catch {}
};

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [showHist, setShowHist] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recs, setRecs] = useState([]);
  const [populer, setPopuler] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    api("/anime?limit=6").then(d => setRecs(d.animeList || [])).catch(() => {});
    api("/trending-real?limit=6").then(d => setPopuler(d.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await api(`/anime?q=${encodeURIComponent(query)}&limit=50`);
        setResults(d.animeList || []);
      } catch {} finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const commitSearch = (q) => {
    const v = q.trim();
    if (!v) return;
    setHistory(prev => {
      const next = [v, ...prev.filter(x => x.toLowerCase() !== v.toLowerCase())].slice(0, 100);
      saveHistory(next);
      return next;
    });
  };

  const removeHist = (e, q) => {
    e.stopPropagation();
    setHistory(prev => {
      const n = prev.filter(x => x !== q);
      saveHistory(n);
      return n;
    });
  };

  const clearHist = () => {
    setHistory([]);
    saveHistory([]);
    setDeleteConfirmOpen(false);
  };

  return (
    <Shell>
      <div className="relative mb-6">
        <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={ref}
          type="text"
          data-testid="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowHist(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSearch(query);
          }}
          placeholder="Cari judul anime..."
          autoFocus
          className="w-full rounded-2xl border border-line bg-elevated py-3.5 pl-11 pr-12 text-sm font-medium text-ink outline-none placeholder:text-muted"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              ref.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          >
            <XIcon size={18} />
          </button>
        )}

        {/* Search History Display */}
        <div data-testid="search-history-list" className="mt-3">
          {history.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
                  <ClockIcon size={13} /> Pencarian terakhir
                </span>
                <button
                  data-testid="search-history-delete-btn"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="text-[11px] font-semibold text-muted2 hover:text-rose"
                >
                  Hapus Riwayat
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.map(h => (
                  <button
                    key={h}
                    onClick={() => {
                      setQuery(h);
                      commitSearch(h);
                    }}
                    className="group flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent"
                  >
                    {h}
                    <XIcon
                      size={11}
                      className="text-muted2 opacity-0 transition group-hover:opacity-100"
                      onClick={(e) => removeHist(e, h)}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmOpen && (
        <div data-testid="search-delete-confirm-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
            <p data-testid="search-delete-confirm-text" className="text-sm font-bold text-ink mb-4">
              Apakah anda yakin akan menghapus ini dari riwayat pencarian?
            </p>
            <div className="flex justify-center gap-3">
              <button
                data-testid="search-delete-cancel-btn"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-full border border-line bg-elevated px-5 py-2 text-xs font-bold text-ink hover:bg-surface"
              >
                Batal
              </button>
              <button
                data-testid="search-delete-confirm-btn"
                onClick={clearHist}
                className="rounded-full bg-rose px-5 py-2 text-xs font-bold text-white shadow hover:brightness-110"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <GridSkeleton count={6} className="grid-cols-2 sm:grid-cols-3" />
      ) : !query.trim() && !searched ? (
        <div className="space-y-6">
          <section data-testid="rekomendasi-section">
            <h3 className="mb-3 text-sm font-bold text-ink">Rekomendasi Untukmu</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(recs.length ? recs : results).slice(0, 6).map(a => (
                <div key={a.id} data-testid="rekomendasi-card" className="rounded-xl">
                  <AnimeCard anime={a} compact />
                </div>
              ))}
            </div>
          </section>

          <section data-testid="populer-section">
            <h3 className="mb-3 text-sm font-bold text-ink">Pencarian Populer</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(populer.length ? populer : results).slice(0, 6).map(a => (
                <AnimeCard key={a.id} anime={a} compact />
              ))}
            </div>
          </section>
        </div>
      ) : results.length === 0 ? (
        <EmptyState title={`Tidak ditemukan untuk "${query}"`} />
      ) : (
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
          {results.map(a => (
            <AnimeCard key={a.id} anime={a} compact />
          ))}
        </div>
      )}
    </Shell>
  );
}
