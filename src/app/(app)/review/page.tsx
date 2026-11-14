'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, campusLabel, errorMessage } from '@/lib/client-api';
import { CampusTag, EmptyState, ErrorNote, PageHead, TableSkeleton, useToast } from '@/components/ui';
import type { ReviewItemRow } from '@/lib/types';

export default function ReviewPage() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ReviewItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [campus, setCampus] = useState('all');
  const [sort, setSort] = useState('oldest');
  const [busyId, setBusyId] = useState('');

  function load() {
    setLoading(true);
    api<ReviewItemRow[]>('/review')
      .then((data) => { setRows(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const term = params.get('q');
    if (term) setQ(term);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (term && !JSON.stringify(row).toLowerCase().includes(term)) return false;
      if (campus !== 'all' && row.campus !== campus) return false;
      return true;
    });
    return sort === 'newest' ? [...list].reverse() : list;
  }, [rows, q, campus, sort]);

  const studentCount = rows.filter((row) => row.group === 'Student').length;
  const staffCount = rows.length - studentCount;

  async function act(id: string, action: 'approve' | 'request-changes') {
    setBusyId(id);
    try {
      await api(`/review/${id}`, { method: 'PATCH', body: { action } });
      toast(action === 'approve' ? 'Record verified.' : 'Changes requested.');
      load();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Administration / Data quality"
        title="Review queue"
        intro="Resolve incomplete submissions and verify changes before records are marked current."
      />

      <div className="grid three" style={{ marginBottom: 11 }}>
        <article className="card metric clickable" onClick={() => { setCampus('all'); setQ(''); }}>
          <div className="metric-top">All pending <span className="metric-icon">◷</span></div>
          <strong>{rows.length}</strong>
          <div className="metric-note">Across both campuses</div>
        </article>
        <article className="card metric clickable" onClick={() => { setQ('Student'); setCampus('all'); }}>
          <div className="metric-top">Student items <span className="metric-icon">♙</span></div>
          <strong>{studentCount}</strong>
          <div className="metric-note">Identity and admission documents</div>
        </article>
        <article className="card metric clickable" onClick={() => { setQ('Staff'); setCampus('all'); }}>
          <div className="metric-top">Staff items <span className="metric-icon">♧</span></div>
          <strong>{staffCount}</strong>
          <div className="metric-note">Appointment and profile updates</div>
        </article>
      </div>

      <div className="filters">
        <input className="searchfilter" placeholder="Search queue" value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={campus} onChange={(event) => setCampus(event.target.value)}>
          <option value="all">All campuses</option>
          <option value="imgbi">Yenagoa</option>
          <option value="sampou">Sampou</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
      </div>

      <ErrorNote message={error} />

      <article className="card tablecard">
        <div className="tablewrap">
          <table className="table filtertable">
            <thead>
              <tr><th>Record</th><th>Issue</th><th>Campus</th><th>Submitted</th><th>Priority</th><th /></tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon="◷"
                      title={rows.length === 0 ? 'The review queue is clear' : 'No items match'}
                      message={rows.length === 0 ? 'New and updated records will appear here for verification.' : 'Adjust the search term or campus filter to see more items.'}
                    />
                  </td>
                </tr>
              ) : filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="recordname">
                      <span className="initial">{row.group === 'Student' ? 'ST' : 'SF'}</span>
                      <span>
                        <b>{row.name}</b>
                        <small>{row.recordId} · {row.group}</small>
                      </span>
                    </div>
                  </td>
                  <td>{row.issue}</td>
                  <td><CampusTag campus={row.campus} /></td>
                  <td>{row.submitted}</td>
                  <td><span className="badge blue">{row.priority}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {row.personId ? (
                      <button className="btn subtle" type="button" style={{ marginRight: 6 }} onClick={() => router.push(`/people/${row.personId}`)}>Open</button>
                    ) : null}
                    <button className="btn" type="button" style={{ marginRight: 6 }} disabled={busyId === row.id} onClick={() => act(row.id, 'request-changes')}>Request changes</button>
                    <button className="btn primary" type="button" disabled={busyId === row.id} onClick={() => act(row.id, 'approve')}>Approve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tablefoot"><span>Showing {filtered.length} items · {campusLabel(campus === 'all' ? null : campus)}</span><span>Live review queue</span></div>
      </article>
    </section>
  );
}
