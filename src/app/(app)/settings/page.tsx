import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import SettingsClient from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const auth = await getSessionUser();
  if (!auth) redirect('/login');
  if (!can(auth.user, 'users')) redirect('/account');
  return <SettingsClient />;
}
