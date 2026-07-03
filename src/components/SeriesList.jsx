import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { searchAnimeAggregate, API_BASE_URL } from '../services/api';

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
        // Untuk Nekopoi: pakai endpoint /nekopoi/search langsung karena
        // aggregate biasanya tidak include Nekopoi penuh (timeout cepat).
        // Untuk source lain: pakai aggregate yang sudah merge multi-source.
        let res;
        if (activeSource === 'nekopoi') {
          try {
            const r = await fetch(`${API_BASE_URL}/nekopoi/search?q=${encodeURIComponent(rootTitle)}`);
            const j = await r.json();
            const list = j?.data || [];
            res = (Array.isArray(list) ? list : []).map((it) => ({
              id: it.id || it.animeId,
              title: it.title,
              poster_url: it.image || it.poster || '',
              year: it.year || null,
              availableSources: ['nekopoi'],
              sourceIds: { nekopoi: it.id || it.animeId },
              _source: 'nekopoi',
            }));
          } catch {
            res = [];
          }
        } else {
          res = await searchAnimeAggregate(rootTitle);
        }
        if (cancelled) return;
        if (!Array.isArray(res)) { setItems([]); return; }
        const list = res
          .filter((it) => {
            const t = normalize(it.title);
            if (!t) return false;
            if (!t.includes(rootNorm) && !rootNorm.includes(t)) return false;
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
        // Untuk Nekopoi: limit lebih tinggi (50) karena seri hentai sering
        // punya banyak varian (S1/S2/Episode/Special) yang user mau lihat
        // semua. Source lain tetap 20.
        setItems(list.slice(0, activeSource === 'nekopoi' ? 50 : 20));
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

export default SeriesList;
