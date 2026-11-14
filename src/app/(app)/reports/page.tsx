'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, campusLabel, downloadBlob, errorMessage } from '@/lib/client-api';
import { can } from '@/lib/roles';
import { useSessionUser } from '@/components/session-context';
import { ErrorNote, PageHead } from '@/components/ui';
import type { PersonRecord, SummaryResponse } from '@/lib/types';

function tally(rows: PersonRecord[], key: (row: PersonRecord) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = key(row) || 'Not recorded';
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export default function ReportsPage() {
  const user = useSessionUser();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [students, setStudents] = useState<PersonRecord[]>([]);
  const [staff, setStaff] = useState<PersonRecord[]>([]);
  const [error, setError] = useState('');
  const [campus, setCampus] = useState('all');

  useEffect(() => {
    api<SummaryResponse>('/summary').then(setSummary).catch((err) => setError(errorMessage(err)));
    if (can(user, 'readStudents')) api<PersonRecord[]>('/students').then(setStudents).catch(() => {});
    if (can(user, 'readStaff')) api<PersonRecord[]>('/staff').then(setStaff).catch(() => {});
  }, [user]);

  const scopedStudents = useMemo(() => campus === 'all' ? students : students.filter((row) => row.campus === campus), [students, campus]);
  const scopedStaff = useMemo(() => campus === 'all' ? staff : staff.filter((row) => row.campus === campus), [staff, campus]);

  const academic = scopedStaff.filter((row) => row.kind === 'Academic').length;
  const nonAcademic = scopedStaff.filter((row) => row.kind === 'Non-academic').length;
  const pending = summary?.metrics.pending ?? 0;

  const byFaculty = tally(scopedStudents, (row) => row.faculty);
  const byLevel = tally(scopedStudents, (row) => row.level);
  const byGender = tally(scopedStudents, (row) => row.gender);
  const byDept = tally(scopedStaff, (row) => row.department);

  const studentComplete = scopedStudents.length
    ? Math.round((scopedStudents.filter((row) => row.completeness >= 80).length / scopedStudents.length) * 100)
    : 0;
  const staffComplete = scopedStaff.length
    ? Math.round((scopedStaff.filter((row) => row.completeness >= 80).length / scopedStaff.length) * 100)
    : 0;

  const distribution = [
    { campus: 'imgbi', label: 'Yenagoa', count: campus === 'sampou' ? 0 : (campus === 'imgbi' ? scopedStudents.length + scopedStaff.length : summary?.distribution.find((item) => item.campus === 'imgbi')?.records ?? 0) },
    { campus: 'sampou', label: 'Sampou', count: campus === 'imgbi' ? 0 : (campus === 'sampou' ? scopedStudents.length + scopedStaff.length : summary?.distribution.find((item) => item.campus === 'sampou')?.records ?? 0) },
  ];
  const distributionTotal = distribution.reduce((sum, item) => sum + item.count, 0);

  function exportSummary() {
    const csv = [
      ['Metric', 'Value'],
      ['Campus scope', campusLabel(campus === 'all' ? null : campus)],
      ['Students', String(scopedStudents.length)],
      ['Academic staff', String(academic)],
      ['Non-academic staff', String(nonAcademic)],
      ['Records needing review', String(pending)],
      ['Student profiles complete (%)', String(studentComplete)],
      ['Staff profiles complete (%)', String(staffComplete)],
    ].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob('bmu-registry-summary.csv', `${csv}\n`, 'text/csv;charset=utf-8');
  }

  return (
    <section className="page show">
      <PageHead
        kicker="Administration / Insights"
        title="Reports"
        intro="Operational summaries for authorised registry and HR administrators."
        actions={<button className="btn" type="button" onClick={exportSummary}>↓ &nbsp;Export summary</button>}
      />

      <div className="filters">
        <select value={campus} onChange={(event) => setCampus(event.target.value)}>
          <option value="all">All campuses</option>
          <option value="imgbi">Yenagoa</option>
          <option value="sampou">Sampou</option>
        </select>
      </div>

      <ErrorNote message={error} />

      <div className="grid four" style={{ marginBottom: 12 }}>
        <article className="card metric clickable" onClick={() => { window.location.href = '/students'; }}><div className="metric-top">Students</div><strong>{scopedStudents.length}</strong><div className="metric-note">All enrolment states</div></article>
        <article className="card metric clickable" onClick={() => { window.location.href = '/staff'; }}><div className="metric-top">Academic staff</div><strong>{academic}</strong><div className="metric-note">{campusLabel(campus === 'all' ? null : campus)}</div></article>
        <article className="card metric clickable" onClick={() => { window.location.href = '/staff'; }}><div className="metric-top">Non-academic staff</div><strong>{nonAcademic}</strong><div className="metric-note">{campusLabel(campus === 'all' ? null : campus)}</div></article>
        <article className="card metric clickable" onClick={() => { window.location.href = '/review'; }}><div className="metric-top">Records needing review</div><strong>{pending}</strong><div className="metric-note">Live queue</div></article>
      </div>

      <div className="grid twocol">
        <article className="card panel">
          <div className="paneltop"><h2>Campus distribution</h2><span className="tiny muted">People records</span></div>
          <div className="campuslist">
            {distribution.map((item) => (
              <div key={item.campus}>
                <div className="campusline">
                  <span><b>{item.label}</b><small>{item.campus === 'imgbi' ? 'Yenagoa, Bayelsa State' : 'Kolokuma/Opokuma LGA'}</small></span>
                  <b>{item.count}</b>
                </div>
                <div className="bar">
                  <i className={item.campus === 'sampou' ? 'sampou' : undefined} style={{ width: `${distributionTotal ? Math.round((item.count / distributionTotal) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card panel">
          <div className="paneltop"><h2>Data quality</h2><span className="tiny muted">Current records</span></div>
          <div className="attention"><span className="attnum">{studentComplete}%</span><span className="attcopy">Student profiles complete<small>Below 80% completeness excluded</small></span></div>
          <div className="attention"><span className="attnum">{staffComplete}%</span><span className="attcopy">Staff profiles complete<small>Across both staff groups</small></span></div>
          <div className="attention"><span className="attnum">{pending}</span><span className="attcopy">Items requiring review<small>See review queue for action</small></span></div>
        </article>
      </div>

      <div className="grid twocol" style={{ marginTop: 12 }}>
        <article className="card panel">
          <div className="paneltop"><h2>Students by faculty</h2><span className="tiny muted">Enrolment breakdown</span></div>
          <div className="tablewrap"><table className="table"><thead><tr><th>Faculty</th><th>Students</th></tr></thead><tbody>
            {byFaculty.length === 0 ? <tr><td colSpan={2}><div className="tiny muted">No data.</div></td></tr> : byFaculty.map(([name, count]) => <tr key={name}><td>{name}</td><td>{count}</td></tr>)}
          </tbody></table></div>
        </article>
        <article className="card panel">
          <div className="paneltop"><h2>Students by level</h2><span className="tiny muted">Enrolment breakdown</span></div>
          <div className="tablewrap"><table className="table"><thead><tr><th>Level</th><th>Students</th></tr></thead><tbody>
            {byLevel.length === 0 ? <tr><td colSpan={2}><div className="tiny muted">No data.</div></td></tr> : byLevel.map(([name, count]) => <tr key={name}><td>{name}</td><td>{count}</td></tr>)}
          </tbody></table></div>
        </article>
      </div>

      <div className="grid twocol" style={{ marginTop: 12 }}>
        <article className="card panel">
          <div className="paneltop"><h2>Students by gender</h2><span className="tiny muted">Enrolment breakdown</span></div>
          <div className="tablewrap"><table className="table"><thead><tr><th>Gender</th><th>Students</th></tr></thead><tbody>
            {byGender.length === 0 ? <tr><td colSpan={2}><div className="tiny muted">No data.</div></td></tr> : byGender.map(([name, count]) => <tr key={name}><td>{name}</td><td>{count}</td></tr>)}
          </tbody></table></div>
        </article>
        <article className="card panel">
          <div className="paneltop"><h2>Staff by department</h2><span className="tiny muted">Appointment breakdown</span></div>
          <div className="tablewrap"><table className="table"><thead><tr><th>Department</th><th>Staff</th></tr></thead><tbody>
            {byDept.length === 0 ? <tr><td colSpan={2}><div className="tiny muted">No data.</div></td></tr> : byDept.map(([name, count]) => <tr key={name}><td>{name}</td><td>{count}</td></tr>)}
          </tbody></table></div>
        </article>
      </div>
    </section>
  );
}
