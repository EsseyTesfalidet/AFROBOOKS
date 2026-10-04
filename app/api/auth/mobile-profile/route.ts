import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isSameOriginMutation } from '@/lib/server/requestOrigin';
import { ensureMobileAuthProfile } from '@/lib/server/mobileAuthProfile';

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ') || bearer.length > 16400) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const auth = await getAdminAuth();
    const token = await auth.verifyIdToken(bearer.slice(7), true);
    if (!['phone', 'apple.com', 'google.com'].includes(token.firebase.sign_in_provider)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const identity = await auth.getUser(token.uid);
    return NextResponse.json(await ensureMobileAuthProfile(await getAdminDb(), identity));
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'ACCOUNT_SUSPENDED' || reason === 'ACCOUNT_NOT_AVAILABLE') {
      return NextResponse.json({ error: reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unable to finish sign-in. Please try again.' }, { status: 401 });
  }
}
