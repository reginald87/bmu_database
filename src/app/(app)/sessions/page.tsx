'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/client-api';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { EmptyState, ErrorNote, Modal, PageHead, useConfirm, useToast } from '@/components/ui';
import type { AcademicSessionRow } from '@/lib/types';

const EMPTY_FORM = { name: '', startDate: '', endDate: '', isCurrent: false };

export default function SessionsPage() {
  const user = useSessionUser();
  const toast = useToast();
  const confirm = useConfirm();
  const writable = can(user, 'manageSessions');

  const [rows, setRows] = useState<AcademicSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicSessionRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api<AcademicSessionRow[]>('/academic-sessions')
      .then((data) => { setRows(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(row: AcademicSessionRow) {
    setEditing(row);
    setForm({ name: row.name, startDate: row.startDate, endDate: row.endDate, isCurrent: row.isCurrent });
    setFormError('');
    setModalOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await api(`/academic-sessions/${editing.id}`, { method: 'PATCH', body: form });
        toast('Session updated.');
      } else {
        await api('/academic-sessions', { method: 'POST', body: form });
        toast('Session created.');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AcademicSessionRow) {
    const confirmed = await confirm({
      title: 'Delete session',
      message: `Delete the academic session "${row.name}"? This cannot be undone.`,
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api(`/academic-sessions/${row.id}`, { method: 'DELETE' });
      toast('Session deleted.');
      load();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Workspace / Configuration"
        title="Academic sessions"
        intro="Manage admission and academic sessions. Students select their admission session from this list."
        actions={writable ? <button className="btn primary" type="button" onClick={openCreate}>＋ New session</button> : undefined}
      />

      <article className="card panel">
        <div className="paneltop">
          <h2>Sessions</h2>
          <span className="tiny muted">{rows.length} session{rows.length === 1 ? '' : 's'}</span>
        </div>
        <ErrorNote message={error} />
        {loading ? <div className="tiny muted">Loading sessions…</div> : null}
        {!loading && rows.length === 0 ? (
          <EmptyState
            icon="◷"
            title="No academic sessions"
            message="Create your first academic session to start assigning students to admission sessions."
            action={writable ? <button className="btn primary" type="button" onClick={openCreate}>Create session</button> : undefined}
          />
        ) : null}
        {rows.map((row) => (
          <div className="feeditem" key={row.id}>
            <span className="taskicon">◷</span>
            <div className="feedcopy">
              <b>{row.name}</b>
              <small>
                {row.startDate || row.endDate
                  ? `${row.startDate || '—'} → ${row.endDate || '—'}`
                  : 'No dates set'}
                {row.isCurrent ? ' · Current session' : ''}
              </small>
            </div>
            {row.isCurrent ? <span className="badge green">Current</span> : null}
            {writable ? (
              <>
                <button className="btn subtle" type="button" style={{ marginLeft: 8 }} onClick={() => openEdit(row)}>Edit</button>
                <button className="btn subtle" type="button" style={{ marginLeft: 8 }} onClick={() => remove(row)}>Delete</button>
              </>
            ) : null}
          </div>
        ))}
      </article>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit session' : 'New academic session'}
        hint="Sessions appear in the admission session dropdown when creating or editing student records."
      >
        <form onSubmit={save}>
          <div className="formfields">
            <label className="wide">Session name
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="2026 / 2027"
                required
              />
            </label>
            <label>Start date
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>End date
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={form.isCurrent}
                onChange={(event) => setForm((current) => ({ ...current, isCurrent: event.target.checked }))}
              />
              Set as current session
            </label>
          </div>
          <ErrorNote message={formError} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save session'}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
