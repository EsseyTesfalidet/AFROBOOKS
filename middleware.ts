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
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js internals, API routes, and static files pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('__session')?.value;

  const isAuthed = !!sessionCookie;

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
