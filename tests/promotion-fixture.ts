import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { submitPromotion, reviewPromotion } from '../lib/server/promotions';
import { PROMOTION_TERMS_VERSION } from '../lib/promotions';

export const author = { uid: 'author', role: 'seller' };
export const admin = { uid: 'admin', role: 'admin' };
export async function promotionFixture(db: Firestore, priceCents = 0, now = Date.now()) {
  await db.doc('books/book').update({
    title: 'The River',
    authorName: 'Author',
    coverUrl: 'https://example.test/cover.jpg',
    genre: 'Fiction',
  });
  await db.doc('promotionSettings/global').set({ enabled: true, priceCents, durationDays: 7 });
  const id = await submitPromotion(db, author, 'book', priceCents, PROMOTION_TERMS_VERSION, now);
  await reviewPromotion(db, admin, id, 'approve', '', now);
  return id;
}
export function promotionStripeFixture(id: string, amount = 900) {
  const metadata = { purchaseType: 'book_promotion', campaignId: id, userId: 'author' };
  const session = {
    id: 'cs_fixture',
    metadata,
    client_reference_id: id,
    payment_status: 'unpaid',
    status: 'open',
    amount_total: amount,
    currency: 'usd',
    livemode: true,
    payment_intent: 'pi_promotion',
    expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
    url: 'https://checkout.stripe.com/c/test',
  } as unknown as Stripe.Checkout.Session;
  const charge = {
    id: 'ch_promotion',
    refunded: false,
    disputed: false,
    amount,
    amount_refunded: 0,
  } as Stripe.Charge;
  const payment = {
    id: 'pi_promotion',
    metadata,
    status: 'succeeded',
    amount_received: amount,
    currency: 'usd',
    livemode: true,
    latest_charge: charge,
  } as unknown as Stripe.PaymentIntent;
  const state = {
    refundStatus: 'succeeded' as Stripe.Refund['status'],
    createCalls: 0,
    refundCalls: 0,
    loseCreateResponse: false,
    loseRefundResponse: false,
    createKeys: [] as string[],
    request: null as Stripe.Checkout.SessionCreateParams | null,
  };
  const stripe = {
    checkout: {
      sessions: {
        list: async function* () {
          yield session;
        },
        create: async (
          input: Stripe.Checkout.SessionCreateParams,
          options: Stripe.RequestOptions,
        ) => {
          state.createCalls++;
          state.request = input;
          state.createKeys.push(options.idempotencyKey!);
          if (state.loseCreateResponse) {
            state.loseCreateResponse = false;
            throw new Error('Lost creation response');
          }
          return session;
        },
        retrieve: async () => session,
        expire: async () => {
          session.status = 'expired';
          return session;
        },
      },
    },
    paymentIntents: { retrieve: async () => payment },
    refunds: {
      list: async function* () {
        if (charge.refunded) yield { amount: charge.amount, status: state.refundStatus };
      },
      create: async () => {
        state.refundCalls++;
        charge.refunded = true;
        charge.amount_refunded = charge.amount;
        if (state.loseRefundResponse) {
          state.loseRefundResponse = false;
          throw new Error('Lost refund response');
        }
        return { id: 're_fixture', status: 'succeeded' };
      },
    },
  } as unknown as Stripe;
  return {
    stripe,
    state,
    session,
    payment,
    charge,
    paid: () => {
      session.payment_status = 'paid';
      session.status = 'complete';
      return { ...payment, refunded: charge.amount_refunded > 0, disputed: charge.disputed };
    },
  };
}
