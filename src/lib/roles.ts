export type Role =
  | 'system-admin'
  | 'registry-officer'
  | 'faculty-officer'
  | 'hr-officer'
  | 'auditor';

export type Capability =
  | 'readStudents'
  | 'writeStudents'
  | 'readStaff'
  | 'writeStaff'
  | 'readStudentDocuments'
  | 'writeStudentDocuments'
  | 'readStaffDocuments'
  | 'writeStaffDocuments'
  | 'reviewStudents'
  | 'reviewStaff'
  | 'audit'
  | 'users'
  | 'summary';

export const ROLES: Record<Role, Capability[]> = {
  'system-admin': [
    'readStudents', 'writeStudents', 'readStaff', 'writeStaff',
    'readStudentDocuments', 'writeStudentDocuments', 'readStaffDocuments', 'writeStaffDocuments',
    'reviewStudents', 'reviewStaff', 'audit', 'users', 'summary',
  ],
  'registry-officer': [
    'readStudents', 'writeStudents', 'readStudentDocuments', 'writeStudentDocuments',
    'reviewStudents', 'audit', 'summary',
  ],
  'faculty-officer': ['readStudents', 'readStudentDocuments', 'summary'],
  'hr-officer': [
    'readStaff', 'writeStaff', 'readStaffDocuments', 'writeStaffDocuments',
    'reviewStaff', 'audit', 'summary',
  ],
  auditor: ['readStudents', 'readStaff', 'audit', 'summary'],
};

export const CAMPUSES = [
  { id: 'imgbi', name: 'Yenagoa', location: 'Bayelsa State' },
  { id: 'sampou', name: 'Sampou', location: 'Kolokuma/Opokuma LGA, Bayelsa State' },
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  'system-admin': 'System administrator',
  'registry-officer': 'Registry officer',
  'faculty-officer': 'Faculty officer',
  'hr-officer': 'HR officer',
  auditor: 'Auditor',
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  campuses: string[];
};

export function isRole(value: string): value is Role {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

export function can(user: SessionUser | null | undefined, capability: Capability, campus?: string | null): boolean {
  if (!user) return false;
  if (!ROLES[user.role]?.includes(capability)) return false;
  if (!campus) return true;
  return user.campuses.includes('*') || user.campuses.includes(campus);
}

export function campusName(id: string | null | undefined): string {
  return CAMPUSES.find((campus) => campus.id === id)?.name ?? 'University-wide';
}

export function parseCampuses(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function serializeCampuses(value: string[]): string {
  return JSON.stringify(value);
}
