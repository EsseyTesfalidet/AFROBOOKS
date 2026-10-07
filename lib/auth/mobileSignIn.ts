import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { loginDestination } from '@/lib/utils/loginDestination';
import { mobileAuthDestination } from './mobileAccess';

// Phone verification is used for account recovery and linking a recovery phone.
// It is deliberately not an independent sign-in method in the mobile app.
export const mobileProviders = {
  phoneRecovery: process.env.NEXT_PUBLIC_AUTH_PHONE_ENABLED === 'true',
  apple: process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === 'true',
};

// Keep this presentation list aligned with Firebase's enforced SMS allowlist.
// Initial rollout follows countries recorded in existing user profiles.
export const mobileSmsCountries: readonly CountryCode[] = ['GH', 'NG', 'US'];

export function isPhoneSignInProvider(provider: string | null | undefined): boolean {
  return provider === 'phone';
}

export function isSupportedSmsNumber(value: string): boolean {
  const country = parsePhoneNumberFromString(value)?.country;
  return !!country && mobileSmsCountries.includes(country);
}

export function normalizePhone(value: string, country: CountryCode): string | null {
  const phone = parsePhoneNumberFromString(value, { defaultCountry: country, extract: false });
  return phone?.isPossible() && !phone.ext ? phone.number : null;
}

export function mobileSignInDestination(profile: { role: string; activeRole: string }, search: string) {
  const fallback = loginDestination(profile, new URLSearchParams(search).get('redirect'));
  return mobileAuthDestination(search, ['/browse', '/dashboard'].includes(fallback) ? '/library' : fallback);
}

export function signInError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (/ACCOUNT_SUSPENDED/.test(code)) return 'This account is suspended. Contact support for help.';
  if (/ACCOUNT_NOT_AVAILABLE/.test(code)) return 'This account is unavailable. Contact support for help.';
  if (/invalid-verification-code/.test(code)) return 'That code is incorrect. Check it and try again.';
  if (/code-expired|session-expired/.test(code)) return 'That code has expired. Request a new code.';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'Incorrect email or password.';
  if (/invalid-phone-number/.test(code)) return 'Check your phone number and country code.';
  if (/sms-region-not-allowed/.test(code)) return 'Phone codes are available for Ghana, Nigeria and US numbers. Please use email or Google for other countries.';
  if (/too-many-requests|quota-exceeded/.test(code)) return 'Too many attempts. Please wait before trying again.';
  if (/network-request-failed|Failed to fetch/.test(code)) return 'Check your connection and try again.';
  if (/popup-closed-by-user|cancelled-popup-request/.test(code)) return 'Sign-in was cancelled. You can try again.';
  if (/popup-blocked|operation-not-supported/.test(code)) return 'Allow the sign-in window in your browser, then try again.';
  if (/account-exists-with-different-credential|credential-already-in-use/.test(code)) return 'Use your original sign-in method to keep your existing library.';
  if (/captcha-check-failed|missing-app-credential|invalid-app-credential/.test(code)) return 'Verification could not finish. Please try again.';
  if (/operation-not-allowed|unauthorized-domain|provider-disabled/.test(code)) return 'This sign-in method is not available yet. Please use email or Google.';
  return 'Unable to sign in. Please try again.';
}
