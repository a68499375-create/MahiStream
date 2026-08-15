import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fdf8f1',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'Inter, Poppins, sans-serif',
          }}
        >
          <div style={{ fontSize: '4rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', marginTop: '1rem' }}>
            Terjadi Kesalahan Tak Terduga
          </h1>
          <p style={{ color: '#888', marginTop: '0.5rem', maxWidth: '360px', fontSize: '0.875rem' }}>
            Aplikasi mengalami error yang tidak dapat dipulihkan secara otomatis.
            Coba muat ulang halaman.
          </p>
          {this.state.error && (
            <pre
              style={{
                marginTop: '1rem',
                fontSize: '0.75rem',
                color: '#c0392b',
                background: '#fff5f5',
                border: '1px solid #f5c6cb',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                maxWidth: '480px',
                overflowX: 'auto',
                textAlign: 'left',
              }}
            >
              {this.state.error?.message || String(this.state.error)}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              background: '#c68a4e',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🔄 Muat Ulang Halaman
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
