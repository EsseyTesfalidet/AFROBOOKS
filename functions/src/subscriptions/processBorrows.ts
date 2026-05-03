import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Runs on the 1st of each month at 08:00 UTC
// Calculates borrow payouts: for each borrow record in the past month,
// distributes the subscription pool proportionally by read share.
export const processMonthlyBorrowPayouts = functions.pubsub
  .schedule('0 8 1 * *')
  .timeZone('UTC')
  .onRun(async () => {
    const db = admin.firestore();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodLabel = monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Fetch all borrow records in the prior month
    const borrowsSnap = await db.collection('borrowRecords')
      .where('borrowedAt', '>=', admin.firestore.Timestamp.fromDate(monthStart))
      .where('borrowedAt', '<', admin.firestore.Timestamp.fromDate(monthEnd))
      .get();

    if (borrowsSnap.empty) {
      console.log('No borrow records for period:', periodLabel);
      return null;
    }

    // Fetch platform settings for borrow rate
    const settingsDoc = await db.collection('platformSettings').doc('global').get();
    const borrowRatePerRead: number = settingsDoc.data()?.borrowRatePerRead ?? 10;

    // Group by sellerId
    const sellerReadCounts: Record<string, number> = {};
    borrowsSnap.docs.forEach((d) => {
      const sellerId: string = d.data().sellerId;
      sellerReadCounts[sellerId] = (sellerReadCounts[sellerId] ?? 0) + 1;
    });

    // Credit each seller's pendingBalance
    const batch = db.batch();
    for (const [sellerId, readCount] of Object.entries(sellerReadCounts)) {
      const earnedCents = readCount * borrowRatePerRead;
      const sellerRef = db.collection('users').doc(sellerId);
      batch.update(sellerRef, {
        pendingBalance: admin.firestore.FieldValue.increment(earnedCents),
      });

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: sellerId,
        type: 'payout',
        title: 'Subscription Earnings Added',
        message: `You earned $${(earnedCents / 100).toFixed(2)} from ${readCount} subscription read${readCount !== 1 ? 's' : ''} in ${periodLabel}.`,
        isRead: false,
        actionUrl: '/seller/earnings',
        relatedBookId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    console.log(`Borrow payouts credited for ${Object.keys(sellerReadCounts).length} sellers in ${periodLabel}`);
    return null;
  });
