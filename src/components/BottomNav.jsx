import { Home, Compass, Calendar, Heart, User, Menu, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import './BottomNav.css';

const navItems = [
  { path: '/', label: 'Beranda', icon: Home },
  { path: '/browse', label: 'Jelajahi', icon: Compass },
  { path: '/jadwal', label: 'Jadwal', icon: Calendar },
  { path: '/bookmark', label: 'Simpan', icon: Heart },
  { path: '/profile', label: 'Profil', icon: User },
];

const iconSize = 22;
const strokeWidth = 2;

export default function BottomNav() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const IconComponent = (item) => <item.icon size={iconSize} strokeWidth={isActive(item.path) ? 2.5 : strokeWidth} />;

  if (isMenuOpen) {
    return (
      <div className="bottom-nav-overlay" onClick={() => setIsMenuOpen(false)} aria-hidden="true" />
    );
  }

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navigasi utama">
      <div className="bottom-nav-bg" aria-hidden="true" />
      <div className="bottom-nav-container">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setIsMenuOpen(false)}
            aria-current={isActive(item.path) ? 'page' : undefined}
          >
            <span className="nav-icon-wrap" aria-hidden="true">
              <IconComponent item={item} />
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}