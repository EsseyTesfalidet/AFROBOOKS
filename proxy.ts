import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PAYOUT_SETUP_PATH, payoutReturnPath, publicReturnPath } from '@/lib/utils/loginDestination';

const BUYER_PATHS = [
  '/checkout', '/library', '/profile', '/notifications', '/watch',
];
const SELLER_PATHS = ['/dashboard', '/publish', '/listings', '/analytics', '/earnings', '/seller', '/promotions', '/video-studio'];
const ADMIN_PATHS = ['/admin'];
const AUTH_PATHS = ['/login', '/signup'];

function pathStartsWith(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/__') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('__session')?.value;
  const fallbackUidCookie = request.cookies.get('ab_uid')?.value;
  const roleCookie = request.cookies.get('ab_role')?.value ?? 'buyer';
  const isAuthed = !!sessionCookie || !!fallbackUidCookie;
  const canAccessSeller = roleCookie === 'seller' || roleCookie === 'both' || roleCookie === 'admin';
  const canAccessAdmin = roleCookie === 'admin';

  if (pathStartsWith(pathname, AUTH_PATHS) && isAuthed) {
    const destination = publicReturnPath(request.nextUrl.searchParams.get('redirect')) ?? payoutReturnPath(request.nextUrl.searchParams.get('redirect'), roleCookie);
    return NextResponse.redirect(new URL(destination ?? '/browse', request.url));
  }

  if (
    (pathStartsWith(pathname, BUYER_PATHS) ||
      pathStartsWith(pathname, SELLER_PATHS) ||
      pathStartsWith(pathname, ADMIN_PATHS)) &&
    !isAuthed
  ) {
    const login = new URL('/login', request.url);
    if (pathname === '/dashboard' && request.nextUrl.searchParams.get('profile') === 'payout') {
      login.searchParams.set('redirect', PAYOUT_SETUP_PATH);
    }
    return NextResponse.redirect(login);
  }

  if (pathStartsWith(pathname, SELLER_PATHS) && !canAccessSeller) {
    return NextResponse.redirect(new URL('/browse', request.url));
  }

  if (pathStartsWith(pathname, ADMIN_PATHS) && !canAccessAdmin) {
    return NextResponse.redirect(new URL('/browse', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
