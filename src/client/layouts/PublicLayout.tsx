import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../components';
import { useApp } from '../context/AppContext';

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user, theme, toggleTheme } = useApp();

  return (
    <div className="auth-wrap">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="brand-mark" style={{ borderBottom: 'none', padding: 0 }}>
            <span className="brand-title">Store Ops Console</span>
            <span className="brand-sub">Phone order intake & warehouse desk</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </Button>
            {user ? (
              <Link to="/app" className="btn btn-primary btn-sm">
                Open console
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" style={{ flex: 1 }}>
        {children}
      </main>
      <footer className="public-footer">
        <span>Store Ops Console · Built for counter staff and warehouse teams · </span>
        <Link to="/login">Sign in</Link>
      </footer>
    </div>
  );
}
