import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, inputCls } from '../lib/client';
import Shell from '../components/Shell';
import { Btn, Spinner, EmptyState } from '../components/ui/index';
import { LockIcon, LockOpenIcon, PlayIcon, EyeIcon, LogOutIcon, FilmIcon } from '../components/icons';
import { isKhususUnlocked, unlockKhusus, lockKhusus, subscribeKhusus } from '../utils/khususAuth';

export default function Khusus() {
  const [unlocked, setUnlocked] = useState(() => isKhususUnlocked());
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeKhusus(v => setUnlocked(v));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    api('/khusus').then(d => {
      setAnimeList(Array.isArray(d) ? d : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [unlocked]);

  const handleUnlock = (e) => {
    e.preventDefault();
    const result = unlockKhusus(pw);
    if (result.ok) { setPw(''); setPwError(''); }
    else if (result.throttled) setPwError('Terlalu banyak percobaan. Tunggu beberapa menit.');
    else setPwError('Password akses salah');
  };

  if (!unlocked) {
    return (
      <Shell>
        <div className="flex min-h-[75vh] items-center justify-center px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xl">
            <form onSubmit={handleUnlock} className="text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-elevated text-accent">
                <LockIcon size={30} />
              </div>

              <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-[11px] font-bold text-accent">
                Akses Terproteksi
              </div>

              <h1 className="mt-1 text-xl font-bold text-ink">Konten Khusus</h1>
              <p className="mt-1.5 mb-6 text-xs text-muted leading-relaxed">
                Masukkan kata sandi untuk mengakses halaman koleksi khusus MahiStream.
              </p>

              <div className="relative mb-4 text-left">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setPwError(''); }}
                  placeholder="Password..."
                  autoFocus
                  autoComplete="off"
                  className={inputCls + " w-full py-3 pl-4 pr-11 text-sm rounded-xl border-line bg-elevated focus:border-accent"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink"
                  aria-label="Tampilkan password"
                >
                  <EyeIcon size={18} />
                </button>
              </div>

              {pwError && (
                <div className="mb-4 rounded-xl border border-red/30 bg-red/10 px-3.5 py-2 text-xs font-semibold text-red">
                  {pwError}
                </div>
              )}

              <Btn type="submit" className="w-full justify-center py-3 text-sm font-bold">
                <LockOpenIcon size={16} /> Buka Akses
              </Btn>

              <p className="mt-4 text-[11px] text-muted2">
                Proteksi Keamanan: Maksimal 5 percobaan per 5 menit.
              </p>
            </form>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Eksklusif</span>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">Koleksi Konten Khusus</h1>
          </div>
          <p className="mt-1 text-xs text-muted">Daftar tayangan khusus dan konten eksklusif MahiStream.</p>
        </div>

        <button
          onClick={() => lockKhusus()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-elevated px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-red/40 hover:text-red"
        >
          <LogOutIcon size={14} /> Keluar Akses
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : animeList.length === 0 ? (
        <EmptyState title="Belum ada konten khusus" desc="Konten khusus terbaru akan muncul di sini setelah diunggah oleh pengelola." />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {animeList.map(a => {
            const links = Array.isArray(a.gdrive_links) ? a.gdrive_links : [];
            const episodeCount = links.length || (Array.isArray(a.episodes) ? a.episodes.length : 1);

            return (
              <div
                key={a.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition duration-200 hover:border-accent/40 hover:shadow-md"
              >
                <div className="relative aspect-video overflow-hidden bg-elevated">
                  {a.poster ? (
                    <img
                      src={a.poster}
                      alt={a.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-elevated text-muted">
                      <FilmIcon size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-surface/90 via-transparent to-transparent" />

                  <div className="absolute bottom-2 right-2">
                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                      {episodeCount} Ep
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-2.5">
                  <h3 className="line-clamp-2 text-xs font-bold text-ink transition group-hover:text-accent">
                    {a.title}
                  </h3>

                  <div className="mt-2.5 flex items-center justify-between gap-1.5 pt-2 border-t border-line/60">
                    <Link
                      to={`/anime/${a.id}`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-elevated px-1.5 py-1.5 text-[11px] font-semibold text-ink transition hover:bg-surface"
                    >
                      <FilmIcon size={12} /> Detail
                    </Link>

                    <Link
                      to={`/video/${a.id}`}
                      aria-label="Tonton"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:brightness-110"
                    >
                      <PlayIcon size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
