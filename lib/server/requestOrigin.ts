/** Reject cross-site browser mutations before using ambient session cookies. */
export function isSameOriginMutation(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  // Non-browser clients may omit Origin; browsers cannot spoof it.
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin && origin !== 'null';
  } catch {
    return false;
  }
}
