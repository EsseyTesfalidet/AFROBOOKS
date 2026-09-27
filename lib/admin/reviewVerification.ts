import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import {
  DEFAULT_SELLER_VERIFICATION_STATUS,
  hasCompletedSellerVerification,
} from '../sellerVerification';

export async function reviewVerification(
  db: Firestore,
  requestId: string,
  reviewerId: string,
  action: 'approved' | 'rejected',
) {
  const notification = doc(collection(db, 'notifications'));
  await runTransaction(db, async (tx) => {
    const requestRef = doc(db, 'verificationRequests', requestId);
    const current = await tx.get(requestRef);
    if (!current.exists() || current.data().status !== 'pending')
      throw new Error('This request has already been reviewed.');
    const sellerId = current.data().sellerId;
    const sellerRef = doc(db, 'sellers', sellerId);
    const [seller, user] = await Promise.all([
      tx.get(sellerRef),
      tx.get(doc(db, 'users', sellerId)),
    ]);
    if (!seller.exists() || !user.exists())
      throw new Error('The author account is no longer available.');
    if (action === 'approved') {
      const data = seller.data();
      const status = data.verificationStatus ?? {};
      const next = {
        ...DEFAULT_SELLER_VERIFICATION_STATUS,
        ...status,
        emailVerified: status.emailVerified ?? false,
        bioAdded: (user.data().bio ?? '').length >= 50,
        idVerified: true,
        tenSalesReached: (data.totalSales ?? 0) >= 10,
      };
      tx.update(sellerRef, {
        verificationStatus: next,
        isVerified: hasCompletedSellerVerification(next),
      });
    }
    tx.update(requestRef, {
      status: action,
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewerId,
    });
    tx.set(notification, {
      userId: sellerId,
      type: 'verification',
      title: action === 'approved' ? 'ID Verification Approved' : 'ID Verification Rejected',
      message:
        action === 'approved'
          ? 'Your identity document has been approved. Your ID verification step is now complete.'
          : 'Your identity document was not accepted. Please resubmit a clear photo of your government-issued ID.',
      actionUrl: '/seller/profile/verification',
      isRead: false,
      createdAt: serverTimestamp(),
    });
  });
}
