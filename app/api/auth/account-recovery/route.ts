import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isSameOriginMutation } from '@/lib/server/requestOrigin';
import { phoneRecoveryAccount } from '@/lib/server/accountRecovery';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
  if (!isSameOriginMutation(request)) return respond({ error: 'Invalid request origin' }, 403);
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ') || bearer.length > 16400) return respond({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    return respond({ error: 'No account details should be supplied.' }, 400);
  }
  try {
    const auth = await getAdminAuth();
    const token = await auth.verifyIdToken(bearer.slice(7), true);
    if (token.firebase.sign_in_provider !== 'phone') return respond({ error: 'Unauthorized' }, 403);
    const authTime = typeof token.auth_time === 'number' ? token.auth_time * 1000 : NaN;
    if (!Number.isFinite(authTime) || authTime > Date.now() + 60_000 || Date.now() - authTime > 5 * 60_000) {
      return respond({ error: 'Verify your recovery phone again.' }, 401);
    }
    const identity = await auth.getUser(token.uid);
    const result = await phoneRecoveryAccount(await getAdminDb(), identity);
    if (!result.account) return respond({ error: 'Recovery is not available for this number.', safeToDelete: result.safeToDelete }, 404);
    return respond(result.account);
  } catch {
    return respond({ error: 'Unable to verify this recovery request.' }, 401);
  }
}
