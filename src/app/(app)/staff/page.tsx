'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, downloadBlob, errorMessage, toCsv } from '@/lib/client-api';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { Avatar, CampusTag, EmptyState, ErrorNote, PageHead, StatusPill, TableSkeleton, useConfirm, useToast } from '@/components/ui';
import { BulkImportModal } from '@/components/bulk-import';
import { PersonWizard } from '@/components/person-wizard';
import { APPOINTMENT_TYPES } from '@/lib/registry';
import type { PersonRecord } from '@/lib/types';

const STAFF_STATUSES = ['Review due', 'Verified', 'On leave', 'Separated', 'Retired'];
const CAMPUS_OPTIONS = [
  { id: 'imgbi', name: 'Yenagoa' },
  { id: 'sampou', name: 'Sampou' },
];

export default function StaffPage() {
  const user = useSessionUser();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState<PersonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [campus, setCampus] = useState('all');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [appointmentType, setAppointmentType] = useState('all');
  const [pill, setPill] = useState<'all' | 'academic' | 'nonacademic'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const writable = can(user, 'writeStaff');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const term = params.get('q');
    if (term) setQ(term);
  }, []);

  function load() {
    setLoading(true);
    api<PersonRecord[]>('/staff')
      .then((data) => { setRows(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !JSON.stringify(row).toLowerCase().includes(term)) return false;
      if (campus !== 'all' && row.campus !== campus) return false;
      if (group !== 'all' && row.kind !== group) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (appointmentType !== 'all' && row.appointmentType !== appointmentType) return false;
      if (pill === 'academic' && row.kind !== 'Academic') return false;
      if (pill === 'nonacademic' && row.kind !== 'Non-academic') return false;
      return true;
    });
  }, [rows, q, campus, group, status, appointmentType, pill]);

  const counts = useMemo(() => ({
    all: rows.length,
    academic: rows.filter((row) => row.kind === 'Academic').length,
    nonacademic: rows.filter((row) => row.kind === 'Non-academic').length,
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
      { key: 'recordId', label: 'Staff ID' },
      { key: 'bims', label: 'BIMS' },
      { key: 'first', label: 'First name' },
      { key: 'last', label: 'Last name' },
      { key: 'kind', label: 'Staff group' },
      { key: 'department', label: 'Department' },
      { key: 'appointment', label: 'Appointment' },
      { key: 'campus', label: 'Campus' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
    ]);
    downloadBlob('bmu-staff.csv', csv, 'text/csv;charset=utf-8');
  }

  async function applyBulk(action: 'status' | 'delete') {
    if (!selected.length) return;
    if (action === 'delete') {
      const confirmed = await confirm({
        title: 'Delete staff records',
        message: `Delete ${selected.length} staff record${selected.length === 1 ? '' : 's'}? This cannot be undone.`,
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
        title="Staff records"
        intro="Academic and non-academic staff profiles, appointments and service history."
        actions={
          writable ? (
            <>
              <button className="btn" type="button" onClick={() => setBulkOpen(true)}>↑ &nbsp;Bulk upload</button>
              <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>＋ &nbsp;New staff record</button>
            </>
          ) : undefined
        }
      />

      <div className="filters">
        <input className="searchfilter" placeholder="Search name, staff ID, BIMS, email or phone" value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={campus} onChange={(event) => setCampus(event.target.value)}>
          <option value="all">All campuses</option>
          {CAMPUS_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="all">All staff groups</option>
          <option>Academic</option>
          <option>Non-academic</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All record states</option>
          {STAFF_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={appointmentType} onChange={(event) => setAppointmentType(event.target.value)}>
          <option value="all">All appointment types</option>
          {APPOINTMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="toolbarline">
        <div className="pills">
          <button className={`filterpill ${pill === 'all' ? 'selected' : ''}`} type="button" onClick={() => setPill('all')}>All staff <b>{counts.all}</b></button>
          <button className={`filterpill ${pill === 'academic' ? 'selected' : ''}`} type="button" onClick={() => setPill('academic')}>Academic <b>{counts.academic}</b></button>
          <button className={`filterpill ${pill === 'nonacademic' ? 'selected' : ''}`} type="button" onClick={() => setPill('nonacademic')}>Non-academic <b>{counts.nonacademic}</b></button>
        </div>
        <button className="btn subtle" type="button" onClick={() => exportRows(filtered)}>↓ Export</button>
      </div>

      {writable && selected.length ? (
        <div className="bulkbar">
          <span className="tiny"><b>{selected.length}</b> selected</span>
          <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
            <option value="">Set status…</option>
            {STAFF_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
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
                <th>Staff member</th>
                <th>Staff group</th>
                <th>Department</th>
                <th>Appointment</th>
                <th>Campus</th>
                <th>State</th>
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
                      icon="♧"
                      title="No staff records match"
                      message="Adjust the filters, clear the search term, or create a new staff record."
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
                  <td><span className="stafftype">{row.kind}</span></td>
                  <td>{row.department || '—'}</td>
                  <td>{row.appointment || '—'}</td>
                  <td><CampusTag campus={row.campus} /></td>
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
        category="staff"
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); load(); }}
      />

      <BulkImportModal
        open={bulkOpen}
        category="staff"
        onClose={() => setBulkOpen(false)}
        onImported={load}
      />
    </section>
  );
}
