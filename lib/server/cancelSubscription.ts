import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { syncSubscription } from './syncSubscription';
import { getStripeServer } from '@/lib/stripe/server';

type BillingClient = { subscriptions: Pick<Stripe['subscriptions'], 'retrieve' | 'update' | 'cancel'> };

export async function cancelUserSubscription(db: Firestore, uid: string, immediately = false, billing?: BillingClient) {
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (!user?.subscriptionId) return;
  const stripe = billing ?? getStripeServer();
  const subscription = await stripe.subscriptions.retrieve(user.subscriptionId);
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  if (customerId !== user.stripeCustomerId || subscription.metadata.userId !== uid) throw new Error('Subscription ownership could not be verified.');
  const updated = ['canceled', 'incomplete_expired'].includes(subscription.status) ? subscription : immediately
    ? await stripe.subscriptions.cancel(subscription.id)
    : await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  await syncSubscription(db, updated);
}
