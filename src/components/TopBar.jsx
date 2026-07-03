import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './TopBar.css';

export default function TopBar() {
  const navigate = useNavigate();

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-inner">
        <a href="/" className="logo" aria-label="MahiStream home">
          <span className="logo-mark" aria-hidden="true">M</span>
          <span className="logo-text">
            <span className="logo-main">Mahi</span>
            <span className="logo-accent">Stream</span>
          </span>
        </a>
        <button
          className="search-btn"
          onClick={() => navigate('/search')}
          aria-label="Cari anime"
        >
          <Search size={20} />
        </button>
      </div>
    </header>
  );
}