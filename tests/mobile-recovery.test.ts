import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { recoverBookCheckout } from '../lib/server/recoverBookCheckout';
import { appFetch } from '../lib/network';
import { publicationDraftKey } from '../lib/publishing/localDrafts';

function fixture(status: string, order: Record<string, unknown> = {}, payment: Record<string, unknown> = {}) {
  const reads: string[] = [];
  const db = { doc: () => ({ get: async () => ({ exists: true, data: () => ({ buyerId: 'reader', stripePaymentIntentId: 'pi_saved', status: 'pending', ...order }) }) }) } as unknown as Firestore;
  const stripe = { paymentIntents: { retrieve: async (id: string) => {
    reads.push(id);
    return { status, metadata: { userId: 'reader' }, latest_charge: null, ...payment };
  } } } as unknown as Stripe;
  return { check: () => recoverBookCheckout(db, stripe, 'reader', ['order']), reads };
}

test('recovery checks Stripe without charging and never offers retry for paid or uncertain payments', async () => {
  for (const status of ['succeeded', 'processing', 'requires_capture', 'unrecognized_future_status']) {
    const value = fixture(status);
    assert.equal(await value.check(), 'pending');
    assert.deepEqual(value.reads, ['pi_saved']);
  }
  for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled']) {
    assert.equal(await fixture(status).check(), 'retryable');
  }
});

test('recovery preserves account boundaries, refund holds and inconsistent records', async () => {
  const other = fixture('succeeded', { buyerId: 'another-user' });
  await assert.rejects(other.check(), /Unauthorized/);
  assert.deepEqual(other.reads, []);
  await assert.rejects(fixture('succeeded', {}, { metadata: { userId: 'another-user' } }).check(), /Unauthorized/);
  assert.equal(await fixture('requires_payment_method', { stripePaymentIntentId: null }).check(), 'pending');
  assert.equal(await fixture('requires_payment_method', { status: 'completed' }).check(), 'review');
  for (const status of ['refunded', 'needs_review', 'disputed']) assert.equal(await fixture('succeeded', { status }).check(), 'review');
  for (const charge of [{ amount_refunded: 100, disputed: false }, { amount_refunded: 0, disputed: true }]) {
    assert.equal(await fixture('succeeded', {}, { latest_charge: charge }).check(), 'review');
  }
});

test('a timed-out POST is never replayed automatically', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, options) => {
    calls++;
    return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('Timeout'))));
  };
  try {
    await assert.rejects(appFetch('https://example.invalid/save', { method: 'POST' }, 5), /Timeout/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('local draft keys isolate accounts and different publications', () => {
  assert.notEqual(publicationDraftKey('one', null), publicationDraftKey('two', null));
  assert.notEqual(publicationDraftKey('one', 'book-a'), publicationDraftKey('one', 'book-b'));
  assert.notEqual(publicationDraftKey('one', null), publicationDraftKey('one', 'new'));
  assert.notEqual(publicationDraftKey('one:two', 'three'), publicationDraftKey('one', 'two:three'));
});
