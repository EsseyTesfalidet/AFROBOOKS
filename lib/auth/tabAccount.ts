import { isInstalledApp } from '@/lib/app/installed';

export const SEPARATE_ACCOUNT_HREF = '/login?account=separate';
export const TAB_ACCOUNT_COOKIE = 'ab_tab_accounts';
const TAB_ACCOUNT_KEY = 'afrobooks:separate-account';
let activeMode: boolean | undefined;

// Only a presentation/routing hint. APIs still require a verified identity.
export function isSeparateAccount(): boolean {
  if (typeof window === 'undefined') return false;
  if (activeMode !== undefined) return activeMode;
  const requested = !isInstalledApp() && window.location.pathname === '/login' && new URLSearchParams(window.location.search).get('account') === 'separate';
  try {
    if (requested) sessionStorage.setItem(TAB_ACCOUNT_KEY, '1');
    const separate = sessionStorage.getItem(TAB_ACCOUNT_KEY) === '1';
    if (separate) document.cookie = `${TAB_ACCOUNT_COOKIE}=1; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    return activeMode = separate;
  } catch { return activeMode = requested; }
}

export function tabAccountStorageAvailable() {
  try {
    sessionStorage.setItem(TAB_ACCOUNT_KEY, '1');
    return sessionStorage.getItem(TAB_ACCOUNT_KEY) === '1';
  } catch { return false; }
}

export function accountStorage() {
  return isSeparateAccount() ? sessionStorage : localStorage;
}
