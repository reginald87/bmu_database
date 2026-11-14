'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, campusLabel, downloadBlob, errorMessage, toCsv } from '@/lib/client-api';
import { CampusTag, EmptyState, ErrorNote, PageHead, TableSkeleton } from '@/components/ui';
import type { AuditRow } from '@/lib/types';

const ACTIONS = [
  'Record viewed', 'Profile updated', 'Document added', 'Verified',
  'Changes requested', 'Record created', 'Record imported', 'Record deleted',
];

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('all');
  const [campus, setCampus] = useState('all');

  useEffect(() => {
    api<AuditRow[]>('/audit')
      .then((data) => { setRows(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
    const params = new URLSearchParams(window.location.search);
    const term = params.get('q');
    if (term) setQ(term);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !JSON.stringify(row).toLowerCase().includes(term)) return false;
      if (action !== 'all' && row.action !== action) return false;
      if (campus !== 'all' && row.campus !== campus) return false;
      return true;
    });
  }, [rows, q, action, campus]);

  function exportLog() {
    const csv = toCsv(filtered, [
      { key: 'when', label: 'Date & time' },
      { key: 'action', label: 'Action' },
      { key: 'record', label: 'Record' },
      { key: 'actor', label: 'Performed by' },
      { key: 'campus', label: 'Campus' },
      { key: 'ref', label: 'Reference' },
    ]);
    downloadBlob('bmu-audit-log.csv', csv, 'text/csv;charset=utf-8');
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Administration / Accountability"
        title="Audit trail"
        intro="Review who accessed or changed a record, when it happened, and from which campus."
        actions={<button className="btn" type="button" onClick={exportLog}>↓ &nbsp;Export log</button>}
      />

      <div className="filters">
        <input className="searchfilter" placeholder="Search person, staff ID, action or actor" value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="all">All actions</option>
          {ACTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={campus} onChange={(event) => setCampus(event.target.value)}>
          <option value="all">All campuses</option>
          <option value="imgbi">Yenagoa</option>
          <option value="sampou">Sampou</option>
        </select>
      </div>

      <ErrorNote message={error} />

      <article className="card tablecard">
        <div className="tablewrap">
          <table className="table filtertable">
            <thead>
              <tr><th>Action</th><th>Record</th><th>Performed by</th><th>Campus</th><th>Date &amp; time</th><th>Reference</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon="◉"
                      title="No audit events match"
                      message="Adjust the action, campus or search filters. Audit events appear as records are viewed or changed."
                    />
                  </td>
                </tr>
              ) : filtered.map((row) => (
                <tr key={row.id}>
                  <td><span className="badge blue">{row.action}</span></td>
                  <td>{row.record}</td>
                  <td>{row.actor}</td>
                  <td><CampusTag campus={row.campus} /></td>
                  <td>{row.when}</td>
                  <td>{row.ref || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tablefoot"><span>Showing {filtered.length} events · {campusLabel(campus === 'all' ? null : campus)}</span><span>Audit retention and access rules apply</span></div>
      </article>
    </section>
  );
}
