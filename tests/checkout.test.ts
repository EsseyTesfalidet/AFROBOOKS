import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFees } from '../lib/utils/fees';
import { calculateEarnings } from '../lib/utils/calculateEarnings';
import { receiptStatus } from '../lib/utils/receiptStatus';
import { paymentConfiguration } from '../lib/stripe/config';

test('configured fees and author estimates agree for a discounted order', () => {
  const fees = calculateFees(799, 20);
  assert.deepEqual(fees, { stripeFee: 53, platformFee: 149, sellerEarnings: 597 });
  assert.equal(calculateEarnings(799, 20).sellerEarnings, fees.sellerEarnings);
  assert.equal(Object.values(fees).reduce((a,b) => a+b), 799);
  assert.throws(() => calculateFees(799, NaN));
  assert.throws(() => calculateFees(799, 101));
  assert.deepEqual(calculateFees(0), { stripeFee: 0, platformFee: 0, sellerEarnings: 0 });
});

test('receipts require every order to be fulfilled before announcing success', () => {
  assert.equal(receiptStatus(2, [{ status: 'completed' }]), 'processing');
  assert.equal(receiptStatus(2, [{ status: 'completed' }, { status: 'pending' }]), 'processing');
  assert.equal(receiptStatus(2, [{ status: 'completed' }, { status: 'completed' }]), 'completed');
  assert.equal(receiptStatus(1, [{ status: 'refunded' }]), 'unavailable');
  assert.equal(receiptStatus(1, [{ status: 'needs_review' }]), 'unavailable');
  assert.equal(receiptStatus(0, []), 'processing');
});

test('production checkout requires matching live keys and a webhook secret', () => {
  const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
  assert.equal(paymentConfiguration(env).checkoutReady, true);
  assert.equal(paymentConfiguration({ ...env, VERCEL_ENV: 'production' }).checkoutReady, false);
  assert.equal(paymentConfiguration({ ...env, STRIPE_SECRET_KEY: 'sk_live_fixture' }).checkoutReady, false);
  const live = { ...env, VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_fixture', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture' };
  assert.equal(paymentConfiguration(live).checkoutReady, true);
  assert.equal(paymentConfiguration({ ...live, STRIPE_WEBHOOK_SECRET: undefined }).checkoutReady, false);
  assert.equal(paymentConfiguration({}).checkoutReady, false);
});
