'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/client-api';
import { ROLE_LABELS } from '@/lib/roles';
import { EmptyState, ErrorNote, PageHead, useToast } from '@/components/ui';
import type { SearchResponse } from '@/lib/types';

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const term = query.trim();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!term) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      api<SearchResponse>(`/search?q=${encodeURIComponent(term)}`)
        .then((result) => { if (!cancelled) setData(result); })
        .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!term) return;
    window.history.replaceState(null, '', `/search?q=${encodeURIComponent(term)}`);
    router.refresh();
  }

  function open(href: string) {
    router.push(href);
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value).then(() => toast('Copied to clipboard.')).catch(() => toast('Copy failed.'));
  }

  const totals = data?.totals;
  const totalCount = totals ? totals.people + totals.documents + totals.review + totals.audit + totals.users : 0;

  const groups = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: 'people',
        label: 'People',
        count: data.totals.people,
        rows: data.people.map((row) => ({
          id: row.id,
          title: row.name,
          meta: [row.recordId, row.kind, row.status, row.campus].filter(Boolean).join(' · '),
          detail: row.email || '',
          href: `/people/${row.id}`,
        })),
      },
      {
        key: 'documents',
        label: 'Documents',
        count: data.totals.documents,
        rows: data.documents.map((row) => ({
          id: row.id,
          title: row.title,
          meta: [row.person, row.type, row.campus].filter(Boolean).join(' · '),
          detail: `${row.filename} · ${row.size}`,
          href: `/vault?q=${encodeURIComponent(row.title)}`,
        })),
      },
      {
        key: 'review',
        label: 'Review queue',
        count: data.totals.review,
        rows: data.review.map((row) => ({
          id: row.id,
          title: `${row.name} · ${row.issue}`,
          meta: [row.recordId, row.group, row.priority, row.submitted].filter(Boolean).join(' · '),
          detail: '',
          href: `/review?q=${encodeURIComponent(row.recordId)}`,
        })),
      },
      {
        key: 'audit',
        label: 'Audit trail',
        count: data.totals.audit,
        rows: data.audit.map((row) => ({
          id: row.id,
          title: row.action,
          meta: [row.record, row.actor, row.when].filter(Boolean).join(' · '),
          detail: row.ref,
          href: `/audit?q=${encodeURIComponent(row.ref || row.action)}`,
        })),
      },
      {
        key: 'users',
        label: 'Accounts',
        count: data.totals.users,
        rows: data.users.map((row) => ({
          id: row.id,
          title: row.displayName,
          meta: [row.username, row.email, ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role].filter(Boolean).join(' · '),
          detail: row.active ? 'Active account' : 'Pending invitation',
          href: '/settings',
        })),
      },
    ].filter((group) => group.count > 0);
  }, [data]);

  return (
    <section className="page show">
      <PageHead
        kicker="Workspace / Search"
        title="Search the registry"
        intro="Search people, identifiers, documents, the review queue, audit events and user accounts from one place."
      />

      <form className="search-hero" onSubmit={submit}>
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, student or staff ID, BIMS number, email, document, audit reference…"
          autoFocus
          aria-label="Search the registry"
        />
        <button className="btn primary" type="submit">Search</button>
      </form>

      <ErrorNote message={error} />

      {!term ? (
        <EmptyState
          icon="⌕"
          title="Start with a name or identifier"
          message="Try a student ID, BIMS number, staff name, document title or audit reference. Results are limited to the records your role can access."
        />
      ) : loading ? (
        <div className="search-loading">
          <span className="skeleton" style={{ width: '38%' }} />
          <span className="skeleton" style={{ width: '64%' }} />
          <span className="skeleton" style={{ width: '52%' }} />
        </div>
      ) : data && totalCount === 0 ? (
        <EmptyState
          icon="∅"
          title={`No matches for “${data.query}”`}
          message="Check the spelling, try a shorter term, or search by record ID. You may also lack permission to view some matching records."
        />
      ) : data ? (
        <div className="search-results">
          <div className="search-summary">
            <b>{totalCount}</b> result{totalCount === 1 ? '' : 's'} for “{data.query}”
            <button className="btn subtle" type="button" onClick={() => copy(window.location.href)}>Copy link</button>
          </div>
          {groups.map((group) => (
            <article className="card panel search-group" key={group.key}>
              <div className="paneltop">
                <h2>{group.label}</h2>
                <span className="badge blue">{group.count}</span>
              </div>
              {group.rows.map((row) => (
                <button key={row.id} type="button" className="search-result" onClick={() => open(row.href)}>
                  <span className="search-result-title"><Highlight text={row.title} term={data.query} /></span>
                  <span className="search-result-meta"><Highlight text={row.meta} term={data.query} /></span>
                  {row.detail ? <span className="search-result-detail"><Highlight text={row.detail} term={data.query} /></span> : null}
                </button>
              ))}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
