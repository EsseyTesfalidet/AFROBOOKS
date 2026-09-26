import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { paySeller } from './payoutLedger';

export const processMonthlyPayouts = functions.pubsub
  .schedule('0 9 15 * *').timeZone('UTC').onRun(async () => {
    const db = admin.firestore();
    // Legacy payouts may have transferred without recording confirmation. An
    // operator must reconcile those balances before enabling the new ledger.
    if ((await db.doc('platformSettings/global').get()).data()?.automatedPayoutsEnabled !== true) {
      console.log('Automatic payouts paused pending balance reconciliation.');
      return null;
    }
    const stripe = new Stripe(functions.config().stripe?.secret_key ?? '', { apiVersion: '2023-10-16' });
    const period = new Date().toISOString().slice(0, 7);
    const sellers = await db.collection('sellers').get();
    for (const seller of sellers.docs) {
      await paySeller(db, seller.id, period, async (input) => stripe.transfers.create({
        amount: input.amount, currency: 'usd', destination: input.destination,
        description: `AfroBooks payout ${input.payoutId}`,
        metadata: { payoutId: input.payoutId, sellerId: input.sellerId },
      }, { idempotencyKey: input.idempotencyKey }));
    }
    return null;
  });
