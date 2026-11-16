'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, setCsrfToken } from '@/lib/client-api';
import { can, ROLE_LABELS, type Capability, type SessionUser } from '@/lib/roles';
import type { NotificationRow, SearchResponse, SummaryResponse } from '@/lib/types';
import { SessionProvider, useSessionUser } from './session-context';
import { ConfirmProvider, ToastProvider, useToast } from './ui';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  capability?: Capability;
  metric?: 'students' | 'staff' | 'pending';
  admin?: boolean;
};

const NAV: NavItem[] = [
  { href: '/home', label: 'Home', icon: '⌂' },
  { href: '/students', label: 'Student records', icon: '♙', capability: 'readStudents', metric: 'students' },
  { href: '/staff', label: 'Staff records', icon: '♧', capability: 'readStaff', metric: 'staff' },
  { href: '/vault', label: 'Document vault', icon: '▤', capability: 'readStudentDocuments' },
  { href: '/review', label: 'Review queue', icon: '◷', capability: 'reviewStudents', metric: 'pending', admin: true },
  { href: '/reports', label: 'Reports', icon: '▥', capability: 'summary', admin: true },
  { href: '/audit', label: 'Audit trail', icon: '◉', capability: 'audit', admin: true },
  { href: '/sessions', label: 'Academic sessions', icon: '◷', capability: 'manageSessions', admin: true },
  { href: '/settings', label: 'Workspace settings', icon: '⚙', capability: 'users', admin: true },
  { href: '/account', label: 'Account & security', icon: '⚿' },
];

const CRUMBS: Array<[RegExp, string]> = [
  [/^\/home/, 'Home'],
  [/^\/students/, 'Student records'],
  [/^\/staff/, 'Staff records'],
  [/^\/vault/, 'Document vault'],
  [/^\/review/, 'Review queue'],
  [/^\/reports/, 'Reports'],
  [/^\/audit/, 'Audit trail'],
  [/^\/settings/, 'Workspace settings'],
  [/^\/sessions/, 'Academic sessions'],
  [/^\/account/, 'Account & security'],
  [/^\/search/, 'Search results'],
  [/^\/people/, 'Person profile'],
];

function displayInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase() || 'BM';
}

function allowed(user: SessionUser, capability?: Capability): boolean {
  if (!capability) return true;
  if (capability === 'readStudentDocuments') {
    return can(user, 'readStudentDocuments') || can(user, 'readStaffDocuments');
  }
  if (capability === 'reviewStudents') {
    return can(user, 'reviewStudents') || can(user, 'reviewStaff');
  }
  return can(user, capability);
}

function Shell({ user, csrfToken, children }: { user: SessionUser; csrfToken: string; children: React.ReactNode }) {
  setCsrfToken(csrfToken);

  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const sessionUser = useSessionUser();

  const [railOpen, setRailOpen] = useState(false);
  const [activePath, setActivePath] = useState('');
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [suggestions, setSuggestions] = useState<SearchResponse | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLFormElement>(null);

  const unread = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    setActivePath(pathname);
  }, [pathname]);

  const loadNotifications = useCallback(async () => {
    try {
      const rows = await api<NotificationRow[]>('/notifications');
      setNotifications(rows);
    } catch {
      /* notifications are non-critical */
    }
  }, []);

  useEffect(() => {
    if (can(sessionUser, 'summary')) {
      api<SummaryResponse>('/summary')
        .then((data) => setCounts(data.metrics as unknown as Record<string, number>))
        .catch(() => {});
    }
  }, [sessionUser]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    setRailOpen(false);
    setNotificationsOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions(null);
      setSearchOpen(false);
      setSearchBusy(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchBusy(true);
      api<SearchResponse>(`/search?q=${encodeURIComponent(term)}`)
        .then((data) => {
          if (cancelled) return;
          setSuggestions(data);
          setSearchOpen(true);
        })
        .catch(() => {
          if (!cancelled) setSuggestions(null);
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) : false;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        searchRef.current?.blur();
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  const crumb = useMemo(
    () => CRUMBS.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Workspace',
    [pathname],
  );

  async function signOut() {
    try {
      await api('/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  async function markRead(id: string) {
    setNotifications((rows) => rows.map((row) => (row.id === id ? { ...row, read: true } : row)));
    try {
      await api('/notifications', { method: 'PATCH', body: { id } });
    } catch {
      /* keep optimistic state */
    }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  function openResult(href: string) {
    setSearchOpen(false);
    router.push(href);
  }

  const suggestionGroups = suggestions ? [
    {
      label: 'People',
      rows: suggestions.people.slice(0, 3).map((row) => ({
        key: row.id,
        title: row.name,
        meta: `${row.recordId} · ${row.kind} · ${row.status}`,
        href: `/people/${row.id}`,
      })),
    },
    {
      label: 'Documents',
      rows: suggestions.documents.slice(0, 3).map((row) => ({
        key: row.id,
        title: row.title,
        meta: `${row.person} · ${row.type} · ${row.campus}`,
        href: `/vault?q=${encodeURIComponent(row.title)}`,
      })),
    },
    {
      label: 'Review queue',
      rows: suggestions.review.slice(0, 3).map((row) => ({
        key: row.id,
        title: `${row.name} · ${row.issue}`,
        meta: `${row.recordId} · ${row.priority}`,
        href: `/review?q=${encodeURIComponent(row.recordId)}`,
      })),
    },
    {
      label: 'Audit trail',
      rows: suggestions.audit.slice(0, 3).map((row) => ({
        key: row.id,
        title: row.action,
        meta: `${row.record} · ${row.when}`,
        href: `/audit?q=${encodeURIComponent(row.ref || row.action)}`,
      })),
    },
    {
      label: 'Accounts',
      rows: suggestions.users.slice(0, 3).map((row) => ({
        key: row.id,
        title: row.displayName,
        meta: `${row.username}${row.email ? ` · ${row.email}` : ''} · ${ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role}`,
        href: '/settings',
      })),
    },
  ].filter((group) => group.rows.length) : [];
  const suggestionTotal = suggestions
    ? suggestions.people.length + suggestions.documents.length + suggestions.review.length + suggestions.audit.length + suggestions.users.length
    : 0;

  const navItems = NAV.filter((item) => allowed(sessionUser, item.capability));
  const registryItems = navItems.filter((item) => !item.admin);
  const adminItems = navItems.filter((item) => item.admin);

  return (
    <div className="app">
      <aside className={railOpen ? 'rail open' : 'rail'} id="rail">
        <button className="railclose" type="button" aria-label="Close menu" onClick={() => setRailOpen(false)}>×</button>
        <div className="brand">
          <img className="crest" src="/crest.png" alt="Bayelsa Medical University crest" />
          <div className="brandname">
            BAYELSA MEDICAL UNIVERSITY
            <small>SECURE DATABASE</small>
          </div>
        </div>

        <button
          className="switcher"
          type="button"
          onClick={() => toast(`Campus scope: ${user.campuses.includes('*') ? 'both campuses' : user.campuses.join(', ')}`)}
        >
          <span className="switchmark">⌖</span>
          <span className="switchtext">
            {user.campuses.includes('*') ? 'University-wide' : 'Assigned campuses'}
            <small>{user.campuses.includes('*') ? '2 campuses' : `${user.campuses.length} campus scope`}</small>
          </span>
          <span className="chev">⌄</span>
        </button>

        <div className="navlabel">Registry</div>
        <nav className="nav" id="nav">
          {registryItems.map((item) => (
            <button
              key={item.href}
              type="button"
              className={activePath.startsWith(item.href) ? 'active' : ''}
              onClick={() => router.push(item.href)}
              suppressHydrationWarning
            >
              <span className="navico">{item.icon}</span>
              {item.label}
              {item.metric ? <span className="count">{counts[item.metric] ?? 0}</span> : null}
            </button>
          ))}
        </nav>

        {adminItems.length ? (
          <>
            <div className="navlabel">Administration</div>
            <nav className="nav">
              {adminItems.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  className={activePath.startsWith(item.href) ? 'active' : ''}
                  onClick={() => router.push(item.href)}
                  suppressHydrationWarning
                >
                  <span className="navico">{item.icon}</span>
                  {item.label}
                  {item.metric ? <span className="count">{counts[item.metric] ?? 0}</span> : null}
                </button>
              ))}
            </nav>
          </>
        ) : null}

        <div className="railbottom">
          <div className="access">
            <i>◈</i>
            <div>
              <strong>BMU secure database</strong>
              <small>Access depends on assigned role</small>
            </div>
          </div>
          <div className="userrow">
            <div className="useravatar">{displayInitials(user.displayName)}</div>
            <div>
              <b>{user.displayName}</b>
              <small>{ROLE_LABELS[user.role]}</small>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="top-action mobiletoggle" type="button" onClick={() => setRailOpen(true)}>☰</button>
          <div className="location">BMU Records &nbsp;/&nbsp; <b>{crumb}</b></div>
          <div className="grow" />
          <form className="global-search" onSubmit={search} ref={searchBoxRef}>
            ⌕
            <input
              id="global"
              ref={searchRef}
              placeholder="Search people, IDs, documents"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => { if (suggestions) setSearchOpen(true); }}
              autoComplete="off"
              suppressHydrationWarning
            />
            <span className="key">/</span>
            {searchOpen && query.trim().length >= 2 ? (
              <div className="search-suggest" role="listbox" aria-label="Search suggestions">
                {searchBusy && !suggestions ? <div className="suggest-note">Searching the registry…</div> : null}
                {!searchBusy && suggestions && suggestionTotal === 0 ? (
                  <div className="suggest-note">No matches for “{query.trim()}”.</div>
                ) : null}
                {suggestionGroups.map((group) => (
                  <div key={group.label} className="suggest-group">
                    <div className="suggest-label">{group.label}</div>
                    {group.rows.map((row) => (
                      <button key={row.key} type="button" className="suggest-row" onClick={() => openResult(row.href)}>
                        <span className="suggest-title">{row.title}</span>
                        <span className="suggest-meta">{row.meta}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {suggestionTotal > 0 ? (
                  <button
                    type="button"
                    className="suggest-all"
                    onClick={() => { setSearchOpen(false); router.push(`/search?q=${encodeURIComponent(query.trim())}`); }}
                  >
                    View all results →
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

          <div style={{ position: 'relative' }}>
            <button
              className="top-action"
              type="button"
              title="Notifications"
              aria-label="Notifications"
              onClick={() => { setNotificationsOpen((open) => !open); setAccountOpen(false); loadNotifications(); }}
            >
              ♧{unread ? <span className="badge green" style={{ marginLeft: 4 }}>{unread}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="card panel" style={{ position: 'absolute', right: 0, top: 44, width: 320, zIndex: 20, maxHeight: 380, overflowY: 'auto' }}>
                <div className="paneltop"><h2>Notifications</h2></div>
                {notifications.length === 0 ? <div className="tiny muted">Nothing new.</div> : null}
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="feeditem"
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid #eef1f4', cursor: 'pointer' }}
                    onClick={() => markRead(item.id)}
                  >
                    <span className="feedicon">{item.read ? '✓' : '●'}</span>
                    <span className="feedcopy">
                      <b>{item.title}</b>
                      <small>{item.message}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className="top-action"
              type="button"
              title="Account"
              onClick={() => { setAccountOpen((open) => !open); setNotificationsOpen(false); }}
            >
              {displayInitials(user.displayName)}
            </button>
            {accountOpen ? (
              <div className="card panel" style={{ position: 'absolute', right: 0, top: 44, width: 240, zIndex: 20 }}>
                <div className="paneltop"><h2>{user.displayName}</h2></div>
                <div className="tiny muted" style={{ marginBottom: 8 }}>{ROLE_LABELS[user.role]}</div>
                <button className="btn subtle" type="button" style={{ width: '100%', marginBottom: 6 }} onClick={() => router.push('/account')}>
                  Account &amp; security
                </button>
                <button className="btn" type="button" style={{ width: '100%' }} onClick={signOut}>Sign out</button>
              </div>
            ) : null}
          </div>

          <button className="btn" type="button" onClick={signOut}>Sign out</button>
        </header>

        <main className="main">{children}</main>
      </section>
    </div>
  );
}

export function AppShell({ user, csrfToken, children }: { user: SessionUser; csrfToken: string; children: React.ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ToastProvider>
        <ConfirmProvider>
          <Shell user={user} csrfToken={csrfToken}>{children}</Shell>
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
