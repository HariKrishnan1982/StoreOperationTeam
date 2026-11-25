import { Link } from 'react-router';
import { Card } from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import { PublicLayout } from '../layouts/PublicLayout';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  const { user } = useApp();

  return (
    <PublicLayout>
      <div className="auth-center">
        <Card className="auth-card">
          <h1 className="page-title" tabIndex={-1} style={{ marginBottom: 'var(--space-2)' }}>
            Page not found
          </h1>
          <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>
            The page you requested does not exist or may have moved.
          </p>
          <Link to={user ? '/app' : '/'} className="btn btn-primary">
            {user ? 'Back to dashboard' : 'Back to home'}
          </Link>
        </Card>
      </div>
    </PublicLayout>
  );
}
