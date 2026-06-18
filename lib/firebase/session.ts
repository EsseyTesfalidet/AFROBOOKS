'use client';

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function setCookie(name: string, value: string, maxAge = AUTH_COOKIE_MAX_AGE) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function setClientAuthHints(uid: string, role: string) {
  setCookie('ab_uid', uid);
  setCookie('ab_role', role);
}

function clearClientAuthHints() {
  clearCookie('ab_uid');
  clearCookie('ab_role');
}

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
    console.warn(`Secure session sync failed for ${uid}. Falling back to client auth hints.`);
    return false;
  }
}

export async function clearAuthSession() {
  clearClientAuthHints();

  await fetch('/api/auth/session', {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => undefined);
}
