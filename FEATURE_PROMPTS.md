# MahiStream — Feature Prompts

---

## MASTER DESIGN SYSTEM

Gunakan design system ini di SEMUA halaman:

### Colors
- Primary: `#FF66CD` (hot pink)
- Primary dark: `#E91E63`, `#C2185B`
- BG: `#0D0D0D`
- Surface: `#161616`
- Surface highlight: `#2A2A2A`
- Text: `#FFFFFF` (headings), `#F0F0F0` (body), `#AAAAAA` (secondary/muted), `#64748B` (tertiary)
- Border: `#2A2A2A`
- Borders hover: `rgba(255, 102, 205, 0.5)`

### Typography
- H1 display only: `Plus Jakarta Sans` (900 weight, ~48px)
- Everything else: `Inter` (body ~18px/400, heading ~32px/700, button ~16px/700, label ~14px/600, caption ~12px/400)
- Import: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@700;800;900&display=swap`

### Spacing (4px base)
- `4/8/12/16/20/24/32/40/48px`
- Section margins: 32-48px
- Card padding: 16px
- Form fields gap: 12px

### Elevation / Shadows
- L0 (page bg): no shadow
- L1 (cards): `0 4px 12px rgba(0,0,0,0.2)`
- L2 (hover): `0 8px 24px rgba(0,0,0,0.4)`
- L3 (modals): `0 8px 32px rgba(0,0,0,0.5)`
- L4 (neon glow - primary buttons, focus): `0 0 24px 0 rgba(255, 102, 205, 0.35)`
- L5 (intense neon - hover primary): `0 0 32px 0 rgba(255, 102, 205, 0.5)`

### Border Radius
- Buttons + cards: 12px
- Inputs + info boxes: 8px
- Small UI: 4px

### Buttons
- Primary: 56px height, ~340px width, hot pink bg, white text, 12px radius, neon glow
- Secondary: 44px height, ~165px width, glass bg (`rgba(255,255,255,0.05)`) + border
- Tertiary: text-only pink

### Inputs
- BG: `rgba(255,255,255,0.05)`, border: `#2A2A2A`, radius: 8px, padding: `12px 16px`
- Focus: border `#FF66CD`, glow `0 0 12px rgba(255,102,205,0.2)`
- Placeholder: `#AAAAAA`
- Error state: border `#EF4444`, bg `rgba(239,68,68,0.05)`
- Disabled: bg `rgba(255,255,255,0.02)`, border `#0D0D0D`, color `#64748B`

### Badges
- Primary: pink bg, white text, `16px` radius
- Secondary: glass pink bg, pink text, pink border
- Success: green glass bg, green text
- Warning: yellow glass bg, yellow text

### Responsive
- Mobile-first
- Grid columns: `4` (mobile) / `8` (tablet) / `12` (desktop)
- Buttons full-width below 480px
- Min touch target: `44x44px`

### Animations
- Fade-in: 0.2s ease-out
- Fade-in-up: 0.35s ease-out
- Skeleton shimmer: 1.5s infinite

---

## PROMPT 1 — HOME PAGE (`/`)

Buat halaman Home untuk website streaming anime MahiStream. Design system hot pink NanimeID.

### Layout
- Sticky top nav: logo "Mahi" (pink) + "Stream" (white) di kiri, search icon button di kanan. BG semi-transparan dengan backdrop blur.
- Hero section: anime pertama dari list. Poster kiri (aspect 3:4), info kanan: badge "Sedang Populer", judul (Plus Jakarta Sans, bold, putih), genre tags, tombol "Tonton" pink dengan neon glow. Background blur dari poster.
- Jika ada announcement, tampilkan card pink glass dengan icon Megaphone.
- Genre quick filter bar: scroll horizontal, 10 genre (Action, Romance, Comedy, Fantasy, Isekai, School, Sci-Fi, Drama, Slice of Life, Horror). Masing2 button surface dengan border, rounded-full.
- Jadwal rilis section (jika ada data): card surface, per hari (senin-minggu), list anime + waktu. Judul "Jadwal Rilis" dengan icon Calendar.
- Grid anime: "Daftar Anime" heading dengan link "Lihat semua" ke /browse. Grid 2/3/4/5 kolom responsive. Masing2: poster (aspect 3:4), rating badge pink di pojok, title putih, episode count + genre.
- Bottom nav: 5 tab (Beranda, Khusus, Jelajahi, Riwayat, Profil). Fixed bottom, glass bg. Active tab pink dengan dot indicator.
- Loading state: skeleton shimmer untuk semua section.

### Data (fetch dari `/api`)
- `GET /api/anime?limit=30` → `{ animeList: [...] }`
- `GET /api/announcements` → `{ content: "..." }` or null
- `GET /api/schedule` → `[{ id, day_of_week, title, time }]`

---

## PROMPT 2 — BROWSE / CATALOG (`/browse`)

Halaman katalog anime dengan filter dan infinite scroll.

### Features
- Search bar: input dengan icon search, tombol "Cari" pink di kanan, tombol X untuk clear
- Sort buttons: Terbaru / Terpopuler / A-Z. Active = pink filled, inactive = surface
- Filter toggle button: "Filter" dengan badge count jika ada filter aktif
- Filter panel (tampil/sembunyi): genre grid (15 genre: Action, Romance, Comedy, Fantasy, Isekai, School, Sci-Fi, Drama, Slice of Life, Horror, Mystery, Thriller, Mecha, Sports, Music), status filter (Ongoing/Completed)
- Anime grid: 2/3/4/5 kolom. Poster, episode count badge, title, rating star, genre pertama
- Infinite scroll: intersection observer, load more saat scroll ke bawah
- Empty state: icon Search + pesan + tombol "Coba Lagi" jika error
- Loading: skeleton shimmer + spinner

### Data
- `GET /api/anime?q=&genre=&status=&sort=&page=&limit=20` → `{ animeList, totalPages }`

---

## PROMPT 3 — SEARCH (`/search`)

Halaman search dengan debounce real-time.

- Input auto-focus dengan icon search
- Debounce 300ms
- Grid hasil 2/3 kolom
- Loading skeleton, empty state jika tidak ditemukan
- Setiap item: poster, hover play overlay, title

### Data
- `GET /api/anime?search={query}&limit=50`

---

## PROMPT 4 — VIDEO PLAYER (`/video/*`)

Full video player dengan kontrol.

### Video Wrapper
- Aspect ratio 16:9, background hitam
- HTML5 video element
- Overlay controls: auto-hide 3 detik saat playing, muncul saat mouse move / touch

### Overlay Top
- Back button (arrow left, navigate back)
- Anime title (putih, Inter 14px/600) + episode number (pink, uppercase 11px/700)

### Overlay Center
- Big play button (lingkaran, pink, neon glow) — muncul hanya saat paused

### Overlay Bottom
- Progress bar: full-width, 4px height, pink fill, shadow glow
- Controls row kiri: skip back 10s, play/pause, skip forward 10s, time display (mm:ss / mm:ss)
- Controls row kanan: speed selector (dropdown: 0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x), quality selector (dropdown dari GDrive links)
- Speed btn: icon Gauge + label "1x"
- Quality btn: icon Monitor

### Below Video
- Detail header: judul (Plus Jakarta Sans 28px/800, putih) + rating badge (pink)
- Synopsis: 13px, #AAAAAA
- Episode list: grid auto-fill minmax(140px, 1fr). Tiap episode: nomor (pink, 16px/700), title optional. Active episode = pink border + pink glass bg
- "Episode Selanjutnya" button: full-width pink dengan neon glow, icon skip forward

### Auto-save progress
- Setiap 10 detik, POST /api/history dengan { animeId, title, poster, episode, progressSeconds, durationSeconds }

### Ganti episode
- Update current episode, reset time ke 0
- Auto-advance ke episode berikutnya saat video ended (jika ada)

### Data
- `GET /api/anime/{id}` → `{ id, title, poster, synopsis, rating, episodeList: [{ id, number, title, gdrive_links }] }`
- `POST /api/history` with userId

---

## PROMPT 5 — BOOKMARKS (`/bookmark`)

Halaman bookmark.

- Heading "Bookmark" (Plus Jakarta Sans)
- Grid 2/3 kolom
- Masing2: poster (aspect 3:4), hover play overlay, title, heart icon button (merah, filled) untuk remove
- Empty state: icon Heart + "Belum ada bookmark"
- Loading: skeleton grid

### Data
- `GET /api/bookmarks?userId=...` → `[{ anime_id, title, poster_url }]`
- `POST /api/bookmarks/toggle` with `{ userId, animeId, title, poster }`

---

## PROMPT 6 — HISTORY (`/history`)

Halaman riwayat tontonan.

- Heading "Riwayat" (Plus Jakarta Sans)
- Tombol "Bersihkan" merah jika ada item
- List: tiap item = poster (aspect video ~16:9), title, episode, timestamp relatif ("baru saja" / "5m" / "3j" / "2h"), progress (misal "10m")
- Hover: play overlay di poster
- Klik item → navigate ke `/video/{anime_id}?ep={episode}`
- Tombol X merah untuk hapus item individual
- Empty state: icon Clock + "Belum ada riwayat" + link ke /browse
- Loading: skeleton list

### Data
- `GET /api/history?userId=...` → `[{ id, anime_id, title, poster_url, episode, progress_seconds, watched_at }]`
- `DELETE /api/history?userId=...&animeId=...`

---

## PROMPT 7 — PROFILE (`/profile`)

Halaman profil user dengan tab.

### Header
- Avatar lingkaran pink dengan icon User
- Nama "Penonton" (Plus Jakarta Sans)
- Subtitle "Streaming tanpa batas"

### Tab Navigation
- 2 tab: Riwayat + Bookmark. Pink pill style, active = pink filled, inactive = transparent
- Isi tab Riwayat: sama seperti halaman History (list dengan poster, title, timestamp, hapus)
- Isi tab Bookmark: sama seperti halaman Bookmark (grid)
- Empty state masing-masing tab

### Data
- `GET /api/history?userId=...`, `GET /api/bookmarks?userId=...`
- `POST /api/bookmarks/toggle`, `DELETE /api/history?userId=...&animeId=...`

---

## PROMPT 8 — SETTINGS (`/settings`)

Halaman pengaturan + request anime.

### Theme Toggle
- Card "Tampilan": icon Moon/Sun, label "Mode Gelap/Terang", toggle switch (iOS style, pink)
- Simpan ke localStorage key `mahistream_theme`
- Update attribute `data-theme` di document

### Request Anime
- Icon Send, heading "Request Anime" (Plus Jakarta Sans)
- Deskripsi: "Request anime yang ingin kamu tonton"
- Form: input judul (required) + textarea catatan (opsional) + button "Kirim Request" pink full-width

### Riwayat Request
- Icon ListTodo, heading "Riwayat Request"
- List request: title, notes, status badge (Menunggu = gray, Proses = yellow, Selesai = green), tanggal
- Status badge: rounded-full dengan dot indikator

### Gradient header
- Background gradient pink to transparent di atas halaman
- Heading "Pengaturan" (Plus Jakarta Sans, putih)

### Data
- `GET /api/requests` → `[{ id, title, notes, status, created_at }]`
- `POST /api/requests` with `{ title, notes, userId }`

---

## PROMPT 9 — KHUSUS / SPECIAL CONTENT (`/khusus`)

Halaman password-gated untuk konten khusus.

### Locked State
- Full-screen centered: icon Lock besar (pink), heading "Konten Khusus" (Plus Jakarta Sans), deskripsi
- Input password dengan toggle show/hide (icon Eye)
- Error message merah jika password salah
- Rate limit: tampilkan pesan "Terlalu banyak percobaan" jika kena throttle
- Button "Buka Akses" pink full-width dengan icon Unlock

### Unlocked State
- Heading "Konten Khusus" dengan button "Kunci" merah di kanan
- Grid 2/3 kolom anime. Masing2: poster, hover play overlay, title, rating
- Klik anime → navigate ke `/video/{id}`

### Password: `alfathsayangkagari`
### Rate limit: 5 attempts per 5 menit (localStorage-based)

### Data
- `GET /api/khusus` → `[{ id, title, poster, gdrive_links, description }]`

---

## PROMPT 10 — DEV PANEL / ADMIN (`/dev`)

Admin panel untuk manage seluruh platform.

### Auth
- Full-screen centered: icon Lock, heading "Panel Developer", input password, button "Buka Panel"
- Password: `alfathsayangkagari`

### Dashboard
- Sticky top bar dengan tab navigation (Anime / Request / Pengumuman / Jadwal / Khusus)
- Stats grid: Anime count, Episode count, Request count, Khusus count (angka besar pink)

### Tab: Anime
- List anime: poster thumbnail, title, episode count, tombol Edit (pink) + Delete (merah)
- Tombol "Tambah" pink di pojok kanan atas
- Form add/edit: title, title_jp, alt_titles, synopsis (textarea), genre (comma separated), poster (URL input + file upload to base64), rating, year
- Episode management per anime: list episode (nomor + title), tambah (prompt nomor, title, GDrive JSON), delete

### Tab: Request
- List semua request user: title, notes, status badge, tanggal
- Action buttons: "Proses" (yellow) → "Selesai" (green)

### Tab: Pengumuman
- Textarea + "Simpan Pengumuman" button

### Tab: Jadwal
- Form: day select, title input, time input, "Tambah Jadwal" button
- List jadwal per hari dengan delete button

### Tab: Khusus
- Form: ID (slug), title, poster (URL + file upload), GDrive links, description
- List konten khusus dengan delete button

### Semua form pakai class `.input-field` dan `.btn-primary`

### Data (semua pakai header `x-admin-key: alfathsayangkagari`)
- `GET /admin/stats`, `GET /admin/requests`, `GET /anime?limit=100`
- `POST /admin/anime`, `DELETE /admin/anime/:id`
- `POST /admin/episodes`, `DELETE /admin/episodes/:id`
- `POST /admin/requests/:id` with `{ status }`
- `POST /admin/announcements` with `{ content }`
- `POST /admin/schedule`, `DELETE /admin/schedule/:id`
- `POST /admin/khusus`, `DELETE /admin/khusus/:id`

---

## PROMPT 11 — BACKEND API (Express + PostgreSQL)

### Database (auto-create on startup)
9 tables: anime, episodes, requests, users, history, bookmarks, announcements, schedule, khusus_content

### Tables structure
- `anime`: id SERIAL PK, title TEXT, title_jp TEXT, alt_titles TEXT, poster TEXT, synopsis TEXT, genre TEXT, status TEXT DEFAULT 'ongoing', rating DECIMAL, year TEXT, type TEXT DEFAULT 'TV', created_at TIMESTAMPTZ DEFAULT NOW()
- `episodes`: id SERIAL PK, anime_id INT REFERENCES anime(id) ON DELETE CASCADE, number INT, title TEXT, gdrive_links TEXT DEFAULT '[]', duration INT DEFAULT 0
- `requests`: id SERIAL PK, title TEXT, notes TEXT, user_id TEXT, status TEXT DEFAULT 'pending'
- `users`: id SERIAL PK, uid TEXT UNIQUE, username TEXT, display_name TEXT, email TEXT, picture TEXT, bio TEXT
- `history`: id SERIAL PK, user_id TEXT, anime_id INT, title TEXT, poster_url TEXT, episode INT, progress_seconds INT DEFAULT 0, duration_seconds INT DEFAULT 0, watched_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, anime_id, episode)
- `bookmarks`: id SERIAL PK, user_id TEXT, anime_id INT, title TEXT, poster_url TEXT, UNIQUE(user_id, anime_id)
- `announcements`: id SERIAL PK, content TEXT, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
- `schedule`: id SERIAL PK, day_of_week TEXT, title TEXT, time TEXT
- `khusus_content`: id TEXT PK, title TEXT, poster TEXT, gdrive_links TEXT DEFAULT '[]', description TEXT

### Endpoints
Semua endpoint RESTful di bawah `/api`. Admin endpoints dilindungi header `x-admin-key`.

**Public:**
- `GET /api` → health check
- `GET /api/anime` → list with search, genre, status, sort, page, limit
- `GET /api/anime/:id` → detail + episodes joined
- `GET /api/requests` → list requests (optional userId filter)
- `POST /api/requests` → create request `{ title, notes, userId }`
- `GET /api/history?userId=...` → get history
- `POST /api/history` → upsert progress `{ userId, animeId, title, poster, episode, progressSeconds, durationSeconds }`
- `DELETE /api/history?userId=...&animeId=...` → delete single or all
- `GET /api/bookmarks?userId=...` → get bookmarks
- `POST /api/bookmarks/toggle` → toggle bookmark `{ userId, animeId, title, poster }`
- `GET /api/announcements` → get latest active
- `GET /api/schedule` → get all
- `GET /api/khusus` → get all

**Admin (`x-admin-key` required):**
- `POST /api/admin/anime` → create or update (if id present)
- `DELETE /api/admin/anime/:id`
- `POST /api/admin/episodes` → create or update
- `DELETE /api/admin/episodes/:id`
- `POST /api/admin/requests/:id` → update status `{ status }`
- `GET /api/admin/requests` → list all
- `GET /api/admin/stats` → counts
- `POST /api/admin/announcements` → upsert `{ content }`
- `POST /api/admin/schedule` → create `{ day_of_week, title, time }`
- `DELETE /api/admin/schedule/:id`
- `POST /api/admin/khusus` → upsert `{ id, title, poster, gdrive_links, description }`
- `DELETE /api/admin/khusus/:id`

### Server config
- Port: 3001
- PostgreSQL: localhost:5432, db: mahistream, user: mahistream, password: mahistream
- Auto-create database + tables on startup
- CORS enabled

### Package.json dependencies
- express, pg, cors
