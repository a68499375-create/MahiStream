import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import CommunityPopup from "./CommunityPopup";
import { cx } from "./ui/index";
import { getTheme, setTheme } from "../lib/client";
import {
  HomeIcon, SearchIcon, CompassIcon, ClockIcon, UserIcon,
  LockIcon, PlayIcon, SunIcon, MoonIcon, TrophyIcon, CommandIcon, WrenchIcon, SettingsIcon,
} from "./icons";

import './TopBar.css';

function ThemeToggle() {
  const [theme, setT] = useState("dark");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); setT(getTheme()); }, []);
  if (!mounted) return <span className="h-9 w-9" />;
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button onClick={() => { setTheme(next); setT(next); }}
      aria-label="Ganti tema"
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-elevated hover:text-accent">
      {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}

function TopNav() {
  let isDev = false;
  let isAdmin = false;
  try {
    const r = JSON.parse(localStorage.getItem('mahi-user') || '{}').role;
    isDev = r === 'dev';
    isAdmin = r === 'admin';
  } catch {}
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 glass">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
<Link to="/" className="flex items-center gap-2.5" data-testid="header-logo">
          <span className="logo-main">Mahi</span>
          <span className="logo-accent">Stream</span>
        </Link>
        <div className="flex items-center gap-1.5">
          {isDev && (
            <Link to="/dev-panel" aria-label="Panel Developer"
              className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20">
              <WrenchIcon size={13} /> Dev
            </Link>
          )}
          {(isDev || isAdmin) && (
            <Link to="/admin" aria-label="Panel Admin"
              className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20">
              <WrenchIcon size={13} /> Admin
            </Link>
          )}
          <Link to="/ranking" aria-label="Peringkat"
            className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/50 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-accent sm:flex">
            <TrophyIcon size={13} /> Top
          </Link>
          <Link to="/genres" aria-label="Genre"
            className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/50 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-accent sm:flex">
            Genre
          </Link>
          <button onClick={() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })); }}
            aria-label="Pencarian cepat"
            className="hidden items-center gap-2 rounded-full border border-line/70 bg-elevated/70 py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-ink lg:flex">
            <SearchIcon size={14} className="text-muted2" />
            <span>Cari anime...</span>
            <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted2">Ctrl K</kbd>
          </button>
          <ThemeToggle />
          <Link to="/search" aria-label="Cari anime"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-elevated hover:text-accent">
            <SearchIcon size={20} />
          </Link>
        </div>
      </div>
    </header>
  );
}

const TABS = [
  { href: "/", label: "Beranda", Icon: HomeIcon },
  { href: "/khusus", label: "Khusus", Icon: LockIcon },
  { href: "/browse", label: "Jelajahi", Icon: CompassIcon },
  { href: "/history", label: "Riwayat", Icon: ClockIcon },
  { href: "/profile", label: "Profil", Icon: UserIcon },
];

function BottomNav() {
  const pathname = useLocation().pathname;
  let isDev = false, isAdmin = false;
  try { const r = JSON.parse(localStorage.getItem('mahi-user') || '{}').role; isDev = r === 'dev'; isAdmin = r === 'admin'; } catch {}
  const extra = [];
  if (isDev || isAdmin) extra.push({ href: "/admin", label: "Admin", Icon: SettingsIcon });
  if (isDev) extra.push({ href: "/dev-panel", label: "Dev", Icon: WrenchIcon });
  const tabs = [...TABS, ...extra];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 glass-strong">
      <div className="mx-auto flex max-w-6xl items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} to={href}
              className={cx("relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition", active ? "text-accent" : "text-muted hover:text-ink")}>
              {active && <span className="absolute -top-px h-1 w-10 rounded-b-full bg-accent shadow-[0_2px_8px_var(--glow)]" />}
              <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition-all", active && "bg-accent/15")}>
                <Icon size={21} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function Shell({ children, className, nav = true, footer = true }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      {nav && <TopNav />}
      <main className={cx("mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4", className)}>
        {children}
      </main>
      
      {nav && <BottomNav />}
      <CommunityPopup />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
