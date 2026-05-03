import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

function getStripe(): Stripe {
  return new Stripe(functions.config().stripe?.secret_key ?? '', { apiVersion: '2024-04-10' as any });
}

// Runs on the 15th of each month at 09:00 UTC
export const processMonthlyPayouts = functions.pubsub
  .schedule('0 9 15 * *')
  .timeZone('UTC')
  .onRun(async () => {
    const db = admin.firestore();
    const stripe = getStripe();
    const now = new Date();
    const periodLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Fetch all sellers with a pending balance
    const sellersSnap = await db.collection('users')
      .where('pendingBalance', '>', 0)
      .get();

    const results: { sellerId: string; status: string; amountCents: number }[] = [];

    for (const sellerDoc of sellersSnap.docs) {
      const seller = sellerDoc.data();
      const amountCents: number = seller.pendingBalance ?? 0;
      const stripeAccountId: string = seller.stripeAccountId ?? '';

      if (amountCents < 100 || !stripeAccountId) continue;

      const payoutRef = await db.collection('payouts').add({
        sellerId: sellerDoc.id,
        sellerName: `${seller.firstName} ${seller.lastName}`,
        stripeAccountId,
        amountCents,
        periodLabel,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      try {
        await stripe.transfers.create({
          amount: amountCents,
          currency: 'usd',
          destination: stripeAccountId,
          description: `AfroBooks payout — ${periodLabel}`,
          metadata: { payoutId: payoutRef.id, sellerId: sellerDoc.id },
        });

        await payoutRef.update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp() });
        await sellerDoc.ref.update({ pendingBalance: 0 });

        await db.collection('notifications').add({
          userId: sellerDoc.id,
          type: 'payout',
          title: 'Payout Processed',
          message: `Your payout of $${(amountCents / 100).toFixed(2)} for ${periodLabel} has been sent.`,
          isRead: false,
          actionUrl: '/seller/earnings',
          relatedBookId: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.push({ sellerId: sellerDoc.id, status: 'paid', amountCents });
      } catch (err) {
        await payoutRef.update({ status: 'failed' });
        results.push({ sellerId: sellerDoc.id, status: 'failed', amountCents });
        console.error(`Payout failed for seller ${sellerDoc.id}:`, err);
      }
    }

    console.log(`Monthly payouts complete: ${results.length} processed`);
    return null;
  });
