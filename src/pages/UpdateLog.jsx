import Shell from '../components/Shell';
import { InfoIcon } from '../components/icons';

const LOG = [
  {
    version: '2.1.0',
    date: 'Agustus 2026',
    items: [
      'Resume progres: episode yang sudah ditonton kini menampilkan badge & indikator waktu di kartu episode (berlaku di anime & konten khusus)',
      'Konten khusus: tombol Detail & Tonton memakai id asli sehingga history/resume tersambung dengan benar',
      'Konten khusus: urutan episode otomatis diurutkan saat upload & tampil (tidak perlu upload ulang)',
      'Label resolusi Kemonokko Tsuushin dibetulkan menjadi 1080p',
      'Keamanan: verifikasi login Google dikunci ke client id resmi, rate limit per IP, password admin diperiksa timing-safe via env',
      'Database: data korup otomatis dibackup sebelum diperbaiki',
      'Label versi dibetulkan konsisten 2.1.0 di halaman Pengaturan, Maintenance, & Syarat Ketentuan',
      'Aset web dibersihkan: file yang tidak terpakai dihapus supaya lebih ringan'
    ]
  },
  {
    version: '4.0.28',
    date: 'Agustus 2026',
    items: [
      'Pemutar video: dropdown pemilih kecepatan dikembalikan, tombol cepat inline 1.25x/1.5x/2x dihapus',
      'Resolusi video: badge & highlight menu kini menampilkan resolusi yang benar-benar diputar (activeQuality), bukan default 1080p',
      'Halaman Khusus: tombol Tonton dibuat ikon play saja (tanpa teks) supaya tidak terpotong di layar kecil',
      'Resume progres: episode yang sudah ditonton dilanjutkan dari detik terakhir, berlaku di anime & konten khusus',
      'Komunitas: popup gabung komunitas muncul sekali per sesi (setelah tutup muncul lagi saat buka ulang aplikasi)',
      'Bot Discord MahiStream: 41+ slash command (tiket kode urut harian ala Ticket Tool, request anime, staff roles, logging, moderasi, auto-rule NSFW & invite)',
      'Server Discord: onboarding, welcome message, panel tiket, panel request anime — semua siap dipakai'
    ]
  },
  {
    version: "4.0.26",
    date: 'Juli 2026',
    items: [
      'Perbaikan keamanan: password admin & khusus diganti, key lama dihapus total',
      'Guard role: pengunjung dengan role user otomatis diredirect dari panel Admin & DevPanel',
      'Header keamanan: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy',
      'TLS 1.2/1.3 saja (TLS 1.0/1.1 dimatikan), CORS dibatasi, rate limit streaming'
    ]
  },
  {
    version: '4.0.22-24',
    date: 'Juli 2026',
    items: [
      'Pengisian episode bolong (Class de 2-Banme, Getsuyoubi no Tawawa Specials, Dungeon ni Deai, Gimai Seikatsu, dll) — total +75 episode',
      'Tombol Tonton di halaman Khusus dibuat sejajar & seragam lebarnya dengan tombol Detail',
      'Video player: dukungan offline/web lokal, perbaikan tombol "Coba Resolusi Lain"',
      'Endpoint API /api/settings/community: link Telegram, WhatsApp, Discord terpusat',
      'Halaman Pengaturan: section Komunitas dengan link Telegram, WhatsApp, dan Discord'
    ]
  },
  {
    version: '4.0.18',
    date: 'Juni 2026',
    items: [
      'Halaman komunitas / khusus dengan password konten',
      'Login Google (OAuth) dan sinkronisasi data',
      'Notifikasi push otomatis untuk episode baru',
      'Halaman Ranking, Jadwal Rilis, Genres, Watchlist, Bookmark, History'
    ]
  }
];

function VersionBlock({ v }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><InfoIcon size={18} /></div>
        <div className="flex-1">
          <h2 className="font-bold text-ink">MahiStream v{v.version}</h2>
          <p className="text-xs text-muted">{v.date}</p>
        </div>
      </div>
      <ul className="space-y-2.5 pl-1">
        {v.items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-ink/85 leading-relaxed">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function UpdateLog() {
  return (
    <Shell nav subtitle="Update Log">
      <div className="space-y-4 py-2">
        {LOG.map((v, i) => (<VersionBlock key={i} v={v} />))}
      </div>
      <footer className="mt-8 text-center text-xs text-muted">
        MahiStream — Update Log
      </footer>
    </Shell>
  );
}