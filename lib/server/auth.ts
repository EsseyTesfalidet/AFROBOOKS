import type { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isSameOriginMutation } from './requestOrigin';

export interface AuthenticatedRequestUser {
  uid: string;
  email: string | null;
  role: 'buyer' | 'seller' | 'both' | 'admin';
  status: 'active' | 'warned' | 'suspended' | 'banned';
  legalAgreement?: { termsVersion: string; privacyVersion: string; acceptedAt: number };
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

export async function requireRequestUser(
  request: NextRequest
): Promise<AuthenticatedRequestUser> {
  const bearerToken = getBearerToken(request);
  const sessionCookie = request.headers.get('x-afrobooks-account-mode') === 'tab'
    ? null : request.cookies.get('__session')?.value ?? null;

  if (!bearerToken && !sessionCookie) {
    throw new Error('Unauthorized');
  }

  if (!bearerToken && !isSameOriginMutation(request)) throw new Error('Unauthorized');
  const adminAuth = await getAdminAuth();
  const adminDb = await getAdminDb();

  let decodedToken: { uid: string; email?: string | null; firebase?: { sign_in_provider?: string } } | null = null;

  try {
    if (bearerToken) {
      decodedToken = await adminAuth.verifyIdToken(bearerToken, true);
    } else if (sessionCookie) {
      try {
        decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
      } catch {
        decodedToken = await adminAuth.verifyIdToken(sessionCookie, true);
      }
    }
  } catch {
    throw new Error('Unauthorized');
  }

  if (!decodedToken) {
    throw new Error('Unauthorized');
  }
  if (decodedToken.firebase?.sign_in_provider === 'phone') {
    throw new Error('Unauthorized');
  }

  const userSnap = await adminDb.collection('users').doc(decodedToken.uid).get();
  if (!userSnap.exists) {
    throw new Error('Unauthorized');
  }

  const userData = userSnap.data() as {
    role?: AuthenticatedRequestUser['role'];
    email?: string | null;
    status?: AuthenticatedRequestUser['status'];
    legalAgreement?: AuthenticatedRequestUser['legalAgreement'];
  };

  const status = userData.status ?? 'active';
  if (status === 'suspended' || status === 'banned') {
    throw new Error('Unauthorized');
  }

  return {
    uid: decodedToken.uid,
    email: userData.email ?? decodedToken.email ?? null,
    role: userData.role ?? 'buyer',
    status,
    legalAgreement: userData.legalAgreement,
  };
}
