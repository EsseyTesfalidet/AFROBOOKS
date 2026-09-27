import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFees, calculateCartPricing, calculateCartTotals, priceForSellerEarnings, MIN_BOOK_PRICE_CENTS, MAX_BOOK_PRICE_CENTS } from '../lib/utils/fees';
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

test('author earnings targets include platform commission and processing in the retail price', () => {
  assert.equal(priceForSellerEarnings(500), 636);
  assert.deepEqual(calculateFees(636), { stripeFee: 48, platformFee: 88, sellerEarnings: 500 });
  for (const rate of [0, 10, 15, 20, 33.5, 99]) {
    for (const target of [1, 50, 299, 500, 999, 12345, 99999]) {
      const price = priceForSellerEarnings(target, rate);
      assert.ok(calculateFees(price, rate).sellerEarnings >= target);
      if (price > MIN_BOOK_PRICE_CENTS) assert.ok(calculateFees(price - 1, rate).sellerEarnings < target);
    }
  }
  for (const target of [0, -1, 0.5, NaN, Infinity, MAX_BOOK_PRICE_CENTS]) assert.throws(() => priceForSellerEarnings(target));
  assert.throws(() => priceForSellerEarnings(500, 100));
  assert.throws(() => priceForSellerEarnings(500, NaN));
});

test('multi-book payments deduct the fixed processing cost once and share it across authors', () => {
  const cart = calculateCartPricing([999, 999, 999]);
  assert.deepEqual(calculateCartTotals([999, 999, 999]), { subtotal: 2997, bundleDiscount: 150, total: 2847 });
  assert.equal(cart.total, 2847);
  assert.equal(cart.stripeFee, 113);
  assert.equal(cart.platformFee, 410);
  assert.equal(cart.sellerEarnings, 2324);
  assert.deepEqual(cart.lines.map(line => line.discountAmount), [50, 50, 50]);
  assert.deepEqual(cart.lines.map(line => line.stripeFee), [38, 38, 37]);
  assert.equal(calculateCartPricing([999]).sellerEarnings, calculateFees(999).sellerEarnings);
  assert.equal(calculateCartPricing([999, 999]).stripeFee, 88);
});

test('discounts and fee allocations conserve every cent including uneven prices and zero lines', () => {
  const carts = [[], [0], [0, 0, 0], [0, 50, 999], [1, 1, 1], [50, 51, 52], [499, 699, 999], [1, 99999998, 99999999], Array(20).fill(99999999)];
  for (const prices of carts) {
    for (const rate of [0, 15, 17.5, 100]) {
      const cart = calculateCartPricing(prices, rate);
      assert.deepEqual({ subtotal: cart.subtotal, bundleDiscount: cart.bundleDiscount, total: cart.total }, calculateCartTotals(prices));
      const sum = (key: keyof typeof cart.lines[number]) => cart.lines.reduce((total, line) => total + line[key], 0);
      assert.equal(sum('discountAmount'), cart.bundleDiscount);
      assert.equal(sum('finalPrice'), cart.total);
      assert.equal(sum('stripeFee'), cart.stripeFee);
      assert.equal(sum('platformFee'), cart.platformFee);
      assert.equal(sum('sellerEarnings'), cart.sellerEarnings);
      assert.equal(cart.stripeFee + cart.platformFee + cart.sellerEarnings, cart.total);
      for (const line of cart.lines) {
        assert.ok(Object.values(line).every(value => Number.isSafeInteger(value) && value >= 0));
        assert.equal(line.originalPrice - line.discountAmount, line.finalPrice);
        assert.equal(line.stripeFee + line.platformFee + line.sellerEarnings, line.finalPrice);
      }
    }
  }
  for (const prices of [[NaN], [-1], [0.5], [Infinity], [MAX_BOOK_PRICE_CENTS + 1]]) assert.throws(() => calculateCartPricing(prices));
  assert.throws(() => calculateCartPricing([999], 101));
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
