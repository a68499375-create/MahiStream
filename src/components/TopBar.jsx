import { SearchIcon } from './icons';
import { useNavigate, Link } from 'react-router-dom';
import './TopBar.css';

export default function TopBar() {
  const navigate = useNavigate();

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-inner">
        <Link to="/" className="logo" aria-label="MahiStream home" data-testid="header-logo">
          <span className="logo-text">
            <span className="logo-main">Mahi</span>
            <span className="logo-accent">Stream</span>
          </span>
        </Link>
        <button
          className="search-btn"
          onClick={() => navigate('/search')}
          aria-label="Cari anime"
        >
          <SearchIcon size={20} />
        </button>
      </div>
    </header>
  );
}