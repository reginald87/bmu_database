import path from 'node:path';
import type { Document, Person } from '@prisma/client';
import { CAMPUSES } from './roles';

export const STATUS_OPTIONS = {
  student: ['Needs review', 'Verified', 'On leave', 'Graduated', 'Withdrawn'],
  staff: ['Review due', 'Verified', 'On leave', 'Separated', 'Retired'],
} as const;

export type PersonLite = {
  id: string;
  recordId: string;
  bims: string;
  email?: string | null;
  first: string;
  last: string;
  dateOfBirth?: string | null;
};

export type EducationEntry = {
  institution: string;
  qualification: string;
  field: string;
  year: string;
  startDate: string;
  endDate: string;
};

export const APPOINTMENT_TYPES = [
  'Adjunct',
  'Contract',
  'Temporary',
  'Tenured',
  'Permanent',
  'Part-time',
  'Full-time',
  'Visiting',
  'Research Fellow',
  'Teaching Assistant',
  'Administrative Staff',
  'Support Staff',
] as const;

export const ENTRY_MODES = [
  'UTME',
  'Direct Entry',
  'Transfer',
  'Remedial',
  'Part-time',
  'Other',
] as const;

export const PROGRAMME_LEVELS = [
  'Undergraduate',
  'Masters',
  'PhD',
  'Postgraduate Diploma',
  'Postgraduate Certificate',
] as const;

export const UNDERGRAD_LEVELS = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
] as const;

// Kept for backward compatibility with existing records.
export const STUDENT_LEVELS = [
  ...UNDERGRAD_LEVELS,
  ...PROGRAMME_LEVELS,
] as const;

export type NormalizedPerson = {
  first: string;
  last: string;
  middleName: string;
  preferredName: string;
  recordId: string;
  bims: string;
  email: string;
  campus: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  address: string;
  city: string;
  lga: string;
  state: string;
  emergencyContact: string;
  nextOfKin: string;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
  kind: string;
  department: string;
  appointment: string;
  salaryGrade: string;
  appointmentDate: string;
  employmentStatus: string;
  programme: string;
  faculty: string;
  level: string;
  programmeLevel: string;
  session: string;
  entryRoute: string;
  admissionDate: string;
  enrollmentStatus: string;
  previousInstitution: string;
  priorQualification: string;
  priorYearCompleted: string;
  appointmentType: string;
  employmentType: string;
  gradeLevel: string;
  highestQualification: string;
  qualificationField: string;
  qualificationInstitution: string;
  qualificationYear: string;
  professionalBody: string;
  professionalBodies: string[];
  professionalRegistration: string;
  supervisor: string;
  education: EducationEntry[];
};

export function cleanString(value: unknown, max = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeUniversityId(value: unknown): string {
  return cleanString(value, 60).toUpperCase();
}

export function validCampus(value: string): boolean {
  return CAMPUSES.some((campus) => campus.id === value);
}

export function normalizeCampus(value: unknown): string {
  const candidate = cleanString(value, 40).toLowerCase();
  const match = CAMPUSES.find((campus) => campus.id === candidate || campus.name.toLowerCase() === candidate);
  return match ? match.id : cleanString(value, 20);
}

export function isStudentId(value: unknown): boolean {
  return /^(?:UG\/\d{2}\/\d{4}|\d{12}[A-Z0-9]{2})$/.test(normalizeUniversityId(value));
}

export function isStaffId(value: unknown): boolean {
  return /^BMU\/PFN\/REG\/(?:APPT\/)?\d{3}$/.test(normalizeUniversityId(value));
}

export function isBims(value: string): boolean {
  return !value || /^BIMS[A-Z0-9]{11}$/.test(cleanString(value, 40).toUpperCase());
}

export function validStatus(kind: 'student' | 'staff', status: string): boolean {
  return (STATUS_OPTIONS[kind] as readonly string[]).includes(status);
}

export function parseJsonArray<T = unknown>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function nowLabel(): string {
  return new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' });
}

export function makePerson(
  input: Record<string, unknown>,
  category: string,
  existing: PersonLite[] = [],
  batch: NormalizedPerson[] = [],
  self: PersonLite | null = null,
): { errors: string[]; normalized: NormalizedPerson } {
  const errors: string[] = [];
  const first = cleanString(input.first, 80);
  const last = cleanString(input.last, 80);
  const middleName = cleanString(input.middleName, 80);
  const preferredName = cleanString(input.preferredName, 80);
  const recordId = normalizeUniversityId(input.recordId);
  const bims = cleanString(input.bims, 40).toUpperCase();
  const campus = normalizeCampus(input.campus);
  const email = cleanString(input.email, 160).toLowerCase();
  const phone = cleanString(input.phone, 40);
  const dateOfBirth = cleanString(input.dateOfBirth, 40);
  const gender = cleanString(input.gender, 20);
  const nationality = cleanString(input.nationality, 40);
  const address = cleanString(input.address, 200);
  const city = cleanString(input.city, 80);
  const lga = cleanString(input.lga, 80);
  const state = cleanString(input.state, 80);
  const emergencyContact = cleanString(input.emergencyContact, 160);
  const nextOfKin = cleanString(input.nextOfKin, 160);
  const salaryGrade = cleanString(input.salaryGrade, 20);
  const appointmentDate = cleanString(input.appointmentDate, 40);
  const employmentStatus = cleanString(input.employmentStatus, 40);
  const guardianName = cleanString(input.guardianName, 160);
  const guardianRelationship = cleanString(input.guardianRelationship, 80);
  const guardianPhone = cleanString(input.guardianPhone, 40);
  const guardianEmail = cleanString(input.guardianEmail, 160).toLowerCase();
  const entryRoute = cleanString(input.entryRoute, 40);
  const admissionDate = cleanString(input.admissionDate, 40);
  const enrollmentStatus = cleanString(input.enrollmentStatus, 40);
  const previousInstitution = cleanString(input.previousInstitution, 160);
  const priorQualification = cleanString(input.priorQualification, 80);
  const priorYearCompleted = cleanString(input.priorYearCompleted, 20);
  const appointmentType = cleanString(input.appointmentType, 40);
  const employmentType = cleanString(input.employmentType, 40);
  const gradeLevel = cleanString(input.gradeLevel, 40);
  const highestQualification = cleanString(input.highestQualification, 80);
  const qualificationField = cleanString(input.qualificationField, 120);
  const qualificationInstitution = cleanString(input.qualificationInstitution, 160);
  const qualificationYear = cleanString(input.qualificationYear, 20);
  const professionalBody = cleanString(input.professionalBody, 120);
  const professionalRegistration = cleanString(input.professionalRegistration, 80);
  const supervisor = cleanString(input.supervisor, 160);

  const professionalBodies = (Array.isArray(input.professionalBodies)
    ? input.professionalBodies
    : typeof input.professionalBodies === 'string'
      ? input.professionalBodies.split(',')
      : []
  )
    .map((item) => cleanString(item, 120))
    .filter(Boolean);

  let education: EducationEntry[] = [];
  try {
    if (Array.isArray(input.education)) education = input.education as EducationEntry[];
    else if (typeof input.education === 'string' && input.education.trim()) education = JSON.parse(input.education);
  } catch {
    education = [];
  }
  education = education
    .map((entry) => ({
      institution: cleanString(entry?.institution, 160),
      qualification: cleanString(entry?.qualification, 120),
      field: cleanString(entry?.field, 120),
      year: cleanString(entry?.year, 20),
      startDate: cleanString(entry?.startDate, 40),
      endDate: cleanString(entry?.endDate, 40),
    }))
    .filter((entry) => entry.institution || entry.qualification || entry.field || entry.year || entry.startDate || entry.endDate);

  if (!first) errors.push('First name is required.');
  if (!last) errors.push('Last name is required.');
  if (!validCampus(campus)) errors.push('Campus must be imgbi or sampou.');
  if (category === 'student' && !isStudentId(recordId) && !(self && recordId === normalizeUniversityId(self.recordId))) {
    errors.push('Student ID must be UG/00/0000 or YYYY + 8 digits + 2 alphanumeric characters (example: 202610012345AB).');
  }
  if (category === 'staff' && !isStaffId(recordId) && !(self && recordId === normalizeUniversityId(self.recordId))) {
    errors.push('Staff ID must be BMU/PFN/REG/000 or BMU/PFN/REG/APPT/000.');
  }
  if (!['student', 'staff'].includes(category)) errors.push('Record type must be student or staff.');
  if (!isBims(bims)) errors.push('BIMS must start with BIMS and contain 11 letters or digits after it (example: BIMS25260NO74247).');

  const idKey = recordId.toLowerCase();
  const bimsKey = bims.toLowerCase();
  if (recordId && (existing.some((row) => row.id !== self?.id && row.recordId?.toLowerCase() === idKey) || batch.some((row) => row.recordId.toLowerCase() === idKey))) {
    errors.push('University ID is already in use.');
  }
  if (bims && (existing.some((row) => row.id !== self?.id && row.bims?.toLowerCase() === bimsKey) || batch.some((row) => row.bims.toLowerCase() === bimsKey))) {
    errors.push('BIMS number is already in use.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email address is invalid.');
  if (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) errors.push('Guardian email address is invalid.');
  if (email && (existing.some((row) => row.id !== self?.id && row.email?.toLowerCase() === email) || batch.some((row) => row.email.toLowerCase() === email))) {
    errors.push('Email address is already in use.');
  }
  if (category === 'student' && (!cleanString(input.programme, 120) || !cleanString(input.session, 30))) {
    errors.push('Programme and admission session are required.');
  }
  if (category === 'staff' && (!['Academic', 'Non-academic'].includes(cleanString(input.kind, 30)) || !cleanString(input.department, 120) || !cleanString(input.appointment, 120))) {
    errors.push('Staff group, department, and appointment are required.');
  }

  return {
    errors,
    normalized: {
      first, last, middleName, preferredName, recordId, bims, email, campus, phone, dateOfBirth, gender,
      nationality, address, city, lga, state, emergencyContact, nextOfKin, guardianName, guardianRelationship,
      guardianPhone, guardianEmail, kind: cleanString(input.kind, 30), department: cleanString(input.department, 120),
      appointment: cleanString(input.appointment, 120), salaryGrade, appointmentDate, employmentStatus,
      programme: cleanString(input.programme, 120), faculty: cleanString(input.faculty, 120),
      level: cleanString(input.level, 20), programmeLevel: cleanString(input.programmeLevel, 40),
      session: cleanString(input.session, 30), entryRoute, admissionDate,
      enrollmentStatus, previousInstitution, priorQualification, priorYearCompleted, appointmentType, employmentType,
      gradeLevel, highestQualification, qualificationField, qualificationInstitution, qualificationYear,
      professionalBody, professionalBodies, professionalRegistration, supervisor, education,
    },
  };
}

export function findDuplicates(
  input: Record<string, unknown>,
  people: PersonLite[],
  self: PersonLite | null = null,
): Array<{ id: string; recordId: string; name: string; kind: string; status: string; campus: string; reason: string }> {
  const email = cleanString(input.email, 160).toLowerCase();
  const first = cleanString(input.first, 80).toLowerCase();
  const last = cleanString(input.last, 80).toLowerCase();
  const dob = cleanString(input.dateOfBirth, 40).toLowerCase();
  return people
    .filter((row) => row.id !== self?.id && (
      (email && row.email?.toLowerCase() === email) ||
      (first && last && dob && row.first?.toLowerCase() === first && row.last?.toLowerCase() === last && row.dateOfBirth?.toLowerCase() === dob)
    ))
    .map((row) => ({
      id: row.id,
      recordId: row.recordId,
      name: `${row.first} ${row.last}`,
      kind: 'Person',
      status: '',
      campus: '',
      reason: email && row.email?.toLowerCase() === email ? 'Same email address' : 'Same name and date of birth',
    }));
}

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell.replace(/\r$/, ''));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function csvToRecords(text: string): Array<Record<string, unknown> & { __row: number }> {
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error('CSV needs a header and at least one record.');
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate column names.');
  return rows.slice(1).map((row, index) => ({
    ...Object.fromEntries(headers.map((header, column) => [header, row[column] || ''])),
    __row: index + 2,
  }));
}

export function safeFileName(value: unknown): string {
  return cleanString(value, 180).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
}

export function fileKind(name: string, content: Buffer): { type: string; mime: string } | null {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf' && content.subarray(0, 5).toString() === '%PDF-') return { type: 'PDF', mime: 'application/pdf' };
  if (ext === '.png' && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { type: 'PNG', mime: 'image/png' };
  if (['.jpg', '.jpeg'].includes(ext) && content[0] === 255 && content[1] === 216 && content[2] === 255) return { type: 'JPG', mime: 'image/jpeg' };
  if (ext === '.docx' && content.subarray(0, 4).toString() === 'PK\x03\x04') {
    return { type: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  return null;
}

export function extractDocumentTitle(filename: string, content: Buffer): string {
  const fallback = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').trim();
  if (content.subarray(0, 5).toString() === '%PDF-') {
    const raw = content.toString('latin1');
    const literal = raw.match(/\/Title\s*\(([^()]*)\)/);
    if (literal?.[1]) {
      const value = literal[1].replace(/\\([()\\])/g, '$1').trim();
      if (value) return cleanString(value, 140);
    }
    const hex = raw.match(/\/Title\s*<([0-9A-Fa-f\s]+)>/);
    if (hex?.[1]) {
      const bytes = Buffer.from(hex[1].replace(/\s+/g, ''), 'hex');
      let text = bytes.toString('utf16le');
      if (bytes[0] === 0xfe && bytes[1] === 0xff) text = bytes.subarray(2).swap16().toString('utf16le');
      const value = text.replace(/^\uFEFF/, '').trim();
      if (value) return cleanString(value, 140);
    }
  }
  return cleanString(fallback, 140);
}

export function personLiteFromDb(person: Person): PersonLite {
  return {
    id: person.id,
    recordId: person.universityId,
    bims: person.bimsNumber ?? '',
    email: person.email,
    first: person.firstName,
    last: person.lastName,
    dateOfBirth: person.dateOfBirth,
  };
}

export type PersonWithDocuments = Person & { documents?: Document[] };

export function personToApi(person: PersonWithDocuments) {
  const documents = person.documents ?? [];
  return {
    id: person.id,
    recordId: person.universityId,
    bims: person.bimsNumber ?? '',
    first: person.firstName,
    last: person.lastName,
    middleName: person.middleName ?? '',
    preferredName: person.preferredName ?? '',
    kind: person.recordType === 'Student' ? 'Student' : (person.staffCategory ?? 'Staff'),
    recordType: person.recordType,
    gender: person.gender ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    dateOfBirth: person.dateOfBirth ?? '',
    nationality: person.nationality ?? '',
    address: person.address ?? '',
    city: person.city ?? '',
    lga: person.lga ?? '',
    state: person.state ?? '',
    emergencyContact: person.emergencyContact ?? '',
    emergencyName: person.emergencyName ?? '',
    emergencyRelationship: person.emergencyRelationship ?? '',
    emergencyPhone: person.emergencyPhone ?? '',
    emergencyEmail: person.emergencyEmail ?? '',
    nextOfKin: person.nextOfKin ?? '',
    guardianName: person.guardianName ?? '',
    guardianRelationship: person.guardianRelationship ?? '',
    guardianPhone: person.guardianPhone ?? '',
    guardianEmail: person.guardianEmail ?? '',
    campus: person.campusId,
    campusDetail: CAMPUSES.find((campus) => campus.id === person.campusId) ?? null,
    status: person.status,
    completeness: person.completeness,
    photo: person.photo ?? '',
    programme: person.programme ?? '',
    faculty: person.faculty ?? '',
    department: person.department ?? '',
    level: person.currentLevel ?? '',
    programmeLevel: person.programmeLevel ?? '',
    session: person.admissionSession ?? '',
    entryRoute: person.entryRoute ?? '',
    admissionDate: person.admissionDate ?? '',
    enrollmentStatus: person.enrollmentStatus ?? '',
    previousInstitution: person.previousInstitution ?? '',
    priorQualification: person.priorQualification ?? '',
    priorYearCompleted: person.priorYearCompleted ?? '',
    appointment: person.jobTitle ?? '',
    appointmentType: person.appointmentType ?? '',
    employmentType: person.employmentType ?? '',
    salaryGrade: person.salaryGrade ?? '',
    appointmentDate: person.appointmentDate ?? '',
    employmentStatus: person.employmentStatus ?? '',
    gradeLevel: person.gradeLevel ?? '',
    highestQualification: person.highestQualification ?? '',
    qualificationField: person.qualificationField ?? '',
    qualificationInstitution: person.qualificationInstitution ?? '',
    qualificationYear: person.qualificationYear ?? '',
    professionalBody: person.professionalBody ?? '',
    professionalBodies: parseJsonArray<string>(person.professionalBodies),
    professionalRegistration: person.professionalRegistration ?? '',
    supervisor: person.supervisor ?? '',
    education: parseJsonArray<EducationEntry>(person.education),
    history: parseJsonArray<string>(person.history),
    documents: documents.map((doc) => `${doc.title} · ${doc.type} · ${doc.classification}`),
    documentRows: documents.map(documentToApi),
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

export function documentToApi(doc: Document & { person?: Person | null }) {
  return {
    id: doc.id,
    name: doc.title,
    title: doc.title,
    filename: doc.filename,
    person: doc.person ? `${doc.person.firstName} ${doc.person.lastName}` : '',
    recordId: doc.person?.universityId ?? '',
    bims: doc.person?.bimsNumber ?? '',
    campus: doc.person?.campusId ?? '',
    classification: doc.classification,
    added: doc.added,
    size: doc.size,
    sizeBytes: doc.sizeBytes,
    type: doc.type,
    mimeType: doc.mimeType,
    expiryDate: doc.expiryDate ?? '',
    scanStatus: doc.scanStatus ?? '',
    scanner: doc.scanner ?? '',
    scannedAt: doc.scannedAt ?? '',
    storageKey: doc.storageKey,
  };
}
