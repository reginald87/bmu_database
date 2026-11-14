import { cookies } from 'next/headers';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Session, User } from '@prisma/client';
import { prisma } from './prisma';
import { parseCampuses, type SessionUser } from './roles';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'bmu_session';
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function sessionSecret(): string {
  return process.env.SESSION_SECRET || 'bmu-local-development-secret-change-me';
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, passwordHash: hash.toString('hex') };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const candidate = await hashPassword(password, salt);
  return safeEqual(candidate.passwordHash, expectedHash);
}

export function signSession(id: string): string {
  return createHmac('sha256', sessionSecret()).update(id).digest('base64url');
}

export function serializeUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role as SessionUser['role'],
    campuses: parseCampuses(user.campuses),
  };
}

export async function createSession(userId: string): Promise<{ id: string; csrfToken: string }> {
  const id = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: { id, userId, csrfToken, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, `${id}.${signSession(id)}`, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_LIFETIME_MS / 1000),
    secure: process.env.NODE_ENV === 'production',
  });
  return { id, csrfToken };
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    const [id] = raw.split('.');
    if (id) await prisma.session.deleteMany({ where: { id } });
  }
  store.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
}

export async function destroySessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export type AuthContext = { session: Session; user: SessionUser };

export async function getSessionUser(): Promise<AuthContext | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [id, signature] = raw.split('.');
  if (!id || !signature || !safeEqual(signature, signSession(id))) return null;

  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now() || !session.user.active) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  return { session, user: serializeUser(session.user) };
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function hasValidCsrf(request: Request, session: Session): boolean {
  const token = request.headers.get('x-csrf-token') || '';
  return Boolean(token) && safeEqual(token, session.csrfToken);
}
