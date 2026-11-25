import { useState, type FormEvent } from 'react';
import { changePassword } from '../api';
import { Button, Card, Field, Input, PageHeader } from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';

export function AccountPage() {
  useDocumentTitle('Account');
  const { user, theme, setTheme, pushToast } = useApp();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || newPassword.length < 8) {
      setError('Enter your current password and a new password of at least 8 characters.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      pushToast('success', 'Password updated. Other active sessions were signed out.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Account"
        subtitle="Your staff profile, password, and display preference"
        breadcrumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Account' }]}
      />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="form-stack">
          <Card title="Profile & session">
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: 'var(--space-2)',
                margin: 0,
              }}
            >
              <dt className="muted">Name</dt>
              <dd style={{ margin: 0 }}>{user?.displayName}</dd>
              <dt className="muted">Username</dt>
              <dd className="mono" style={{ margin: 0 }}>
                {user?.username}
              </dd>
              <dt className="muted">Role</dt>
              <dd style={{ margin: 0 }}>{user?.role}</dd>
              <dt className="muted">Session policy</dt>
              <dd className="text-small muted" style={{ margin: 0 }}>
                Signs out automatically after 30 minutes idle or 8 hours total.
              </dd>
            </dl>
          </Card>

          <Card title="Appearance">
            <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
              Light paper mode is the default. Switch to dark mode for low-light counters.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant={theme === 'light' ? 'primary' : 'secondary'}
                onClick={() => setTheme('light')}
              >
                Light mode
              </Button>
              <Button
                variant={theme === 'dark' ? 'primary' : 'secondary'}
                onClick={() => setTheme('dark')}
              >
                Dark mode
              </Button>
            </div>
          </Card>
        </div>

        <Card title="Change password">
          {error ? (
            <div className="banner-alert banner-error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
          <form className="form-stack" onSubmit={handlePasswordChange} noValidate>
            <Field id="acc-current-pw" label="Current password" required>
              <Input
                id="acc-current-pw"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field id="acc-new-pw" label="New password" hint="At least 8 characters" required>
              <Input
                id="acc-new-pw"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
