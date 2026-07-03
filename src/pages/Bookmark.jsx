import { Heart, Trash2, Lock, Play, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import { getCurrentUserId } from '../services/api';

// Bookmarks per-akun: prefix kunci localStorage dengan user id supaya
// setiap akun (atau guest device) punya daftar simpanan terpisah.
const bookmarkKey = (suffix) => `mahistream_bookmarks_${suffix}_${getCurrentUserId()}`;

// Migrasi otomatis dari format lama (`mahistream_bookmarks` /
// `mahistream_bookmarks_khusus` tanpa user id) ke per-akun. Migrasi
// dilakukan sekali ke akun yang sedang aktif supaya data lama tidak hilang.
const migrateLegacyBookmarks = () => {
  try {
    const flagKey = `mahistream_bookmarks_migrated_${getCurrentUserId()}`;
    if (localStorage.getItem(flagKey) === '1') return;
    const legacyUmum = JSON.parse(localStorage.getItem('mahistream_bookmarks') || '[]');
    const legacyKhusus = JSON.parse(localStorage.getItem('mahistream_bookmarks_khusus') || '[]');
    if (legacyUmum.length > 0) {
      const cur = JSON.parse(localStorage.getItem(bookmarkKey('umum')) || '[]');
      const ids = new Set(cur.map((b) => b.id));
      const merged = [...cur, ...legacyUmum.filter((b) => !ids.has(b.id))];
      localStorage.setItem(bookmarkKey('umum'), JSON.stringify(merged));
    }
    if (legacyKhusus.length > 0) {
      const cur = JSON.parse(localStorage.getItem(bookmarkKey('khusus')) || '[]');
      const ids = new Set(cur.map((b) => b.id));
      const merged = [...cur, ...legacyKhusus.filter((b) => !ids.has(b.id))];
      localStorage.setItem(bookmarkKey('khusus'), JSON.stringify(merged));
    }
    localStorage.setItem(flagKey, '1');
  } catch {}
};

export default function Bookmark() {
  const [bookmarksUmum, setBookmarksUmum] = useState([]);
  const [bookmarksKhusus, setBookmarksKhusus] = useState([]);
  const [activeTab, setActiveTab] = useState('umum');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    migrateLegacyBookmarks();
    let umum = JSON.parse(localStorage.getItem(bookmarkKey('umum')) || '[]');
    let khusus = JSON.parse(localStorage.getItem(bookmarkKey('khusus')) || '[]');

    // Auto-migrate nekopoi dari umum ke khusus
    const toMove = umum.filter((b) => b.source === 'nekopoi');
    if (toMove.length > 0) {
      khusus = [...khusus, ...toMove];
      umum = umum.filter((b) => b.source !== 'nekopoi');
      localStorage.setItem(bookmarkKey('umum'), JSON.stringify(umum));
      localStorage.setItem(bookmarkKey('khusus'), JSON.stringify(khusus));
    }

    setBookmarksUmum(umum);
    setBookmarksKhusus(khusus);
  }, []);

  const handleDelete = (id, type) => {
    if (type === 'umum') {
      const newB = bookmarksUmum.filter((b) => b.id !== id);
      setBookmarksUmum(newB);
      localStorage.setItem(bookmarkKey('umum'), JSON.stringify(newB));
    } else {
      const newB = bookmarksKhusus.filter((b) => b.id !== id);
      setBookmarksKhusus(newB);
      localStorage.setItem(bookmarkKey('khusus'), JSON.stringify(newB));
    }
    setConfirmDeleteId(null);
  };

  const currentBookmarks = activeTab === 'umum' ? bookmarksUmum : bookmarksKhusus;

  return (
    <div className="min-h-screen pb-28 bg-bg text-text">
      <TopBar />

      <div className="cr-container mt-8">
        {/* Header with gradient pill */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <Heart size={26} className="text-white fill-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-text leading-tight">Favorit Saya</h1>
              <p className="text-[13px] text-text-secondary font-medium leading-relaxed">
                Anime yang sudah kamu favoritkan.
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-bold">
            <Sparkles size={12} /> {currentBookmarks.length} item
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1.5 mb-8 bg-surface border border-border p-1.5 rounded-2xl w-full max-w-sm shadow-sm">
          <button
            onClick={() => setActiveTab('umum')}
            className={`flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all ${
              activeTab === 'umum'
                ? 'bg-primary text-white shadow-md shadow-primary/30'
                : 'text-text-secondary hover:text-text hover:bg-surface-highlight'
            }`}
          >
            Umum
          </button>
          <button
            onClick={() => setActiveTab('khusus')}
            className={`flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'khusus'
                ? 'bg-primary text-white shadow-md shadow-primary/30'
                : 'text-text-secondary hover:text-text hover:bg-surface-highlight'
            }`}
          >
            <Lock size={14} /> Khusus
          </button>
        </div>

        {currentBookmarks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
            {currentBookmarks.map((anime) => (
              <div
                key={anime.id}
                data-testid="bookmark-item"
                className="relative group"
              >
                <Link
                  to={`/video/${anime.id}${anime.source ? '?source=' + anime.source : ''}`}
                  className="block rounded-2xl overflow-hidden bg-surface border border-border shadow-sm card-lift"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-surface-highlight">
                    <img
                      src={anime.posterUrl || anime.poster}
                      alt={anime.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-90" />
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-primary/95 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-wider shadow-md">
                      Tersimpan
                    </span>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-primary/95 rounded-full p-3 shadow-2xl transform scale-50 group-hover:scale-100 transition-transform">
                        <Play size={22} className="text-white fill-white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="text-[13px] font-bold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {anime.title}
                    </h4>
                  </div>
                </Link>
                <button
                  onClick={() => setConfirmDeleteId({ id: anime.id, type: activeTab, title: anime.title })}
                  className="absolute top-2 left-2 p-1.5 bg-black/60 hover:bg-red-600 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 transition-all active:scale-90 shadow-lg"
                  aria-label="Hapus dari favorit"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 flex flex-col items-center animate-fade-in">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-rose-500/15 to-rose-500/5 border border-rose-500/20 flex items-center justify-center mb-6 shadow-inner">
              <Heart size={42} className="text-rose-500" />
            </div>
            <h3 className="text-lg font-black text-text mb-2">Belum ada favorit</h3>
            <p className="text-[13px] text-text-secondary mb-6 max-w-xs leading-relaxed">
              Klik ikon hati di halaman anime untuk menambahkan ke favorit.
            </p>
            <Link
              to={activeTab === 'umum' ? '/browse' : '/khusus'}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold px-6 py-3 rounded-full shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
              <Play size={16} /> Jelajahi Anime
            </Link>
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-surface border border-border rounded-3xl px-7 py-8 max-w-sm w-full shadow-2xl text-center space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center text-red-500 border border-red-500/30">
                <Trash2 size={28} />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-text leading-snug">Hapus dari favorit?</h3>
              <p className="text-[13px] text-text-secondary font-medium leading-relaxed">
                "{confirmDeleteId.title}" akan dihapus dari daftar favorit.
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <button
                onClick={() => handleDelete(confirmDeleteId.id, confirmDeleteId.type)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-full shadow-md transition active:scale-95 text-sm"
              >
                Ya, hapus
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full bg-surface-highlight hover:bg-border text-text-secondary font-bold py-3.5 rounded-full transition active:scale-95 text-sm"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
