'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="page show">
      <EmptyState
        icon="!"
        title="Something went wrong"
        message="The workspace hit an unexpected error. Try again, or return to the home page if the problem continues."
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn primary" type="button" onClick={reset}>Try again</button>
            <Link className="btn" href="/home">Back to home</Link>
          </div>
        }
      />
    </section>
  );
}
