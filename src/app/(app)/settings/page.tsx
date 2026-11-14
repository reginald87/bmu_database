'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage, setCsrfToken } from '@/lib/client-api';
import { CAMPUSES, can, ROLE_LABELS, type Role } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { EmptyState, ErrorNote, Loading, Modal, PageHead, useConfirm, useToast } from '@/components/ui';
import type { MailStatus, UserRow } from '@/lib/types';

const INVITE_ROLES: Role[] = ['registry-officer', 'faculty-officer', 'hr-officer', 'auditor'];

const EMPTY_INVITE = {
  username: '',
  email: '',
  displayName: '',
  role: 'registry-officer' as Role,
  campuses: ['imgbi'] as string[],
};

export default function SettingsPage() {
  const user = useSessionUser();
  const toast = useToast();
  const confirm = useConfirm();
  const manageUsers = can(user, 'users');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userError, setUserError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [inviteError, setInviteError] = useState('');
  const [inviteResult, setInviteResult] = useState<UserRow | null>(null);
  const [savingInvite, setSavingInvite] = useState(false);

  const [mail, setMail] = useState<MailStatus | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const [emailTarget, setEmailTarget] = useState<UserRow | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  function loadUsers() {
    if (!manageUsers) return;
    api<UserRow[]>('/users')
      .then((data) => { setUsers(data); setUserError(''); })
      .catch((err) => setUserError(errorMessage(err)));
  }

  function loadMail() {
    if (!manageUsers) return;
    api<MailStatus>('/mail/status')
      .then((data) => setMail(data))
      .catch(() => setMail(null));
  }

  useEffect(() => {
    loadUsers();
    loadMail();
  }, [manageUsers]);

  async function toggleUser(target: UserRow) {
    if (target.active) {
      const confirmed = await confirm({
        title: 'Deactivate account',
        message: `Deactivate ${target.displayName}? They will be signed out and unable to sign in until reactivated.`,
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!confirmed) return;
    }
    try {
      await api(`/users/${target.id}`, { method: 'PATCH', body: { active: !target.active } });
      toast(target.active ? 'Account deactivated.' : 'Account activated.');
      loadUsers();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteResult(null);
    setInviteError('');
    setInviteOpen(true);
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setSavingInvite(true);
    setInviteError('');
    try {
      const result = await api<UserRow>('/users', {
        method: 'POST',
        body: { ...inviteForm },
      });
      setInviteResult(result);
      toast(result.emailSent ? `Invitation emailed to ${result.email}.` : 'Invitation created. Email delivery failed — share the link securely.');
      loadUsers();
    } catch (err) {
      setInviteError(errorMessage(err));
    } finally {
      setSavingInvite(false);
    }
  }

  function toggleCampus(id: string) {
    setInviteForm((current) => ({
      ...current,
      campuses: current.campuses.includes(id)
        ? current.campuses.filter((item) => item !== id)
        : [...current.campuses, id],
    }));
  }

  async function resendInvitation(target: UserRow) {
    if (!target.email) {
      openEmail(target);
      return;
    }
    try {
      const result = await api<UserRow>(`/users/${target.id}/invitation`, {
        method: 'POST',
        body: { email: target.email },
      });
      toast(result.emailSent ? `Invitation emailed to ${result.email}.` : `Invitation refreshed, but email failed: ${result.emailError ?? 'unknown error'}`);
      loadUsers();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  function openEmail(target: UserRow) {
    setEmailTarget(target);
    setEmailValue(target.email ?? '');
    setEmailError('');
  }

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!emailTarget) return;
    setEmailBusy(true);
    setEmailError('');
    try {
      await api(`/users/${emailTarget.id}`, { method: 'PATCH', body: { email: emailValue } });
      toast('Email address updated.');
      setEmailTarget(null);
      loadUsers();
    } catch (err) {
      setEmailError(errorMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function sendTest(event: React.FormEvent) {
    event.preventDefault();
    setTestBusy(true);
    try {
      await api('/mail/test', { method: 'POST', body: { to: testEmail } });
      toast('Test email sent. Check the inbox.');
      setTestEmail('');
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setTestBusy(false);
    }
  }

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

  function downloadBackup() {
    window.location.href = '/api/export';
  }

  function copy(value: string, label: string) {
    navigator.clipboard?.writeText(value).then(() => toast(`${label} copied.`)).catch(() => toast('Copy failed.'));
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Workspace / Configuration"
        title="Workspace settings"
        intro="Campus structure, access roles, email delivery and record governance for this workspace."
      />

      <div className="grid twocol">
        <article className="card panel">
          <div className="paneltop"><h2>Campus directory</h2></div>
          {CAMPUSES.map((campus) => (
            <div className="feeditem" key={campus.id}>
              <span className="taskicon">⌖</span>
              <div className="feedcopy"><b>{campus.name} Campus</b><small>{campus.location}</small></div>
              <span className="badge green">Active</span>
            </div>
          ))}
        </article>

        {manageUsers ? (
          <article className="card panel">
            <div className="paneltop">
              <h2>Email delivery</h2>
              {mail ? <span className={`badge ${mail.configured ? 'green' : 'red'}`}>{mail.configured ? 'Configured' : 'Not configured'}</span> : null}
            </div>
            {!mail ? <Loading label="Checking Gmail SMTP…" /> : (
              <>
                <div className="feeditem">
                  <span className="taskicon">✉</span>
                  <div className="feedcopy">
                    <b>{mail.address || 'No Gmail account set'}</b>
                    <small>
                      {mail.configured
                        ? `Invitation emails are sent from this address. Activation links open ${mail.appUrl}.`
                        : 'Add GMAIL_USER and GMAIL_APP_PASSWORD to .env, then restart the server to enable invitation emails.'}
                    </small>
                  </div>
                </div>
                <form onSubmit={sendTest} className="inline-form">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(event) => setTestEmail(event.target.value)}
                    placeholder="you@bmu.edu.ng"
                    aria-label="Test email recipient"
                    required
                  />
                  <button className="btn" type="submit" disabled={testBusy}>{testBusy ? 'Sending…' : 'Send test email'}</button>
                </form>
              </>
            )}
          </article>
        ) : null}
      </div>

      {manageUsers ? (
        <article className="card panel" style={{ marginTop: 12 }}>
          <div className="paneltop">
            <h2>User accounts</h2>
            <button className="btn" type="button" onClick={openInvite}>＋ Invite user</button>
          </div>
          <ErrorNote message={userError} />
          {users.length === 0 ? (
            <EmptyState
              icon="♧"
              title="No user accounts yet"
              message="Invite registry officers, faculty officers, HR officers and auditors to collaborate."
              action={<button className="btn primary" type="button" onClick={openInvite}>Invite the first user</button>}
            />
          ) : null}
          {users.map((account) => (
            <div className="feeditem" key={account.id}>
              <span className="taskicon">{account.displayName.charAt(0).toUpperCase()}</span>
              <div className="feedcopy">
                <b>{account.displayName}</b>
                <small>
                  {account.username}
                  {account.email ? ` · ${account.email}` : ' · no email'}
                  {` · ${ROLE_LABELS[account.role as Role] ?? account.role}`}
                  {` · ${account.campuses.includes('*') ? 'All campuses' : account.campuses.join(', ')}`}
                </small>
              </div>
              {!account.email && !account.active ? <span className="badge red">No email</span> : null}
              <span className={`badge ${account.active ? 'green' : 'blue'}`}>{account.active ? 'Active' : 'Pending'}</span>
              {account.id !== user.id ? (
                <>
                  {!account.active ? (
                    <>
                      <button className="btn subtle" type="button" style={{ marginLeft: 8 }} onClick={() => resendInvitation(account)}>
                        {account.email ? 'Resend invite' : 'Add email'}
                      </button>
                      {account.email ? (
                        <button className="btn subtle" type="button" style={{ marginLeft: 8 }} onClick={() => openEmail(account)}>Edit email</button>
                      ) : null}
                    </>
                  ) : null}
                  <button className="btn subtle" type="button" style={{ marginLeft: 8 }} onClick={() => toggleUser(account)}>
                    {account.active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </article>
      ) : null}

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

        <article className="card panel">
          <div className="paneltop"><h2>Data &amp; backup</h2></div>
          <p className="tiny muted">Download a full JSON backup of the registry database for archival or migration.</p>
          <button className="btn" type="button" onClick={downloadBackup}>↓ &nbsp;Download full backup</button>
          <div className="callout" style={{ marginTop: 12 }}>
            <b>Security note:</b> Production access must be reviewed with BMU IT, Registry, HR, and data protection stakeholders.
          </div>
        </article>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a user"
        hint="An invitation email is sent with a 48-hour activation link. You can also copy the link and share it securely."
      >
        {inviteResult ? (
          <div>
            <div className={`notice ${inviteResult.emailSent ? 'success' : 'warning'}`} style={{ marginTop: 0 }}>
              {inviteResult.emailSent ? (
                <div><b>Invitation emailed</b> — sent to {inviteResult.email}. They can activate their account from the email.</div>
              ) : (
                <div><b>Email delivery failed</b> — {inviteResult.emailError || 'the invitation email could not be sent.'} Share the activation link below instead.</div>
              )}
            </div>
            <div className="invite-linkbox">
              <div className="tiny muted">Activation link</div>
              <code>{inviteResult.invitationLink}</code>
              <div className="tiny muted" style={{ marginTop: 8 }}>Invitation token</div>
              <code>{inviteResult.invitationToken}</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn" type="button" onClick={() => copy(inviteResult.invitationLink ?? '', 'Activation link')}>Copy link</button>
              <button className="btn" type="button" onClick={() => copy(inviteResult.invitationToken ?? '', 'Token')}>Copy token</button>
              <button className="btn primary" type="button" onClick={() => setInviteOpen(false)}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={invite}>
            {mail && !mail.configured ? (
              <div className="callout">
                <b>Gmail SMTP is not configured.</b> The account will be created and you can copy the activation link, but no email will be sent until GMAIL_USER and GMAIL_APP_PASSWORD are set in .env.
              </div>
            ) : null}
            <div className="formfields">
              <label>Username<input value={inviteForm.username} onChange={(event) => setInviteForm((current) => ({ ...current, username: event.target.value }))} placeholder="jane.doe" required /></label>
              <label>Email address<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="jane.doe@bmu.edu.ng" required /></label>
              <label className="wide">Full name<input value={inviteForm.displayName} onChange={(event) => setInviteForm((current) => ({ ...current, displayName: event.target.value }))} required /></label>
              <label className="wide">Role
                <select value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as Role }))}>
                  {INVITE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </select>
              </label>
              <div className="wide" style={{ display: 'flex', gap: 16 }}>
                {CAMPUSES.map((campus) => (
                  <label key={campus.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={inviteForm.campuses.includes(campus.id)}
                      onChange={() => toggleCampus(campus.id)}
                    />
                    {campus.name}
                  </label>
                ))}
              </div>
            </div>
            <ErrorNote message={inviteError} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" type="button" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button className="btn primary" type="submit" disabled={savingInvite}>{savingInvite ? 'Sending invitation…' : 'Send invitation'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(emailTarget)}
        onClose={() => setEmailTarget(null)}
        title="Email address"
        hint={`Set the invitation email for ${emailTarget?.displayName ?? 'this account'}.`}
      >
        <form onSubmit={saveEmail}>
          <div className="formfields" style={{ gridTemplateColumns: '1fr' }}>
            <label>Email address
              <input type="email" value={emailValue} onChange={(event) => setEmailValue(event.target.value)} placeholder="name@bmu.edu.ng" required />
            </label>
          </div>
          <ErrorNote message={emailError} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" type="button" onClick={() => setEmailTarget(null)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={emailBusy}>{emailBusy ? 'Saving…' : 'Save email'}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
