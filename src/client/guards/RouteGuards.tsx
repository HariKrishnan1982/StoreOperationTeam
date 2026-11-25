import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Skeleton } from '../components';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Store Ops Console`;
  }, [title]);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, authChecked } = useApp();
  const location = useLocation();

  if (!authChecked) {
    return (
      <div className="app-main">
        <Skeleton rows={5} />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, authChecked } = useApp();

  if (!authChecked) {
    return (
      <div className="app-main">
        <Skeleton rows={4} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
