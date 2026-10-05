import { signInError } from './mobileSignIn';

export type RecoveryProvider = 'password' | 'google.com' | 'apple.com';
export interface RecoveryPhoneStatus {
  uid: string;
  phoneNumber: string | null;
  profileSynced: boolean;
  providers: RecoveryProvider[];
}

export function hasRecentPhoneConfirmation(authTime: unknown, now = Date.now()) {
  const time = typeof authTime === 'number' ? authTime * 1000 : NaN;
  return Number.isFinite(time) && time <= now + 60000 && now - time <= 5 * 60000;
}

export function recoveryPhoneError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  if (/credential-already-in-use|phone-number-already-exists/.test(code)) return 'That number belongs to another account. Use that account’s original sign-in method or contact support. Your accounts have not been merged.';
  if (/provider-already-linked|PHONE_ALREADY_LINKED/.test(code)) return 'A phone number is already linked. Refresh its status below.';
  if (/PHONE_REAUTH_REQUIRED|requires-recent-login/.test(code)) return 'Please confirm your existing sign-in again before linking a phone.';
  if (/PHONE_ACCOUNT_CHANGED|user-mismatch/.test(code)) return 'Use the same account you opened these settings with. Reopen settings if you switched accounts.';
  if (/PHONE_NOT_LINKED/.test(code)) return 'Verify the text message code before saving your recovery phone.';
  if (/invalid-credential|wrong-password/.test(code)) return 'Your current password is incorrect. Please try again.';
  return signInError(error).replace('Unable to sign in.', 'Unable to link your phone.');
}
