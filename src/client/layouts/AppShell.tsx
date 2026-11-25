import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Button, IconButton } from '../components';
import { useApp } from '../context/AppContext';
import { canCreateOrders, isAdmin } from '../utils/format';

export function AppShell() {
  const { user, logoutUser, pushToast, theme, toggleTheme } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logoutUser();
    pushToast('info', 'Signed out.');
    navigate('/login');
  };

  const navItems = [
    { to: '/app', label: 'Dashboard', end: true, show: true },
    { to: '/app/orders', label: 'Orders', end: false, show: true },
    {
      to: '/app/orders/new',
      label: 'New order',
      end: true,
      show: canCreateOrders(user?.role),
    },
    { to: '/app/inventory', label: 'Inventory', end: false, show: true },
    {
      to: '/app/inventory/new',
      label: 'Add product',
      end: true,
      show: isAdmin(user?.role),
    },
    { to: '/app/stock-movements', label: 'Stock log', end: true, show: true },
    { to: '/app/account', label: 'Account', end: true, show: true },
    { to: '/app/help', label: 'Help', end: true, show: true },
    ...(import.meta.env.DEV
      ? [{ to: '/app/dev/components', label: 'Components', end: true, show: true }]
      : []),
  ].filter((item) => item.show);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Primary navigation">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link to="/app" className="brand-mark" onClick={() => setSidebarOpen(false)}>
              <span className="brand-title">Store Ops Console</span>
              <span className="brand-sub">Counter & warehouse desk</span>
            </Link>
            {sidebarOpen ? (
              <IconButton label="Close menu" onClick={() => setSidebarOpen(false)}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>

          <nav className="sidebar-nav" style={{ marginTop: 'var(--space-4)' }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-summary">
            <span style={{ fontWeight: 600 }}>{user?.displayName ?? user?.username}</span>
            <span className="text-small muted">{user?.role}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="app-main-col">
        <div className="mobile-topbar">
          <IconButton label="Open navigation menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} aria-hidden="true" />
          </IconButton>
          <span className="brand-title">Store Ops Console</span>
          <span className="text-small muted">{user?.role}</span>
        </div>

        <main id="main-content" className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
