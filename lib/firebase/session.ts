'use client';

export async function syncAuthSession(idToken: string, uid: string) {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      throw new Error('Session cookie sync failed');
    }
    return true;
  } catch {
    console.warn(`Secure session sync failed for ${uid}. Server-protected routes may require a refresh.`);
    return false;
  }
}

export async function clearAuthSession() {
  await fetch('/api/auth/session', {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => undefined);
}
