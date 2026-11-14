'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, campusLabel, errorMessage } from '@/lib/client-api';
import { documentTitlesFor } from '@/lib/document-titles';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { Avatar, CampusTag, EmptyState, ErrorNote, Field, Modal, StatusPill, useConfirm, useToast } from '@/components/ui';
import { PersonWizard } from '@/components/person-wizard';
import type { PersonRecord } from '@/lib/types';

const CLASSIFICATIONS = ['Internal', 'Restricted', 'HR only'];

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export default function PersonPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const user = useSessionUser();
  const toast = useToast();
  const confirm = useConfirm();

  const [person, setPerson] = useState<PersonRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'profile' | 'academic' | 'documents' | 'history'>('profile');

  const [editOpen, setEditOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCustomTitle, setUploadCustomTitle] = useState('');
  const [uploadClassification, setUploadClassification] = useState('Internal');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const isStudent = person?.recordType === 'Student';
  const titleOptions = documentTitlesFor(person?.recordType);
  const effectiveUploadTitle = uploadTitle === 'Other' ? uploadCustomTitle.trim() : uploadTitle;
  const writable = person
    ? can(user, isStudent ? 'writeStudents' : 'writeStaff', person.campus)
    : false;
  const canUpload = person
    ? can(user, isStudent ? 'writeStudentDocuments' : 'writeStaffDocuments', person.campus)
    : false;
  const canReadDocuments = person
    ? can(user, isStudent ? 'readStudentDocuments' : 'readStaffDocuments', person.campus)
    : false;

  function load() {
    setLoading(true);
    api<PersonRecord>(`/people/${id}`)
      .then((data) => { setPerson(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    const handleBeforePrint = () => {
      document.querySelectorAll('.print-summary').forEach((el) => {
        (el as HTMLElement).style.display = 'block';
      });
      document.querySelectorAll('.page > *:not(.print-summary)').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      document.querySelectorAll('aside.rail, header.topbar').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    };
    const handleAfterPrint = () => {
      document.querySelectorAll('.print-summary').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      document.querySelectorAll('.page > *:not(.print-summary)').forEach((el) => {
        (el as HTMLElement).style.display = '';
      });
      document.querySelectorAll('aside.rail, header.topbar').forEach((el) => {
        (el as HTMLElement).style.display = '';
      });
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadFile) { setUploadError('Choose a file to upload.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const data = await fileToBase64(uploadFile);
      await api(`/people/${id}/documents`, {
        method: 'POST',
        body: {
          filename: uploadFile.name,
          title: effectiveUploadTitle || 'Other',
          classification: uploadClassification,
          expiryDate: uploadExpiry,
          data,
        },
      });
      toast('Document scanned and added.');
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadCustomTitle('');
      setUploadExpiry('');
      load();
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeRecord() {
    if (!person) return;
    const confirmed = await confirm({
      title: 'Delete this record',
      message: `Delete the record for ${person.first} ${person.last}? This cannot be undone.`,
      confirmLabel: 'Delete record',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api(`/people/${id}`, { method: 'DELETE' });
      toast('Record deleted.');
      router.push(isStudent ? '/students' : '/staff');
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <section className="page show">
        <div className="search-loading">
          <span className="skeleton" style={{ width: '34%', height: 28 }} />
          <span className="skeleton" style={{ width: '52%' }} />
          <span className="skeleton" style={{ width: '100%', height: 160 }} />
          <span className="skeleton" style={{ width: '100%', height: 120 }} />
        </div>
      </section>
    );
  }

  if (!person) {
    return (
      <section className="page show">
        <EmptyState
          icon="∅"
          title="Record not found"
          message={error || 'This record may have been deleted, or your role may not have access to it.'}
          action={<button className="btn" type="button" onClick={() => router.back()}>← Go back</button>}
        />
      </section>
    );
  }

  return (
    <section className="page show">
      <div className="pagehead">
        <div>
          <div className="kicker">{isStudent ? 'Student records' : 'Staff records'} / Profile</div>
          <h1>{person.first} {person.last}</h1>
          <div className="intro">{person.recordId} · {person.kind} · {campusLabel(person.campus)} campus</div>
        </div>
        <div className="headactions">
          <button className="btn" type="button" onClick={() => router.push(isStudent ? '/students' : '/staff')}>← &nbsp;Back</button>
          <button className="btn" type="button" onClick={() => window.print()}>▤ &nbsp;Print summary</button>
          {canUpload ? <button className="btn" type="button" onClick={() => { setUploadError(''); setUploadOpen(true); }}>↑ &nbsp;Attach document</button> : null}
          {writable ? <button className="btn" type="button" onClick={() => setEditOpen(true)}>✎ &nbsp;Edit record</button> : null}
          {writable ? <button className="btn danger" type="button" onClick={removeRecord}>Delete</button> : null}
        </div>
      </div>

      <article className="card profilehero" style={{ marginBottom: 11 }}>
        <Avatar first={person.first} last={person.last} gender={person.gender} photo={person.photo} size={88} />
        <div style={{ flex: 1 }}>
          <h2>{person.first} {person.middleName ? `${person.middleName} ` : ''}{person.last}</h2>
          <div className="meta">{person.recordId} &nbsp;·&nbsp; {person.kind} &nbsp;·&nbsp; <StatusPill status={person.status} /></div>
        </div>
        <CampusTag campus={person.campus} />
      </article>

      <div className="profile-tabs" style={{ marginBottom: 16 }}>
        <div className="tablist" role="tablist">
          <button className={`tab ${tab === 'profile' ? 'active' : ''}`} type="button" onClick={() => setTab('profile')}>Personal &amp; identity</button>
          <button className={`tab ${tab === 'academic' ? 'active' : ''}`} type="button" onClick={() => setTab('academic')}>{isStudent ? 'Academic record' : 'Employment'}</button>
          <button className={`tab ${tab === 'documents' ? 'active' : ''}`} type="button" onClick={() => setTab('documents')}>Documents</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} type="button" onClick={() => setTab('history')}>Record history</button>
        </div>
      </div>

      {tab === 'profile' ? (
        <div className="grid twocol">
          <article className="card panel">
            <div className="paneltop"><h2>Personal information</h2><span className="tiny muted">Visible to authorised registry staff</span></div>
            <div className="profilegrid">
              <Field label="Preferred name" value={person.preferredName} />
              <Field label="Date of birth" value={person.dateOfBirth} />
              <Field label="University email" value={person.email} />
              <Field label="Phone" value={person.phone} />
              <Field label="Gender" value={person.gender} />
              <Field label="Nationality" value={person.nationality} />
              <Field label="Home LGA" value={person.lga} />
              <Field label="State" value={person.state} />
              <Field label="Address" value={person.address} />
              <Field label="Emergency contact" value={person.emergencyContact} />
              <Field label="Next of kin" value={person.nextOfKin} />
              <Field label="Guardian" value={person.guardianName} />
            </div>
          </article>
          <article className="card panel">
            <div className="paneltop"><h2>Identity</h2><span className="tiny muted">Unique university identifiers</span></div>
            <div className="profilegrid">
              <Field label="University ID" value={person.recordId} />
              <Field label="BIMS number" value={person.bims} />
              <Field label="Record type" value={person.recordType} />
              <Field label="Campus" value={campusLabel(person.campus)} />
              <Field label="Completeness" value={`${person.completeness}%`} />
              <Field label="Last updated" value={new Date(person.updatedAt).toLocaleString('en-GB')} />
            </div>
          </article>
        </div>
      ) : null}

      {tab === 'academic' ? (
        <article className="card panel">
          <div className="paneltop">
            <h2>{isStudent ? 'Academic record' : 'Employment details'}</h2>
            <span className="tiny muted">{isStudent ? 'Programme, faculty and level details' : 'Appointment and service details'}</span>
          </div>
          <div className="profilegrid">
            {isStudent ? (
              <>
                <Field label="Programme" value={person.programme} />
                <Field label="Faculty" value={person.faculty} />
                <Field label="Admission session" value={person.session} />
                <Field label="Current level" value={person.level} />
                <Field label="Programme level" value={person.programmeLevel} />
                <Field label="Entry mode" value={person.entryRoute} />
                <Field label="Admission date" value={person.admissionDate} />
                <Field label="Enrollment status" value={person.enrollmentStatus} />
              </>
            ) : (
              <>
                <Field label="Staff group" value={person.kind} />
                <Field label="Department" value={person.department} />
                <Field label="Appointment" value={person.appointment} />
                <Field label="Appointment type" value={person.appointmentType} />
                <Field label="Salary grade" value={person.salaryGrade} />
                <Field label="Appointment date" value={person.appointmentDate} />
                <Field label="Employment status" value={person.employmentStatus} />
                <Field label="Highest qualification" value={person.highestQualification} />
                <Field label="Supervisor" value={person.supervisor} />
              </>
            )}
          </div>
          {person.education && person.education.length ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                {isStudent ? 'Previous institutions & qualifications' : 'Academic qualifications'}
              </h3>
              {person.education.map((entry, index) => (
                <div key={index} className="feeditem" style={{ marginBottom: 8 }}>
                  <div className="feedcopy">
                    <b>{entry.institution || '—'}</b>
                    <small>
                      {[entry.qualification, entry.field, entry.year, entry.startDate, entry.endDate].filter(Boolean).join(' · ') || 'No details'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      ) : null}

      {tab === 'documents' ? (
        <article className="card panel">
          <div className="paneltop">
            <h2>Documents on file</h2>
            {canUpload ? <button className="btn" type="button" onClick={() => { setUploadError(''); setUploadOpen(true); }}>↑&nbsp; Attach document</button> : null}
          </div>
          {!canReadDocuments ? <div className="tiny muted">Your role cannot view documents for this record.</div> : null}
          {canReadDocuments && person.documentRows.length === 0 ? (
            <EmptyState
              icon="▤"
              title="No documents on file"
              message={canUpload ? 'Attach an admission letter, credential or supporting document to get started.' : 'No documents have been attached to this record yet.'}
              action={canUpload ? <button className="btn primary" type="button" onClick={() => { setUploadError(''); setUploadOpen(true); }}>↑ Attach document</button> : undefined}
            />
          ) : null}
          {canReadDocuments ? person.documentRows.map((doc) => (
            <div className="feeditem" key={doc.id}>
              <span className="filetype">{doc.type}</span>
              <div className="feedcopy">
                <b>{doc.title}</b>
                <small>{doc.classification} · {doc.size} · Added {doc.added} · {doc.scanStatus}</small>
              </div>
              <span style={{ whiteSpace: 'nowrap' }}>
                {['PDF', 'PNG', 'JPG'].includes(doc.type) ? (
                  <a className="tiny muted" href={`/api/documents/${doc.id}/file?view=1`} target="_blank" rel="noopener noreferrer" style={{ marginRight: 10 }}>👁 View</a>
                ) : null}
                <a className="tiny muted" href={`/api/documents/${doc.id}/file`}>▾ Download</a>
              </span>
            </div>
          )) : null}
        </article>
      ) : null}

      {tab === 'history' ? (
        <article className="card panel">
          <div className="paneltop"><h2>Record history</h2><span className="tiny muted">{person.history.length} events</span></div>
          <div className="timeline">
            {person.history.length === 0 ? <div>No history recorded yet.<small>Events appear as the record changes.</small></div> : null}
            {person.history.map((entry, index) => (
              <div key={`${entry}-${index}`}>{entry}<small>Registry event</small></div>
            ))}
          </div>
        </article>
      ) : null}

      <div className="print-summary" style={{ display: 'none' }}>
        <header className="print-header">
          <img className="print-logo" src="/crest.png" alt="Bayelsa Medical University crest" />
          <div className="print-header-text">
            <h1>Bayelsa Medical University</h1>
            <p>Registry System · Student &amp; Staff Record Summary</p>
          </div>
          <div className="print-status">{person.status}</div>
        </header>

        <div className="print-identity">
          <div className="print-photo">
            {person.photo ? (
              <img src={person.photo} alt={`${person.first} ${person.last}`} />
            ) : (
              <span className="print-photo-placeholder">
                {person.first.charAt(0)}{person.last.charAt(0)}
              </span>
            )}
          </div>
          <div className="print-identity-details">
            <h2>{person.first} {person.middleName ? `${person.middleName} ` : ''}{person.last}</h2>
            <p className="print-record-id">{person.recordId}</p>
            <p>{person.kind} · {campusLabel(person.campus)} campus</p>
            <p className="print-generated">Generated {new Date().toLocaleString('en-GB')}</p>
          </div>
        </div>

        <section className="print-section">
          <h2>Personal information</h2>
          <dl className="print-grid">
            <div><dt>Preferred name</dt><dd>{person.preferredName || '—'}</dd></div>
            <div><dt>Date of birth</dt><dd>{person.dateOfBirth || '—'}</dd></div>
            <div><dt>Email</dt><dd>{person.email || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{person.phone || '—'}</dd></div>
            <div><dt>Gender</dt><dd>{person.gender || '—'}</dd></div>
            <div><dt>Nationality</dt><dd>{person.nationality || '—'}</dd></div>
            <div><dt>Address</dt><dd>{person.address || '—'}</dd></div>
            <div><dt>City</dt><dd>{person.city || '—'}</dd></div>
            <div><dt>Home LGA</dt><dd>{person.lga || '—'}</dd></div>
            <div><dt>State</dt><dd>{person.state || '—'}</dd></div>
            <div><dt>Emergency contact</dt><dd>{person.emergencyContact || '—'}</dd></div>
            <div><dt>Next of kin</dt><dd>{person.nextOfKin || '—'}</dd></div>
            <div><dt>Guardian</dt><dd>{person.guardianName || '—'}</dd></div>
            <div><dt>Guardian phone</dt><dd>{person.guardianPhone || '—'}</dd></div>
          </dl>
        </section>

        <section className="print-section">
          <h2>{isStudent ? 'Academic record' : 'Employment details'}</h2>
          <dl className="print-grid">
            {isStudent ? (
              <>
                <div><dt>Programme</dt><dd>{person.programme || '—'}</dd></div>
                <div><dt>Faculty</dt><dd>{person.faculty || '—'}</dd></div>
                <div><dt>Programme level</dt><dd>{person.programmeLevel || '—'}</dd></div>
                <div><dt>Current level</dt><dd>{person.level || '—'}</dd></div>
                <div><dt>Admission session</dt><dd>{person.session || '—'}</dd></div>
                <div><dt>Entry mode</dt><dd>{person.entryRoute || '—'}</dd></div>
                <div><dt>Admission date</dt><dd>{person.admissionDate || '—'}</dd></div>
                <div><dt>Enrollment status</dt><dd>{person.enrollmentStatus || '—'}</dd></div>
              </>
            ) : (
              <>
                <div><dt>Staff group</dt><dd>{person.kind || '—'}</dd></div>
                <div><dt>Department</dt><dd>{person.department || '—'}</dd></div>
                <div><dt>Appointment</dt><dd>{person.appointment || '—'}</dd></div>
                <div><dt>Appointment type</dt><dd>{person.appointmentType || '—'}</dd></div>
                <div><dt>Employment type</dt><dd>{person.employmentType || '—'}</dd></div>
                <div><dt>Salary grade</dt><dd>{person.salaryGrade || '—'}</dd></div>
                <div><dt>Appointment date</dt><dd>{person.appointmentDate || '—'}</dd></div>
                <div><dt>Employment status</dt><dd>{person.employmentStatus || '—'}</dd></div>
                <div><dt>Highest qualification</dt><dd>{person.highestQualification || '—'}</dd></div>
                <div><dt>Supervisor</dt><dd>{person.supervisor || '—'}</dd></div>
              </>
            )}
          </dl>
        </section>

        {person.education && person.education.length ? (
          <section className="print-section">
            <h2>{isStudent ? 'Previous institutions & qualifications' : 'Academic qualifications'}</h2>
            <table className="print-table">
              <thead>
                <tr><th>Institution</th><th>Qualification</th><th>Field</th><th>Year</th><th>Start</th><th>End</th></tr>
              </thead>
              <tbody>
                {person.education.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.institution || '—'}</td>
                    <td>{entry.qualification || '—'}</td>
                    <td>{entry.field || '—'}</td>
                    <td>{entry.year || '—'}</td>
                    <td>{entry.startDate || '—'}</td>
                    <td>{entry.endDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <footer className="print-footer">
          <p>Generated {new Date().toLocaleString('en-GB')} · Bayelsa Medical University Secure Database</p>
        </footer>
      </div>

      <PersonWizard
        open={editOpen}
        category={isStudent ? 'student' : 'staff'}
        initial={person}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setPerson(updated); setEditOpen(false); }}
      />

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Attach document" hint="Files are signature-checked and scanned before being accepted.">
        <form onSubmit={uploadDocument}>
          <div className="formfields">
            <label className="wide">Title
              <select value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)}>
                <option value="">Choose a document type…</option>
                {titleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            {uploadTitle === 'Other' ? (
              <label className="wide">Custom title<input value={uploadCustomTitle} onChange={(event) => setUploadCustomTitle(event.target.value)} placeholder="Describe the document" /></label>
            ) : null}
            <label>Classification
              <select value={uploadClassification} onChange={(event) => setUploadClassification(event.target.value)}>
                {CLASSIFICATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Expiry date<input type="date" value={uploadExpiry} onChange={(event) => setUploadExpiry(event.target.value)} /></label>
            <label className="wide">File<input type="file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></label>
          </div>
          <ErrorNote message={uploadError} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" type="button" onClick={() => setUploadOpen(false)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={uploading}>{uploading ? 'Scanning…' : 'Upload document'}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
