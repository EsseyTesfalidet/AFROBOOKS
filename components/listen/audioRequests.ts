import { auth } from '@/lib/firebase/config';
import { appFetch } from '@/lib/network';

async function send<T>(path: string, method: string, body: BodyInit, json = false): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const response = await appFetch(path, { method, body, headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) } }, 65000);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to save. Please try again.');
  return result as T;
}
export const prepareAudioSample = (id: string) => send<{ seconds: number }>('/api/audio/sample', 'POST', JSON.stringify({ id }), true);
export function uploadAudioCover(id: string, file: File | null) {
  if (!file) return send<{ coverUrl: string }>('/api/audio/cover', 'DELETE', JSON.stringify({ id }), true);
  const body = new FormData(); body.set('id', id); body.set('file', file);
  return send<{ coverUrl: string }>('/api/audio/cover', 'POST', body);
}
