import type { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export interface AuthenticatedRequestUser {
  uid: string;
  email: string | null;
  role: 'buyer' | 'seller' | 'both' | 'admin';
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

export async function requireRequestUser(
  request: NextRequest
): Promise<AuthenticatedRequestUser> {
  const adminAuth = await getAdminAuth();
  const adminDb = await getAdminDb();

  const bearerToken = getBearerToken(request);
  const sessionCookie = request.cookies.get('__session')?.value ?? null;

  if (!bearerToken && !sessionCookie) {
    throw new Error('Unauthorized');
  }

  let decodedToken: { uid: string; email?: string | null } | null = null;

  if (bearerToken) {
    decodedToken = await adminAuth.verifyIdToken(bearerToken);
  } else if (sessionCookie) {
    try {
      decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    } catch {
      decodedToken = await adminAuth.verifyIdToken(sessionCookie);
    }
  }

  if (!decodedToken) {
    throw new Error('Unauthorized');
  }

  const userSnap = await adminDb.collection('users').doc(decodedToken.uid).get();
  if (!userSnap.exists) {
    throw new Error('Unauthorized');
  }

  const userData = userSnap.data() as {
    role?: AuthenticatedRequestUser['role'];
    email?: string | null;
  };

  return {
    uid: decodedToken.uid,
    email: userData.email ?? decodedToken.email ?? null,
    role: userData.role ?? 'buyer',
  };
}
