import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';

// Feed this the latest Stripe object, not an older webhook payload.
export async function syncSubscription(db: Firestore, sub: Stripe.Subscription) {
  const { userId, plan } = sub.metadata;
  if (!userId || !['basic', 'standard', 'premium'].includes(plan)) return;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  await db.runTransaction(async tx => {
    const ref = db.doc(`users/${userId}`);
    const user = (await tx.get(ref)).data();
    if (!user || user.stripeCustomerId !== customerId) return;
    const cancelled = ['canceled', 'incomplete_expired'].includes(sub.status);
    const status = cancelled ? 'cancelled' : ['active', 'trialing'].includes(sub.status) ? 'active' : 'past_due';
    const record = db.collection('subscriptions').doc(sub.id);
    const previous = (await tx.get(record)).data();
    tx.set(record, {
      userId, userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Reader',
      plan, price: sub.items.data.reduce((sum, item) => sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1), 0),
      stripeSubscriptionId: sub.id, stripeCustomerId: customerId, status,
      startDate: new Date(sub.start_date * 1000), createdAt: previous?.createdAt || new Date(sub.created * 1000),
      currentPeriodStart: new Date(sub.current_period_start * 1000), currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end, updatedAt: new Date(),
    });
    // Cancellation of an older subscription must not clear a newer entitlement.
    if (user.subscriptionId && user.subscriptionId !== sub.id) return;
    if (!user.subscriptionId && cancelled) return;
    tx.update(ref, {
      subscriptionId: cancelled ? null : sub.id, subscriptionPlan: cancelled ? 'none' : plan,
      subscriptionStatus: status, updatedAt: new Date(),
    });
  });
}
