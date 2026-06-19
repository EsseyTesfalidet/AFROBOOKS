import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const adminAuth = await getAdminAuth();
    const adminDb = await getAdminDb();

    const decoded = await adminAuth.verifyIdToken(idToken);
    await adminAuth.getUser(decoded.uid);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    }

    const userData = userSnap.data() as { role?: string; status?: string };
    if (userData.status === 'suspended' || userData.status === 'banned') {
      return NextResponse.json({ error: 'Account unavailable' }, { status: 403 });
    }

    const role = userData.role ?? 'buyer';

    const response = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === 'production';

    response.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    response.cookies.set('ab_uid', decoded.uid, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    response.cookies.set('ab_role', role, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });

    return response;
  } catch (error) {
    console.error('session create error:', error);
    return NextResponse.json({ error: 'Invalid session token' }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set('__session', '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
  response.cookies.set('ab_uid', '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
  response.cookies.set('ab_role', '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });

  return response;
}
