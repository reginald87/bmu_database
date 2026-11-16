'use client';

import { useState } from 'react';
import { api, errorMessage, setCsrfToken } from '@/lib/client-api';
import { CAMPUSES, can, ROLE_LABELS } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { ErrorNote, PageHead, useToast } from '@/components/ui';

export default function AccountPage() {
  const user = useSessionUser();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [backupBusy, setBackupBusy] = useState(false);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError('');
    try {
      const result = await api<{ csrfToken: string }>('/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCsrfToken(result.csrfToken);
      setCurrentPassword('');
      setNewPassword('');
      toast('Password changed. Other sessions were signed out.');
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function downloadBackup() {
    setBackupBusy(true);
    try {
      const response = await fetch('/api/export', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'The backup could not be downloaded.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bmu-registry-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('Backup downloaded.');
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBackupBusy(false);
    }
  }

  const assigned = user.campuses.includes('*')
    ? CAMPUSES.map((campus) => campus.name)
    : CAMPUSES.filter((campus) => user.campuses.includes(campus.id)).map((campus) => campus.name);

  return (
    <section className="page show">
      <PageHead
        kicker="Account / Security"
        title="Account &amp; security"
        intro="Your sign-in details, role and password. Workspace configuration is managed by the system administrator."
      />

      <div className="grid twocol">
        <article className="card panel">
          <div className="paneltop"><h2>Your access</h2></div>
          <div className="feeditem">
            <span className="taskicon">◈</span>
            <div className="feedcopy">
              <b>{user.displayName}</b>
              <small>{user.username}</small>
            </div>
          </div>
          <div className="feeditem">
            <span className="taskicon">♧</span>
            <div className="feedcopy">
              <b>{ROLE_LABELS[user.role] ?? user.role}</b>
              <small>Role</small>
            </div>
          </div>
          <div className="feeditem">
            <span className="taskicon">⌖</span>
            <div className="feedcopy">
              <b>{assigned.length ? assigned.join(', ') : 'No campus assigned'}</b>
              <small>Campus scope</small>
            </div>
          </div>
        </article>

        <article className="card panel">
          <div className="paneltop"><h2>Campus directory</h2></div>
          {CAMPUSES.map((campus) => (
            <div className="feeditem" key={campus.id}>
              <span className="taskicon">⌖</span>
              <div className="feedcopy"><b>{campus.name} Campus</b><small>{campus.location}</small></div>
              <span className={`badge ${user.campuses.includes('*') || user.campuses.includes(campus.id) ? 'green' : 'blue'}`}>
                {user.campuses.includes('*') || user.campuses.includes(campus.id) ? 'Assigned' : 'Not assigned'}
              </span>
            </div>
          ))}
        </article>
      </div>

      <div className="grid twocol" style={{ marginTop: 12 }}>
        <article className="card panel">
          <div className="paneltop"><h2>Change password</h2><span className="tiny muted">At least 12 characters</span></div>
          <form onSubmit={changePassword}>
            <div className="formfields" style={{ gridTemplateColumns: '1fr' }}>
              <label>Current password
                <div className="password-wrapper">
                  <input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
                  <button type="button" className="password-toggle" onClick={() => setShowCurrentPassword(!showCurrentPassword)} aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}>
                    {showCurrentPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </label>
              <label>New password
                <div className="password-wrapper">
                  <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
                  <button type="button" className="password-toggle" onClick={() => setShowNewPassword(!showNewPassword)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                    {showNewPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </label>
            </div>
            <ErrorNote message={passwordError} />
            <button className="btn primary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button>
          </form>
        </article>
      </div>

      {can(user, 'users') || can(user, 'audit') ? (
        <article className="card panel" style={{ marginTop: 12 }}>
          <div className="paneltop"><h2>Data &amp; backup</h2></div>
          <p className="tiny muted">Download a full JSON backup of the registry database for archival or migration.</p>
          <button className="btn" type="button" onClick={downloadBackup} disabled={backupBusy}>
            {backupBusy ? 'Preparing…' : '↓  Download full backup'}
          </button>
          <div className="callout" style={{ marginTop: 12 }}>
            <b>Security note:</b> Production access must be reviewed with BMU IT, Registry, HR, and data protection stakeholders.
          </div>
        </article>
      ) : null}
    </section>
  );
}
