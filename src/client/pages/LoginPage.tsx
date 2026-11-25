import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api';
import { Button, Card, Field, Input } from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import { PublicLayout } from '../layouts/PublicLayout';

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { user, loginUser } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next');
  const safeNext = nextPath && nextPath.startsWith('/') ? nextPath : '/app';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={safeNext} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter both your username and password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await loginUser(username.trim(), password);
      navigate(safeNext, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many sign-in attempts. Please wait a few minutes before trying again.');
      } else {
        setError('Username or password did not match. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <div className="auth-center">
        <Card className="auth-card">
          <h1 className="page-title" tabIndex={-1} style={{ marginBottom: 'var(--space-2)' }}>
            Sign in
          </h1>
          <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>
            Sign in with your store staff account to open the console.
          </p>

          {error ? (
            <div className="banner-alert banner-error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          <form className="form-stack" onSubmit={handleSubmit} noValidate>
            <Field id="login-username" label="Username" required>
              <Input
                id="login-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field id="login-password" label="Password" required>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {import.meta.env.DEV ? (
            <div
              style={{
                marginTop: 'var(--space-6)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--border-hairline)',
              }}
            >
              <p className="text-small muted" style={{ marginBottom: 'var(--space-2)' }}>
                Development quick fill:
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  onClick={() => {
                    setUsername('admin');
                    setPassword('AdminPass123!');
                  }}
                >
                  Admin
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setUsername('operator');
                    setPassword('OperatorPass123!');
                  }}
                >
                  Operator
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setUsername('warehouse');
                    setPassword('WarehousePass123!');
                  }}
                >
                  Warehouse
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </PublicLayout>
  );
}
