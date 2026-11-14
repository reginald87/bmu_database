'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, campusLabel } from '@/lib/client-api';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { Avatar, CampusTag, PageHead, StatusPill } from '@/components/ui';
import type { AuditRow, DocumentRow, PersonRecord, ReviewItemRow, SummaryResponse } from '@/lib/types';

function greeting(name?: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${time}, ${name}` : time;
}

export default function HomePage() {
  const user = useSessionUser();
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [students, setStudents] = useState<PersonRecord[]>([]);
  const [staff, setStaff] = useState<PersonRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [review, setReview] = useState<ReviewItemRow[]>([]);
  const [activity, setActivity] = useState<AuditRow[]>([]);

  useEffect(() => {
    api<SummaryResponse>('/summary').then(setSummary).catch(() => {});
    if (can(user, 'readStudents')) api<PersonRecord[]>('/students').then(setStudents).catch(() => {});
    if (can(user, 'readStaff')) api<PersonRecord[]>('/staff').then(setStaff).catch(() => {});
    if (can(user, 'readStudentDocuments') || can(user, 'readStaffDocuments')) {
      api<DocumentRow[]>('/documents').then(setDocuments).catch(() => {});
    }
    if (can(user, 'reviewStudents') || can(user, 'reviewStaff')) {
      api<ReviewItemRow[]>('/review').then(setReview).catch(() => {});
    }
    if (can(user, 'audit')) {
      api<AuditRow[]>('/audit').then((rows) => setActivity(rows.slice(0, 4))).catch(() => {});
    }
  }, [user]);

  const incompleteStudents = students.filter((row) => row.completeness < 80).length;
  const incompleteStaff = staff.filter((row) => row.completeness < 80).length;
  const expiringDocuments = documents.filter((row) => {
    if (!row.expiryDate) return false;
    const expiry = new Date(row.expiryDate).getTime();
    return Number.isFinite(expiry) && expiry - Date.now() < 60 * 24 * 60 * 60 * 1000;
  }).length;
  const duplicates = review.filter((row) => row.issue.toLowerCase().includes('duplicate')).length;
  const metrics = summary?.metrics;

  return (
    <section className="page show">
      <PageHead
        kicker="University registry"
        title={greeting(user?.displayName)}
        intro="Your records workspace across Yenagoa and Sampou campuses."
        actions={
          <>
            <button className="btn" type="button" onClick={() => router.push('/reports')}>↗ &nbsp;Export snapshot</button>
            <button className="btn primary" type="button" onClick={() => router.push('/students')}>＋ &nbsp;Create record</button>
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 12 }}>
        <article className="card metric clickable" onClick={() => router.push('/students')}>
          <div className="metric-top">Student records <span className="metric-icon">♙</span></div>
          <strong>{metrics?.students ?? '—'}</strong>
          <div className="metric-note"><b>Live</b> <span>registry total</span></div>
        </article>
        <article className="card metric clickable" onClick={() => router.push('/staff')}>
          <div className="metric-top">Staff records <span className="metric-icon" style={{ background: '#edf3f0', color: 'var(--teal)' }}>♧</span></div>
          <strong>{metrics?.staff ?? '—'}</strong>
          <div className="metric-note">{metrics?.academicStaff ?? 0} academic · {metrics?.nonAcademicStaff ?? 0} non-academic</div>
        </article>
        <article className="card metric clickable" onClick={() => router.push('/vault')}>
          <div className="metric-top">Digital documents <span className="metric-icon" style={{ background: '#eef2fb', color: 'var(--navy)' }}>▤</span></div>
          <strong>{metrics?.documents ?? '—'}</strong>
          <div className="metric-note">PDF, Word and image records</div>
        </article>
        <article className="card metric clickable" onClick={() => router.push('/review')}>
          <div className="metric-top">Awaiting review <span className="metric-icon" style={{ background: '#fff4e2', color: 'var(--amber)' }}>◷</span></div>
          <strong>{metrics?.pending ?? '—'}</strong>
          <div className="metric-note"><b style={{ color: 'var(--amber)' }}>{review.length}</b> <span>in the queue</span></div>
        </article>
      </div>

      <article className="card panel" style={{ marginBottom: 12 }}>
        <div className="paneltop">
          <h2>Data quality &amp; completeness</h2>
          <span className="tiny muted">Records missing key information</span>
        </div>
        <div className="grid four">
          <div className="metric clickable" onClick={() => router.push('/students')}>
            <div className="metric-top">Incomplete students</div>
            <strong>{incompleteStudents}</strong>
            <div className="metric-note">Below 80% completeness</div>
          </div>
          <div className="metric clickable" onClick={() => router.push('/staff')}>
            <div className="metric-top">Incomplete staff</div>
            <strong>{incompleteStaff}</strong>
            <div className="metric-note">Below 80% completeness</div>
          </div>
          <div className="metric clickable" onClick={() => router.push('/vault')}>
            <div className="metric-top">Expiring documents</div>
            <strong>{expiringDocuments}</strong>
            <div className="metric-note">Expiring within 60 days</div>
          </div>
          <div className="metric clickable" onClick={() => router.push('/review')}>
            <div className="metric-top">Duplicates flagged</div>
            <strong>{duplicates}</strong>
            <div className="metric-note">Potential duplicate records</div>
          </div>
        </div>
      </article>

      <div className="grid twocol" style={{ marginBottom: 12 }}>
        <article className="card panel">
          <div className="paneltop">
            <h2>Start with a task</h2>
            <span className="tiny muted">Common registry actions</span>
          </div>
          <div className="taskbox">
            <button className="task" type="button" onClick={() => router.push('/students')}>
              <span className="taskicon">♙</span>
              <span><b>Find a student</b><small>Search profile or student ID</small></span>
              <span className="arrow">→</span>
            </button>
            <button className="task" type="button" onClick={() => router.push('/staff')}>
              <span className="taskicon" style={{ background: '#edf3f0', color: 'var(--teal)' }}>♧</span>
              <span><b>Find a staff member</b><small>Academic and non-academic</small></span>
              <span className="arrow">→</span>
            </button>
            <button className="task" type="button" onClick={() => router.push('/vault')}>
              <span className="taskicon" style={{ background: '#eef2fb', color: 'var(--navy)' }}>▤</span>
              <span><b>Locate a document</b><small>Search files across records</small></span>
              <span className="arrow">→</span>
            </button>
            <button className="task" type="button" onClick={() => router.push('/review')}>
              <span className="taskicon" style={{ background: '#fff4e2', color: 'var(--amber)' }}>◷</span>
              <span><b>Review submissions</b><small>{review.length} items need attention</small></span>
              <span className="arrow">→</span>
            </button>
          </div>
        </article>

        <article className="card panel">
          <div className="paneltop">
            <h2>Records by campus</h2>
            <button className="textlink" type="button" onClick={() => router.push('/reports')}>Details →</button>
          </div>
          <div className="campuslist">
            {(summary?.distribution ?? []).map((item) => (
              <div key={item.campus}>
                <div className="campusline">
                  <span><b>{campusLabel(item.campus)}</b><small>{item.records} records</small></span>
                  <span className="campus-tag">{item.share}%</span>
                </div>
                <div className="bar">
                  <i className={item.campus === 'sampou' ? 'sampou' : undefined} style={{ width: `${item.share}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="notice">
            <span>ⓘ</span>
            <span>Campus scope is visible throughout the workspace. Switch scope to focus on one location.</span>
          </div>
        </article>
      </div>

      <div className="grid twocol">
        <article className="card tablecard">
          <div className="panel" style={{ paddingBottom: 4 }}>
            <div className="paneltop">
              <div>
                <h2>Recently updated</h2>
                <span className="tiny muted">Latest changes to person records</span>
              </div>
              <button className="textlink" type="button" onClick={() => router.push('/students')}>Browse directory →</button>
            </div>
          </div>
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr><th>Person</th><th>Record</th><th>Campus</th><th>State</th></tr>
              </thead>
              <tbody>
                {(summary?.recent ?? []).map((person) => (
                  <tr key={person.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/people/${person.id}`)}>
                    <td>
                      <div className="recordname">
                        <Avatar first={person.first} last={person.last} gender={person.gender} photo={person.photo} />
                        <span><b>{person.first} {person.last}</b><small>{person.recordId}</small></span>
                      </div>
                    </td>
                    <td>{person.kind}</td>
                    <td><CampusTag campus={person.campus} /></td>
                    <td><StatusPill status={person.status} /></td>
                  </tr>
                ))}
                {summary && summary.recent.length === 0 ? (
                  <tr><td colSpan={4}><div className="tiny muted">No records yet.</div></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="tablefoot"><span>Showing {summary?.recent.length ?? 0} recent changes</span><span>Live registry data</span></div>
        </article>

        <article className="card panel">
          <div className="paneltop">
            <div>
              <h2>Activity trail</h2>
              <span className="tiny muted">Recent actions in this workspace</span>
            </div>
            <button className="textlink" type="button" onClick={() => router.push('/audit')}>Full trail →</button>
          </div>
          <div className="feed">
            {activity.map((row) => (
              <div className="feeditem" key={row.id}>
                <span className="feedicon">◈</span>
                <div className="feedcopy">
                  <b>{row.action}</b> · {row.record}
                  <small>{row.actor} · {campusLabel(row.campus)}</small>
                </div>
                <span className="feedtime">{row.when}</span>
              </div>
            ))}
            {activity.length === 0 ? <div className="tiny muted">No recent activity is visible to your role.</div> : null}
          </div>
          <div className="notice">
            <span>◈</span>
            <span>Viewing or changing a record should leave a trace in the audit trail.</span>
          </div>
        </article>
      </div>
    </section>
  );
}
