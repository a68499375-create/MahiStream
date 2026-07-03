import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star, CalendarDays } from 'lucide-react';
import TopBar from '../components/TopBar';
import { fetchBrowseCatalog, fetchSchedule, getProxiedImageUrl } from '../services/api';

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// Bangun 7 hari mulai dari hari ini ke depan dalam timezone Asia/Jakarta (WIB).
// Item pertama selalu hari ini di WIB.
const buildDaysData = () => {
  // Konversi waktu UTC sekarang ke WIB (UTC+7) tanpa bergantung pada timezone OS.
  const now = new Date();
  const jakartaNow = new Date(now.getTime() + ((7 * 60) - now.getTimezoneOffset() * -1) * 60 * 1000);
  // Lebih sederhana: ambil bagian-bagian dengan Intl.DateTimeFormat.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const todayStr = fmt.format(now); // "Mon, 2026-06-23"
  // Parsing tanggal dari string yyyy-MM-dd
  const parts = todayStr.split(', ');
  const ymd = parts[1] || parts[0];
  const [y, m, d] = ymd.split('-').map(Number);
  const todayJakarta = new Date(Date.UTC(y, m - 1, d));
  void jakartaNow;
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(todayJakarta);
    dt.setUTCDate(todayJakarta.getUTCDate() + i);
    const dayName = DAY_NAMES[dt.getUTCDay()];
    return {
      dateNum: String(dt.getUTCDate()).padStart(2, "0"),
      dayName,
      yearMonth: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`,
      apiDay: dayName,
    };
  });
};

// Pastikan string jam tampil rapi "HH:MM WIB". Jam dari Kuramanime biasanya
// sudah dalam format "HH:MM"; di sini hanya menambah suffix WIB tanpa
// mengubah format aslinya. Bila format lain (mis. "8 PM"), normalkan.
const formatJam = (raw) => {
  if (!raw) return '';
  const cleaned = String(raw).trim();
  if (/wib$/i.test(cleaned)) return cleaned;
  const m = cleaned.match(/^(\d{1,2})\s*[:.]\s*(\d{2})$/);
  if (m) {
    return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]} WIB`;
  }
  const m2 = cleaned.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (m2) {
    let h = parseInt(m2[1], 10);
    if (m2[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m2[2].toLowerCase() === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00 WIB`;
  }
  return cleaned;
};

export default function Jadwal() {
  const daysData = useMemo(() => buildDaysData(), []);
  const [scheduleList, setScheduleList] = useState([]);
  const [ongoingItems, setOngoingItems] = useState([]);
  const [activeDay, setActiveDay] = useState(daysData[0].apiDay);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setIsLoading(true);
      try {
        const [data, sched] = await Promise.all([
          fetchBrowseCatalog().catch(() => ({ items: [] })),
          fetchSchedule().catch(() => []),
        ]);
        if (cancelled) return;
        setOngoingItems(data.items || []);
        setScheduleList(sched || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  const currentDayInfo = daysData.find(d => d.apiDay === activeDay) || daysData[0];
  const dayScheduleObj = scheduleList.find(s => (s.title || '').toLowerCase() === activeDay.toLowerCase());
  const rawScheduleAnime = dayScheduleObj ? dayScheduleObj.animeList : [];

  const filteredScheduleAnime = rawScheduleAnime
    .map(anime => {
      const ongoingMatch = ongoingItems.find(o => o.id === anime.animeId);
      const source = anime.source || 'kuramanime';
      let posterUrl = anime.poster || ongoingMatch?.posterUrl || '';
      if (posterUrl && source === 'kuramanime') {
        posterUrl = getProxiedImageUrl(posterUrl, 'https://v18.kuramanime.ing/');
      }
      const fallback = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(anime.title)}`;
      return {
        id: anime.animeId,
        title: anime.title,
        posterUrl: posterUrl || fallback,
        rating: ongoingMatch?.rating || 8.5,
        episode: ongoingMatch?.episodes || (anime.jam ? '' : 'Eps 1'),
        jam: formatJam(anime.jam) || (ongoingMatch?.tags?.[0] || ''),
        status: ongoingMatch?.status || "ONGOING",
        source,
      };
    })
    .filter(anime => anime.status !== "COMPLETED");

  return (
    <div className="min-h-screen pb-28 bg-bg text-text">
      <TopBar />
      <div className="cr-container mt-8">

        {/* Premium header */}
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <CalendarDays size={26} className="text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-text leading-tight">Jadwal Rilis</h1>
              <p className="text-[13px] text-text-secondary font-medium leading-relaxed">
                Daftar anime tayang setiap minggu (zona WIB).
              </p>
            </div>
          </div>
        </div>

        {/* Source filter dihapus — sekarang Jadwal khusus Kuramanime. */}

        {/* Horizontal Day Selector */}
        <div
          data-testid="day-selector-list"
          className="flex gap-2 overflow-x-auto no-scrollbar pb-4 mb-6 border-b border-border"
        >
          {daysData.map((d) => (
            <button
              key={d.apiDay}
              data-testid="day-selector-item"
              onClick={() => setActiveDay(d.apiDay)}
              className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer border ${
                activeDay === d.apiDay
                  ? 'bg-primary text-white border-primary shadow-md'
                  : 'bg-surface border-border text-text-secondary hover:bg-surface-highlight'
              }`}
            >
              {d.dateNum} {d.dayName}
            </button>
          ))}
        </div>

        {/* Active Date Header */}
        <div data-testid="active-date-header" className="flex items-center justify-between mb-6 bg-surface border border-border p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-4">
            <span className="text-4xl font-extrabold text-text leading-none">
              {currentDayInfo.dateNum}
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider leading-none mb-1">
                {currentDayInfo.dayName}
              </span>
              <span className="text-xs font-semibold text-text-secondary leading-none">
                {currentDayInfo.yearMonth}
              </span>
            </div>
          </div>
          <div className="bg-primary/10 border border-primary/30 text-accent px-3 py-1 rounded-full text-xs font-bold">
            {filteredScheduleAnime.length} anime
          </div>
        </div>

        {/* Schedule Anime Grid */}
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="caption-text text-text-secondary font-bold tracking-widest">MEMUAT...</p>
          </div>
        ) : filteredScheduleAnime.length > 0 ? (
          <div data-testid="schedule-grid" className="grid grid-cols-3 gap-3 md:gap-6">
            {filteredScheduleAnime.map((anime) => (
              <Link
                to={`/video/${anime.id}?source=${anime.source}`}
                key={`${anime.source}-${anime.id}`}
                data-testid="schedule-card-item"
                className="bg-surface rounded-2xl overflow-hidden shadow-md border border-border flex flex-col group hover:scale-102 transition-all duration-300"
              >
                <div className="relative aspect-[3/4] w-full">
                  <img
                    src={anime.posterUrl}
                    alt={anime.title}
                    loading="lazy"
                    className="w-full h-full object-cover bg-surface-highlight"
                    onError={(e) => {
                      const fallback = `https://placehold.co/300x400/18181b/c68a4e?text=${encodeURIComponent(anime.title)}`;
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/5 to-transparent flex flex-col justify-end p-2 md:p-3">
                    <h4 className="text-[10px] md:text-sm font-bold text-text line-clamp-1 mb-0.5 md:mb-1">
                      {anime.title}
                    </h4>
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-0.5 text-yellow-500">
                        <Star size={10} fill="currentColor" />
                        <span className="text-[9px] md:text-xs font-bold">{anime.rating}</span>
                      </div>
                      <div className="flex flex-col items-end leading-none">
                        {anime.episode && (
                          <span className="text-[8px] md:text-[10px] font-bold text-accent bg-primary/15 px-1 rounded mb-0.5">{anime.episode}</span>
                        )}
                        {anime.jam && (
                          <span className="text-[8px] md:text-[10px] font-medium bg-black/60 text-white px-1 py-0.5 rounded">{anime.jam}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-text-secondary bg-surface rounded-2xl border border-border p-6 shadow-sm">
            Tidak ada jadwal rilis hari ini.
          </div>
        )}

      </div>
    </div>
  );
}
