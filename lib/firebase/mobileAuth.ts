import {
  GoogleAuthProvider, OAuthProvider, signInWithPopup, browserPopupRedirectResolver, type User,
} from 'firebase/auth';
import { auth } from './config';
import { authenticatedPost } from './request';
import { mobileProviders } from '@/lib/auth/mobileSignIn';

export async function finishMobileIdentity(user: User) {
  if (auth.currentUser?.uid !== user.uid) throw new Error('ACCOUNT_NOT_AVAILABLE');
  return authenticatedPost<{ isNewUser: boolean }>('/api/auth/mobile-profile', {});
}

export async function mobileSocialSignIn(providerName: 'google' | 'apple') {
  if (providerName === 'apple' && !mobileProviders.apple) throw new Error('provider-disabled');
  const provider = providerName === 'apple' ? new OAuthProvider('apple.com') : new GoogleAuthProvider();
  if (providerName === 'apple') { provider.addScope('email'); provider.addScope('name'); }
  else provider.setCustomParameters({ prompt: 'select_account' });
  // Start directly in the click handler so browsers retain user activation.
  // A cancelled popup must never silently start a second sign-in.
  const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  const profile = await finishMobileIdentity(result.user);
  return { user: result.user, ...profile };
}
