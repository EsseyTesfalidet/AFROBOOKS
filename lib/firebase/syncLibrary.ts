import { auth } from './config';
import { authenticatedPost } from './request';

// Concurrent views share recovery work. Never reuse one account's result for another.
type LibrarySyncResult = { pendingOrderIds: string[] };
const running = new Map<string, Promise<LibrarySyncResult>>();
export function syncPurchasedLibrary(userId: string, bookId?: string): Promise<LibrarySyncResult> {
  const key = JSON.stringify([userId, bookId ?? null]);
  const existing = running.get(key);
  if (existing) return existing;
  const task = (async () => {
    let cursor: string | undefined;
    const pendingOrderIds: string[] = [];
    do {
      if (auth.currentUser?.uid !== userId) throw new Error('Account changed. Please reopen your library.');
      const result = await authenticatedPost<{ nextCursor: string | null; pendingOrderIds: string[] }>('/api/library/sync', { ...(bookId ? { bookId } : {}), ...(cursor ? { cursor } : {}) });
      pendingOrderIds.push(...result.pendingOrderIds);
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    return { pendingOrderIds };
  })().finally(() => { running.delete(key); });
  running.set(key, task);
  return task;
}
