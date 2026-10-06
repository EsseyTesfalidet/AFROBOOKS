import { isSeparateAccount } from '@/lib/auth/tabAccount';

export const CONNECTION_RESTORED = 'afrobooks:connection-restored';
export const CONNECTION_FAILED = 'afrobooks:connection-failed';

// A tab account must never fall back to another tab's server session cookie.
export function accountFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (isSeparateAccount()) {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('x-afrobooks-account-mode', 'tab');
      return fetch(input, { ...init, headers, credentials: 'omit' });
    }
  }
  return fetch(input, init);
}

// Never automatically replay a mutation: a lost response can hide a successful save/payment.
export async function appFetch(input: RequestInfo | URL, init: RequestInit = {}, timeout = 20000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    return await accountFetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (!init.signal?.aborted && typeof window !== 'undefined') window.dispatchEvent(new Event(CONNECTION_FAILED));
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
