'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, campusLabel, downloadBlob, errorMessage, toCsv } from '@/lib/client-api';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { Avatar, CampusTag, EmptyState, ErrorNote, PageHead, StatusPill, TableSkeleton, useConfirm, useToast } from '@/components/ui';
import { BulkImportModal } from '@/components/bulk-import';
import { PersonWizard } from '@/components/person-wizard';
import { PROGRAMME_LEVELS } from '@/lib/registry';
import type { PersonRecord } from '@/lib/types';

const STUDENT_STATUSES = ['Needs review', 'Verified', 'On leave', 'Graduated', 'Withdrawn'];
const CAMPUS_OPTIONS = [
  { id: 'imgbi', name: 'Yenagoa' },
  { id: 'sampou', name: 'Sampou' },
];

export default function StudentsPage() {
  const user = useSessionUser();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState<PersonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [campus, setCampus] = useState('all');
  const [programme, setProgramme] = useState('all');
  const [status, setStatus] = useState('all');
  const [level, setLevel] = useState('all');
  const [programmeLevel, setProgrammeLevel] = useState('all');
  const [pill, setPill] = useState<'all' | 'recent' | 'review'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const writable = can(user, 'writeStudents');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const term = params.get('q');
    if (term) setQ(term);
  }, []);

  function load() {
    setLoading(true);
    api<PersonRecord[]>('/students')
      .then((data) => { setRows(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const programmes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.programme).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return rows.filter((row) => {
      if (term && !JSON.stringify(row).toLowerCase().includes(term)) return false;
      if (campus !== 'all' && row.campus !== campus) return false;
      if (programme !== 'all' && row.programme !== programme) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (level !== 'all' && row.level !== level) return false;
      if (programmeLevel !== 'all' && row.programmeLevel !== programmeLevel) return false;
      if (pill === 'recent' && new Date(row.updatedAt).getTime() < weekAgo) return false;
      if (pill === 'review' && row.status === 'Verified') return false;
      return true;
    });
  }, [rows, q, campus, programme, status, level, programmeLevel, pill]);

  const counts = useMemo(() => ({
    all: rows.length,
    recent: rows.filter((row) => new Date(row.updatedAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000).length,
    review: rows.filter((row) => row.status !== 'Verified').length,
  }), [rows]);

  const allSelected = filtered.length > 0 && filtered.every((row) => selected.includes(row.id));

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((current) => current.filter((id) => !filtered.some((row) => row.id === id)));
    } else {
      setSelected((current) => Array.from(new Set([...current, ...filtered.map((row) => row.id)])));
    }
  }

  function exportRows(list: PersonRecord[]) {
    const csv = toCsv(list, [
      { key: 'recordId', label: 'Student ID' },
      { key: 'bims', label: 'BIMS' },
      { key: 'first', label: 'First name' },
      { key: 'last', label: 'Last name' },
      { key: 'programme', label: 'Programme' },
      { key: 'faculty', label: 'Faculty' },
      { key: 'level', label: 'Level' },
      { key: 'session', label: 'Session' },
      { key: 'campus', label: 'Campus' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
    ]);
    downloadBlob('bmu-students.csv', csv, 'text/csv;charset=utf-8');
  }

  async function applyBulk(action: 'status' | 'delete') {
    if (!selected.length) return;
    if (action === 'delete') {
      const confirmed = await confirm({
        title: 'Delete student records',
        message: `Delete ${selected.length} student record${selected.length === 1 ? '' : 's'}? This cannot be undone.`,
        confirmLabel: 'Delete records',
        danger: true,
      });
      if (!confirmed) return;
    }
    if (action === 'status' && !bulkStatus) { toast('Choose a status first.'); return; }
    try {
      await api('/people/bulk', {
        method: 'POST',
        body: { ids: selected, action, status: bulkStatus || undefined },
      });
      toast(action === 'delete' ? 'Records deleted.' : 'Status updated.');
      setSelected([]);
      setBulkStatus('');
      load();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Registry / People"
        title="Student records"
        intro="Find a student and review their academic profile and supporting documents."
        actions={
          writable ? (
            <>
              <button className="btn" type="button" onClick={() => setBulkOpen(true)}>↑ &nbsp;Bulk upload</button>
              <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>＋ &nbsp;New student</button>
            </>
          ) : undefined
        }
      />

      <div className="filters">
        <input className="searchfilter" placeholder="Search name, student ID, BIMS, email or phone" value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={campus} onChange={(event) => setCampus(event.target.value)}>
          <option value="all">All campuses</option>
          {CAMPUS_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={programme} onChange={(event) => setProgramme(event.target.value)}>
          <option value="all">All programmes</option>
          {programmes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All record states</option>
          {STUDENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={programmeLevel} onChange={(event) => setProgrammeLevel(event.target.value)}>
          <option value="all">All programme levels</option>
          {PROGRAMME_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="all">All levels</option>
          {['100', '200', '300', '400', '500', '600'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="toolbarline">
        <div className="pills">
          <button className={`filterpill ${pill === 'all' ? 'selected' : ''}`} type="button" onClick={() => setPill('all')}>All students <b>{counts.all}</b></button>
          <button className={`filterpill ${pill === 'recent' ? 'selected' : ''}`} type="button" onClick={() => setPill('recent')}>Recently updated <b>{counts.recent}</b></button>
          <button className={`filterpill ${pill === 'review' ? 'selected' : ''}`} type="button" onClick={() => setPill('review')}>Needs review <b>{counts.review}</b></button>
        </div>
        <button className="btn subtle" type="button" onClick={() => exportRows(filtered)}>↓ Export</button>
      </div>

      {writable && selected.length ? (
        <div className="bulkbar">
          <span className="tiny"><b>{selected.length}</b> selected</span>
          <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
            <option value="">Set status…</option>
            {STUDENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="btn" type="button" onClick={() => applyBulk('status')}>Apply</button>
          <button className="btn danger" type="button" onClick={() => applyBulk('delete')}>Delete</button>
          <button className="btn subtle" type="button" onClick={() => exportRows(rows.filter((row) => selected.includes(row.id)))}>Export</button>
          <button className="btn subtle" type="button" onClick={() => setSelected([])}>Clear</button>
        </div>
      ) : null}

      <ErrorNote message={error} />

      <article className="card tablecard">
        <div className="tablewrap">
          <table className="table filtertable">
            <thead>
              <tr>
                <th className="bulkcol"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                <th>Student</th>
                <th>Programme</th>
                <th>Level</th>
                <th>Campus</th>
                <th>Completeness</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={8} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon="♙"
                      title="No student records match"
                      message="Adjust the filters, clear the search term, or create a new student record."
                    />
                  </td>
                </tr>
              ) : filtered.map((row) => (
                <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/people/${row.id}`)}>
                  <td className="bulkcol" onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.first} ${row.last}`} />
                  </td>
                  <td>
                    <div className="recordname">
                      <Avatar first={row.first} last={row.last} gender={row.gender} photo={row.photo} />
                      <span><b>{row.first} {row.last}</b><small>{row.recordId}</small></span>
                    </div>
                  </td>
                  <td>{row.programme || '—'}</td>
                  <td>{row.level || '—'}</td>
                  <td><CampusTag campus={row.campus} /></td>
                  <td>{row.completeness}%</td>
                  <td><StatusPill status={row.status} /></td>
                  <td>•••</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tablefoot"><span>Showing {filtered.length} records</span><span>Live registry data</span></div>
      </article>

      <PersonWizard
        open={createOpen}
        category="student"
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); load(); }}
      />

      <BulkImportModal
        open={bulkOpen}
        category="student"
        onClose={() => setBulkOpen(false)}
        onImported={load}
      />
    </section>
  );
}
