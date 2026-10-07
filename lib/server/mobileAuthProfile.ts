import type { UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/** Firebase identity is the only source of identity; never accept a client UID or role. */
export async function ensureMobileAuthProfile(db: Firestore, identity: UserRecord, now = Date.now()) {
  if (identity.disabled) throw new Error('ACCOUNT_NOT_AVAILABLE');
  const ref = db.collection('users').doc(identity.uid);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const status = existing.data()?.status;
      if (status === 'suspended') throw new Error('ACCOUNT_SUSPENDED');
      if (status === 'banned') throw new Error('ACCOUNT_NOT_AVAILABLE');
      // Do not change names, roles, payment details, or preferences on sign-in.
      return { isNewUser: false };
    }
    const age = now - Date.parse(identity.metadata.creationTime);
    if (!Number.isFinite(age) || age < -60000 || age > 10 * 60 * 1000 ||
        !identity.providerData.some(p => ['google.com', 'apple.com'].includes(p.providerId))) {
      // A missing/deleted profile on an older identity must not be resurrected.
      throw new Error('ACCOUNT_NOT_AVAILABLE');
    }
    const [firstName = '', ...lastName] = (identity.displayName ?? '').trim().split(/\s+/);
    transaction.create(ref, {
      uid: identity.uid, email: identity.email ?? '', firstName, lastName: lastName.join(' '),
      username: `reader-${identity.uid.slice(0, 12).toLowerCase()}`,
      avatarUrl: identity.photoURL ?? null, bio: '', phone: identity.phoneNumber ?? '',
      country: '', dateOfBirth: '', role: 'buyer', activeRole: 'buyer', status: 'active',
      stripeCustomerId: null, referralCode: `AFRO-${identity.uid.slice(0, 12).toUpperCase()}`,
      referredBy: null, referralCredits: 0, subscriptionId: null, subscriptionPlan: 'none', subscriptionStatus: 'none',
      notificationPreferences: { purchaseConfirmations: true, readingReminders: true, newChapterAlerts: true,
        reviewReplies: true, flashSales: true, recommendations: true, emailReceipts: true,
        weeklyDigest: false, promotionalEmails: false },
      readerPreferences: { fontSize: 'medium', lineSpacing: 'normal' },
      favoriteGenre: '', language: 'en', currency: 'USD',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { isNewUser: true };
  });
}
