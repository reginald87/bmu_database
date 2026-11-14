'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, campusLabel, errorMessage, formatBytes } from '@/lib/client-api';
import { documentTitlesFor } from '@/lib/document-titles';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { CampusTag, EmptyState, ErrorNote, Modal, PageHead, TableSkeleton, useToast } from '@/components/ui';
import type { DocumentRow, PersonRecord } from '@/lib/types';

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

export default function VaultPage() {
  const user = useSessionUser();
  const toast = useToast();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [campus, setCampus] = useState('all');
  const [classification, setClassification] = useState('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [title, setTitle] = useState('');
  const [fileClassification, setFileClassification] = useState('Internal');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const canUpload = can(user, 'writeStudentDocuments') || can(user, 'writeStaffDocuments');

  const selectedPerson = people.find((person) => person.id === personId);
  const titleOptions = documentTitlesFor(selectedPerson?.recordType);
  const effectiveTitle = title === 'Other' ? customTitle.trim() : title;

  function load() {
    setLoading(true);
    api<DocumentRow[]>('/documents')
      .then((data) => { setDocuments(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api<PersonRecord[]>('/people').then(setPeople).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const term = params.get('q');
    if (term) setQ(term);
  }, []);

  const kindByRecord = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of people) map.set(person.recordId, person.kind);
    return map;
  }, [people]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return documents.filter((doc) => {
      if (term && !JSON.stringify(doc).toLowerCase().includes(term)) return false;
      if (type !== 'all' && doc.type !== type) return false;
      if (campus !== 'all' && doc.campus !== campus) return false;
      if (classification !== 'all' && doc.classification !== classification) return false;
      return true;
    });
  }, [documents, q, type, campus, classification]);

  const totalBytes = documents.reduce((sum, doc) => sum + (doc.sizeBytes || 0), 0);
  const studentCount = documents.filter((doc) => !doc.recordId.startsWith('BMU/PFN')).length;
  const academicCount = documents.filter((doc) => kindByRecord.get(doc.recordId) === 'Academic').length;
  const nonAcademicCount = documents.filter((doc) => kindByRecord.get(doc.recordId) === 'Non-academic').length;
  const storagePercent = Math.min(100, Math.round((totalBytes / (200 * 1024 * 1024)) * 100));

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!personId) { setUploadError('Choose the record this document belongs to.'); return; }
    if (!file) { setUploadError('Choose a file to upload.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const data = await fileToBase64(file);
      await api(`/people/${personId}/documents`, {
        method: 'POST',
        body: { filename: file.name, title: effectiveTitle || 'Other', classification: fileClassification, expiryDate: expiry, data },
      });
      toast('Document scanned and added.');
      setUploadOpen(false);
      setFile(null);
      setTitle('');
      setCustomTitle('');
      setExpiry('');
      setPersonId('');
      load();
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Registry / Repository"
        title="Document vault"
        intro="University documents linked to student and staff records, with access classification."
        actions={canUpload ? <button className="btn primary" type="button" onClick={() => { setUploadError(''); setUploadOpen(true); }}>↑ &nbsp;Upload documents</button> : undefined}
      />

      <article className="card storage">
        <div className="storage-head"><span>Repository storage</span><span className="muted">{formatBytes(totalBytes)} used</span></div>
        <div className="bar"><i style={{ width: `${storagePercent}%`, background: 'var(--navy)' }} /></div>
        <div className="tiny muted" style={{ marginTop: 5 }}>Files are scanned and stored locally for this workspace.</div>
      </article>

      <div className="foldergrid">
        <div className="folder"><span className="foldericon">▰</span><b>Student records</b><small>{studentCount} files</small></div>
        <div className="folder"><span className="foldericon">▰</span><b>Academic staff</b><small>{academicCount} files</small></div>
        <div className="folder"><span className="foldericon">▰</span><b>Non-academic staff</b><small>{nonAcademicCount} files</small></div>
        <div className="folder"><span className="foldericon">▰</span><b>Institutional</b><small>Policies · forms · circulars</small></div>
      </div>

      <div className="filters">
        <input className="searchfilter" placeholder="Search file name, person or record ID" value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">All formats</option>
          <option>PDF</option>
          <option>DOCX</option>
          <option>JPG</option>
          <option>PNG</option>
        </select>
        <select value={campus} onChange={(event) => setCampus(event.target.value)}>
          <option value="all">All campuses</option>
          <option value="imgbi">Yenagoa</option>
          <option value="sampou">Sampou</option>
        </select>
        <select value={classification} onChange={(event) => setClassification(event.target.value)}>
          <option value="all">All classifications</option>
          {CLASSIFICATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <ErrorNote message={error} />

      <article className="card tablecard">
        <div className="tablewrap">
          <table className="table filtertable">
            <thead>
              <tr><th>Document</th><th>Linked record</th><th>Campus</th><th>Classification</th><th>Added</th><th>File</th><th /></tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={7} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon="▤"
                      title="No documents match"
                      message="Adjust the filters or clear the search term. Upload a document to add it to the vault."
                      action={canUpload ? <button className="btn primary" type="button" onClick={() => { setUploadError(''); setUploadOpen(true); }}>↑ Upload document</button> : undefined}
                    />
                  </td>
                </tr>
              ) : filtered.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <div className="recordname">
                      <span className="filetype">{doc.type}</span>
                      <span><b>{doc.title}</b><small>{doc.filename} · {doc.size}</small></span>
                    </div>
                  </td>
                  <td>{doc.person || '—'}<div className="tiny muted">{doc.recordId}</div></td>
                  <td><CampusTag campus={doc.campus} /></td>
                  <td><span className="badge blue">{doc.classification}</span></td>
                  <td>{doc.added}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {['PDF', 'PNG', 'JPG'].includes(doc.type) ? (
                      <a className="textlink" href={`/api/documents/${doc.id}/file?view=1`} target="_blank" rel="noopener noreferrer" style={{ marginRight: 10 }}>👁 View</a>
                    ) : null}
                    <a className="textlink" href={`/api/documents/${doc.id}/file`}>▾ Download</a>
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tablefoot"><span>Showing {filtered.length} files</span><span>File access is permission-controlled</span></div>
      </article>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document" hint="Choose the linked record and a supported file. The file is scanned before acceptance.">
        <form onSubmit={upload}>
          <div className="formfields">
            <label className="wide">Linked record
              <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
                <option value="">Choose a person…</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.first} {person.last} · {person.recordId}</option>
                ))}
              </select>
            </label>
            <label className="wide">Title
              <select value={title} onChange={(event) => setTitle(event.target.value)}>
                <option value="">Choose a document type…</option>
                {titleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            {title === 'Other' ? (
              <label className="wide">Custom title<input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Describe the document" /></label>
            ) : null}
            <label>Classification
              <select value={fileClassification} onChange={(event) => setFileClassification(event.target.value)}>
                {CLASSIFICATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Expiry date<input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></label>
            <label className="wide">File<input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
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
