import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fulfillPayment } from '../lib/server/fulfillPayment';
import { prepareBookGift, attachGiftPayment } from '../lib/server/bookGifts';
import { processAuthorRoyalties, reconcileAuthor, payAuthorOrder } from '../functions/src/stripe/authorRoyalties';
import { seedRoyalty, royaltyFixture } from './royalty-fixture';
import { createBookPurchase, BookPurchaseError, type PurchaseGateway } from '../lib/server/bookPurchases';
import { confirmBookPurchase } from '../lib/server/confirmBookPurchase';
import { reconcileLibrary } from '../lib/server/reconcileLibrary';
import { currentBookPayment } from '../lib/server/currentBookPayment';
import { reconcileBookRefunds } from '../lib/server/bookRefunds';
import { salesSummary } from '../lib/admin/metrics';
import { settleUnpaidRefunds } from '../lib/server/settleUnpaidRefunds';
import { reviewPaymentRoyalties } from '../lib/server/authorPayments';
import { reconcileAuthorSettlement } from '../lib/server/reconcileAuthorSettlement';
import { reviewAdminSettlement } from '../lib/server/adminSettlement';
import type Stripe from 'stripe';
import { assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'demo-afrobooks-destination';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local Firestore emulator required');
const app = initializeApp({ projectId }, 'destination-tests');
const db = getFirestore(app);
let env: RulesTestEnvironment;
before(async () => { env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc('books/book').set({ sellerId: 'author', status: 'live', totalSales: 0 });
  await db.doc('sellers/author').set({ pendingBalance: 0, totalEarnings: 0, totalSales: 0 });
});
after(async () => { await env?.cleanup(); await deleteApp(app); });
async function seedOrder() {
  await db.doc('orders/order').set({ buyerId: 'reader', sellerId: 'author', bookId: 'book', bookTitle: 'Book', finalPrice: 1000, sellerEarnings: 800, stripePaymentIntentId: 'pi_test', status: 'pending' });
}
const payment = { id: 'pi_test', amount_received: 1000, currency: 'usd', metadata: { userId: 'reader' } };
function refundFixture() {
  const state = { amount: 1000, status: 'succeeded', fail: false };
  const stripe = {
    paymentIntents: { retrieve: async () => ({ ...payment, status: 'succeeded' }) },
    refunds: { list: async function* () {
      if (state.fail) throw new Error('Stripe unavailable');
      yield { id: 're_test', status: state.status, amount: state.amount };
    } },
  } as unknown as Stripe;
  return { state, stripe };
}

function settledRefundFixture() {
  const state = { active: true, owner: 'author', transfer: false, refund: 1000, disputed: false, fail: false };
  const stripe = {
    accounts: { retrieve: async () => ({ id: 'acct_author', details_submitted: true, payouts_enabled: state.active, capabilities: { transfers: 'active' }, metadata: { userId: state.owner } }) },
    paymentIntents: { retrieve: async (id: string) => ({ ...payment, id, amount_received: id === 'pi_new' ? 200 : 1000, status: 'succeeded', latest_charge: { id: 'ch_test', paid: true, amount_refunded: 0, disputed: state.disputed } }) },
    refunds: { list: async function* (params: { payment_intent: string }) { if (state.fail) throw new Error('Stripe unavailable'); if (params.payment_intent !== 'pi_new') yield { status: 'succeeded', amount: state.refund }; } },
    transfers: { list: async function* () { if (state.transfer) yield { id: 'tr_unknown' }; } },
  } as unknown as Stripe;
  return { state, stripe };
}

test('settled refunds with no author transfer clear the hold, preserve refunded access and allow new purchases', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author' });
  const f = settledRefundFixture();
  await reconcileBookRefunds(db, f.stripe, payment.id);
  const seller = (await db.doc('sellers/author').get()).data()!;
  assert.equal(seller.payoutHoldReason, undefined);
  assert.equal(seller.totalEarnings, 0);
  assert.equal(seller.pendingBalance, 0);
  assert.equal((await db.doc('orders/order').get()).data()?.refundRoyaltyStatus, 'settled_no_transfer');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal((await db.doc('payoutReviews/author').get()).data()?.status, 'resolved');
  const royalties = royaltyFixture();
  assert.equal(await reconcileAuthor(db, 'author', royalties.gateway), true);
  await reviewPaymentRoyalties(db, payment.id);
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
  const purchase = purchaseFixture();
  await createBookPurchase(db, purchase.gateway, 'reader', purchase.drafts, purchase.params);
  assert.equal(purchase.payments.size, 1);
});

test('uncredited historical refunds can be settled without reducing a zero author balance', async () => {
  await seedOrder();
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author' });
  await reconcileBookRefunds(db, settledRefundFixture().stripe, payment.id);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
});

test('refund hold settlement refuses transferred funds, partial refunds, disputes and account mismatches', async () => {
  await seedOrder();
  await db.doc('orders/order').update({ status: 'refunded', refundStatus: 'full' });
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author', payoutHoldReason: 'payment_review' });
  const f = settledRefundFixture();
  for (const [key, value] of Object.entries({ active: false, owner: 'someone_else', transfer: true, refund: 100, disputed: true })) {
    const saved = { ...f.state };
    Object.assign(f.state, { [key]: value });
    assert.equal(await settleUnpaidRefunds(db, f.stripe, 'author'), false, key);
    assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, 'payment_review');
    Object.assign(f.state, saved);
  }
  f.state.fail = true;
  await assert.rejects(settleUnpaidRefunds(db, f.stripe, 'author'), /Stripe unavailable/);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, 'payment_review');
});

test('refund settlement preserves other holds, payout reservations and unexplained balances', async () => {
  await seedOrder();
  await db.doc('orders/order').update({ status: 'refunded', refundStatus: 'full' });
  const seller = db.doc('sellers/author');
  await seller.update({ stripeAccountId: 'acct_author', payoutHoldReason: 'account_mismatch' });
  const f = settledRefundFixture();
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await seller.get()).data()?.payoutHoldReason, 'account_mismatch');
  await seller.update({ payoutHoldReason: 'payment_review' });
  await db.doc('payouts/reserved').set({ sellerId: 'author', status: 'pending' });
  assert.equal(await settleUnpaidRefunds(db, f.stripe, 'author'), false);
  await db.doc('payouts/reserved').delete();
  await seller.update({ totalEarnings: 99, pendingBalance: 99 });
  assert.equal(await settleUnpaidRefunds(db, f.stripe, 'author'), false);
  assert.equal((await seller.get()).data()?.totalEarnings, 99);
});

test('a new earned sale is preserved when unpaid refunded earnings are reconciled', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  await db.doc('orders/new').set({ buyerId: 'reader', sellerId: 'author', stripePaymentIntentId: 'pi_new', finalPrice: 200, status: 'completed', sellerEarnings: 200 });
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author', totalEarnings: 1000, pendingBalance: 1000 });
  await reconcileBookRefunds(db, settledRefundFixture().stripe, payment.id);
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 200);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 200);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
});

test('an unrelated disputed completed sale keeps the author held even when old refunds are settled', async () => {
  await seedOrder();
  await db.doc('orders/order').update({ status: 'refunded', refundStatus: 'full' });
  await db.doc('orders/new').set({ buyerId: 'reader', sellerId: 'author', stripePaymentIntentId: 'pi_new', finalPrice: 200, status: 'completed', sellerEarnings: 200 });
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author', totalEarnings: 200, pendingBalance: 200, payoutHoldReason: 'payment_review' });
  const f = settledRefundFixture();
  const retrieve = f.stripe.paymentIntents.retrieve;
  f.stripe.paymentIntents.retrieve = (async (id: string) => {
    const result = await retrieve(id);
    if (id === 'pi_new') (result.latest_charge as Stripe.Charge).disputed = true;
    return result;
  }) as Stripe['paymentIntents']['retrieve'];
  assert.equal(await settleUnpaidRefunds(db, f.stripe, 'author'), false);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, 'payment_review');
});

test('full refund removes paid access, corrects admin revenue and survives duplicate and late success events', async () => {
  await seedOrder();
  await db.doc('orders/order').update({ createdAt: new Date(), platformFee: 200 });
  await fulfillPayment(db, payment);
  const f = refundFixture();
  await Promise.all([reconcileBookRefunds(db, f.stripe, payment.id), reconcileBookRefunds(db, f.stripe, payment.id)]);
  const order = (await db.doc('orders/order').get()).data()!;
  assert.equal(order.status, 'refunded');
  assert.equal(order.paymentRefundedAmount, 1000);
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal(salesSummary([order as { status: string }], 30).gross, 0);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, 'payment_review');
  await fulfillPayment(db, payment);
  await reconcileLibrary(db, f.stripe, 'reader');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  await db.doc('notifications/order_purchase').update({ isRead: true });
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('notifications/order_purchase').get()).data()?.isRead, true);
});

test('refund before fulfillment never grants access or earnings on a delayed success', async () => {
  await seedOrder();
  await reconcileBookRefunds(db, refundFixture().stripe, payment.id);
  assert.equal(await fulfillPayment(db, payment), false);
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 0);
});

test('partial and pending refunds preserve existing access and clearly require financial review', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  const f = refundFixture(); f.state.status = 'pending';
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('orders/order').get()).data()?.refundStatus, 'pending');
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
  f.state.status = 'succeeded'; f.state.amount = 200;
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'needs_review');
  assert.equal((await db.doc('orders/order').get()).data()?.refundStatus, 'partial');
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
});

test('a failed refund never revokes access and a later failure of a full refund stays under review', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  const f = refundFixture(); f.state.status = 'failed';
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'completed');
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
  f.state.status = 'succeeded';
  await reconcileBookRefunds(db, f.stripe, payment.id);
  f.state.status = 'failed';
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'needs_review');
  assert.equal((await db.doc('orders/order').get()).data()?.refundStatus, 'failed');
});

test('refund preserves another completed purchase and free or independently owned copies', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  const old = (await db.doc('orders/order').get()).data()!;
  await db.doc('orders/other').set({ ...old, stripePaymentIntentId: 'pi_other' });
  const f = refundFixture();
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('library/reader_book').get()).data()?.orderId, 'other');
  await db.doc('library/reader_book').update({ purchaseType: 'free_copy', orderId: 'order' });
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('library/reader_book').get()).data()?.purchaseType, 'free_copy');
});

test('full refund releases only its own checkout reservation so a new purchase can be made', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  await db.doc('orders/order').update({ bookCheckoutId: 'old' });
  await db.doc('bookPurchaseLocks/reader_book').set({ checkoutId: 'old' });
  await reconcileBookRefunds(db, refundFixture().stripe, payment.id);
  assert.equal((await db.doc('bookPurchaseLocks/reader_book').get()).exists, false);
  const f = purchaseFixture();
  await createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params);
  assert.equal(f.payments.size, 1);
  const newLock = (await db.doc('bookPurchaseLocks/reader_book').get()).data()?.checkoutId;
  await reconcileBookRefunds(db, refundFixture().stripe, payment.id);
  assert.equal((await db.doc('bookPurchaseLocks/reader_book').get()).data()?.checkoutId, newLock);
});

test('Stripe failure commits no refund changes and unrelated payments do not touch orders', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  const f = refundFixture(); f.state.fail = true;
  await assert.rejects(reconcileBookRefunds(db, f.stripe, payment.id), /Stripe unavailable/);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'completed');
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
  assert.equal((await reconcileBookRefunds(db, f.stripe, 'pi_unrelated')).status, 'unrelated');
});

test('gift refunds revoke only the claimed gift after full settlement, preserving other copies', async () => {
  await seedOrder();
  await db.doc('orders/order').update({ status: 'completed', giftId: 'gift' });
  await db.doc('bookGifts/gift').set({ status: 'claimed', recipientId: 'friend', orderId: 'order', bookId: 'book' });
  await db.doc('library/friend_book').set({ userId: 'friend', bookId: 'book', purchaseType: 'bought', orderId: 'order', giftId: 'gift' });
  const f = refundFixture(); f.state.amount = 100;
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('library/friend_book').get()).exists, true);
  f.state.amount = 1000;
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('library/friend_book').get()).exists, false);
  assert.equal((await db.doc('bookGifts/gift').get()).data()?.reviewReason, 'payment_refunded');
  await db.doc('library/friend_book').set({ userId: 'friend', bookId: 'book', purchaseType: 'bought', orderId: 'independent' });
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('library/friend_book').get()).data()?.orderId, 'independent');
});

test('multiple successful refunds are summed while failed refund amounts are ignored', async () => {
  await seedOrder(); await fulfillPayment(db, payment);
  const f = refundFixture();
  f.stripe.refunds.list = (() => (async function* () {
    yield { status: 'succeeded', amount: 400 };
    yield { status: 'failed', amount: 1000 };
    yield { status: 'succeeded', amount: 600 };
  })()) as unknown as Stripe['refunds']['list'];
  assert.equal((await reconcileBookRefunds(db, f.stripe, payment.id)).status, 'full');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
});

test('full bundle refund removes all purchased titles while partial bundle refund preserves them', async () => {
  await seedOrder();
  await db.doc('orders/order').update({ finalPrice: 500, sellerEarnings: 400 });
  await db.doc('books/book2').set({ status: 'live', totalSales: 0 });
  await db.doc('orders/order2').set({ ...(await db.doc('orders/order').get()).data(), bookId: 'book2' });
  await fulfillPayment(db, payment);
  const f = refundFixture(); f.state.amount = 500;
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.collection('library').get()).size, 2);
  f.state.amount = 1000;
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.collection('library').get()).size, 0);
  assert.ok((await db.collection('orders').get()).docs.every(o => o.data().status === 'refunded'));
});
const giftInput = { senderId: 'reader', senderName: 'Alex', recipientEmail: 'friend@example.test', message: 'Enjoy this story!', attemptId: 'e85c20fc-031a-43ba-a289-383c25ae1823', order: { buyerId: 'reader', bookId: 'book', bookTitle: 'Story', sellerId: 'author', finalPrice: 1000, sellerEarnings: 800, status: 'pending' } };

function purchaseFixture() {
  const payments = new Map<string, Awaited<ReturnType<PurchaseGateway['retrieve']>>>();
  const state = { lostResponse: false, cancelRace: false };
  const gateway: PurchaseGateway = {
    create: async (params, options) => {
      if (!payments.has(options.idempotencyKey)) payments.set(options.idempotencyKey, { id: `pi_${payments.size + 1}`, amount: params.amount, status: 'requires_payment_method', client_secret: 'test-only' });
      if (state.lostResponse) { state.lostResponse = false; throw new Error('Response lost'); }
      return { ...payments.get(options.idempotencyKey)! };
    },
    retrieve: async id => ({ ...[...payments.values()].find(p => p.id === id)! }),
    cancel: async id => {
      const payment = [...payments.values()].find(p => p.id === id)!;
      if (state.cancelRace) { payment.status = 'succeeded'; throw new Error('Payment already succeeded'); }
      payment.status = 'canceled'; return { ...payment };
    },
  };
  const drafts = [{ ...giftInput.order, chargeRouting: 'separate', destinationAccountId: null, applicationFeeAmount: 0 }];
  const params = { amount: 1000, currency: 'usd', metadata: { userId: 'reader', purchaseType: 'books' } };
  return { gateway, payments, state, drafts, params };
}

test('owned books cannot start another payment, and a missing library record is restored from its receipt', async () => {
  const f = purchaseFixture();
  await seedOrder();
  await db.doc('orders/order').update({ status: 'completed' });
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), error => error instanceof BookPurchaseError && error.code === 'BOOK_ALREADY_OWNED');
  assert.equal(f.payments.size, 0);
  assert.equal((await db.doc('library/reader_book').get()).data()?.purchaseType, 'bought');
  await db.doc('orders/order').delete();
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), /already own/);
  assert.equal(f.payments.size, 0);
});

test('opening the library recovers a paid purchase without the receipt page, once, and prevents a second charge', async () => {
  await seedOrder();
  const stripe = { paymentIntents: { retrieve: async () => ({ ...payment, status: 'succeeded', latest_charge: { paid: true, amount_refunded: 0, disputed: false } }) } } as unknown as Stripe;
  await Promise.all([reconcileLibrary(db, stripe, 'reader'), reconcileLibrary(db, stripe, 'reader', { bookId: 'book' })]);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'completed');
  assert.equal((await db.doc('library/reader_book').get()).data()?.purchaseType, 'bought');
  await reconcileLibrary(db, stripe, 'reader');
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 800);
  assert.equal((await db.doc('books/book').get()).data()?.totalSales, 1);
  const f = purchaseFixture();
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), error => error instanceof BookPurchaseError && error.code === 'BOOK_ALREADY_OWNED');
  assert.equal(f.payments.size, 0);
});

test('a completed receipt repairs a missing library entry even after fulfillment was marked complete', async () => {
  await seedOrder();
  await fulfillPayment(db, payment);
  const addedAt = (await db.doc('orders/order').get()).data()?.fulfilledAt;
  await db.doc('library/reader_book').delete();
  const stripe = { paymentIntents: { retrieve: async () => { throw new Error('Completed receipts need no new Stripe request'); } } } as unknown as Stripe;
  const result = await reconcileLibrary(db, stripe, 'reader', { bookId: 'book' });
  assert.equal(result.restored, 1);
  assert.equal((await db.doc('library/reader_book').get()).data()?.addedAt.toMillis(), addedAt.toMillis());
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 800);
  assert.equal((await db.doc('books/book').get()).data()?.totalSales, 1);
  assert.equal((await reconcileLibrary(db, stripe, 'reader')).restored, 0);
});

test('library recovery excludes other readers, gifts, refunded or disputed charges, and unreadable payments', async () => {
  await seedOrder();
  let calls = 0;
  const current = { ...payment, status: 'succeeded', latest_charge: { paid: true, amount_refunded: 1000, disputed: false } };
  const stripe = { paymentIntents: { retrieve: async () => { calls++; return current; } } } as unknown as Stripe;
  assert.equal((await reconcileLibrary(db, stripe, 'other')).restored, 0);
  assert.equal(calls, 0);
  await db.doc('orders/gift').set({ ...giftInput.order, giftId: 'gift', status: 'completed' });
  assert.deepEqual((await reconcileLibrary(db, stripe, 'reader')).pendingOrderIds, ['order']);
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  current.latest_charge.amount_refunded = 0; current.latest_charge.disputed = true;
  await reconcileLibrary(db, stripe, 'reader');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  current.latest_charge.disputed = false; current.status = 'requires_payment_method';
  await reconcileLibrary(db, stripe, 'reader');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'pending');
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 0);
});

test('library recovery does not revive removed books or orders under review', async () => {
  await seedOrder();
  const stripe = {} as Stripe;
  await db.doc('orders/order').update({ status: 'completed' });
  await db.doc('bookDeletions/book').set({ status: 'completed' });
  assert.equal((await reconcileLibrary(db, stripe, 'reader')).restored, 0);
  await db.doc('bookDeletions/book').delete();
  await db.doc('books/book').update({ status: 'removed' });
  assert.equal((await reconcileLibrary(db, stripe, 'reader')).restored, 0);
  await db.doc('books/book').update({ status: 'live' });
  await db.doc('orders/order').update({ status: 'needs_review' });
  assert.deepEqual((await reconcileLibrary(db, stripe, 'reader')).pendingOrderIds, ['order']);
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
});

test('library recovery paginates old receipts without timestamps and scopes a book lookup', async () => {
  const batch = db.batch();
  for (let i = 0; i < 25; i++) {
    batch.set(db.doc(`orders/order${i}`), { buyerId: 'reader', bookId: `book${i}`, status: 'completed' });
    batch.set(db.doc(`books/book${i}`), { status: 'live' });
  }
  await batch.commit();
  const stripe = {} as Stripe;
  const first = await reconcileLibrary(db, stripe, 'reader');
  assert.equal(first.restored, 20);
  assert.ok(first.nextCursor);
  const second = await reconcileLibrary(db, stripe, 'reader', { cursor: first.nextCursor });
  assert.equal(second.restored, 5);
  assert.equal(second.nextCursor, null);
  assert.equal((await db.collection('library').get()).size, 25);
  await db.doc('library/reader_book1').delete();
  await db.doc('library/reader_book2').delete();
  assert.equal((await reconcileLibrary(db, stripe, 'reader', { bookId: 'book1' })).restored, 1);
  assert.equal((await db.doc('library/reader_book2').get()).exists, false);
});

test('simultaneous checkout requests reserve one order and reuse the same Stripe payment', async () => {
  const f = purchaseFixture();
  const results = await Promise.all(Array.from({ length: 3 }, () => createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params)));
  assert.equal(f.payments.size, 1);
  assert.equal(new Set(results.map(r => r.payment.id)).size, 1);
  assert.equal((await db.collection('orders').get()).size, 1);
  assert.equal((await db.collection('bookCheckouts').get()).size, 1);
  const payment = [...f.payments.values()][0]; payment.status = 'succeeded';
  const retry = await createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params);
  assert.equal(retry.payment.status, 'succeeded');
  assert.equal(f.payments.size, 1);
});

test('lost Stripe creation responses recover idempotently without creating a second payment', async () => {
  const f = purchaseFixture(); f.state.lostResponse = true;
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), /Response lost/);
  const result = await createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params);
  assert.equal(result.payment.id, 'pi_1'); assert.equal(f.payments.size, 1);
  assert.equal((await db.collection('orders').get()).size, 1);
});

test('changing a cart cancels the old unpaid payment before creating a replacement', async () => {
  const f = purchaseFixture();
  await createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params);
  await createBookPurchase(db, f.gateway, 'reader', [...f.drafts, { ...f.drafts[0], bookId: 'second' }], { ...f.params, amount: 2000 });
  assert.deepEqual([...f.payments.values()].map(p => p.status), ['canceled', 'requires_payment_method']);
  assert.equal((await db.collection('orders').where('status', '==', 'pending').get()).size, 2);
});

test('a confirmation racing cart cancellation never creates a second payment', async () => {
  const f = purchaseFixture();
  await createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params); f.state.cancelRace = true;
  const changed = [...f.drafts, { ...f.drafts[0], bookId: 'second' }];
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', changed, { ...f.params, amount: 2000 }), /already succeeded/);
  const retry = await createBookPurchase(db, f.gateway, 'reader', changed, { ...f.params, amount: 2000 });
  assert.equal(retry.payment.status, 'succeeded'); assert.equal(f.payments.size, 1);
});

test('unknown checkouts older than the Stripe idempotency window fail closed', async () => {
  const f = purchaseFixture(); f.state.lostResponse = true;
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params));
  const checkout = (await db.collection('bookCheckouts').get()).docs[0];
  await checkout.ref.update({ createdAt: new Date(Date.now() - 24 * 3600000) });
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), error => error instanceof BookPurchaseError && error.code === 'PAYMENT_PENDING');
  assert.equal(f.payments.size, 1);
});

test('legacy paid-but-unfulfilled orders block another charge while waiting for the webhook', async () => {
  const f = purchaseFixture();
  await seedOrder();
  f.payments.set('legacy', { id: 'pi_test', amount: 1000, status: 'succeeded', client_secret: null });
  await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), error => error instanceof BookPurchaseError && error.code === 'PAYMENT_PENDING');
  assert.equal(f.payments.size, 1);
  assert.equal((await db.collection('bookCheckouts').get()).size, 0);
});

test('receipt verification recovers a delayed webhook once and refuses another buyer or an unpaid/refunded charge', async () => {
  await seedOrder();
  let calls = 0;
  const current = { ...payment, status: 'requires_payment_method', latest_charge: { id: 'ch_paid', paid: true, amount_refunded: 0, disputed: false } };
  const stripe = { paymentIntents: { retrieve: async () => { calls++; return current; } } } as unknown as Stripe;
  await assert.rejects(confirmBookPurchase(db, stripe, 'other', ['order']), /Unauthorized receipt/);
  assert.equal(calls, 0);
  assert.deepEqual(await confirmBookPurchase(db, stripe, 'reader', ['order']), []);
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  current.status = 'succeeded'; current.latest_charge.amount_refunded = 100;
  await assert.rejects(confirmBookPurchase(db, stripe, 'reader', ['order']), /requires review/);
  current.latest_charge.amount_refunded = 0;
  await Promise.all([confirmBookPurchase(db, stripe, 'reader', ['order']), fulfillPayment(db, payment)]);
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 800);
  assert.equal((await db.doc('books/book').get()).data()?.totalSales, 1);
});

test('delayed success after a refund or dispute never grants access or author earnings', async () => {
  for (const change of [{ amount_refunded: 100 }, { disputed: true }]) {
   for (const routing of ['separate', 'destination']) {
    await env.clearFirestore();
    await db.doc('books/book').set({ sellerId: 'author', status: 'live', totalSales: 0 });
    await db.doc('sellers/author').set({ pendingBalance: 0, totalEarnings: 0 });
    await seedOrder();
    await db.doc('orders/order').update({ chargeRouting: routing });
    const stripe = {} as Stripe;
    const current = { ...payment, status: 'succeeded', latest_charge: { paid: true, amount_refunded: 0, disputed: false, ...change } } as unknown as Stripe.PaymentIntent;
    const verified = await currentBookPayment(stripe, current);
    await fulfillPayment(db, verified);
    await fulfillPayment(db, payment); // A stale retry cannot undo review.
    assert.equal((await db.doc('orders/order').get()).data()?.status, 'needs_review');
    assert.equal((await db.doc('orders/order').get()).data()?.reviewReason, 'payment_review');
    assert.equal((await db.doc('library/reader_book').get()).exists, false);
    assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 0);
    const f = purchaseFixture();
    await assert.rejects(createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params), /needs review/);
    assert.equal(f.payments.size, 0);
   }
  }
});

test('checkout reservations and paid library records cannot be edited by readers', async () => {
  const f = purchaseFixture();
  const result = await createBookPurchase(db, f.gateway, 'reader', f.drafts, f.params);
  const client = env.authenticatedContext('reader').firestore();
  const checkout = (await db.collection('bookCheckouts').get()).docs[0];
  for (const path of [`bookCheckouts/${checkout.id}`, 'bookPurchaseLocks/reader_book']) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { paymentIntentId: 'pi_fake' }));
  }
  await fulfillPayment(db, { ...payment, id: result.payment.id });
  await assertFails(setDoc(doc(client, 'library/reader_book'), { purchaseType: 'subscription' }));
});

const autoSettlement = { accountId: 'acct_author', chargeId: 'ch_auto', transferId: 'tr_auto', grossAmount: 1000, applicationFeeAmount: 200 };
async function seedDestinationOrder() {
  await seedOrder();
  await db.doc('orders/order').update({ chargeRouting: 'destination', destinationAccountId: 'acct_author', applicationFeeAmount: 200 });
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author' });
}
function autoTransferFixture() {
  const fixture = royaltyFixture();
  fixture.transfers.set('auto', { id: 'tr_auto', amount: 1000, currency: 'usd', destination: 'acct_author', source_transaction: 'ch_auto', reversed: false, amount_reversed: 0, metadata: {} });
  return fixture;
}

function reversedDestinationFixture() {
  const transfer = { id: 'tr_auto', amount: 1000, currency: 'usd', destination: 'acct_author', source_transaction: 'ch_auto', reversed: true, amount_reversed: 1000, metadata: {} };
  const fee = { amount: 200, amount_refunded: 0, currency: 'usd', account: 'acct_author', originating_transaction: 'ch_auto' };
  const current = { ...payment, status: 'succeeded', transfer_data: { destination: 'acct_author' }, application_fee_amount: 200,
    latest_charge: { id: 'ch_auto', paid: true, disputed: false, amount_refunded: 1000, transfer: 'tr_auto', application_fee: 'fee_auto' } };
  const state = { refund: 1000, refundStatus: 'succeeded', fail: false };
  const stripe = {
    accounts: { retrieve: async () => ({ id: 'acct_author', details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' }, metadata: { userId: 'author' } }) },
    paymentIntents: { retrieve: async () => { if (state.fail) throw new Error('Provider unavailable'); return current; } },
    refunds: { list: async function* () { yield { status: state.refundStatus, amount: state.refund }; } },
    applicationFees: { retrieve: async () => fee },
    transfers: { list: async function* () { yield transfer; } },
  } as unknown as Stripe;
  return { stripe, state, current, transfer, fee };
}
const settlementAdmin = { uid: 'admin', role: 'admin', status: 'active', email: null } as const;

test('admin settles fully reversed destination refunds, records retained fees and permits repurchase without re-holding', async () => {
  await seedDestinationOrder(); await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  const f = reversedDestinationFixture();
  const result = await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author');
  assert.equal(result.settled, true);
  assert.equal(result.retainedFeeCents, 200);
  const seller = (await db.doc('sellers/author').get()).data()!;
  assert.equal(seller.payoutHoldReason, undefined); assert.equal(seller.totalEarnings, 0); assert.equal(seller.pendingBalance, 0);
  assert.equal((await db.doc('payouts/destination_pi_test').get()).data()?.status, 'reversed');
  assert.equal((await db.doc('orders/order').get()).data()?.refundRoyaltyStatus, 'settled_reversed_transfer');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  const audit = (await db.collection('paymentSettlementAudits').get()).docs[0].data();
  assert.equal(audit.adminId, 'admin'); assert.equal(audit.status, 'settled');
  const worker = autoTransferFixture(); worker.transfers.set('auto', f.transfer);
  assert.equal(await reconcileAuthor(db, 'author', worker.gateway), true);
  await reconcileBookRefunds(db, f.stripe, payment.id);
  await reviewPaymentRoyalties(db, payment.id);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
  const fresh = purchaseFixture();
  await createBookPurchase(db, fresh.gateway, 'reader', fresh.drafts, fresh.params);
  assert.equal(fresh.payments.size, 1);
});

test('ordinary full destination-refund webhook settles a confirmed reversal automatically', async () => {
  await seedDestinationOrder(); await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  const f = reversedDestinationFixture(); f.fee.amount_refunded = 200;
  await reconcileBookRefunds(db, f.stripe, payment.id);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
  assert.equal((await db.doc('payoutReviews/author').get()).data()?.retainedFeeCents, 0);
  assert.equal((await db.doc('payouts/destination_pi_test').get()).data()?.retainedApplicationFeeCents, 0);
});

test('settlement blocks pending/partial refunds and missing, partial or mismatched transfer reversals', async () => {
  await seedDestinationOrder(); await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  const f = reversedDestinationFixture();
  f.transfer.reversed = false; f.transfer.amount_reversed = 0;
  let result = await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author');
  assert.equal(result.settled, false); assert.match(result.message, /not been fully reversed/);
  f.transfer.reversed = true; f.transfer.amount_reversed = 900;
  assert.equal((await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author')).settled, false);
  f.transfer.amount_reversed = 1000; f.transfer.source_transaction = 'ch_wrong';
  assert.equal((await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author')).settled, false);
  f.transfer.source_transaction = 'ch_auto'; f.state.refund = 500;
  assert.equal((await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author')).settled, false);
  f.state.refund = 1000; f.state.refundStatus = 'pending';
  assert.equal((await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author')).settled, false);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, 'payment_review');
});

test('admin settlement refuses normal and suspended accounts and cannot silently overwrite a balance mismatch', async () => {
  await seedDestinationOrder(); await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  const f = reversedDestinationFixture();
  await assert.rejects(reviewAdminSettlement(db, f.stripe, { ...settlementAdmin, role: 'buyer' }, 'author'), /Admin access/);
  await assert.rejects(reviewAdminSettlement(db, f.stripe, { ...settlementAdmin, status: 'suspended' }, 'author'), /Admin access/);
  assert.equal((await db.collection('paymentSettlementAudits').get()).size, 0);
  await db.doc('sellers/author').update({ totalEarnings: 1500 });
  const result = await reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author');
  assert.equal(result.settled, false); assert.match(result.message, /balances differ/);
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 1500);
});

test('concurrent settlement requests do not deduct royalties twice and provider failure remains auditable', async () => {
  await seedDestinationOrder(); await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  const f = reversedDestinationFixture(); f.state.fail = true;
  await assert.rejects(reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author'), /Provider unavailable/);
  assert.equal((await db.collection('paymentSettlementAudits').get()).docs[0].data()?.status, 'failed');
  f.state.fail = false;
  const results = await Promise.all([reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author'), reviewAdminSettlement(db, f.stripe, settlementAdmin, 'author')]);
  assert.ok(results.every(r => r.settled));
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 0);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
});

test('destination fulfillment records one automatic net payout and retries never send another transfer', async () => {
  await seedDestinationOrder();
  const paid = { ...payment, destinationSettlement: autoSettlement };
  await Promise.all([fulfillPayment(db, paid), fulfillPayment(db, paid), fulfillPayment(db, paid)]);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await db.doc('sellers/author').get()).data()?.totalEarnings, 800);
  assert.equal((await db.doc('books/book').get()).data()?.totalSales, 1);
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
  const payout = (await db.doc('payouts/destination_pi_test').get()).data();
  assert.equal(payout?.amountCents, 800);
  assert.equal(payout?.grossAmountCents, 1000);
  assert.equal(payout?.status, 'paid');
  const { gateway, state, transfers } = autoTransferFixture();
  await db.doc('platformSettings/global').set({ automatedPayoutsEnabled: true });
  await processAuthorRoyalties(db, gateway);
  assert.equal(state.createCalls, 0);
  assert.equal(transfers.size, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
});

test('destination fulfillment fails closed for missing settlement, wrong recipient, fee or routing', async () => {
  await seedDestinationOrder();
  await assert.rejects(fulfillPayment(db, payment), /Destination order mismatch/);
  for (const change of [{ accountId: 'acct_other' }, { applicationFeeAmount: 199 }, { grossAmount: 999 }]) {
    await assert.rejects(fulfillPayment(db, { ...payment, destinationSettlement: { ...autoSettlement, ...change } }), /Destination order mismatch/);
  }
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'pending');
  assert.equal((await db.collection('payouts').get()).size, 0);
  await db.doc('orders/order').update({ chargeRouting: 'separate' });
  await assert.rejects(fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement }), /Destination order mismatch/);
});

test('multiple books from one author share one destination payout while legacy royalties remain payable', async () => {
  await seedDestinationOrder();
  await db.doc('orders/order').update({ finalPrice: 500, sellerEarnings: 400 });
  await db.doc('books/second').set({ sellerId: 'author', status: 'live', totalSales: 0 });
  await db.doc('orders/second').set({ ...(await db.doc('orders/order').get()).data(), bookId: 'second' });
  await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  assert.equal((await db.doc('library/reader_second').get()).exists, true);
  assert.deepEqual((await db.doc('payouts/destination_pi_test').get()).data()?.orderIds.sort(), ['order', 'second']);
  await db.doc('orders/legacy').set({ buyerId: 'reader', sellerId: 'author', bookId: 'book', finalPrice: 1000, sellerEarnings: 800, stripePaymentIntentId: 'pi_legacy', status: 'completed' });
  await db.doc('sellers/author').update({ totalEarnings: 1600, pendingBalance: 800 });
  await db.doc('platformSettings/global').set({ automatedPayoutsEnabled: true });
  const { gateway, state } = autoTransferFixture();
  await processAuthorRoyalties(db, gateway);
  assert.equal(state.createCalls, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await db.doc('payouts/royalty_legacy').get()).data()?.status, 'paid');
  assert.equal((await db.collection('payouts').get()).size, 2);
});

test('a reversed automatic transfer holds further payouts and is never replaced', async () => {
  await seedDestinationOrder();
  await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  const { gateway, state, transfers } = autoTransferFixture();
  transfers.get('auto')!.amount_reversed = 100;
  assert.equal(await reconcileAuthor(db, 'author', gateway), false);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, 'unrecorded_transfer');
  assert.equal(await payAuthorOrder(db, 'order', gateway), 'skipped');
  assert.equal(state.createCalls, 0);
});

test('an automatic transfer arriving before fulfillment defers reconciliation without holding or duplicating funds', async () => {
  await seedDestinationOrder();
  const { gateway, state } = autoTransferFixture();
  const retrieve = gateway.payment;
  gateway.payment = async id => ({ ...await retrieve(id), destinationAccountId: 'acct_author', charge: { id: 'ch_auto', transferId: 'tr_auto', paid: true, amount_refunded: 0, disputed: false } });
  assert.equal(await reconcileAuthor(db, 'author', gateway), false);
  assert.equal((await db.doc('sellers/author').get()).data()?.payoutHoldReason, undefined);
  assert.equal(state.createCalls, 0);
  await fulfillPayment(db, { ...payment, destinationSettlement: autoSettlement });
  assert.equal(await reconcileAuthor(db, 'author', gateway), true);
});

test('legacy royalty processing refuses a destination payment even if its order marker is missing', async () => {
  const { gateway, state } = royaltyFixture();
  await seedRoyalty(db);
  await reconcileAuthor(db, 'author', gateway);
  const retrieve = gateway.payment;
  gateway.payment = async id => ({ ...await retrieve(id), destinationAccountId: 'acct_author' });
  assert.equal(await payAuthorOrder(db, 'royalty-order', gateway), 'needs_review');
  assert.equal(state.createCalls, 0);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
});

test('destination gift retries preserve original routing and record funds without granting sender access', async () => {
  const gift = await prepareBookGift(db, { ...giftInput, order: { ...giftInput.order, chargeRouting: 'destination', destinationAccountId: 'acct_author', applicationFeeAmount: 200 } });
  await prepareBookGift(db, { ...giftInput, order: { ...giftInput.order, chargeRouting: 'separate', destinationAccountId: null, applicationFeeAmount: 0 } });
  assert.equal((await db.doc(`orders/${gift.orderId}`).get()).data()?.chargeRouting, 'destination');
  await attachGiftPayment(db, gift.id, 'pi_gift_dest');
  const paid = { ...payment, id: 'pi_gift_dest', metadata: { userId: 'reader', giftId: gift.id }, destinationSettlement: autoSettlement };
  await Promise.all([fulfillPayment(db, paid), fulfillPayment(db, paid)]);
  assert.equal((await db.doc(`bookGifts/${gift.id}`).get()).data()?.status, 'available');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await db.collection('payouts').get()).size, 1);
});
