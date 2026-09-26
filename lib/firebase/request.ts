import { auth } from './config';

export async function authenticatedPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Unable to save. Please try again.');
  return result as T;
}
