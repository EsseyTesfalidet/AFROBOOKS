import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PAYOUT_SETUP_PATH, payoutReturnPath, publicReturnPath } from '@/lib/utils/loginDestination';
import { TAB_ACCOUNT_COOKIE } from '@/lib/auth/tabAccount';
import { BUYER_PATHS, SELLER_PATHS, ADMIN_PATHS, pathStartsWith } from '@/lib/auth/routeAccess';
const AUTH_PATHS = ['/login', '/signup'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cookies cannot identify which tab is navigating. Once separate accounts
  // are used, the client route gate reads that tab's Firebase identity instead.
  // This does not grant API or Firestore access.
  if (request.cookies.get(TAB_ACCOUNT_COOKIE)?.value === '1' ||
    (pathname === '/login' && request.nextUrl.searchParams.get('account') === 'separate')) {
    return NextResponse.next();
  }

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
