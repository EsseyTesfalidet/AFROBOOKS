import { isInstalledApp } from '@/lib/app/installed';

export function isPublicMobilePage(path: string) {
  return ['/login', '/signup', '/privacy', '/terms'].includes(path);
}

export function hasMobileAccount(state: {
  loading: boolean;
  firebaseUser: { uid: string } | null;
  userProfile: { uid: string; status: string } | null;
}) {
  return !state.loading && !!state.firebaseUser &&
    state.userProfile?.uid === state.firebaseUser.uid &&
    ['active', 'warned'].includes(state.userProfile.status);
}

// Only app screens are accepted; auth pages and external redirects cannot loop
// back into login. Hashes (including gift secrets) are never put in login URLs.
export function mobileReturnPath(value: string | null): string | null {
  if (!value || value.length > 2048 || /[\\\u0000-\u0020\u007f#]/.test(value)) return null;
  const path = value.split('?')[0];
  if (!/^\/(?:browse|discover|search|cart|checkout|library|book|read|sample|author|profile|notifications|community|subscription|gift|gifts|about-help|dashboard|publish|listings|analytics|earnings|seller|promotions|admin)(?:\/[A-Za-z0-9_-]+)*$/.test(path)) return null;
  return value;
}

export function mobileLoginHref(path: string, search = '') {
  const destination = mobileReturnPath(path + search);
  return destination ? `/login?appReturn=${encodeURIComponent(destination)}` : '/login';
}

export function mobileAuthDestination(search: string, fallback: string) {
  if (!isInstalledApp()) return fallback;
  return mobileReturnPath(new URLSearchParams(search).get('appReturn')) ?? fallback;
}

export function mobileAuthSwitchHref(path: '/login' | '/signup', search: string, fallback: string) {
  if (!isInstalledApp()) return fallback;
  const destination = mobileReturnPath(new URLSearchParams(search).get('appReturn'));
  return destination ? `${path}?appReturn=${encodeURIComponent(destination)}` : fallback;
}

export function saveMobileGiftToken(path: string, hash: string) {
  if (path !== '/gifts/claim') return;
  const token = new URLSearchParams(hash.slice(1)).get('token');
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    // Same private session key as the gift-claim screen. No network disclosure.
    try { sessionStorage.setItem('afrobooks-gift-token', token); } catch { /* Reopen the gift link after signing in. */ }
  }
}
