export const BUYER_PATHS = ['/checkout', '/library', '/profile', '/notifications', '/watch', '/listen'];
export const SELLER_PATHS = ['/dashboard', '/publish', '/listings', '/analytics', '/earnings', '/seller', '/promotions', '/video-studio', '/audio-studio'];
export const ADMIN_PATHS = ['/admin'];
export function pathStartsWith(path: string, prefixes: string[]) {
  return prefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

export function protectedPage(path: string) {
  return pathStartsWith(path, [...BUYER_PATHS, ...SELLER_PATHS, ...ADMIN_PATHS]);
}

export function accountPageAccess(path: string, uid: string | undefined, profile: { uid: string; role: string; status: string } | null) {
  if (!protectedPage(path)) return 'allow';
  if (!uid || !profile || profile.uid !== uid || ['suspended', 'banned'].includes(profile.status)) return 'login';
  if (pathStartsWith(path, ADMIN_PATHS) && profile.role !== 'admin') return 'denied';
  if (pathStartsWith(path, SELLER_PATHS) && !['seller', 'both', 'admin'].includes(profile.role)) return 'denied';
  return 'allow';
}
