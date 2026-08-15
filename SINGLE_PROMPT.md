buatkan aku aplikasi dengan fitur2 berikut:

Aplikasi streaming anime bernama MahiStream, web SPA pake React 19 + Vite + Tailwind 4, backend Express + PostgreSQL. Design theme gelap dengan aksen pink.

FITUR-FITUR:

1. HOME PAGE (/)
- Sticky top nav: logo di kiri, search icon button di kanan.
- Hero section: anime pertama dari list. Poster kiri, info kanan: badge, judul, genre tags, tombol "Tonton".
- Pengumuman banner (jika ada).
- Genre quick filter bar: scroll horizontal, 10 genre button.
- Jadwal rilis: per hari senin-minggu, list anime + waktu.
- Grid anime: grid 2/3/4/5 kolom. Poster, rating badge, title, episode count + genre.
- Bottom nav fixed: 5 tab (Beranda/Khusus/Jelajahi/Riwayat/Profil).
- Loading skeleton.
- API: GET /api/anime?limit=30, GET /api/announcements, GET /api/schedule

2. BROWSE (/browse)
- Search bar + tombol "Cari"
- Sort: Terbaru / Terpopuler / A-Z
- Filter: genre grid (15 genre), status (Ongoing/Completed)
- Infinite scroll
- Grid anime 2/3/4/5 kolom
- Empty state + error state
- API: GET /api/anime?q=&genre=&status=&sort=&page=&limit=20

3. SEARCH (/search)
- Input auto-focus, debounce 300ms
- Grid hasil 2/3 kolom
- Hover play overlay
- API: GET /api/anime?search=&limit=50

4. VIDEO PLAYER (/video/*)
- Aspect 16:9, auto-hide controls
- Top: back btn, title, episode number
- Center: big play btn saat paused
- Bottom: progress bar, skip -10s/play-pause/+10s, time display, speed selector (0.5x-2x), quality selector (dari GDrive links)
- Bawah video: judul, rating badge, synopsis, episode list (grid, active state), "Episode Selanjutnya" button
- Auto-save progress tiap 10 detik
- Auto-advance episode saat video ended
- API: GET /api/anime/:id, POST /api/history

5. BOOKMARKS (/bookmark)
- Heading
- Grid 2/3 kolom, poster, hover play overlay, title, remove btn
- Empty state
- API: GET /api/bookmarks?userId=..., POST /api/bookmarks/toggle

6. HISTORY (/history)
- Heading, tombol "Bersihkan"
- List: poster, title, episode, timestamp, progress
- Hover play overlay, click resume
- Hapus individual
- Empty state
- API: GET /api/history?userId=..., DELETE /api/history?userId=...&animeId=...

7. PROFILE (/profile)
- Header: avatar, nama "Penonton"
- 2 tab: Riwayat + Bookmark
- Isi tab = daftar riwayat / grid bookmark
- API: fetchHistory, fetchBookmarks

8. SETTINGS (/settings)
- Theme toggle: dark/light, simpan localStorage
- Request anime: form judul + catatan + kirim
- Riwayat request: list with status badge (pending/process/done)
- API: GET /api/requests, POST /api/requests

9. KHUSUS (/khusus)
- Password gate: input password, buka akses
- Password: alfathsayangkagari
- Rate limit 5x/5menit
- Unlocked: grid anime + kunci btn
- API: GET /api/khusus

10. DEV PANEL (/dev)
- Password: alfathsayangkagari
- Tab: Anime/Request/Pengumuman/Jadwal/Khusus
- Stats dashboard
- Anime CRUD: form title/title_jp/alt_titles/synopsis/genre/poster/rating/year, episode manage
- Request manage: list + set status
- Pengumuman: textarea + simpan
- Jadwal: form day/title/time + list per hari
- Khusus: form id/title/poster/gdrive/description
- API semua pake header x-admin-key

11. BACKEND API
Express 4 + PostgreSQL
9 tabel: anime, episodes, requests, users, history, bookmarks, announcements, schedule, khusus_content

Public endpoints di /api:
- GET /api (health)
- GET /api/anime (list/search/filter/page)
- GET /api/anime/:id (detail + episodes)
- GET/POST /api/requests
- GET/POST/DELETE /api/history?userId=
- GET /api/bookmarks?userId=
- POST /api/bookmarks/toggle
- GET /api/announcements
- GET /api/schedule
- GET /api/khusus

Admin endpoints (x-admin-key header):
- POST /api/admin/anime, DELETE /api/admin/anime/:id
- POST /api/admin/episodes, DELETE /api/admin/episodes/:id
- POST /api/admin/requests/:id, GET /api/admin/requests
- GET /api/admin/stats
- POST /api/admin/announcements
- POST/DELETE /api/admin/schedule
- POST/DELETE /api/admin/khusus

Server port 3001, auto-create database + tables, CORS enabled.
Dependencies: express, pg, cors.
