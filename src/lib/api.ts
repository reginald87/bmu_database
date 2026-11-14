import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import type { Document, Person } from '@prisma/client';
import { prisma } from './prisma';
import {
  createSession, destroyCurrentSession, destroySessionsForUser, getSessionUser,
  hasValidCsrf, hashPassword, sameOrigin, safeEqual, serializeUser, verifyPassword,
} from './auth';
import {
  CAMPUSES, ROLES, ROLE_LABELS, can, campusName, isRole, parseCampuses, serializeCampuses,
  type Capability, type SessionUser,
} from './roles';
import { invitationLink, mailerAddress, mailerConfigured, sendInvitationEmail, sendTestEmail } from './mailer';
import {
  cleanString, csvToRecords, documentToApi, extractDocumentTitle, fileKind, findDuplicates, makePerson, nowLabel,
  normalizeCampus, normalizeUniversityId, parseJsonArray, personLiteFromDb, personToApi, safeFileName,
  validCampus, validStatus, type NormalizedPerson, type PersonLite,
} from './registry';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const STORAGE_DIR = path.join(ROOT, 'storage');
const QUARANTINE_DIR = path.join(ROOT, 'quarantine');

const loginFailures = new Map<string, { count: number; until: number }>();
const activationFailures = new Map<string, { count: number; until: number }>();

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function deny(): Response {
  return json({ error: 'You do not have permission to do that.' }, 403);
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

async function readJson(request: Request, maxBytes = 1_500_000): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Request is too large.');
  try {
    const value = await request.json();
    return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

async function ensureDirs(): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
  await mkdir(QUARANTINE_DIR, { recursive: true });
}

async function peopleLite(): Promise<PersonLite[]> {
  return (await prisma.person.findMany()).map(personLiteFromDb);
}

async function findPerson(idOrRecordId: string): Promise<(Person & { documents: Document[] }) | null> {
  return prisma.person.findFirst({
    where: { OR: [{ id: idOrRecordId }, { universityId: normalizeUniversityId(idOrRecordId) }] },
    include: { documents: { orderBy: { createdAt: 'desc' } } },
  });
}

async function auditEvent(action: string, person: { firstName: string; lastName: string; recordType: string; campusId: string; universityId: string }, actor: string, campusId?: string | null) {
  await prisma.auditEvent.create({
    data: {
      action,
      record: `${person.firstName} ${person.lastName} · ${person.recordType}`,
      actor,
      campusId: campusId === undefined ? person.campusId : campusId,
      when: nowLabel(),
      ref: person.universityId,
    },
  });
}

async function notify(input: { roles?: string[]; campusId?: string | null; userId?: string | null; title: string; message: string; href?: string | null }) {
  await prisma.notification.create({
    data: {
      roles: JSON.stringify(input.roles ?? []),
      campusId: input.campusId ?? null,
      userId: input.userId ?? null,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      readBy: '[]',
    },
  });
}

function filterRows<T extends Record<string, unknown>>(rows: T[], params: URLSearchParams): T[] {
  const q = (params.get('q') || '').toLowerCase();
  const campus = params.get('campus');
  const status = params.get('status');
  const programme = params.get('programme');
  const kind = params.get('kind');
  const fileType = params.get('type');
  const classification = params.get('classification');
  const action = params.get('action');
  return rows.filter((row) => {
    const rowCampus = row.campus as string | undefined;
    const rowStatus = row.status as string | undefined;
    const rowProgramme = row.programme as string | undefined;
    const rowKind = row.kind as string | undefined;
    const rowType = row.type as string | undefined;
    const rowClassification = row.classification as string | undefined;
    const rowAction = row.action as string | undefined;
    return (!campus || campus === 'all' || rowCampus === campus)
      && (!status || status === 'all' || rowStatus === status)
      && (!programme || programme === 'all' || rowProgramme === programme)
      && (!kind || kind === 'all' || rowKind === kind)
      && (!fileType || fileType === 'all' || (fileType === 'IMAGE' ? ['JPG', 'PNG'].includes(rowType || '') : rowType === fileType))
      && (!classification || classification === 'all' || rowClassification === classification)
      && (!action || action === 'all' || (action === 'Viewed' ? rowAction === 'Record viewed' : rowAction === action))
      && (!q || JSON.stringify(row).toLowerCase().includes(q));
  });
}

function personCreateData(n: NormalizedPerson, category: string, status: string, history: string[], completeness = 70) {
  const latestEducation = n.education.length ? n.education[n.education.length - 1] : null;
  return {
    universityId: n.recordId,
    bimsNumber: n.bims || null,
    firstName: n.first,
    middleName: n.middleName || null,
    lastName: n.last,
    preferredName: n.preferredName || null,
    email: n.email || null,
    phone: n.phone || null,
    dateOfBirth: n.dateOfBirth || null,
    gender: n.gender || null,
    nationality: n.nationality || null,
    address: n.address || null,
    city: n.city || null,
    lga: n.lga || null,
    state: n.state || null,
    emergencyContact: n.emergencyContact || null,
    nextOfKin: n.nextOfKin || null,
    guardianName: n.guardianName || null,
    guardianRelationship: n.guardianRelationship || null,
    guardianPhone: n.guardianPhone || null,
    guardianEmail: n.guardianEmail || null,
    campusId: n.campus,
    recordType: category === 'student' ? 'Student' : 'Staff',
    status,
    completeness,
    programme: category === 'student' ? n.programme || null : null,
    faculty: category === 'student' ? n.faculty || null : null,
    department: n.department || null,
    currentLevel: category === 'student' ? n.level || null : null,
    programmeLevel: category === 'student' ? n.programmeLevel || null : null,
    admissionSession: category === 'student' ? n.session || null : null,
    entryRoute: n.entryRoute || null,
    admissionDate: n.admissionDate || null,
    enrollmentStatus: n.enrollmentStatus || null,
    previousInstitution: category === 'student' ? (latestEducation?.institution || null) : null,
    priorQualification: category === 'student' ? (latestEducation?.qualification || null) : null,
    priorYearCompleted: category === 'student' ? (latestEducation?.year || null) : null,
    staffCategory: category === 'staff' ? n.kind || null : null,
    jobTitle: category === 'staff' ? n.appointment || null : null,
    appointmentType: n.appointmentType || null,
    employmentType: n.employmentType || null,
    salaryGrade: n.salaryGrade || null,
    appointmentDate: n.appointmentDate || null,
    employmentStatus: n.employmentStatus || null,
    gradeLevel: n.gradeLevel || null,
    highestQualification: category === 'staff' ? (latestEducation?.qualification || n.highestQualification || null) : null,
    qualificationField: category === 'staff' ? (latestEducation?.field || null) : null,
    qualificationInstitution: category === 'staff' ? (latestEducation?.institution || null) : null,
    qualificationYear: category === 'staff' ? (latestEducation?.year || null) : null,
    professionalBody: n.professionalBody || null,
    professionalBodies: JSON.stringify(n.professionalBodies),
    professionalRegistration: n.professionalRegistration || null,
    supervisor: n.supervisor || null,
    education: JSON.stringify(n.education),
    history: JSON.stringify(history),
  };
}

function personUpdateData(n: NormalizedPerson, category: string) {
  const student = category === 'student';
  const latestEducation = n.education.length ? n.education[n.education.length - 1] : null;
  return {
    universityId: n.recordId,
    bimsNumber: n.bims || null,
    firstName: n.first,
    middleName: n.middleName || null,
    lastName: n.last,
    preferredName: n.preferredName || null,
    email: n.email || null,
    phone: n.phone || null,
    dateOfBirth: n.dateOfBirth || null,
    gender: n.gender || null,
    nationality: n.nationality || null,
    address: n.address || null,
    city: n.city || null,
    lga: n.lga || null,
    state: n.state || null,
    emergencyContact: n.emergencyContact || null,
    nextOfKin: n.nextOfKin || null,
    guardianName: n.guardianName || null,
    guardianRelationship: n.guardianRelationship || null,
    guardianPhone: n.guardianPhone || null,
    guardianEmail: n.guardianEmail || null,
    campusId: n.campus,
    programme: student ? n.programme || null : null,
    faculty: student ? n.faculty || null : null,
    department: n.department || null,
    currentLevel: student ? n.level || null : null,
    programmeLevel: student ? n.programmeLevel || null : null,
    admissionSession: student ? n.session || null : null,
    entryRoute: n.entryRoute || null,
    admissionDate: n.admissionDate || null,
    enrollmentStatus: n.enrollmentStatus || null,
    previousInstitution: student ? (latestEducation?.institution || null) : null,
    priorQualification: student ? (latestEducation?.qualification || null) : null,
    priorYearCompleted: student ? (latestEducation?.year || null) : null,
    staffCategory: student ? null : n.kind || null,
    jobTitle: student ? null : n.appointment || null,
    appointmentType: n.appointmentType || null,
    employmentType: n.employmentType || null,
    salaryGrade: n.salaryGrade || null,
    appointmentDate: n.appointmentDate || null,
    employmentStatus: n.employmentStatus || null,
    gradeLevel: n.gradeLevel || null,
    highestQualification: student ? null : (latestEducation?.qualification || n.highestQualification || null),
    qualificationField: student ? null : (latestEducation?.field || null),
    qualificationInstitution: student ? null : (latestEducation?.institution || null),
    qualificationYear: student ? null : (latestEducation?.year || null),
    professionalBody: n.professionalBody || null,
    professionalBodies: JSON.stringify(n.professionalBodies),
    professionalRegistration: n.professionalRegistration || null,
    supervisor: n.supervisor || null,
    education: JSON.stringify(n.education),
  };
}

function validatePhoto(photo: unknown): string | undefined {
  if (photo === undefined) return undefined;
  const value = String(photo || '');
  if (value && !/^data:image\/(png|jpe?g|webp);base64,/.test(value)) {
    throw new HttpError(400, 'Profile photo must be a PNG, JPG or WebP image.');
  }
  if (value.length > 400000) throw new HttpError(400, 'Profile photo is too large. Use an image under 300 KB.');
  return value || undefined;
}

async function currentDefenderPath(): Promise<string | null> {
  const base = process.env.ProgramData || 'C:\\ProgramData';
  const platformDir = path.join(base, 'Microsoft', 'Windows Defender', 'Platform');
  try {
    const entries = (await readdir(platformDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    for (const entry of entries) {
      const candidate = path.join(platformDir, entry.name, 'MpCmdRun.exe');
      try { await access(candidate); return candidate; } catch { /* keep looking */ }
    }
  } catch { /* fall through */ }
  const fallback = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');
  try { await access(fallback); return fallback; } catch { return null; }
}

type ScanResult = { scanner: string; output: string; status: 'Clean' | 'Skipped' };

async function scanFile(filePath: string): Promise<ScanResult> {
  if ((process.env.BMU_ALLOW_UNSCANNED_UPLOADS || '').toLowerCase() === 'true') {
    return {
      scanner: 'Not configured',
      output: 'Malware scanning is disabled by BMU_ALLOW_UNSCANNED_UPLOADS.',
      status: 'Skipped',
    };
  }
  let command: string | null;
  let args: string[];
  if (process.platform === 'win32') {
    command = await currentDefenderPath();
    if (!command) throw new HttpError(503, 'Microsoft Defender scanner is unavailable.');
    args = ['-Scan', '-ScanType', '3', '-File', filePath, '-DisableRemediation'];
  } else {
    command = process.env.BMU_CLAMSCAN_PATH || 'clamscan';
    args = ['--no-summary', filePath];
  }
  try {
    const result = await execFileAsync(command, args, { windowsHide: true, timeout: 120_000, maxBuffer: 1_000_000 });
    return {
      scanner: process.platform === 'win32' ? 'Microsoft Defender Antivirus' : 'ClamAV',
      output: `${result.stdout}\n${result.stderr}`.slice(0, 2000),
      status: 'Clean',
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
    if (err.code === 'ENOENT') throw new HttpError(503, 'The configured malware scanner could not be started.');
    if (err.killed || err.signal === 'SIGTERM') throw new HttpError(503, 'The malware scan did not finish before timeout.');
    if (err.code === '1' || err.code === '2') throw new HttpError(422, 'The file was rejected because the malware scan detected a threat or did not complete cleanly.');
    throw new HttpError(503, 'The malware scan failed. The file was not accepted.');
  }
}

export async function handleApi(request: Request, segments: string[]): Promise<Response> {
  const method = request.method.toUpperCase();
  const route = `/${segments.join('/')}`;

  try {
    if (route === '/session' && method === 'GET') {
      const auth = await getSessionUser();
      const userCount = await prisma.user.count();
      return json({
        setupRequired: userCount === 0,
        authenticated: Boolean(auth),
        user: auth?.user ?? null,
        csrfToken: auth?.session.csrfToken ?? null,
      });
    }

    if (route === '/setup' && method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Request origin was rejected.' }, 403);
      if ((await prisma.user.count()) > 0) return json({ error: 'Initial setup is already complete.' }, 409);
      const input = await readJson(request);
      const username = cleanString(input.username, 40).toLowerCase();
      const displayName = cleanString(input.displayName, 100);
      const password = String(input.password || '');
      const setting = await prisma.setting.findUnique({ where: { key: 'bootstrapTokenHash' } });
      const providedHash = createHash('sha256').update(String(input.setupToken || '')).digest('hex');
      if (!setting || !safeEqual(providedHash, setting.value)) return json({ error: 'Setup token is invalid.' }, 403);
      if (!/^[a-z0-9._-]{3,40}$/.test(username) || !displayName || password.length < 12) {
        return json({ error: 'Use a 3–40 character username, your display name, and a password at least 12 characters long.' }, 400);
      }
      if (await prisma.user.findUnique({ where: { username } })) return json({ error: 'That username is already in use.' }, 409);
      const credentials = await hashPassword(password);
      const user = await prisma.user.create({
        data: { username, displayName, role: 'system-admin', campuses: serializeCampuses(['*']), active: true, ...credentials },
      });
      await prisma.setting.deleteMany({ where: { key: 'bootstrapTokenHash' } });
      const session = await createSession(user.id);
      return json({ ok: true, user: serializeUser(user), csrfToken: session.csrfToken }, 201);
    }

    if (route === '/login' && method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Request origin was rejected.' }, 403);
      const ip = clientIp(request);
      const failure = loginFailures.get(ip) || { count: 0, until: 0 };
      if (failure.until > Date.now()) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      const input = await readJson(request);
      const username = cleanString(input.username, 40).toLowerCase();
      const password = String(input.password || '');
      const user = await prisma.user.findFirst({ where: { username, active: true } });
      const valid = Boolean(user?.passwordHash && user.salt) && await verifyPassword(password, user!.salt!, user!.passwordHash!);
      if (!valid) {
        failure.count += 1;
        if (failure.count >= 5) { failure.count = 0; failure.until = Date.now() + 15 * 60 * 1000; }
        loginFailures.set(ip, failure);
        return json({ error: 'Username or password is incorrect.' }, 401);
      }
      loginFailures.delete(ip);
      const session = await createSession(user!.id);
      return json({ ok: true, user: serializeUser(user!), csrfToken: session.csrfToken });
    }

    if (route === '/activate' && method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Request origin was rejected.' }, 403);
      const ip = clientIp(request);
      const failure = activationFailures.get(ip) || { count: 0, until: 0 };
      if (failure.until > Date.now()) return json({ error: 'Too many activation attempts. Try again later.' }, 429);
      const input = await readJson(request);
      const username = cleanString(input.username, 40).toLowerCase();
      const token = String(input.token || '');
      const password = String(input.password || '');
      const user = await prisma.user.findFirst({ where: { username, active: false } });
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const valid = Boolean(
        user?.inviteTokenHash &&
        user.inviteExpiresAt &&
        user.inviteExpiresAt.getTime() > Date.now() &&
        safeEqual(user.inviteTokenHash, tokenHash),
      );
      if (!valid) {
        failure.count += 1;
        if (failure.count >= 5) { failure.count = 0; failure.until = Date.now() + 15 * 60 * 1000; }
        activationFailures.set(ip, failure);
        return json({ error: 'Invitation details are invalid or expired.' }, 401);
      }
      if (password.length < 12) return json({ error: 'Choose a password at least 12 characters long.' }, 400);
      const credentials = await hashPassword(password);
      const updated = await prisma.user.update({
        where: { id: user!.id },
        data: { ...credentials, active: true, inviteTokenHash: null, inviteExpiresAt: null },
      });
      activationFailures.delete(ip);
      const session = await createSession(updated.id);
      return json({ ok: true, csrfToken: session.csrfToken, user: serializeUser(updated) });
    }

    const auth = await getSessionUser();
    if (!auth) return json({ error: 'Please sign in to continue.' }, 401);
    const user = auth.user;

    if (method !== 'GET') {
      if (!sameOrigin(request)) return json({ error: 'Request origin was rejected.' }, 403);
      if (!hasValidCsrf(request, auth.session)) return json({ error: 'Security token expired. Reload the page and try again.' }, 403);
    }

    if (route === '/logout' && method === 'POST') {
      await destroyCurrentSession();
      return json({ ok: true });
    }

    if (route === '/notifications' && method === 'GET') {
      const rows = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
      const visible = rows.filter((row) => {
        const roles = parseJsonArray<string>(row.roles);
        const readBy = parseJsonArray<string>(row.readBy);
        return (!roles.length || roles.includes(user.role))
          && (!row.campusId || can(user, 'summary', row.campusId))
          && (!row.userId || row.userId === user.id)
          && !readBy.includes('__hidden');
      });
      return json(visible.map((row) => {
        const readBy = parseJsonArray<string>(row.readBy);
        return { ...row, roles: parseJsonArray<string>(row.roles), read: readBy.includes(user.id) };
      }));
    }

    if (route === '/notifications' && method === 'PATCH') {
      const input = await readJson(request);
      const id = cleanString(input.id, 60);
      const notification = await prisma.notification.findUnique({ where: { id } });
      if (!notification) return json({ error: 'Notification not found.' }, 404);
      const readBy = parseJsonArray<string>(notification.readBy);
      if (!readBy.includes(user.id)) readBy.push(user.id);
      await prisma.notification.update({ where: { id }, data: { readBy: JSON.stringify(readBy) } });
      return json({ ok: true });
    }

    if (route === '/users' && method === 'GET') {
      if (!can(user, 'users')) return deny();
      const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
      return json(rows.map((row) => ({
        id: row.id, username: row.username, email: row.email, displayName: row.displayName, role: row.role,
        campuses: parseCampuses(row.campuses), active: row.active, createdAt: row.createdAt,
      })));
    }

    if (route === '/users' && method === 'POST') {
      if (!can(user, 'users')) return deny();
      const input = await readJson(request);
      const username = cleanString(input.username, 40).toLowerCase();
      const email = cleanString(input.email, 160).toLowerCase();
      const displayName = cleanString(input.displayName, 100);
      const role = cleanString(input.role, 30);
      const assignedCampuses = Array.isArray(input.campuses) ? input.campuses.filter((c): c is string => typeof c === 'string' && validCampus(c)) : [];
      if (!/^[a-z0-9._-]{3,40}$/.test(username) || !displayName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isRole(role) || role === 'system-admin' || !assignedCampuses.length) {
        return json({ error: 'Provide a username, full name, valid email address, an allowed role, and at least one campus.' }, 400);
      }
      if (await prisma.user.findUnique({ where: { username } })) return json({ error: 'That username is already in use.' }, 409);
      if (await prisma.user.findUnique({ where: { email } })) return json({ error: 'That email address is already in use.' }, 409);
      const invitationToken = randomBytes(32).toString('base64url');
      const created = await prisma.user.create({
        data: {
          username, email, displayName, role, campuses: serializeCampuses(assignedCampuses), active: false,
          inviteTokenHash: createHash('sha256').update(invitationToken).digest('hex'),
          inviteExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      await prisma.auditEvent.create({
        data: {
          action: 'User invitation created', record: `${displayName} · ${role}`, actor: user.displayName,
          campusId: assignedCampuses.length === 1 ? assignedCampuses[0] : null, when: nowLabel(), ref: username,
        },
      });
      const mail = await sendInvitationEmail({
        to: email, displayName, username, token: invitationToken,
        roleLabel: ROLE_LABELS[role], invitedBy: user.displayName,
      });
      await notify({
        roles: ['system-admin'],
        title: mail.sent ? 'User invitation emailed' : 'User invitation created',
        message: mail.sent
          ? `An invitation email was sent to ${email}.`
          : `An invitation for ${displayName} is ready; email delivery failed.`,
      });
      return json({
        id: created.id, username: created.username, email: created.email, displayName: created.displayName, role: created.role,
        campuses: parseCampuses(created.campuses), active: created.active, invitationToken,
        invitationLink: invitationLink(created.username, invitationToken),
        emailSent: mail.sent, emailError: mail.error,
      }, 201);
    }

    if (route === '/password' && method === 'POST') {
      const input = await readJson(request);
      const oldPassword = String(input.currentPassword || '');
      const newPassword = String(input.newPassword || '');
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.salt || !dbUser.passwordHash || !(await verifyPassword(oldPassword, dbUser.salt, dbUser.passwordHash))) {
        return json({ error: 'Current password is incorrect.' }, 401);
      }
      if (newPassword.length < 12) return json({ error: 'Choose a password at least 12 characters long.' }, 400);
      const credentials = await hashPassword(newPassword);
      await prisma.user.update({ where: { id: user.id }, data: credentials });
      await destroySessionsForUser(user.id);
      const session = await createSession(user.id);
      return json({ ok: true, csrfToken: session.csrfToken });
    }

    const userMatch = route.match(/^\/users\/([\w-]+)$/);
    if (userMatch && method === 'PATCH') {
      if (!can(user, 'users')) return deny();
      const target = await prisma.user.findUnique({ where: { id: userMatch[1] } });
      if (!target) return json({ error: 'User not found.' }, 404);
      const input = await readJson(request);
      if (target.id === user.id && input.active === false) return json({ error: 'You cannot deactivate your own account.' }, 400);
      const data: Record<string, unknown> = {};
      if (typeof input.active === 'boolean') data.active = input.active;
      if (typeof input.email === 'string') {
        const email = cleanString(input.email, 160).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
        if (email) {
          const clash = await prisma.user.findFirst({ where: { email, NOT: { id: target.id } } });
          if (clash) return json({ error: 'That email address is already in use.' }, 409);
        }
        data.email = email || null;
      }
      if (typeof input.role === 'string' && isRole(input.role) && input.role !== 'system-admin') data.role = input.role;
      if (Array.isArray(input.campuses)) {
        const scope = input.campuses.filter((c): c is string => typeof c === 'string' && validCampus(c));
        if (!scope.length) return json({ error: 'A user must have at least one valid campus.' }, 400);
        data.campuses = serializeCampuses(scope);
      }
      const updated = await prisma.user.update({ where: { id: target.id }, data });
      await prisma.auditEvent.create({
        data: {
          action: 'User access changed',
          record: `${updated.displayName} · ${updated.role}${updated.active ? ' · active' : ' · inactive'}`,
          actor: user.displayName,
          campusId: parseCampuses(updated.campuses).length === 1 ? parseCampuses(updated.campuses)[0] : null,
          when: nowLabel(), ref: updated.username,
        },
      });
      return json({
        id: updated.id, username: updated.username, email: updated.email, displayName: updated.displayName, role: updated.role,
        campuses: parseCampuses(updated.campuses), active: updated.active,
      });
    }

    const invitationMatch = route.match(/^\/users\/([\w-]+)\/(?:invite|invitation)$/);
    if (invitationMatch && method === 'POST') {
      if (!can(user, 'users')) return deny();
      const target = await prisma.user.findUnique({ where: { id: invitationMatch[1] } });
      if (!target) return json({ error: 'User not found.' }, 404);
      if (target.active) return json({ error: 'This account is already active.' }, 409);
      let input: Record<string, unknown> = {};
      try {
        input = await readJson(request);
      } catch {
        input = {};
      }
      const providedEmail = cleanString(input.email, 160).toLowerCase();
      if (providedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providedEmail)) {
        return json({ error: 'Enter a valid email address.' }, 400);
      }
      if (providedEmail && providedEmail !== target.email) {
        const clash = await prisma.user.findFirst({ where: { email: providedEmail, NOT: { id: target.id } } });
        if (clash) return json({ error: 'That email address is already in use.' }, 409);
      }
      const email = providedEmail || target.email || '';
      if (!email) return json({ error: 'Add an email address before sending the invitation.' }, 400);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: target.id },
        data: {
          email,
          inviteTokenHash: createHash('sha256').update(token).digest('hex'),
          inviteExpiresAt: expiresAt,
        },
      });
      const mail = await sendInvitationEmail({
        to: email, displayName: target.displayName, username: target.username, token,
        roleLabel: ROLE_LABELS[target.role as keyof typeof ROLE_LABELS] ?? target.role,
        invitedBy: user.displayName,
      });
      await prisma.auditEvent.create({
        data: {
          action: 'User invitation resent', record: `${target.displayName} · ${target.role}`,
          actor: user.displayName, campusId: null, when: nowLabel(), ref: target.username,
        },
      });
      return json({
        invitationToken: token, expiresAt, email,
        invitationLink: invitationLink(target.username, token),
        emailSent: mail.sent, emailError: mail.error,
      });
    }

    if (route === '/mail/status' && method === 'GET') {
      if (!can(user, 'users')) return deny();
      return json({
        configured: mailerConfigured(),
        address: mailerAddress(),
        appUrl: process.env.APP_URL || 'http://localhost:3000',
      });
    }

    if (route === '/mail/test' && method === 'POST') {
      if (!can(user, 'users')) return deny();
      const input = await readJson(request);
      const to = cleanString(input.to, 160).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'Enter a valid email address.' }, 400);
      const result = await sendTestEmail(to);
      if (!result.sent) return json({ error: result.error || 'The test email could not be sent.' }, 502);
      return json({ ok: true });
    }

    if (route === '/summary' && method === 'GET') {
      if (!can(user, 'summary')) return deny();
      const all = await prisma.person.findMany({ orderBy: { updatedAt: 'desc' } });
      const visibleStudents = all.filter((row) => row.recordType === 'Student' && can(user, 'readStudents', row.campusId));
      const visibleStaff = all.filter((row) => row.recordType === 'Staff' && can(user, 'readStaff', row.campusId));
      const imgbiCount = [...visibleStudents, ...visibleStaff].filter((row) => row.campusId === 'imgbi').length;
      const sampouCount = [...visibleStudents, ...visibleStaff].filter((row) => row.campusId === 'sampou').length;
      const total = imgbiCount + sampouCount;
      const [documents, pending] = await Promise.all([prisma.document.count(), prisma.reviewItem.count()]);
      return json({
        campuses: CAMPUSES,
        metrics: {
          students: visibleStudents.length,
          staff: visibleStaff.length,
          academicStaff: visibleStaff.filter((row) => row.staffCategory === 'Academic').length,
          nonAcademicStaff: visibleStaff.filter((row) => row.staffCategory === 'Non-academic').length,
          documents,
          pending,
        },
        distribution: [
          { campus: 'imgbi', records: imgbiCount, share: total ? Math.round((imgbiCount / total) * 100) : 0 },
          { campus: 'sampou', records: sampouCount, share: total ? Math.round((sampouCount / total) * 100) : 0 },
        ],
        recent: [...visibleStudents.slice(0, 2), ...visibleStaff.slice(0, 2)].map((row) => personToApi(row)),
      });
    }

    if (route === '/search' && method === 'GET') {
      const query = (new URL(request.url).searchParams.get('q') || '').trim();
      const term = query.toLowerCase();
      if (!term) {
        return json({
          query: '', people: [], documents: [], review: [], audit: [], users: [],
          totals: { people: 0, documents: 0, review: 0, audit: 0, users: 0 },
        });
      }

      let people: unknown[] = [];
      let documents: unknown[] = [];
      let review: unknown[] = [];
      let audit: unknown[] = [];
      let users: unknown[] = [];

      const peopleRows = (await prisma.person.findMany())
        .filter((row) => can(user, row.recordType === 'Student' ? 'readStudents' : 'readStaff', row.campusId))
        .map((row) => personToApi(row))
        .filter((row) => JSON.stringify(row).toLowerCase().includes(term))
        .slice(0, 8);
      people = peopleRows.map((row) => ({
        id: row.id, name: `${row.first} ${row.last}`, recordId: row.recordId, bims: row.bims,
        kind: row.kind, recordType: row.recordType, campus: row.campus, status: row.status,
        email: row.email, completeness: row.completeness,
      }));

      if (can(user, 'readStudentDocuments') || can(user, 'readStaffDocuments')) {
        const docs = await prisma.document.findMany({ include: { person: true }, orderBy: { createdAt: 'desc' } });
        documents = docs
          .filter((doc) => {
            if (!doc.person) return false;
            const cap: Capability = doc.person.recordType === 'Student' ? 'readStudentDocuments' : 'readStaffDocuments';
            if (!can(user, cap, doc.person.campusId)) return false;
            if (doc.classification === 'HR only' && !can(user, 'readStaffDocuments', doc.person.campusId)) return false;
            return true;
          })
          .map((doc) => documentToApi(doc))
          .filter((row) => JSON.stringify(row).toLowerCase().includes(term))
          .slice(0, 8)
          .map((row) => ({
            id: row.id, title: row.title, filename: row.filename, person: row.person,
            recordId: row.recordId, campus: row.campus, classification: row.classification,
            type: row.type, size: row.size, added: row.added,
          }));
      }

      if (can(user, 'reviewStudents') || can(user, 'reviewStaff')) {
        const items = await prisma.reviewItem.findMany({ include: { person: true }, orderBy: { createdAt: 'desc' } });
        review = items
          .filter((item) => {
            const isStudent = item.person ? item.person.recordType === 'Student' : item.group === 'Student';
            return can(user, isStudent ? 'reviewStudents' : 'reviewStaff', item.campusId);
          })
          .map((item) => ({
            id: item.id, name: item.name, recordId: item.recordId, group: item.group, issue: item.issue,
            campus: item.campusId, submitted: item.submitted, priority: item.priority, personId: item.personId,
          }))
          .filter((row) => JSON.stringify(row).toLowerCase().includes(term))
          .slice(0, 8);
      }

      if (can(user, 'audit')) {
        const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
        audit = events
          .filter((row) => can(user, 'audit', row.campusId))
          .map((row) => ({
            id: row.id, action: row.action, record: row.record, actor: row.actor,
            campus: row.campusId ?? '', when: row.when, ref: row.ref ?? '',
          }))
          .filter((row) => JSON.stringify(row).toLowerCase().includes(term))
          .slice(0, 8);
      }

      if (can(user, 'users')) {
        const accounts = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
        users = accounts
          .map((row) => ({
            id: row.id, username: row.username, email: row.email ?? '', displayName: row.displayName,
            role: row.role, campuses: parseCampuses(row.campuses), active: row.active,
          }))
          .filter((row) => JSON.stringify(row).toLowerCase().includes(term))
          .slice(0, 8);
      }

      return json({
        query,
        people,
        documents,
        review,
        audit,
        users,
        totals: {
          people: people.length,
          documents: documents.length,
          review: review.length,
          audit: audit.length,
          users: users.length,
        },
      });
    }

    if (route === '/students' && method === 'GET') {
      if (!can(user, 'readStudents')) return deny();
      const params = new URL(request.url).searchParams;
      const rows = (await prisma.person.findMany({ where: { recordType: 'Student' } }))
        .filter((row) => can(user, 'readStudents', row.campusId))
        .map((row) => personToApi(row));
      return json(filterRows(rows, params));
    }

    if (route === '/staff' && method === 'GET') {
      if (!can(user, 'readStaff')) return deny();
      const params = new URL(request.url).searchParams;
      const rows = (await prisma.person.findMany({ where: { recordType: 'Staff' } }))
        .filter((row) => can(user, 'readStaff', row.campusId))
        .map((row) => personToApi(row));
      return json(filterRows(rows, params));
    }

    if (route === '/documents' && method === 'GET') {
      if (!can(user, 'readStudentDocuments') && !can(user, 'readStaffDocuments')) return deny();
      const params = new URL(request.url).searchParams;
      const rows = await prisma.document.findMany({ include: { person: true }, orderBy: { createdAt: 'desc' } });
      const allowed = rows.filter((doc) => {
        const person = doc.person;
        if (!person) return false;
        const cap: Capability = person.recordType === 'Student' ? 'readStudentDocuments' : 'readStaffDocuments';
        if (!can(user, cap, person.campusId)) return false;
        if (doc.classification === 'HR only' && !can(user, 'readStaffDocuments', person.campusId)) return false;
        return true;
      });
      const mapped = allowed.map((doc) => {
        const api = documentToApi(doc);
        const { storageKey: _storageKey, mimeType: _mimeType, ...rest } = api;
        return rest;
      });
      return json(filterRows(mapped, params));
    }

    if (route === '/review' && method === 'GET') {
      if (!can(user, 'reviewStudents') && !can(user, 'reviewStaff')) return deny();
      const params = new URL(request.url).searchParams;
      const rows = await prisma.reviewItem.findMany({ include: { person: true }, orderBy: { createdAt: 'desc' } });
      const allowed = rows
        .filter((item) => {
          const isStudent = item.person ? item.person.recordType === 'Student' : item.group === 'Student';
          return can(user, isStudent ? 'reviewStudents' : 'reviewStaff', item.campusId);
        })
        .map((item) => ({
          id: item.id, name: item.name, recordId: item.recordId, bims: item.person?.bimsNumber ?? '',
          group: item.group, issue: item.issue, campus: item.campusId, submitted: item.submitted, priority: item.priority,
          personId: item.personId,
        }));
      return json(filterRows(allowed, params));
    }

    if (route === '/audit' && method === 'GET') {
      if (!can(user, 'audit')) return deny();
      const params = new URL(request.url).searchParams;
      const rows = (await prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }))
        .filter((row) => can(user, 'audit', row.campusId))
        .map((row) => ({
          id: row.id, action: row.action, record: row.record, actor: row.actor,
          campus: row.campusId ?? '', when: row.when, ref: row.ref ?? '',
        }));
      return json(filterRows(rows, params));
    }

    if (route === '/import/template' && method === 'GET') {
      const params = new URL(request.url).searchParams;
      const category = params.get('category');
      if (!['student', 'staff'].includes(category || '') || !can(user, category === 'student' ? 'writeStudents' : 'writeStaff')) return deny();
      const csv = category === 'student'
        ? 'first,last,middleName,preferredName,recordId,bims,campus,email,phone,dateOfBirth,gender,nationality,address,city,lga,state,emergencyContact,nextOfKin,guardianName,guardianRelationship,guardianPhone,guardianEmail,programme,faculty,programmeLevel,level,session,entryRoute,admissionDate,enrollmentStatus,previousInstitution,priorQualification,priorYearCompleted\n' +
          'John,Doe,,Johnny,UG/24/0001,BIMS25260NO74247,imgbi,john.doe@example.com,+2348012345678,2000-01-15,Male,Nigerian,123 Main St,Yenagoa,Yenagoa LGA,Bayelsa,+2348098765432,Jane Doe,Mother,+2348087654321,jane.doe@example.com,MBBS,Medicine,Undergraduate,100,2024/2025,UTME,2024-09-01,Enrolled,,,\n' +
          'Jane,Smith,,Janet,202610012345AB,BIMS25260NO74248,sampou,jane.smith@example.com,+2348023456789,1999-05-20,Female,Nigerian,456 Oak Ave,Sampou,Kolokuma/Opokuma LGA,Bayelsa,+2348076543210,John Smith,Father,+2348065432109,john.smith@example.com,BSc Nursing,Nursing,Undergraduate,200,2024/2025,Direct Entry,2024-09-01,Enrolled,University of Lagos,BSc,2023\n'
        : 'first,last,middleName,preferredName,recordId,bims,campus,email,phone,dateOfBirth,gender,nationality,address,city,lga,state,emergencyContact,nextOfKin,guardianName,guardianRelationship,guardianPhone,guardianEmail,kind,department,appointment,appointmentType,employmentType,salaryGrade,appointmentDate,employmentStatus,gradeLevel,highestQualification,qualificationField,qualificationInstitution,qualificationYear,professionalBody,professionalBodies,professionalRegistration,supervisor\n' +
          'Adebayo,Akin,,Bayo,BMU/PFN/REG/001,BIMS25260NO74249,imgbi,adebayo.akin@bmu.edu.ng,+2348034567890,1985-03-10,Male,Nigerian,789 University Rd,Yenagoa,Yenagoa LGA,Bayelsa,+2348054321098,Mrs Akin,Wife,+2348043210987,mrs.akin@example.com,Academic,Medicine,Senior Lecturer,Tenured,Full-time,GL-12,2020-01-15,Active,Professor,PhD,Medicine,BMU,2020,Medical Council of Nigeria,"NMC, GMC",NMC-12345,Prof. Johnson\n' +
          'Chioma,Okafor,,Chi,BMU/PFN/REG/002,BIMS25260NO74250,sampou,chioma.okafor@bmu.edu.ng,+2348045678901,1990-07-25,Female,Nigerian,321 College Ave,Sampou,Kolokuma/Opokuma LGA,Bayelsa,+2348067890123,Mr Okafor,Husband,+2348078901234,mr.okafor@example.com,Non-academic,Administration,Administrative Officer,Permanent,Full-time,GL-08,2019-06-01,Active,Bachelor,BSc,Public Administration,University of Port Harcourt,2018,,,\n';
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="bmu-${category}-template.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (route === '/import/preview' && method === 'POST') {
      const input = await readJson(request);
      const category = cleanString(input.category, 20);
      if (!['student', 'staff'].includes(category)) return json({ error: 'Choose student or staff import.' }, 400);
      if (!can(user, category === 'student' ? 'writeStudents' : 'writeStaff')) return deny();
      let rows: Array<Record<string, unknown> & { __row: number }>;
      try {
        if (typeof input.csv !== 'string' || Buffer.byteLength(input.csv) > 1_000_000) throw new Error('CSV must be no larger than 1 MB.');
        rows = csvToRecords(input.csv);
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
      if (rows.length > 500) return json({ error: 'A CSV can contain at most 500 records per import.' }, 413);
      const existing = await peopleLite();
      const accepted: NormalizedPerson[] = [];
      const results = rows.map((row) => {
        const check = makePerson(row, category, existing, accepted);
        if (!can(user, category === 'student' ? 'writeStudents' : 'writeStaff', check.normalized.campus)) check.errors.push('You do not have permission for this campus.');
        if (!check.errors.length) accepted.push(check.normalized);
        const { __row, ...data } = row;
        return { row: __row, valid: !check.errors.length, errors: check.errors, recordId: check.normalized.recordId, data };
      });
      return json({ category, total: rows.length, valid: results.filter((row) => row.valid).length, invalid: results.filter((row) => !row.valid).length, rows: results });
    }

    if (route === '/import/commit' && method === 'POST') {
      const input = await readJson(request);
      const category = cleanString(input.category, 20);
      if (!['student', 'staff'].includes(category) || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 500) {
        return json({ error: 'Provide 1–500 validated rows and a valid record type.' }, 400);
      }
      if (!can(user, category === 'student' ? 'writeStudents' : 'writeStaff')) return deny();
      const existing = await peopleLite();
      const prepared: NormalizedPerson[] = [];
      const results = (input.rows as Record<string, unknown>[]).map((row, index) => {
        const check = makePerson(row, category, existing, prepared);
        if (!can(user, category === 'student' ? 'writeStudents' : 'writeStaff', check.normalized.campus)) check.errors.push('You do not have permission for this campus.');
        if (!check.errors.length) prepared.push(check.normalized);
        return { row: index + 2, errors: check.errors };
      });
      if (results.some((row) => row.errors.length)) {
        return json({ error: 'No records were imported because validation failed. Review the rows and retry.', rows: results.filter((row) => row.errors.length) }, 409);
      }
      const photo = validatePhoto(input.photo);
      let imported = 0;
      for (const data of prepared) {
        const created = await prisma.person.create({
          data: {
            ...personCreateData(data, category, category === 'student' ? 'Needs review' : 'Review due', [`Record imported · ${user.displayName} · ${nowLabel()}`]),
            photo: photo ?? null,
          },
        });
        await prisma.reviewItem.create({
          data: {
            personId: created.id, name: `${created.firstName} ${created.lastName}`, recordId: created.universityId,
            group: category === 'student' ? 'Student' : `${created.staffCategory ?? 'Staff'} staff`,
            issue: 'Bulk imported record awaiting verification', campusId: created.campusId, submitted: nowLabel(), priority: 'Normal',
          },
        });
        await auditEvent('Record imported', created, user.displayName);
        imported += 1;
      }
      await notify({
        roles: ['system-admin', category === 'student' ? 'registry-officer' : 'hr-officer'],
        title: 'Bulk import completed', message: `${imported} ${category} records were imported and queued for review.`,
      });
      return json({ imported }, 201);
    }

    if (route === '/people/bulk' && method === 'POST') {
      const input = await readJson(request);
      const ids = Array.isArray(input.ids) ? input.ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
      const action = cleanString(input.action, 20);
      if (!ids.length) return json({ error: 'Select at least one record.' }, 400);
      if (!['status', 'delete'].includes(action)) return json({ error: 'Bulk action must be status or delete.' }, 400);
      const targets = (await Promise.all(ids.map((id) => findPerson(id)))).filter((row): row is Person & { documents: Document[] } => Boolean(row));
      if (!targets.length) return json({ error: 'No matching records found.' }, 404);
      for (const person of targets) {
        const cap: Capability = person.recordType === 'Student' ? 'writeStudents' : 'writeStaff';
        if (!can(user, cap, person.campusId)) return deny();
      }
      if (action === 'status') {
        const status = cleanString(input.status, 40);
        for (const person of targets) {
          if (!validStatus(person.recordType === 'Student' ? 'student' : 'staff', status)) {
            return json({ error: `Invalid status for ${person.recordType}.` }, 400);
          }
        }
        for (const person of targets) {
          const history = parseJsonArray<string>(person.history);
          history.unshift(`Status set to ${status} · ${user.displayName} · ${nowLabel()}`);
          await prisma.person.update({ where: { id: person.id }, data: { status, history: JSON.stringify(history) } });
          await auditEvent('Status updated', person, user.displayName);
        }
        return json({ updated: targets.length });
      }
      const storageKeys: string[] = [];
      for (const person of targets) {
        for (const doc of person.documents) {
          if (doc.storageKey) storageKeys.push(doc.storageKey);
        }
      }
      await prisma.$transaction(async (tx) => {
        for (const person of targets) {
          await tx.person.delete({ where: { id: person.id } });
        }
      });
      for (const key of storageKeys) {
        await rm(path.join(STORAGE_DIR, key), { force: true }).catch(() => {});
      }
      for (const person of targets) {
        await auditEvent('Record deleted', person, user.displayName);
      }
      return json({ deleted: targets.length });
    }

    const fileMatch = route.match(/^\/documents\/([\w-]+)\/file$/);
    if (fileMatch && method === 'GET') {
      const doc = await prisma.document.findUnique({ where: { id: fileMatch[1] }, include: { person: true } });
      if (!doc?.storageKey) return json({ error: 'Document file not found.' }, 404);
      if (!doc.person) return json({ error: 'Record not found.' }, 404);
      const cap: Capability = doc.person.recordType === 'Student' ? 'readStudentDocuments' : 'readStaffDocuments';
      if (!can(user, cap, doc.person.campusId) || (doc.classification === 'HR only' && !can(user, 'readStaffDocuments', doc.person.campusId))) return deny();
      const inline = new URL(request.url).searchParams.get('view') === '1';
      const viewable = ['application/pdf', 'image/png', 'image/jpeg'].includes(doc.mimeType);
      const disposition = inline && viewable ? 'inline' : 'attachment';
      try {
        const bytes = await readFile(path.join(STORAGE_DIR, doc.storageKey));
        return new Response(new Uint8Array(bytes), {
          status: 200,
          headers: {
            'Content-Type': doc.mimeType,
            'Content-Disposition': `${disposition}; filename="${safeFileName(doc.filename)}"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
          },
        });
      } catch {
        return json({ error: 'Document file not found.' }, 404);
      }
    }

    const uploadMatch = route.match(/^\/people\/([\w-]+)\/documents$/);
    if (uploadMatch && method === 'POST') {
      const person = await findPerson(uploadMatch[1]);
      if (!person) return json({ error: 'Person record not found.' }, 404);
      const cap: Capability = person.recordType === 'Student' ? 'writeStudentDocuments' : 'writeStaffDocuments';
      if (!can(user, cap, person.campusId)) return deny();
      const input = await readJson(request, 14_000_000);
      const filename = safeFileName(input.filename);
      const bytes = Buffer.from(String(input.data || ''), 'base64');
      const requestedTitle = cleanString(input.title, 140);
      const title = !requestedTitle || requestedTitle === 'Other'
        ? extractDocumentTitle(filename, bytes)
        : requestedTitle;
      const classification = cleanString(input.classification, 30);
      if (!filename || !title || !['Internal', 'Restricted', 'HR only'].includes(classification) || !bytes.length || bytes.length > 10 * 1024 * 1024) {
        return json({ error: 'Provide a title and supported file no larger than 10 MB.' }, 400);
      }
      if (classification === 'HR only' && (person.recordType === 'Student' || !can(user, 'writeStaffDocuments', person.campusId))) return deny();
      const kind = fileKind(filename, bytes);
      if (!kind) return json({ error: 'File signature or format is not supported.' }, 415);
      await ensureDirs();
      const id = `doc-${randomBytes(8).toString('hex')}`;
      const key = `${id}.${kind.type.toLowerCase()}`;
      const quarantinePath = path.join(QUARANTINE_DIR, key);
      await writeFile(quarantinePath, bytes, { flag: 'wx' });
      let scan: ScanResult;
      try {
        scan = await scanFile(quarantinePath);
      } catch (error) {
        await rm(quarantinePath, { force: true });
        await prisma.auditEvent.create({
          data: {
            action: 'Document scan failed', record: `Upload for ${person.universityId}`, actor: user.displayName,
            campusId: person.campusId, when: nowLabel(), ref: person.universityId,
          },
        });
        throw error;
      }
      await rename(quarantinePath, path.join(STORAGE_DIR, key));
      const doc = await prisma.document.create({
        data: {
          id, personId: person.id, title, filename, classification, type: kind.type, mimeType: kind.mime,
          size: `${Math.ceil(bytes.length / 1024)} KB`, sizeBytes: bytes.length, storageKey: key,
          scanStatus: scan.status, scanner: scan.scanner, scannedAt: nowLabel(),
          expiryDate: cleanString(input.expiryDate, 20) || null, added: nowLabel(),
        },
        include: { person: true },
      });
      const history = parseJsonArray<string>(person.history);
      history.unshift(`Document added · ${user.displayName} · ${nowLabel()}`);
      await prisma.person.update({ where: { id: person.id }, data: { history: JSON.stringify(history) } });
      await auditEvent(scan.status === 'Clean' ? 'Document added' : 'Document added without malware scan', person, user.displayName);
      return json(documentToApi(doc), 201);
    }

    const detailMatch = route.match(/^\/people\/([\w-]+)$/);
    if (detailMatch) {
      const person = await findPerson(detailMatch[1]);
      if (!person) return json({ error: 'Record not found.' }, 404);
      const readCap: Capability = person.recordType === 'Student' ? 'readStudents' : 'readStaff';
      if (method === 'GET') {
        if (!can(user, readCap, person.campusId)) return deny();
        const docCap: Capability = person.recordType === 'Student' ? 'readStudentDocuments' : 'readStaffDocuments';
        const view = personToApi({ ...person, documents: can(user, docCap, person.campusId) ? person.documents : [] });
        return json(view);
      }
      if (method === 'PATCH') {
        const writeCap: Capability = person.recordType === 'Student' ? 'writeStudents' : 'writeStaff';
        if (!can(user, writeCap, person.campusId)) return deny();
        const input = await readJson(request);
        if (input.campus && !can(user, writeCap, normalizeCampus(input.campus))) return deny();
        const category = person.recordType === 'Student' ? 'student' : 'staff';
        const self: PersonLite = personLiteFromDb(person);
        const existing = await peopleLite();
        const check = makePerson({ ...personToApi(person), ...input }, category, existing, [], self);
        if (check.errors.length) return json({ error: check.errors.join(' ') }, 400);
        const photo = validatePhoto(input.photo);
        const data: Record<string, unknown> = personUpdateData(check.normalized, category);
        if (photo !== undefined) data.photo = photo;
        if ('status' in input) {
          if (!validStatus(category, String(input.status))) return json({ error: 'Invalid status for this record type.' }, 400);
          data.status = cleanString(input.status, 40);
        }
        const history = parseJsonArray<string>(person.history);
        history.unshift(`Profile updated · ${user.displayName} · ${nowLabel()}`);
        data.history = JSON.stringify(history);
        const updated = await prisma.person.update({ where: { id: person.id }, data, include: { documents: true } });
        await auditEvent('Profile updated', updated, user.displayName);
        return json(personToApi(updated));
      }
      if (method === 'DELETE') {
        const writeCap: Capability = person.recordType === 'Student' ? 'writeStudents' : 'writeStaff';
        if (!can(user, writeCap, person.campusId)) return deny();
        const storageKeys = person.documents.map((doc) => doc.storageKey).filter((key): key is string => Boolean(key));
        await prisma.$transaction(async (tx) => {
          await tx.person.delete({ where: { id: person.id } });
        });
        for (const key of storageKeys) {
          await rm(path.join(STORAGE_DIR, key), { force: true }).catch(() => {});
        }
        await auditEvent('Record deleted', person, user.displayName);
        return json({ ok: true });
      }
      return json({ error: 'Use GET, PATCH, or DELETE.' }, 405);
    }

    if (route === '/people' && method === 'GET') {
      const q = (new URL(request.url).searchParams.get('q') || '').toLowerCase();
      const all = await prisma.person.findMany();
      const rows = all
        .filter((row) => can(user, row.recordType === 'Student' ? 'readStudents' : 'readStaff', row.campusId))
        .map((row) => personToApi(row))
        .filter((row) => JSON.stringify(row).toLowerCase().includes(q));
      return json(rows);
    }

    if (route === '/people' && method === 'POST') {
      const input = await readJson(request);
      const category = cleanString(input.category, 20);
      const existing = await peopleLite();
      const check = makePerson(input, category, existing);
      if (check.errors.length) return json({ error: check.errors.join(' ') }, 400);
      if (!can(user, category === 'student' ? 'writeStudents' : 'writeStaff', check.normalized.campus)) return deny();
      const created = await prisma.person.create({
        data: {
          ...personCreateData(check.normalized, category, category === 'student' ? 'Needs review' : 'Review due', [`Record created · ${user.displayName} · ${nowLabel()}`]),
          photo: validatePhoto(input.photo) ?? null,
        },
        include: { documents: true },
      });
      await prisma.reviewItem.create({
        data: {
          personId: created.id, name: `${created.firstName} ${created.lastName}`, recordId: created.universityId,
          group: created.recordType === 'Student' ? 'Student' : `${created.staffCategory ?? 'Staff'} staff`,
          issue: 'New record awaiting verification', campusId: created.campusId, submitted: nowLabel(), priority: 'Normal',
        },
      });
      await auditEvent('Record created', created, user.displayName);
      await notify({
        roles: ['system-admin', category === 'student' ? 'registry-officer' : 'hr-officer'],
        campusId: created.campusId, title: 'Record created',
        message: `A new ${category} record for ${created.firstName} ${created.lastName} is awaiting verification.`,
      });
      return json(personToApi(created), 201);
    }

    if (route === '/people/check-duplicates' && method === 'POST') {
      const input = await readJson(request);
      const existing = await peopleLite();
      const excludeId = cleanString(input.excludeId, 60);
      const self = excludeId ? existing.find((row) => row.id === excludeId) ?? null : null;
      return json({ duplicates: findDuplicates(input, existing, self) });
    }

    const reviewMatch = route.match(/^\/review\/([\w-]+)$/);
    if (reviewMatch && method === 'PATCH') {
      const input = await readJson(request);
      const item = await prisma.reviewItem.findUnique({ where: { id: reviewMatch[1] }, include: { person: true } });
      if (!item) return json({ error: 'Review item not found.' }, 404);
      const isStudent = item.person ? item.person.recordType === 'Student' : item.group === 'Student';
      if (!can(user, isStudent ? 'reviewStudents' : 'reviewStaff', item.campusId)) return deny();
      const action = cleanString(input.action, 20);
      if (!['approve', 'request-changes'].includes(action)) return json({ error: 'Action must be approve or request-changes.' }, 400);
      if (item.person) {
        const person = item.person;
        const status = action === 'approve' ? 'Verified' : 'Needs review';
        const history = parseJsonArray<string>(person.history);
        history.unshift(`${action === 'approve' ? 'Record verified' : 'Changes requested'} · ${user.displayName} · ${nowLabel()}`);
        const updated = await prisma.person.update({ where: { id: person.id }, data: { status, history: JSON.stringify(history) } });
        await auditEvent(action === 'approve' ? 'Verified' : 'Changes requested', updated, user.displayName);
        await notify({
          roles: ['system-admin', isStudent ? 'registry-officer' : 'hr-officer'],
          campusId: item.campusId, title: 'Review completed',
          message: `Review for ${person.firstName} ${person.lastName} was updated.`,
        });
      }
      await prisma.reviewItem.delete({ where: { id: item.id } });
      return json({ ok: true, item });
    }

    if (route === '/academic-sessions' && method === 'GET') {
      if (!can(user, 'summary')) return deny();
      const rows = await prisma.academicSession.findMany({ orderBy: { createdAt: 'desc' } });
      return json(rows.map((row) => ({
        id: row.id, name: row.name, startDate: row.startDate ?? '', endDate: row.endDate ?? '',
        isCurrent: row.isCurrent, createdAt: row.createdAt, updatedAt: row.updatedAt,
      })));
    }

    if (route === '/academic-sessions' && method === 'POST') {
      if (!can(user, 'users')) return deny();
      const input = await readJson(request);
      const name = cleanString(input.name, 60);
      const startDate = cleanString(input.startDate, 20);
      const endDate = cleanString(input.endDate, 20);
      const isCurrent = Boolean(input.isCurrent);
      if (!name) return json({ error: 'Session name is required.' }, 400);
      const existing = await prisma.academicSession.findUnique({ where: { name } });
      if (existing) return json({ error: 'A session with that name already exists.' }, 409);
      if (isCurrent) {
        await prisma.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      }
      const created = await prisma.academicSession.create({
        data: { name, startDate: startDate || null, endDate: endDate || null, isCurrent },
      });
      await prisma.auditEvent.create({
        data: {
          action: 'Academic session created', record: name, actor: user.displayName,
          campusId: null, when: nowLabel(), ref: name,
        },
      });
      return json({
        id: created.id, name: created.name, startDate: created.startDate ?? '', endDate: created.endDate ?? '',
        isCurrent: created.isCurrent, createdAt: created.createdAt, updatedAt: created.updatedAt,
      }, 201);
    }

    const sessionMatch = route.match(/^\/academic-sessions\/([\w-]+)$/);
    if (sessionMatch && method === 'PATCH') {
      if (!can(user, 'users')) return deny();
      const target = await prisma.academicSession.findUnique({ where: { id: sessionMatch[1] } });
      if (!target) return json({ error: 'Session not found.' }, 404);
      const input = await readJson(request);
      const data: Record<string, unknown> = {};
      if (typeof input.name === 'string') {
        const name = cleanString(input.name, 60);
        if (!name) return json({ error: 'Session name is required.' }, 400);
        const clash = await prisma.academicSession.findFirst({ where: { name, NOT: { id: target.id } } });
        if (clash) return json({ error: 'A session with that name already exists.' }, 409);
        data.name = name;
      }
      if (typeof input.startDate === 'string') data.startDate = cleanString(input.startDate, 20) || null;
      if (typeof input.endDate === 'string') data.endDate = cleanString(input.endDate, 20) || null;
      if (typeof input.isCurrent === 'boolean') {
        if (input.isCurrent) {
          await prisma.academicSession.updateMany({ where: { isCurrent: true, NOT: { id: target.id } }, data: { isCurrent: false } });
        }
        data.isCurrent = input.isCurrent;
      }
      const updated = await prisma.academicSession.update({ where: { id: target.id }, data });
      await prisma.auditEvent.create({
        data: {
          action: 'Academic session updated', record: updated.name, actor: user.displayName,
          campusId: null, when: nowLabel(), ref: updated.name,
        },
      });
      return json({
        id: updated.id, name: updated.name, startDate: updated.startDate ?? '', endDate: updated.endDate ?? '',
        isCurrent: updated.isCurrent, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
      });
    }

    if (sessionMatch && method === 'DELETE') {
      if (!can(user, 'users')) return deny();
      const target = await prisma.academicSession.findUnique({ where: { id: sessionMatch[1] } });
      if (!target) return json({ error: 'Session not found.' }, 404);
      await prisma.academicSession.delete({ where: { id: target.id } });
      await prisma.auditEvent.create({
        data: {
          action: 'Academic session deleted', record: target.name, actor: user.displayName,
          campusId: null, when: nowLabel(), ref: target.name,
        },
      });
      return json({ ok: true });
    }

    if (route === '/export' && method === 'GET') {
      if (!can(user, 'users') && !can(user, 'audit')) return deny();
      const [students, staff, documents, reviewItems, audit, users, notifications] = await Promise.all([
        prisma.person.findMany({ where: { recordType: 'Student' } }),
        prisma.person.findMany({ where: { recordType: 'Staff' } }),
        prisma.document.findMany(),
        prisma.reviewItem.findMany(),
        prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.user.findMany(),
        prisma.notification.findMany({ orderBy: { createdAt: 'desc' } }),
      ]);
      const body = {
        students: students.map((row) => personToApi(row)),
        staff: staff.map((row) => personToApi(row)),
        documents: documents.map((doc) => documentToApi(doc)),
        reviewItems,
        audit,
        users: users.map((row) => ({
          id: row.id, username: row.username, displayName: row.displayName, role: row.role,
          campuses: parseCampuses(row.campuses), active: row.active, createdAt: row.createdAt,
        })),
        notifications,
      };
      return new Response(JSON.stringify(body, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="bmu-registry-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return json({ error: 'No such endpoint.' }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('BMU API request error:', (error as Error).message);
    return json({ error: 'The request could not be completed.' }, 500);
  }
}
