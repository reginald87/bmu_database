import Link from 'next/link';
import { EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <section className="page show">
      <EmptyState
        icon="∅"
        title="Page not found"
        message="The page you are looking for does not exist, or your role may not have access to it."
        action={<Link className="btn primary" href="/home">Back to the workspace</Link>}
      />
    </section>
  );
}
