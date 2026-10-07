import type { UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

const RECENT_UNLINKED_PHONE_IDENTITY_MS = 10 * 60 * 1000;

export type PhoneRecoveryAccount = { email: string; providers: string[] };

export async function phoneRecoveryAccount(db: Firestore, identity: UserRecord, now = Date.now()) {
  if (identity.disabled || !identity.phoneNumber ||
      !identity.providerData.some(provider => provider.providerId === 'phone' && provider.phoneNumber === identity.phoneNumber)) {
    return { account: null, safeToDelete: false };
  }

  const profile = await db.collection('users').doc(identity.uid).get();
  if (!profile.exists) {
    const createdAt = Date.parse(identity.metadata.creationTime);
    const phoneOnly = identity.providerData.length === 1 && identity.providerData[0]?.providerId === 'phone';
    return {
      account: null,
      // Firebase creates a temporary Auth identity after SMS verification of
      // an unlinked number. Delete only a fresh phone-only identity with no app
      // profile so recovery cannot leave a second, empty account behind.
      safeToDelete: phoneOnly && Number.isFinite(createdAt) &&
        createdAt <= now + 60_000 && now - createdAt <= RECENT_UNLINKED_PHONE_IDENTITY_MS,
    };
  }

  const status = profile.data()?.status ?? 'active';
  if (!['active', 'warned'].includes(status)) return { account: null, safeToDelete: false };
  const providers = identity.providerData
    .map(provider => provider.providerId)
    .filter(provider => ['password', 'google.com', 'apple.com'].includes(provider));
  if (!identity.email || providers.length === 0) return { account: null, safeToDelete: false };

  return { account: { email: identity.email, providers }, safeToDelete: false };
}
