'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage, setCsrfToken } from '@/lib/client-api';
import type { SessionResponse } from '@/lib/types';
import './login.css';

type Mode = 'checking' | 'setup' | 'login' | 'activate';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('checking');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMode((current) => (current === 'checking' ? 'login' : current));
    }, 3000);

    api<SessionResponse>('/session')
      .then((session) => {
        clearTimeout(timeout);
        if (session.authenticated) {
          router.replace('/home');
          return;
        }
        if (session.setupRequired) {
          setMode('setup');
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const activation = params.get('activate') === '1' || params.has('token') || params.has('username');
        if (activation) {
          const invitedUsername = params.get('username') ?? '';
          const invitedToken = params.get('token') ?? '';
          if (invitedUsername) setUsername(invitedUsername);
          if (invitedToken) setInviteToken(invitedToken);
          setMode('activate');
        } else {
          setMode('login');
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        setMode('login');
        setError(errorMessage(err));
      });

    return () => clearTimeout(timeout);
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body =
        mode === 'setup'
          ? { setupToken, displayName, username, password }
          : mode === 'activate'
            ? { username, token: inviteToken, password }
            : { username, password };
      const result = await api<{ csrfToken: string }>(`/${mode === 'activate' ? 'activate' : mode}`, {
        method: 'POST',
        body,
      });
      setCsrfToken(result.csrfToken);
      router.replace('/home');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const title =
    mode === 'setup' ? 'Create the first administrator'
      : mode === 'activate' ? 'Activate your account'
        : 'Welcome back';
  const subtitle =
    mode === 'setup'
      ? 'Use the setup token printed by the database seed to claim this workspace.'
      : mode === 'activate'
        ? 'Enter the invitation token shared by your administrator and choose a password.'
        : 'Sign in to the Bayelsa Medical University secure database.';
  const label =
    mode === 'setup' ? 'Finish setup'
      : mode === 'activate' ? 'Activate account'
        : 'Sign in';
  const modeLabel =
    mode === 'setup' ? 'First-run setup'
      : mode === 'activate' ? 'Account activation'
        : 'Secure sign in';

  return (
    <div className="loginpage">
      <aside className="story">
        <div className="brand">
          <img src="/crest.png" alt="Bayelsa Medical University crest" />
          <b>BAYELSA MEDICAL UNIVERSITY<small>SECURE DATABASE</small></b>
        </div>
        <div className="storycopy">
          <div className="eyebrow">Secure records workspace</div>
          <h1>One registry for every student and staff record.</h1>
          <p>
            Manage identities, academic records and supporting documents across the
            Yenagoa and Sampou campuses with role-based access and a full audit trail.
          </p>
          <div className="campuses">
            <span>Yenagoa campus</span>
            <span>Sampou campus</span>
          </div>
        </div>
        <div className="storyfoot">
          Bayelsa Medical University · Registry, Human Resources and Data Protection
        </div>
      </aside>

      <main className="formside">
        <div className="panel">
          <span className="mode">{modeLabel}</span>
          <h2>{title}</h2>
          <div className="sub">{subtitle}</div>

          {mode === 'checking' ? (
            <div className="notice">Checking workspace status…</div>
          ) : (
            <form onSubmit={submit}>
              {mode === 'setup' ? (
                <>
                  <div className="field">
                    <label htmlFor="setupToken">Setup token</label>
                    <input
                      id="setupToken"
                      value={setupToken}
                      onChange={(event) => setSetupToken(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="displayName">Your full name</label>
                    <input
                      id="displayName"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                </>
              ) : null}

              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              {mode === 'activate' ? (
                <div className="field">
                  <label htmlFor="inviteToken">Invitation token</label>
                  <input
                    id="inviteToken"
                    value={inviteToken}
                    onChange={(event) => setInviteToken(event.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="password">{mode === 'login' ? 'Password' : 'Choose a password'}</label>
                <div className="password-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'login' ? undefined : 12}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="error">{error}</div>

              <button className="submit" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : label}
              </button>
            </form>
          )}

          {mode === 'login' ? (
            <div className="notice">
              Have an invitation?{' '}
              <button
                type="button"
                onClick={() => { setMode('activate'); setError(''); }}
                style={{ background: 'none', border: 0, color: '#783c69', fontWeight: 700, cursor: 'pointer', padding: 0, font: 'inherit' }}
              >
                Activate your account
              </button>
            </div>
          ) : null}

          {mode === 'activate' ? (
            <div className="notice">
              Already activated?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                style={{ background: 'none', border: 0, color: '#783c69', fontWeight: 700, cursor: 'pointer', padding: 0, font: 'inherit' }}
              >
                Return to sign in
              </button>
            </div>
          ) : null}

          {mode === 'setup' ? (
            <div className="notice">
              The setup token is printed once by <code>npm run db:seed</code> and stored only as a hash.
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
