import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { isSameOriginMutation } from '@/lib/server/requestOrigin';
import { recoveryPhoneStatus } from '@/lib/server/recoveryPhone';

export const runtime = 'nodejs';
async function handle(request: NextRequest, sync: boolean) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (sync && !isSameOriginMutation(request)) return respond({ error: 'Invalid request origin' }, 403);
  try {
    const user = await requireRequestUser(request);
    if (sync) {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return respond({ error: 'No account or phone details should be supplied.' }, 400);
    }
    const auth = await getAdminAuth();
    return respond(await recoveryPhoneStatus(await getAdminDb(), await auth.getUser(user.uid), sync));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Unauthorized') return respond({ error: 'Sign in to manage your recovery phone.' }, 401);
    if (message === 'ACCOUNT_NOT_AVAILABLE') return respond({ error: message }, 403);
    if (message === 'PHONE_NOT_LINKED') return respond({ error: message }, 409);
    return respond({ error: 'Unable to refresh recovery phone details. Please try again.' }, 503);
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
