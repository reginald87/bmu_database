'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/client-api';
import { ErrorNote, Modal, useToast } from '@/components/ui';
import { APPOINTMENT_TYPES, ENTRY_MODES, PROGRAMME_LEVELS, UNDERGRAD_LEVELS } from '@/lib/registry';
import type { AcademicSessionRow, EducationEntry, PersonRecord } from '@/lib/types';

export type PersonCategory = 'student' | 'staff';

type WizardValues = Record<string, string>;

const CAMPUS_OPTIONS = [
  { id: 'imgbi', name: 'Yenagoa' },
  { id: 'sampou', name: 'Sampou' },
];

const STUDENT_STATUSES = ['Needs review', 'Verified', 'On leave', 'Graduated', 'Withdrawn'];
const STAFF_STATUSES = ['Review due', 'Verified', 'On leave', 'Separated', 'Retired'];

const BASE_VALUES: WizardValues = {
  first: '', middleName: '', last: '', preferredName: '',
  recordId: '', bims: '', campus: 'imgbi', email: '', phone: '',
  dateOfBirth: '', gender: '', nationality: '',
  address: '', city: '', lga: '', state: '',
  emergencyContact: '', nextOfKin: '',
  guardianName: '', guardianRelationship: '', guardianPhone: '', guardianEmail: '',
  programme: '', faculty: '', level: '', programmeLevel: '', session: '', entryRoute: '',
  admissionDate: '', enrollmentStatus: '',
  kind: 'Academic', department: '', appointment: '', appointmentType: '', employmentType: '',
  salaryGrade: '', appointmentDate: '', employmentStatus: '', gradeLevel: '',
  highestQualification: '', professionalBody: '', professionalRegistration: '', supervisor: '',
  status: '',
};

const EMPTY_EDUCATION: EducationEntry = {
  institution: '', qualification: '', field: '', year: '', startDate: '', endDate: '',
};

function valuesFromPerson(person: PersonRecord): WizardValues {
  const values: WizardValues = { ...BASE_VALUES };
  for (const key of Object.keys(BASE_VALUES)) {
    const value = (person as unknown as Record<string, unknown>)[key];
    values[key] = value === null || value === undefined ? '' : String(value);
  }
  if (person.recordType === 'Student') values.kind = 'Academic';
  // Backward compatibility: infer programmeLevel from legacy level values.
  if (!values.programmeLevel && values.level) {
    if (UNDERGRAD_LEVELS.includes(values.level as (typeof UNDERGRAD_LEVELS)[number])) {
      values.programmeLevel = 'Undergraduate';
    } else if (PROGRAMME_LEVELS.includes(values.level as (typeof PROGRAMME_LEVELS)[number])) {
      values.programmeLevel = values.level;
      values.level = '';
    }
  }
  return values;
}

function educationFromPerson(person: PersonRecord): EducationEntry[] {
  if (!person.education || !Array.isArray(person.education)) return [];
  return person.education.map((entry) => ({
    institution: entry.institution ?? '',
    qualification: entry.qualification ?? '',
    field: entry.field ?? '',
    year: entry.year ?? '',
    startDate: entry.startDate ?? '',
    endDate: entry.endDate ?? '',
  }));
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'wide' : undefined}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ReviewSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  const visible = rows.filter(([, value]) => value);
  if (!visible.length) return null;
  return (
    <section>
      <h4>{title}</h4>
      <dl>
        {visible.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PersonWizard({
  open,
  category,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: PersonCategory;
  initial?: PersonRecord | null;
  onClose: () => void;
  onSaved: (person: PersonRecord) => void;
}) {
  const toast = useToast();
  const editing = Boolean(initial);
  const isStudent = category === 'student';
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<WizardValues>(BASE_VALUES);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [stepError, setStepError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<AcademicSessionRow[]>([]);

  const steps = useMemo(() => [
    {
      label: 'Identity',
      hint: 'Core identifiers and the university record number. These values are checked against BMU formats.',
    },
    {
      label: isStudent ? 'Academic' : 'Employment',
      hint: isStudent
        ? 'Programme, admission details and current academic standing.'
        : 'Staff group, department, appointment and service details.',
    },
    {
      label: 'Contact',
      hint: 'Contact information, next of kin and guardian details.',
    },
    {
      label: 'Review',
      hint: editing ? 'Review the changes before saving them to the registry.' : 'Review the record before creating it.',
    },
  ], [editing, isStudent]);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setStepError('');
    setSubmitError('');
    setValues(initial ? valuesFromPerson(initial) : { ...BASE_VALUES });
    setEducation(initial ? educationFromPerson(initial) : []);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !isStudent) return;
    api<AcademicSessionRow[]>('/academic-sessions')
      .then((data) => setSessions(data))
      .catch(() => setSessions([]));
  }, [open, isStudent]);

  function setField(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setEducationField(index: number, key: keyof EducationEntry, value: string) {
    setEducation((current) => current.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  }

  function addEducationEntry() {
    setEducation((current) => [...current, { ...EMPTY_EDUCATION }]);
  }

  function removeEducationEntry(index: number) {
    setEducation((current) => current.filter((_, i) => i !== index));
  }

  function validateStep(index: number): string {
    if (index === 0) {
      if (!values.first.trim()) return 'First name is required.';
      if (!values.last.trim()) return 'Last name is required.';
      if (!values.recordId.trim()) return 'University ID is required.';
      const recordId = values.recordId.trim().toUpperCase();
      if (isStudent && !/^(?:UG\/\d{2}\/\d{4}|\d{12}[A-Z0-9]{2})$/.test(recordId)) {
        return 'Student ID must be UG/00/0000 or YYYY + 8 digits + 2 alphanumeric characters.';
      }
      if (!isStudent && !/^BMU\/PFN\/REG\/(?:APPT\/)?\d{3}$/.test(recordId)) {
        return 'Staff ID must be BMU/PFN/REG/000 or BMU/PFN/REG/APPT/000.';
      }
      if (values.bims && !/^BIMS[A-Z0-9]{11}$/.test(values.bims.trim().toUpperCase())) {
        return 'BIMS must start with BIMS and contain 11 letters or digits after it.';
      }
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        return 'Enter a valid email address.';
      }
      return '';
    }
    if (index === 1) {
      if (isStudent) {
        if (!values.programme.trim()) return 'Programme is required.';
        if (!values.session.trim()) return 'Admission session is required.';
      } else {
        if (!['Academic', 'Non-academic'].includes(values.kind)) return 'Choose a staff group.';
        if (!values.department.trim()) return 'Department is required.';
        if (!values.appointment.trim()) return 'Appointment is required.';
      }
      return '';
    }
    return '';
  }

  function goNext() {
    const error = validateStep(stepIndex);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError('');
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setStepError('');
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    for (let index = 0; index < steps.length - 1; index += 1) {
      const error = validateStep(index);
      if (error) {
        setStepIndex(index);
        setStepError(error);
        return;
      }
    }
    setSaving(true);
    setSubmitError('');
    try {
      const body = { ...values, category, education };
      const saved = editing && initial
        ? await api<PersonRecord>(`/people/${initial.id}`, { method: 'PATCH', body })
        : await api<PersonRecord>('/people', { method: 'POST', body });
      toast(editing ? 'Record updated.' : `${isStudent ? 'Student' : 'Staff'} record created and queued for review.`);
      onSaved(saved);
      onClose();
    } catch (error) {
      setSubmitError(errorMessage(error));
      setStepIndex(steps.length - 1);
    } finally {
      setSaving(false);
    }
  }

  const displayName = [values.first, values.middleName, values.last].filter(Boolean).join(' ') || 'New record';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${isStudent ? 'student' : 'staff'} record` : `New ${isStudent ? 'student' : 'staff'} record`}
      hint={editing ? 'Changes are validated and written to the audit trail.' : 'Complete the sections to build a verified registry record.'}
      wide
    >
      <form onSubmit={submit}>
        <div className="wizard-steps">
          {steps.map((step, index) => (
            <button
              key={step.label}
              type="button"
              className={`wizard-step ${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'done' : ''}`}
              onClick={() => {
                if (index <= stepIndex) {
                  setStepError('');
                  setStepIndex(index);
                }
              }}
              disabled={index > stepIndex}
            >
              <span>{index < stepIndex ? '✓' : index + 1}</span>
              {step.label}
            </button>
          ))}
        </div>

        <div className="wizard-heading">
          <h3>{steps[stepIndex].label}</h3>
          <p>{steps[stepIndex].hint}</p>
        </div>

        {stepIndex === 0 ? (
          <div className="formfields">
            <TextField label="First name" value={values.first} onChange={(value) => setField('first', value)} required />
            <TextField label="Last name" value={values.last} onChange={(value) => setField('last', value)} required />
            <TextField label="Middle name" value={values.middleName} onChange={(value) => setField('middleName', value)} />
            <TextField label="Preferred name" value={values.preferredName} onChange={(value) => setField('preferredName', value)} />
            <TextField
              label={isStudent ? 'Student ID' : 'Staff ID'}
              value={values.recordId}
              onChange={(value) => setField('recordId', value)}
              placeholder={isStudent ? 'UG/00/0000 or 202610012345AB' : 'BMU/PFN/REG/000'}
              required
            />
            <TextField label="BIMS number" value={values.bims} onChange={(value) => setField('bims', value)} placeholder="BIMS25260NO74247" />
            <SelectField
              label="Campus"
              value={values.campus}
              onChange={(value) => setField('campus', value)}
              options={CAMPUS_OPTIONS.map((item) => ({ value: item.id, label: item.name }))}
            />
            <TextField label="Email" type="email" value={values.email} onChange={(value) => setField('email', value)} />
            <TextField label="Phone" value={values.phone} onChange={(value) => setField('phone', value)} />
            <TextField label="Date of birth" type="date" value={values.dateOfBirth} onChange={(value) => setField('dateOfBirth', value)} />
            <SelectField
              label="Gender"
              value={values.gender}
              onChange={(value) => setField('gender', value)}
              options={[
                { value: '', label: 'Not specified' },
                { value: 'Female', label: 'Female' },
                { value: 'Male', label: 'Male' },
                { value: 'Other', label: 'Other' },
              ]}
            />
            <TextField label="Nationality" value={values.nationality} onChange={(value) => setField('nationality', value)} />
          </div>
        ) : null}

        {stepIndex === 1 && isStudent ? (
          <div className="formfields">
            <TextField label="Programme" value={values.programme} onChange={(value) => setField('programme', value)} required />
            <TextField label="Faculty" value={values.faculty} onChange={(value) => setField('faculty', value)} />
            <SelectField
              label="Programme level"
              value={values.programmeLevel}
              onChange={(value) => {
                setField('programmeLevel', value);
                if (value !== 'Undergraduate') setField('level', '');
              }}
              options={[
                { value: '', label: 'Not specified' },
                ...PROGRAMME_LEVELS.map((level) => ({ value: level, label: level })),
              ]}
            />
            {values.programmeLevel === 'Undergraduate' ? (
              <SelectField
                label="Current level"
                value={values.level}
                onChange={(value) => setField('level', value)}
                options={[
                  { value: '', label: 'Not specified' },
                  ...UNDERGRAD_LEVELS.map((level) => ({ value: level, label: level })),
                ]}
              />
            ) : null}
            <SelectField
              label="Admission session"
              value={values.session}
              onChange={(value) => setField('session', value)}
              options={[
                { value: '', label: 'Select session' },
                ...sessions.map((s) => ({ value: s.name, label: s.name + (s.isCurrent ? ' (current)' : '') })),
              ]}
            />
            <SelectField
              label="Entry mode"
              value={values.entryRoute}
              onChange={(value) => setField('entryRoute', value)}
              options={[
                { value: '', label: 'Not specified' },
                ...ENTRY_MODES.map((mode) => ({ value: mode, label: mode })),
              ]}
            />
            <TextField label="Admission date" type="date" value={values.admissionDate} onChange={(value) => setField('admissionDate', value)} />
            <TextField label="Enrollment status" value={values.enrollmentStatus} onChange={(value) => setField('enrollmentStatus', value)} />
            <TextField label="Department" value={values.department} onChange={(value) => setField('department', value)} />
          </div>
        ) : null}

        {stepIndex === 1 && isStudent ? (
          <div className="education-section">
            <div className="education-header">
              <h4>Previous institutions &amp; qualifications</h4>
              <p className="tiny muted">Add each previous school, qualification and the dates attended.</p>
            </div>
            {education.map((entry, index) => (
              <div className="education-entry" key={index}>
                <div className="education-entry-header">
                  <span className="tiny muted">Entry {index + 1}</span>
                  <button className="btn subtle" type="button" onClick={() => removeEducationEntry(index)}>Remove</button>
                </div>
                <div className="formfields">
                  <TextField label="Institution" value={entry.institution} onChange={(value) => setEducationField(index, 'institution', value)} placeholder="e.g. Federal University of Technology" />
                  <TextField label="Qualification" value={entry.qualification} onChange={(value) => setEducationField(index, 'qualification', value)} placeholder="e.g. HND, BSc, SSCE" />
                  <TextField label="Field of study" value={entry.field} onChange={(value) => setEducationField(index, 'field', value)} placeholder="e.g. Computer Science" />
                  <TextField label="Year completed" value={entry.year} onChange={(value) => setEducationField(index, 'year', value)} placeholder="e.g. 2020" />
                  <TextField label="Start date" type="date" value={entry.startDate} onChange={(value) => setEducationField(index, 'startDate', value)} />
                  <TextField label="End date" type="date" value={entry.endDate} onChange={(value) => setEducationField(index, 'endDate', value)} />
                </div>
              </div>
            ))}
            <button className="btn" type="button" onClick={addEducationEntry}>+ Add previous institution</button>
          </div>
        ) : null}

        {stepIndex === 1 && !isStudent ? (
          <div className="formfields">
            <SelectField
              label="Staff group"
              value={values.kind}
              onChange={(value) => setField('kind', value)}
              options={[
                { value: 'Academic', label: 'Academic' },
                { value: 'Non-academic', label: 'Non-academic' },
              ]}
            />
            <TextField label="Department" value={values.department} onChange={(value) => setField('department', value)} required />
            <TextField label="Appointment" value={values.appointment} onChange={(value) => setField('appointment', value)} required />
            <SelectField
              label="Appointment type"
              value={values.appointmentType}
              onChange={(value) => setField('appointmentType', value)}
              options={[
                { value: '', label: 'Not specified' },
                ...APPOINTMENT_TYPES.map((type) => ({ value: type, label: type })),
              ]}
            />
            <TextField label="Employment type" value={values.employmentType} onChange={(value) => setField('employmentType', value)} />
            <TextField label="Salary grade" value={values.salaryGrade} onChange={(value) => setField('salaryGrade', value)} placeholder="CONUASS 04" />
            <TextField label="Grade level" value={values.gradeLevel} onChange={(value) => setField('gradeLevel', value)} />
            <TextField label="Appointment date" type="date" value={values.appointmentDate} onChange={(value) => setField('appointmentDate', value)} />
            <TextField label="Employment status" value={values.employmentStatus} onChange={(value) => setField('employmentStatus', value)} />
            <TextField label="Highest qualification" value={values.highestQualification} onChange={(value) => setField('highestQualification', value)} />
            <TextField label="Professional body" value={values.professionalBody} onChange={(value) => setField('professionalBody', value)} />
            <TextField label="Professional registration" value={values.professionalRegistration} onChange={(value) => setField('professionalRegistration', value)} />
            <TextField label="Supervisor" value={values.supervisor} onChange={(value) => setField('supervisor', value)} />
          </div>
        ) : null}

        {stepIndex === 1 && !isStudent ? (
          <div className="education-section">
            <div className="education-header">
              <h4>Academic qualifications</h4>
              <p className="tiny muted">Add each qualification, the institution and the dates attended.</p>
            </div>
            {education.map((entry, index) => (
              <div className="education-entry" key={index}>
                <div className="education-entry-header">
                  <span className="tiny muted">Entry {index + 1}</span>
                  <button className="btn subtle" type="button" onClick={() => removeEducationEntry(index)}>Remove</button>
                </div>
                <div className="formfields">
                  <TextField label="Institution" value={entry.institution} onChange={(value) => setEducationField(index, 'institution', value)} placeholder="e.g. University of Lagos" />
                  <TextField label="Qualification" value={entry.qualification} onChange={(value) => setEducationField(index, 'qualification', value)} placeholder="e.g. PhD, MSc, BSc" />
                  <TextField label="Field of study" value={entry.field} onChange={(value) => setEducationField(index, 'field', value)} placeholder="e.g. Computer Science" />
                  <TextField label="Year completed" value={entry.year} onChange={(value) => setEducationField(index, 'year', value)} placeholder="e.g. 2015" />
                  <TextField label="Start date" type="date" value={entry.startDate} onChange={(value) => setEducationField(index, 'startDate', value)} />
                  <TextField label="End date" type="date" value={entry.endDate} onChange={(value) => setEducationField(index, 'endDate', value)} />
                </div>
              </div>
            ))}
            <button className="btn" type="button" onClick={addEducationEntry}>+ Add qualification</button>
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="formfields">
            <TextField label="Address" value={values.address} onChange={(value) => setField('address', value)} wide />
            <TextField label="City" value={values.city} onChange={(value) => setField('city', value)} />
            <TextField label="Home LGA" value={values.lga} onChange={(value) => setField('lga', value)} />
            <TextField label="State" value={values.state} onChange={(value) => setField('state', value)} />
            <TextField label="Emergency contact" value={values.emergencyContact} onChange={(value) => setField('emergencyContact', value)} />
            <TextField label="Next of kin" value={values.nextOfKin} onChange={(value) => setField('nextOfKin', value)} />
            <TextField label="Guardian name" value={values.guardianName} onChange={(value) => setField('guardianName', value)} />
            <TextField label="Guardian relationship" value={values.guardianRelationship} onChange={(value) => setField('guardianRelationship', value)} />
            <TextField label="Guardian phone" value={values.guardianPhone} onChange={(value) => setField('guardianPhone', value)} />
            <TextField label="Guardian email" type="email" value={values.guardianEmail} onChange={(value) => setField('guardianEmail', value)} />
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <div className="wizard-review">
            <div className="notice success" style={{ margin: 0 }}>
              <b>{displayName}</b> · {values.recordId || 'No ID yet'} · {CAMPUS_OPTIONS.find((item) => item.id === values.campus)?.name ?? values.campus}
            </div>
            {editing ? (
              <div className="formfields">
                <SelectField
                  label="Record status"
                  value={values.status}
                  onChange={(value) => setField('status', value)}
                  options={(isStudent ? STUDENT_STATUSES : STAFF_STATUSES).map((status) => ({ value: status, label: status }))}
                />
              </div>
            ) : null}
            <ReviewSection
              title="Identity"
              rows={[
                ['Full name', displayName],
                [isStudent ? 'Student ID' : 'Staff ID', values.recordId],
                ['BIMS', values.bims],
                ['Campus', CAMPUS_OPTIONS.find((item) => item.id === values.campus)?.name ?? values.campus],
                ['Email', values.email],
                ['Phone', values.phone],
                ['Gender', values.gender],
                ['Date of birth', values.dateOfBirth],
                ['Nationality', values.nationality],
              ]}
            />
            {isStudent ? (
              <ReviewSection
                title="Academic"
                rows={[
                  ['Programme', values.programme],
                  ['Faculty', values.faculty],
                  ['Programme level', values.programmeLevel],
                  ['Current level', values.level],
                  ['Session', values.session],
                  ['Entry mode', values.entryRoute],
                  ['Admission date', values.admissionDate],
                  ['Enrollment status', values.enrollmentStatus],
                ]}
              />
            ) : (
              <ReviewSection
                title="Employment"
                rows={[
                  ['Staff group', values.kind],
                  ['Department', values.department],
                  ['Appointment', values.appointment],
                  ['Appointment type', values.appointmentType],
                  ['Salary grade', values.salaryGrade],
                  ['Appointment date', values.appointmentDate],
                  ['Employment status', values.employmentStatus],
                  ['Highest qualification', values.highestQualification],
                  ['Supervisor', values.supervisor],
                ]}
              />
            )}
            {education.length ? (
              <ReviewSection
                title={isStudent ? 'Previous institutions & qualifications' : 'Academic qualifications'}
                rows={education.map((entry, index) => [
                  `Entry ${index + 1}`,
                  [entry.institution, entry.qualification, entry.field, entry.year, entry.startDate, entry.endDate].filter(Boolean).join(' · ') || '—',
                ])}
              />
            ) : null}
            <ReviewSection
              title="Contact"
              rows={[
                ['Address', values.address],
                ['City', values.city],
                ['Home LGA', values.lga],
                ['State', values.state],
                ['Emergency contact', values.emergencyContact],
                ['Next of kin', values.nextOfKin],
                ['Guardian', values.guardianName],
                ['Guardian relationship', values.guardianRelationship],
                ['Guardian phone', values.guardianPhone],
                ['Guardian email', values.guardianEmail],
              ]}
            />
          </div>
        ) : null}

        <ErrorNote message={stepError || submitError} />

        <div className="wizard-footer">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <div className="right">
            {stepIndex > 0 ? <button className="btn" type="button" onClick={goBack}>Back</button> : null}
            {stepIndex < steps.length - 1 ? (
              <button className="btn primary" type="button" onClick={goNext}>Continue</button>
            ) : (
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : `Create ${isStudent ? 'student' : 'staff'} record`}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
