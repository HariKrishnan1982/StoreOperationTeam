import { Link } from 'react-router';
import { Card } from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import { PublicLayout } from '../layouts/PublicLayout';

export function ForbiddenPage() {
  useDocumentTitle('Access denied');
  const { user } = useApp();

  return (
    <PublicLayout>
      <div className="auth-center">
        <Card className="auth-card">
          <h1 className="page-title" tabIndex={-1} style={{ marginBottom: 'var(--space-2)' }}>
            Access denied
          </h1>
          <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>
            Your current role ({user?.role ?? 'Guest'}) does not have permission to open this page.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Link to={user ? '/app' : '/'} className="btn btn-primary">
              {user ? 'Back to dashboard' : 'Back to home'}
            </Link>
            <Link to="/app/help" className="btn btn-secondary">
              View role guide
            </Link>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
