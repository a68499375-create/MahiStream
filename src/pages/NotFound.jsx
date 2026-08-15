import { Link } from 'react-router-dom';
import Shell from '../components/Shell';

export default function NotFound() {
  return (
    <Shell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center px-4">
        <div className="text-8xl select-none animate-bounce">🌊</div>
        <div>
          <h1 className="text-5xl font-extrabold text-ink tracking-tight">404</h1>
          <p className="mt-2 text-lg font-semibold text-muted">Halaman Tidak Ditemukan</p>
          <p className="mt-1 text-sm text-muted max-w-xs mx-auto">
            Halaman yang kamu cari tidak ada atau sudah dipindahkan.
            Mungkin salah ketik? Coba cari anime favoritmu!
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/"
            className="rounded-2xl bg-accent px-6 py-3 text-sm font-bold text-white shadow hover:bg-accent2 transition-colors"
          >
            🏠 Kembali ke Beranda
          </Link>
          <Link
            to="/search"
            className="rounded-2xl border border-line bg-elevated px-6 py-3 text-sm font-bold text-ink shadow hover:bg-line transition-colors"
          >
            🔍 Cari Anime
          </Link>
        </div>
      </div>
    </Shell>
  );
}
