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

function setFallbackSession(idToken: string, uid: string) {
  setCookie('__session', idToken);
  setCookie('ab_uid', uid);
}

function clearFallbackSession() {
  clearCookie('__session');
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
  } catch {
    setFallbackSession(idToken, uid);
  }
}

export async function clearAuthSession() {
  clearFallbackSession();

  await fetch('/api/auth/session', {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => undefined);
}
