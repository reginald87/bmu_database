import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getSessionUser();
  if (!auth) redirect('/login');

  return (
    <AppShell user={auth.user} csrfToken={auth.session.csrfToken}>
      {children}
    </AppShell>
  );
}
