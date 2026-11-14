import { handleApi } from '@/lib/api';

type RouteContext = { params: Promise<{ path: string[] }> };

async function dispatch(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return handleApi(request, path ?? []);
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
