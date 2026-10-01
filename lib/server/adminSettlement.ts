import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import type { AuthenticatedRequestUser } from './auth';
import { reconcileBookRefunds } from './bookRefunds';
import { reconcileAuthorSettlement } from './reconcileAuthorSettlement';

export async function reviewAdminSettlement(db: Firestore, stripe: Stripe, actor: AuthenticatedRequestUser, sellerId: string) {
  if (actor.role !== 'admin' || !['active', 'warned'].includes(actor.status)) throw new Error('Admin access required');
  if (!sellerId || sellerId.length > 128 || sellerId.includes('/')) throw new Error('Invalid author');
  const audit = db.collection('paymentSettlementAudits').doc();
  await audit.create({ adminId: actor.uid, sellerId, action: 'check_stripe_and_settle', status: 'checking', createdAt: new Date() });
  try {
    const orders = await db.collection('orders').where('sellerId', '==', sellerId).get();
    if (orders.size > 200) throw new Error('This ledger needs a larger reconciliation. Contact support.');
    for (const paymentId of new Set(orders.docs.map(o => o.data().stripePaymentIntentId as string).filter(Boolean))) {
      await reconcileBookRefunds(db, stripe, paymentId, { skipSettlement: true });
    }
    const result = await reconcileAuthorSettlement(db, stripe, sellerId);
    await audit.update({ status: result.settled ? 'settled' : 'blocked', message: result.message, retainedFeeCents: result.retainedFeeCents ?? 0, checkedAt: new Date() });
    return result;
  } catch (error) {
    await audit.update({ status: 'failed', checkedAt: new Date() });
    throw error;
  }
}
