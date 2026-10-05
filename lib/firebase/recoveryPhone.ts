import { EmailAuthProvider, GoogleAuthProvider, OAuthProvider, browserPopupRedirectResolver, linkWithPhoneNumber, reauthenticateWithCredential, reauthenticateWithPopup, type ConfirmationResult, type RecaptchaVerifier } from 'firebase/auth';
import { auth } from './config';
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
  if (!mobileProviders.phone) throw new Error('provider-disabled');
  if (!isSupportedSmsNumber(number)) throw new Error('sms-region-not-allowed');
  const user = await recentAccount(uid);
  await user.reload(); currentAccount(uid);
  if (user.phoneNumber || user.providerData.some(provider => provider.providerId === 'phone')) throw new Error('PHONE_ALREADY_LINKED');
  // Link to the signed-in identity. Never sign in as a different phone identity.
  return linkWithPhoneNumber(user, number, verifier);
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
