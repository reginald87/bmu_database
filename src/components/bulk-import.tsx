'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/client-api';
import { ErrorNote, Modal, useToast } from '@/components/ui';

type PreviewRow = {
  row: number;
  valid: boolean;
  errors: string[];
  recordId: string;
  data: Record<string, unknown>;
};

type PreviewResponse = {
  category: string;
  total: number;
  valid: number;
  invalid: number;
  rows: PreviewRow[];
};

export function BulkImportModal({
  open,
  category,
  onClose,
  onImported,
}: {
  open: boolean;
  category: 'student' | 'staff';
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFileName('');
    setPreview(null);
    setBusy(false);
    setCommitting(false);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  async function previewCsv(text: string, name: string) {
    setBusy(true);
    setError('');
    setPreview(null);
    setFileName(name);
    try {
      const result = await api<PreviewResponse>('/import/preview', {
        method: 'POST',
        body: { category, csv: text },
      });
      setPreview(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('CSV must be no larger than 1 MB.');
      return;
    }
    const text = await file.text();
    await previewCsv(text, file.name);
  }

  async function commit() {
    if (!preview) return;
    const rows = preview.rows.filter((row) => row.valid).map((row) => row.data);
    if (!rows.length) {
      setError('There are no valid rows to import.');
      return;
    }
    setCommitting(true);
    setError('');
    try {
      const result = await api<{ imported: number }>('/import/commit', {
        method: 'POST',
        body: { category, rows },
      });
      toast(`${result.imported} ${category} record${result.imported === 1 ? '' : 's'} imported and queued for review.`);
      onImported();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCommitting(false);
    }
  }

  const label = category === 'student' ? 'students' : 'staff';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bulk import ${label}`}
      hint="Upload a CSV, review validation results, then import the valid rows. Every imported record is queued for review."
      wide
    >
      <div className="import-toolbar">
        <a className="btn subtle" href={`/api/import/template?category=${category}`}>↓ Download CSV template</a>
        <label className="btn primary import-file">
          Choose CSV file
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
        {fileName ? <span className="tiny muted">{fileName}</span> : null}
      </div>

      <ErrorNote message={error} />

      {busy ? <div className="search-loading"><span className="skeleton" style={{ width: '42%' }} /><span className="skeleton" style={{ width: '70%' }} /></div> : null}

      {preview ? (
        <>
          <div className="import-summary">
            <span className="badge blue">{preview.total} rows</span>
            <span className="badge green">{preview.valid} valid</span>
            {preview.invalid ? <span className="badge red">{preview.invalid} with errors</span> : null}
          </div>
          <div className="tablewrap" style={{ maxHeight: 340 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Record ID</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.recordId || '—'}</td>
                    <td><span className={`badge ${row.valid ? 'green' : 'red'}`}>{row.valid ? 'Ready' : 'Fix needed'}</span></td>
                    <td className="tiny">{row.errors.length ? row.errors.join(' ') : 'All checks passed.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 ? <div className="tiny muted">Showing the first 100 rows of {preview.rows.length}.</div> : null}
          <div className="import-actions">
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="button" onClick={commit} disabled={committing || preview.valid === 0}>
              {committing ? 'Importing…' : `Import ${preview.valid} valid row${preview.valid === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      ) : !busy ? (
        <div className="callout" style={{ marginTop: 14 }}>
          <b>Before you upload:</b> use the template so column names match the registry. Student IDs must follow
          <code> UG/00/0000</code> or the 14-character format; staff IDs follow <code>BMU/PFN/REG/000</code>.
          <br /><br />
          <b>Required fields:</b> {category === 'student' ? 'first, last, recordId, campus, programme, session' : 'first, last, recordId, campus, kind, department, appointment'}
          <br />
          <b>Optional fields:</b> all other columns can be left blank.
          <br />
          <b>Campus values:</b> <code>imgbi</code> (Yenagoa) or <code>sampou</code> (Sampou)
          <br />
          <b>Staff kind:</b> <code>Academic</code> or <code>Non-academic</code>
          <br />
          <b>Programme levels:</b> Undergraduate, Masters, PhD, Postgraduate Diploma, Postgraduate Certificate
          <br />
          <b>Entry modes:</b> UTME, Direct Entry, Transfer, Remedial, Part-time, Other
        </div>
      ) : null}
    </Modal>
  );
}
