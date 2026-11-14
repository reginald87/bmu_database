import type { Metadata } from 'next';
import SearchClient from './search-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search · BMU Secure Database',
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  return <SearchClient initialQuery={params.q ?? ''} />;
}
