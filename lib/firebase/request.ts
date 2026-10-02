import { auth } from './config';
import { appFetch } from '@/lib/network';

export async function authenticatedGet<T>(path: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  const response = await appFetch(path, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Unable to load. Please try again.');
  return result as T;
}

export async function authenticatedPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  const response = await appFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const reference =
      typeof result.reference === 'string' && /^req_[A-Za-z0-9]+$/.test(result.reference)
        ? ` Reference: ${result.reference}`
        : '';
    throw new Error((result.error ?? 'Unable to save. Please try again.') + reference);
  }
  return result as T;
}
