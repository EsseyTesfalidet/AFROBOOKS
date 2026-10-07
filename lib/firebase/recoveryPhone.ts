import { initializeApp, getApps } from 'firebase/app';
import { EmailAuthProvider, GoogleAuthProvider, OAuthProvider, browserPopupRedirectResolver, inMemoryPersistence, initializeAuth, getAuth, linkWithPhoneNumber, reauthenticateWithCredential, reauthenticateWithPopup, RecaptchaVerifier, signInWithPhoneNumber, sendPasswordResetEmail, signOut, deleteUser, type Auth, type ConfirmationResult, type RecaptchaVerifier as RecaptchaVerifierType, type User } from 'firebase/auth';
import app, { auth } from './config';
import { authenticatedGet, authenticatedPost } from './request';
import { isSupportedSmsNumber, mobileProviders } from '@/lib/auth/mobileSignIn';
import { hasRecentPhoneConfirmation, type RecoveryPhoneStatus, type RecoveryProvider } from '@/lib/auth/recoveryPhone';

function currentAccount(uid: string) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('PHONE_ACCOUNT_CHANGED');
  return user;
}
async function recentAccount(uid: string) {
  const user = currentAccount(uid);
  const token = await user.getIdTokenResult();
  currentAccount(uid);
  if (!hasRecentPhoneConfirmation(token.claims.auth_time)) throw new Error('PHONE_REAUTH_REQUIRED');
  return user;
}
export async function confirmRecoveryIdentity(uid: string, provider: RecoveryProvider, password = '') {
  const user = currentAccount(uid);
  if (!user.providerData.some(item => item.providerId === provider)) throw new Error('PHONE_ACCOUNT_CHANGED');
  if (provider === 'password') {
    if (!user.email || !password) throw new Error('auth/wrong-password');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else {
    const oauth = provider === 'google.com' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
    if (provider === 'google.com') oauth.setCustomParameters({ prompt: 'select_account' });
    // Start in the button handler to retain browser permission for the popup.
    await reauthenticateWithPopup(user, oauth, browserPopupRedirectResolver);
  }
  currentAccount(uid);
  await user.getIdToken(true);
}
export async function requestRecoveryCode(uid: string, number: string, verifier: RecaptchaVerifier) {
  if (!mobileProviders.phoneRecovery) throw new Error('provider-disabled');
  if (!isSupportedSmsNumber(number)) throw new Error('sms-region-not-allowed');
  const user = await recentAccount(uid);
  await user.reload(); currentAccount(uid);
  if (user.phoneNumber || user.providerData.some(provider => provider.providerId === 'phone')) throw new Error('PHONE_ALREADY_LINKED');
  // Link to the signed-in identity. Never sign in as a different phone identity.
  return linkWithPhoneNumber(user, number, verifier);
}

// Recovery SMS uses a separate in-memory Firebase Auth instance. It verifies
// ownership of a phone already linked to a profile but never signs into the
// app's normal Auth instance or creates an app profile.
let recoveryAuth: Auth | null = null;
const RECOVERY_APP_NAME = 'afrobooks-phone-recovery';

export function getPhoneRecoveryAuth() {
  if (recoveryAuth) return recoveryAuth;
  const recoveryApp = getApps().find(item => item.name === RECOVERY_APP_NAME) ?? initializeApp(app.options, RECOVERY_APP_NAME);
  try { recoveryAuth = initializeAuth(recoveryApp, { persistence: inMemoryPersistence }); }
  catch (error) {
    if (!(error instanceof Error) || !/already-initialized/.test(error.message)) throw error;
    recoveryAuth = getAuth(recoveryApp);
  }
  return recoveryAuth;
}

export function createPhoneVerifier(container: HTMLElement) {
  return new RecaptchaVerifier(auth, container, { size: 'invisible' });
}

export function createRecoveryPhoneVerifier(container: HTMLElement) {
  return new RecaptchaVerifier(getPhoneRecoveryAuth(), container, { size: 'invisible' });
}

export function sendAccountRecoveryCode(number: string, verifier: RecaptchaVerifierType): Promise<ConfirmationResult> {
  if (!mobileProviders.phoneRecovery) return Promise.reject(new Error('provider-disabled'));
  if (!isSupportedSmsNumber(number)) return Promise.reject(new Error('sms-region-not-allowed'));
  return signInWithPhoneNumber(getPhoneRecoveryAuth(), number, verifier);
}

export async function resolveAccountRecovery(confirmation: ConfirmationResult, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('auth/invalid-verification-code');
  const recoveryAuth = getPhoneRecoveryAuth();
  let user: User | null = null;
  try {
    user = (await confirmation.confirm(code)).user;
    const response = await fetch('/api/auth/account-recovery', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
      body: '{}',
    });
    const data = await response.json().catch(() => null) as { email?: string; providers?: string[]; safeToDelete?: boolean } | null;
    if (!response.ok) {
      if (data?.safeToDelete) await deleteUser(user).catch(() => undefined);
      throw new Error('RECOVERY_ACCOUNT_NOT_FOUND');
    }
    if (!data?.email || !Array.isArray(data.providers)) throw new Error('RECOVERY_ACCOUNT_NOT_FOUND');
    return { email: data.email, providers: data.providers };
  } finally {
    await signOut(recoveryAuth).catch(() => undefined);
  }
}

export async function sendAccountPasswordReset(email: string) {
  if (!email) throw new Error('RECOVERY_ACCOUNT_NOT_FOUND');
  await sendPasswordResetEmail(getPhoneRecoveryAuth(), email);
}
export async function confirmRecoveryCode(uid: string, confirmation: ConfirmationResult, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('auth/invalid-verification-code');
  await recentAccount(uid);
  const result = await confirmation.confirm(code);
  currentAccount(uid);
  if (result.user.uid !== uid) throw new Error('PHONE_ACCOUNT_CHANGED');
  await result.user.getIdToken(true);
}
export async function getRecoveryPhone(uid: string, sync = false) {
  currentAccount(uid);
  const result = sync ? await authenticatedPost<RecoveryPhoneStatus>('/api/auth/recovery-phone', {}) : await authenticatedGet<RecoveryPhoneStatus>('/api/auth/recovery-phone');
  currentAccount(uid);
  if (result.uid !== uid) throw new Error('PHONE_ACCOUNT_CHANGED');
  return result;
}
