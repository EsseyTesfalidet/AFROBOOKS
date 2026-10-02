export const CONNECTION_RESTORED = 'afrobooks:connection-restored';
export const CONNECTION_FAILED = 'afrobooks:connection-failed';

// Never automatically replay a mutation: a lost response can hide a successful save/payment.
export async function appFetch(input: RequestInfo | URL, init: RequestInit = {}, timeout = 20000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (!init.signal?.aborted && typeof window !== 'undefined') window.dispatchEvent(new Event(CONNECTION_FAILED));
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
