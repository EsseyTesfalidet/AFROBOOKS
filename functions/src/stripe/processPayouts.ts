import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { processAuthorRoyalties } from './authorRoyalties';
import { stripeRoyaltyGateway } from './royaltyGateway';

// Keep the deployed function name while replacing the old monthly aggregation.
// Source-linked royalties reach Stripe after a sale; Stripe schedules bank payouts.
export const processMonthlyPayouts = functions.runWith({ secrets: ['STRIPE_SECRET_KEY'], timeoutSeconds: 540 })
  .pubsub.schedule('every 60 minutes').timeZone('UTC').onRun(async () => {
    const db = admin.firestore();
    if ((await db.doc('platformSettings/global').get()).data()?.automatedPayoutsEnabled !== true) {
      console.log('Automatic payouts paused pending balance reconciliation.');
      return null;
    }
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    if (!/^(sk|rk)_live_/.test(key)) throw new Error('Live Stripe payout credentials are not configured');
    const stripe = new Stripe(key, { apiVersion: '2023-10-16', timeout: 20000, maxNetworkRetries: 1 });
    console.log('Author royalty run completed', await processAuthorRoyalties(db, stripeRoyaltyGateway(stripe)));
    return null;
  });
