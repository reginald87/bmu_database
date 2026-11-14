import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function IndexPage() {
  const auth = await getSessionUser();
  redirect(auth ? '/home' : '/login');
}
