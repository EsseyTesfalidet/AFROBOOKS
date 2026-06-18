import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BUYER_PATHS = [
  '/browse', '/book', '/read', '/cart', '/checkout',
  '/library', '/discover', '/search', '/subscription',
];
const SELLER_PATHS = ['/dashboard', '/publish', '/listings', '/analytics'];
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
    return NextResponse.redirect(new URL('/browse', request.url));
  }

  if (
    (pathStartsWith(pathname, BUYER_PATHS) ||
      pathStartsWith(pathname, SELLER_PATHS) ||
      pathStartsWith(pathname, ADMIN_PATHS)) &&
    !isAuthed
  ) {
    return NextResponse.redirect(new URL('/login', request.url));
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
