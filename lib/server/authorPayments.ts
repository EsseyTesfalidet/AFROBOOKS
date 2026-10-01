import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { accountReadiness } from '@/functions/src/stripe/accountReadiness';
import { stripeRoyaltyGateway } from '@/functions/src/stripe/royaltyGateway';
import { holdAuthorPayouts, processAuthorRoyalties } from '@/functions/src/stripe/authorRoyalties';
import { isSettledRefund } from '@/functions/src/stripe/refundSettlement';

export { accountReadiness };

export async function syncAuthorAccount(db: Firestore, sellerId: string, account: Stripe.Account) {
  if (account.metadata?.userId !== sellerId) throw new Error('Stripe account ownership mismatch');
  const readiness = accountReadiness(account);
  await db.doc(`sellers/${sellerId}`).update(readiness);
  return readiness;
}

export async function sendBookRoyalties(db: Firestore, stripe: Stripe, paymentId: string) {
  const orders = await db.collection('orders').where('stripePaymentIntentId', '==', paymentId).get();
  const sellers = [...new Set(orders.docs.map(order => order.data().sellerId as string))];
  for (const seller of sellers) await processAuthorRoyalties(db, stripeRoyaltyGateway(stripe), seller);
}

export async function reviewPaymentRoyalties(db: Firestore, paymentId: string) {
  const orders = await db.collection('orders').where('stripePaymentIntentId', '==', paymentId).get();
  for (const seller of new Set(orders.docs.filter(order => !isSettledRefund(order.data())).map(order => order.data().sellerId as string))) {
    await holdAuthorPayouts(db, seller, 'payment_review');
  }
}
