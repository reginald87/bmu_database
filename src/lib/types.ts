export type Campus = { id: string; name: string; location: string };

export type AcademicSessionRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EducationEntry = {
  institution: string;
  qualification: string;
  field: string;
  year: string;
  startDate: string;
  endDate: string;
};

export type DocumentRow = {
  id: string;
  name: string;
  title: string;
  filename: string;
  person: string;
  recordId: string;
  bims: string;
  campus: string;
  classification: string;
  added: string;
  size: string;
  sizeBytes: number;
  type: string;
  mimeType: string;
  expiryDate: string;
  scanStatus: string;
  scanner: string;
  scannedAt: string;
};

export type PersonRecord = {
  id: string;
  recordId: string;
  bims: string;
  first: string;
  last: string;
  middleName: string;
  preferredName: string;
  kind: string;
  recordType: 'Student' | 'Staff' | string;
  gender: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  address: string;
  city: string;
  lga: string;
  state: string;
  emergencyContact: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  emergencyEmail: string;
  nextOfKin: string;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
  campus: string;
  campusDetail: Campus | null;
  status: string;
  completeness: number;
  photo: string;
  programme: string;
  faculty: string;
  department: string;
  level: string;
  programmeLevel: string;
  session: string;
  entryRoute: string;
  admissionDate: string;
  enrollmentStatus: string;
  previousInstitution: string;
  priorQualification: string;
  priorYearCompleted: string;
  appointment: string;
  appointmentType: string;
  employmentType: string;
  salaryGrade: string;
  appointmentDate: string;
  employmentStatus: string;
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
  history: string[];
  documents: string[];
  documentRows: DocumentRow[];
  createdAt: string;
  updatedAt: string;
};

export type SummaryResponse = {
  campuses: Campus[];
  metrics: {
    students: number;
    staff: number;
    academicStaff: number;
    nonAcademicStaff: number;
    documents: number;
    pending: number;
  };
  distribution: Array<{ campus: string; records: number; share: number }>;
  recent: PersonRecord[];
};

export type ReviewItemRow = {
  id: string;
  name: string;
  recordId: string;
  bims: string;
  group: string;
  issue: string;
  campus: string;
  submitted: string;
  priority: string;
  personId: string | null;
};

export type AuditRow = {
  id: string;
  action: string;
  record: string;
  actor: string;
  campus: string;
  when: string;
  ref: string;
};

export type UserRow = {
  id: string;
  username: string;
  email?: string | null;
  displayName: string;
  role: string;
  campuses: string[];
  active: boolean;
  createdAt?: string;
  invitationToken?: string;
  invitationLink?: string;
  expiresAt?: string;
  emailSent?: boolean;
  emailError?: string;
};

export type SearchPerson = {
  id: string;
  name: string;
  recordId: string;
  bims: string;
  kind: string;
  recordType: string;
  campus: string;
  status: string;
  email: string;
  completeness: number;
};

export type SearchDocument = {
  id: string;
  title: string;
  filename: string;
  person: string;
  recordId: string;
  campus: string;
  classification: string;
  type: string;
  size: string;
  added: string;
};

export type SearchReview = {
  id: string;
  name: string;
  recordId: string;
  group: string;
  issue: string;
  campus: string;
  submitted: string;
  priority: string;
  personId: string | null;
};

export type SearchAudit = {
  id: string;
  action: string;
  record: string;
  actor: string;
  campus: string;
  when: string;
  ref: string;
};

export type SearchUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  campuses: string[];
  active: boolean;
};

export type SearchResponse = {
  query: string;
  people: SearchPerson[];
  documents: SearchDocument[];
  review: SearchReview[];
  audit: SearchAudit[];
  users: SearchUser[];
  totals: {
    people: number;
    documents: number;
    review: number;
    audit: number;
    users: number;
  };
};

export type MailStatus = {
  configured: boolean;
  address: string;
  appUrl: string;
};

export type NotificationRow = {
  id: string;
  roles: string[];
  campusId: string | null;
  userId: string | null;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export type SessionResponse = {
  setupRequired: boolean;
  authenticated: boolean;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    campuses: string[];
  } | null;
  csrfToken: string | null;
};
