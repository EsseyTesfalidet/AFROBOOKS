import type { Firestore } from 'firebase-admin/firestore';
import type { RoyaltyGateway, RoyaltyTransfer } from '../functions/src/stripe/authorRoyalties';

export async function seedRoyalty(db: Firestore, options: { orderId?: string; sellerId?: string; amount?: number; price?: number; paymentId?: string } = {}) {
  const { orderId = 'royalty-order', sellerId = 'author', amount = 800, price = 1000, paymentId = 'pi_royalty' } = options;
  await db.doc(`sellers/${sellerId}`).set({ pendingBalance: amount, totalEarnings: amount, stripeAccountId: `acct_${sellerId}` }, { merge: true });
  await db.doc(`orders/${orderId}`).set({ buyerId: 'reader', sellerId, bookId: 'book', bookTitle: 'Book', finalPrice: price, sellerEarnings: amount, stripePaymentIntentId: paymentId, status: 'completed' });
}

export function royaltyFixture() {
  const transfers = new Map<string, RoyaltyTransfer>();
  const state = { createCalls: 0, loseResponse: false, failBeforeTransfer: false, ready: true, refunded: false, disputed: false, live: true };
  const gateway: RoyaltyGateway = {
    account: async id => ({ id, details_submitted: true, payouts_enabled: state.ready, capabilities: { transfers: 'active' }, metadata: { userId: id.slice(5) }, country: 'US' }),
    payment: async id => ({ id, status: 'succeeded', currency: 'usd', amount_received: 1000, livemode: state.live, metadata: { userId: 'reader' }, charge: { id: `ch_${id}`, paid: true, amount_refunded: state.refunded ? 100 : 0, disputed: state.disputed } }),
    transfers: async destination => [...transfers.values()].filter(transfer => transfer.destination === destination),
    transfer: async input => {
      state.createCalls++;
      if (state.failBeforeTransfer) throw new Error('Network unavailable');
      if (!transfers.has(input.idempotencyKey)) transfers.set(input.idempotencyKey, {
        id: `tr_${input.orderId}`, amount: input.amount, currency: 'usd', destination: input.destination,
        source_transaction: input.source, reversed: false, amount_reversed: 0,
        metadata: { payoutId: input.payoutId, sellerId: input.sellerId, orderId: input.orderId },
      });
      if (state.loseResponse) { state.loseResponse = false; throw new Error('Response lost after Stripe created transfer'); }
      return transfers.get(input.idempotencyKey)!;
    },
  };
  return { gateway, transfers, state };
}
