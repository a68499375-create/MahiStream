import { Play, Search, ChevronRight, Flame, Sparkles, Clock, Bookmark, Eye, Download, Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchHomeData } from '../services/api';
import { isKhususUnlocked, subscribeKhusus } from '../utils/khususAuth';
import './Home.css';

const buildVideoHref = (anime, extraQuery = '') => {
  if (!anime || !anime.id) return '#';
  const src = anime.source || anime._source;
  const params = new URLSearchParams();
  if (src && src !== 'otakudesu') params.set('source', src);
  if (extraQuery) {
    extraQuery.split('&').forEach((p) => {
      const [k, v] = p.split('=');
      if (k) params.set(k, v ?? '');
    });
  }
  const qs = params.toString();
  return `/video/${anime.id}${qs ? `?${qs}` : ''}`;
};

const isNekopoi = (item) => {
  if (!item) return false;
  const sources = [
    item.source,
    item._source,
    item.provider,
    ...(Array.isArray(item.availableSources) ? item.availableSources : []),
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return sources.some((s) => s === 'nekopoi');
};

const isRecentRelease = (anime) => {
  if (anime.episodeList && Array.isArray(anime.episodeList)) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    for (const ep of anime.episodeList) {
      const epDate = ep.date || ep.releaseDate || ep.createdAt;
      if (epDate) {
        const date = new Date(epDate);
        if (!isNaN(date.getTime()) && date >= sevenDaysAgo) return true;
      }
    }
  }
  const badge = (anime.badge || '').toLowerCase();
  const title = (anime.title || '').toLowerCase();
  const hasNewBadge = badge && (badge.includes('new') || badge.includes('baru') || badge.includes('terbaru') || badge.includes('ep') || badge.includes('episode') || badge.includes('hari') || badge.includes('day'));
  const oldSeries = ['naruto', 'boruto', 'one piece', 'detective conan', 'conan', 'pokemon', 'dragon ball', 'doraemon', 'shinchan', 'crayon shin', 'gintama', 'fairy tail', 'bleach', 'attack on titan', 'shingeki'];
  const isOldSeries = oldSeries.some(s => title.includes(s));
  if (isOldSeries && !hasNewBadge) return false;
  return hasNewBadge || !isOldSeries;
};

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [khususUnlocked, setKhususUnlocked] = useState(() => isKhususUnlocked());
  const heroRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeKhusus((next) => setKhususUnlocked(next));
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 60000);

    const loadData = async () => {
      setIsLoading(true);
      try {
        const result = await fetchHomeData();
        if (!cancelled) setData(result);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          clearTimeout(timeout);
        }
      }
    };
    loadData();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const heroCandidate = data?.hero;
    if (!heroCandidate) return;
    if (!khususUnlocked && isNekopoi(heroCandidate)) return;
    const url = heroCandidate.posterUrl;
    if (!url) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    link.fetchPriority = 'high';
    document.head.appendChild(link);
    return () => {
      try { document.head.removeChild(link); } catch { }
    };
  }, [data?.hero, khususUnlocked]);

  const handleHeroSlideClick = useCallback((href, e) => {
    if (e.currentTarget.classList.contains('hero-poster')) return;
    navigate(href);
  }, [navigate]);

  if (isLoading) {
    return <HomeSkeleton />;
  }

  if (!data) {
    return (
      <div className="home-error">
        <div className="error-content">
          <Search className="error-icon" size={48} />
          <h2>Gagal memuat data</h2>
          <p>Periksa koneksi internet kamu dan coba lagi.</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">Coba Lagi</button>
        </div>
      </div>
    );
  }

  const { hero, ongoing, latestEpisodes, schedule } = data;
  const safeOngoing = khususUnlocked ? ongoing : (ongoing || []).filter((a) => !isNekopoi(a));
  const safeLatest = khususUnlocked ? latestEpisodes : (latestEpisodes || []).filter((a) => !isNekopoi(a));
  const filteredOngoing = safeOngoing.filter(isRecentRelease);
  const filteredLatest = safeLatest.filter(isRecentRelease);
  const safeHero = khususUnlocked ? hero : (!hero || isNekopoi(hero) ? filteredOngoing[0] || filteredLatest[0] : hero);

  const heroItems = [safeHero, ...filteredOngoing.filter(a => a.id !== safeHero?.id)].filter(Boolean).slice(0, 6);

  const popularGenres = [
    { name: 'Action', id: 'action' },
    { name: 'Romance', id: 'romance' },
    { name: 'Comedy', id: 'comedy' },
    { name: 'Fantasy', id: 'fantasy' },
    { name: 'Isekai', id: 'isekai' },
    { name: 'School', id: 'school' },
    { name: 'Sci-Fi', id: 'sci-fi' },
    { name: 'Drama', id: 'drama' },
    { name: 'Slice of Life', id: 'slice-of-life' },
    { name: 'Supernatural', id: 'supernatural' },
  ];

  return (
    <div className="home-page">
      <section className="hero-section" ref={heroRef} aria-label="Hero Carousel">
        {heroItems.length > 0 && (
          <HeroCarousel
            items={heroItems}
            navigate={navigate}
            buildVideoHref={buildVideoHref}
            handleSlideClick={handleHeroSlideClick}
          />
        )}
      </section>

      <div className="home-content">
        <section className="genres-section" aria-label="Genre Populer">
          <div className="section-header">
            <h2 className="section-title">
              <span className="section-title-accent" />
              Genre Populer
            </h2>
          </div>
          <div className="genres-scroll" role="list">
            {popularGenres.map((genre) => (
              <button
                key={genre.id}
                role="listitem"
                onClick={() => navigate('/browse', { state: { tab: 'genre', autoFilterGenre: genre.id, autoFilterName: genre.name } })}
                className="genre-chip"
                aria-label={`Genre ${genre.name}`}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </section>

        <AnimeGridSection
          title="Episode Terbaru"
          items={filteredLatest.slice(0, 24)}
          buildVideoHref={buildVideoHref}
          showEpisodeBadge={true}
          viewAllHref="/browse"
          viewAllState={{ tab: 'latest' }}
          dataTestId="latest-episodes-grid"
        />

        <AnimeRankingSection
          title="Trending Sekarang"
          items={filteredOngoing.slice(0, 10)}
          buildVideoHref={buildVideoHref}
          viewAllHref="/browse"
          viewAllState={{ tab: 'schedule' }}
          dataTestId="trending-ranking"
        />

        {schedule && schedule.length > 0 && (
          <ScheduleSection schedule={schedule} buildVideoHref={buildVideoHref} />
        )}
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="home-page skeleton-page">
      <div className="loading-banner">
        <div className="loading-banner-spinner" />
        <span>Memuat data anime...</span>
      </div>
      <div className="home-content">
        <section className="genres-section">
          <div className="section-header skeleton-text" aria-hidden="true" />
          <div className="genres-scroll" role="list">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton-chip" role="listitem" aria-hidden="true" />
            ))}
          </div>
        </section>
        <section className="anime-grid-section">
          <div className="section-header skeleton-text" aria-hidden="true" />
          <div className="anime-grid" role="list">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="anime-card-skeleton" role="listitem" aria-hidden="true">
                <div className="skeleton skeleton-poster" />
                <div className="skeleton skeleton-title" />
              </div>
            ))}
          </div>
        </section>
        <section className="ranking-section">
          <div className="section-header skeleton-text" aria-hidden="true" />
          <div className="ranking-list" role="list">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="ranking-item-skeleton" role="listitem" aria-hidden="true">
                <div className="skeleton skeleton-rank" />
                <div className="skeleton skeleton-poster-sm" />
                <div className="skeleton skeleton-title" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function HeroCarousel({ items, navigate, buildVideoHref, handleSlideClick }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(null);

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const timer = setInterval(() => setIdx(i => (i + 1) % items.length), 6000);
    return () => clearInterval(timer);
  }, [items, paused]);

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 50) {
      setIdx(i => diff > 0 ? (i - 1 + items.length) % items.length : (i + 1) % items.length);
    }
    setTouchStart(null);
  };

  if (!items.length) return null;

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-label="Hero Carousel"
      aria-roledescription="carousel"
    >
      <div className="hero-slides" style={{ minHeight: 280 }}>
        {items.map((hero, i) => {
          const active = i === idx;
          const href = buildVideoHref(hero);
          return (
            <article
              key={`${hero.id}-${i}`}
              className={`hero-slide ${active ? 'hero-slide-active' : 'hero-slide-inactive'}`}
              aria-hidden={!active}
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} dari ${items.length}`}
            >
              <div className="hero-backdrop">
                <img src={hero.posterUrl} alt="" aria-hidden="true" className="hero-backdrop-img" />
                <div className="hero-backdrop-overlay" />
              </div>
              <div className="hero-content">
                <Link
                  to={href}
                  className="hero-poster-link"
                  onClick={(e) => handleSlideClick(href, e)}
                  tabIndex={active ? 0 : -1}
                  aria-label={hero.title}
                >
                  <img
                    src={hero.posterUrl}
                    alt={hero.title}
                    className="hero-poster"
                    loading={active ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                </Link>
                <div className="hero-info">
                  <span className="hero-badge">
                    <Flame className="hero-badge-icon" size={12} />
                    <span>Sedang Populer</span>
                  </span>
                  <h1 className="hero-title">{hero.title}</h1>
                  {hero.genreList && hero.genreList.length > 0 && (
                    <div className="hero-genres">
                      {hero.genreList.slice(0, 3).map((g, j) => {
                        const label = typeof g === 'object' ? (g.title || g.name) : g;
                        return <span key={j} className="hero-genre-tag">{label}</span>;
                      })}
                    </div>
                  )}
                  <div className="hero-actions">
                    <button
                      onClick={() => navigate(buildVideoHref(hero, 'play=true'))}
                      className="btn btn-primary btn-lg"
                      tabIndex={active ? 0 : -1}
                    >
                      <Play size={16} className="btn-icon" />
                      <span>Tonton Sekarang</span>
                    </button>
                    <Link to={href} className="btn btn-secondary btn-lg" tabIndex={active ? 0 : -1}>
                      <Bookmark size={16} className="btn-icon" />
                      <span>Detail</span>
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {items.length > 1 && (
        <div className="hero-indicators" role="tablist" aria-label="Pilih slide">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Slide ${i + 1}`}
              className={`hero-indicator ${i === idx ? 'active' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AnimeGridSection({ title, items, buildVideoHref, showEpisodeBadge, viewAllHref, viewAllState, dataTestId }) {
  if (!items.length) return null;

  return (
    <section className="anime-grid-section" aria-labelledby={`section-${dataTestId}`}>
      <div className="section-header">
        <h2 id={`section-${dataTestId}`} className="section-title">
          <span className="section-title-accent" />
          {title}
        </h2>
        {viewAllHref && (
          <Link to={viewAllHref} state={viewAllState} className="section-view-all">
            Lihat Semua <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div data-testid={dataTestId} className="anime-grid" role="list">
        {items.map((anime) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            buildVideoHref={buildVideoHref}
            showEpisodeBadge={showEpisodeBadge}
            dataTestId="anime-card-normal"
          />
        ))}
      </div>
    </section>
  );
}

function AnimeCard({ anime, buildVideoHref, showEpisodeBadge, dataTestId }) {
  const href = buildVideoHref(anime);
  return (
    <Link to={href} className="anime-card-link" data-testid={dataTestId} role="listitem">
      <div className="anime-poster-wrapper">
        <img
          src={anime.posterUrl}
          alt={anime.title}
          loading="lazy"
          decoding="async"
          className="anime-poster"
        />
        <div className="anime-poster-overlay">
          <button className="play-overlay-btn" aria-label={`Tonton ${anime.title}`}>
            <Play size={28} className="play-overlay-icon" />
          </button>
        </div>
        {showEpisodeBadge && anime.badge && (
          <span className="episode-badge">{anime.badge}</span>
        )}
        {anime.badge && !showEpisodeBadge && (
          <span className="corner-badge">{anime.badge}</span>
        )}
      </div>
      <h3 className="anime-title">{anime.title}</h3>
      {anime.rating && <span className="anime-rating">★ {anime.rating}</span>}
    </Link>
  );
}

function AnimeRankingSection({ title, items, buildVideoHref, viewAllHref, viewAllState, dataTestId }) {
  if (!items.length) return null;

  return (
    <section className="ranking-section" aria-labelledby={`section-${dataTestId}`}>
      <div className="section-header">
        <h2 id={`section-${dataTestId}`} className="section-title">
          <span className="section-title-accent" />
          {title}
        </h2>
        {viewAllHref && (
          <Link to={viewAllHref} state={viewAllState} className="section-view-all">
            Lihat Semua <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div data-testid={dataTestId} className="ranking-list" role="list">
        {items.map((anime, idx) => (
          <Link
            key={anime.id}
            to={buildVideoHref(anime)}
            className="ranking-item"
            role="listitem"
          >
            <span className={`rank-number ${idx < 3 ? 'top-3' : ''}`}>
              {String(idx + 1).padStart(2, '0')}
            </span>
            <div className="ranking-poster-wrapper">
              <img
                src={anime.posterUrl}
                alt={anime.title}
                loading="lazy"
                className="ranking-poster"
              />
            </div>
            <div className="ranking-info">
              <h3 className="ranking-title">{anime.title}</h3>
              <p className="ranking-meta">{anime.badge || 'Ongoing'}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ScheduleSection({ schedule, buildVideoHref }) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const [activeDay, setActiveDay] = useState(new Date().getDay());

  return (
    <section className="schedule-section" aria-label="Jadwal Rilis">
      <div className="section-header">
        <h2 className="section-title">
          <span className="section-title-accent" />
          Jadwal Rilis
        </h2>
      </div>
      <div className="schedule-tabs" role="tablist" aria-label="Hari">
        {days.map((day, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeDay}
            aria-controls={`schedule-panel-${i}`}
            id={`schedule-tab-${i}`}
            onClick={() => setActiveDay(i)}
            className={`schedule-tab ${i === activeDay ? 'active' : ''}`}
          >
            {day.substring(0, 3)}
          </button>
        ))}
      </div>
      <div className="schedule-panels">
        {days.map((day, i) => (
          <div
            key={i}
            role="tabpanel"
            id={`schedule-panel-${i}`}
            aria-labelledby={`schedule-tab-${i}`}
            hidden={i !== activeDay}
            className="schedule-panel"
          >
            <ScheduleDayList day={day} items={schedule[day] || []} buildVideoHref={buildVideoHref} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ScheduleDayList({ day, items, buildVideoHref }) {
  if (!items.length) {
    return (
      <div className="schedule-empty">
        <Clock size={32} className="schedule-empty-icon" />
        <p>Tidak ada jadwal rilis untuk hari {day.toLowerCase()}.</p>
      </div>
    );
  }

  return (
    <div className="schedule-grid" role="list">
      {items.map((anime) => (
        <Link
          key={anime.id}
          to={buildVideoHref(anime)}
          className="schedule-item"
          role="listitem"
        >
          <div className="schedule-poster-wrapper">
            <img
              src={anime.posterUrl}
              alt={anime.title}
              loading="lazy"
              className="schedule-poster"
            />
          </div>
          <div className="schedule-info">
            <h3 className="schedule-title">{anime.title}</h3>
            <div className="schedule-meta">
              {anime.time && <span className="schedule-time">{anime.time}</span>}
              {anime.rating && <span className="schedule-rating">★ {anime.rating}</span>}
            </div>
          </div>
          {anime.newEpisode && (
            <span className="schedule-new-badge">EP Baru</span>
          )}
        </Link>
      ))}
    </div>
  );
}