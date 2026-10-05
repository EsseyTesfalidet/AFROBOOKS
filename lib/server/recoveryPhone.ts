import type { UserRecord } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { RecoveryPhoneStatus, RecoveryProvider } from '@/lib/auth/recoveryPhone';

export function verifiedRecoveryPhone(identity: UserRecord) {
  if (identity.disabled) throw new Error('ACCOUNT_NOT_AVAILABLE');
  const number = identity.phoneNumber;
  return number && /^\+[1-9]\d{6,14}$/.test(number) && identity.providerData.some(provider => provider.providerId === 'phone' && provider.phoneNumber === number) ? number : null;
}

export async function recoveryPhoneStatus(db: Firestore, identity: UserRecord, sync = false): Promise<RecoveryPhoneStatus> {
  const phoneNumber = verifiedRecoveryPhone(identity);
  if (sync && !phoneNumber) throw new Error('PHONE_NOT_LINKED');
  const ref = db.collection('users').doc(identity.uid);
  return db.runTransaction(async tx => {
    const profile = await tx.get(ref);
    const data = profile.data();
    if (!profile.exists || !['active', 'warned'].includes(data?.status ?? 'active')) throw new Error('ACCOUNT_NOT_AVAILABLE');
    const profileSynced = !phoneNumber || data?.phone === phoneNumber;
    // Only mirror the number that Firebase has verified on this same identity.
    // Contact text in Firestore never proves ownership or joins accounts.
    if (sync && !profileSynced) tx.update(ref, { phone: phoneNumber, updatedAt: FieldValue.serverTimestamp() });
    return { uid: identity.uid, phoneNumber, profileSynced: sync || profileSynced,
      providers: identity.providerData.map(provider => provider.providerId).filter((id): id is RecoveryProvider => ['password', 'google.com', 'apple.com'].includes(id)) };
  });
}
