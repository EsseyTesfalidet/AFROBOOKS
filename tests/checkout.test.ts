import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFees, calculateCartPricing, calculateCartTotals, priceForSellerEarnings, MIN_BOOK_PRICE_CENTS, MAX_BOOK_PRICE_CENTS } from '../lib/utils/fees';
import { calculateEarnings } from '../lib/utils/calculateEarnings';
import { receiptStatus } from '../lib/utils/receiptStatus';
import { paymentConfiguration } from '../lib/stripe/config';
import { accountReadiness } from '../functions/src/stripe/accountReadiness';
import { formatStripeAmount } from '../lib/utils/stripeMoney';
import { bookRouting, routingParameters } from '../lib/stripe/bookRouting';
import { destinationSettlement } from '../lib/server/destinationPayment';
import type Stripe from 'stripe';
import { pricingGuidance } from '../lib/utils/pricingGuidance';
import { cartMinimum, minimumPublicationPrice } from '../lib/utils/fees';

test('short story bundles enforce an affordable minimum after discounts and share one processing fee', () => {
  assert.equal(minimumPublicationPrice('short_story'), 10);
  assert.equal(minimumPublicationPrice('magazine'), 50);
  assert.equal(cartMinimum([25]).remaining, 75);
  assert.equal(cartMinimum(Array(10).fill(10)).remaining, 5);
  assert.equal(cartMinimum(Array(11).fill(10)).remaining, 0);
  assert.equal(cartMinimum([50]).remaining, 0);
  const cart = calculateCartPricing(Array(5).fill(25));
  assert.equal(cart.total, 119);
  assert.equal(cart.stripeFee, 33);
  assert.equal(cart.sellerEarnings, 73);
  assert.equal(cart.lines.reduce((sum, line) => sum + line.sellerEarnings, 0), cart.sellerEarnings);
  assert.ok(cart.lines.every(line => line.sellerEarnings > 0));
  assert.equal(pricingGuidance(1000, '', 'all', 'short_story').suggested, 25);
});

test('pricing guidance stays within checkout limits and quotes the current author fee', () => {
  for (const count of [NaN, -1, 0, 9999, 10000, 39999, 40000, 200000]) {
    const range = pricingGuidance(count);
    assert.ok(range.low >= MIN_BOOK_PRICE_CENTS && range.high <= MAX_BOOK_PRICE_CENTS);
    assert.ok(range.low <= range.suggested && range.suggested <= range.high);
    for (const price of [range.low, range.suggested, range.high]) {
      const fees = calculateFees(price, 20);
      assert.equal(fees.sellerEarnings + fees.platformFee + fees.stripeFee, price);
      assert.ok(fees.sellerEarnings > 0);
    }
  }
  assert.equal(pricingGuidance(9999).suggested, 199);
  assert.equal(pricingGuidance(10000).suggested, 399);
  assert.equal(pricingGuidance(40000).suggested, 699);
});

test('poetry and children’s pricing guidance does not devalue a book based on word count', () => {
  assert.deepEqual(pricingGuidance(1000, 'Poetry'), pricingGuidance(60000, 'Poetry'));
  assert.deepEqual(pricingGuidance(1000, 'Fiction', 'children'), pricingGuidance(60000, 'Fiction', 'children'));
});

test('single-author destination charges retain fees and preserve quoted author earnings', () => {
  const pricing = calculateCartPricing([499, 699, 999]);
  const routing = bookRouting(new Map([['author', 'acct_author']]), pricing.total, pricing.sellerEarnings, true);
  assert.deepEqual(routingParameters(routing), { transfer_data: { destination: 'acct_author' }, application_fee_amount: pricing.stripeFee + pricing.platformFee });
  assert.equal(pricing.total - routing.applicationFeeAmount, pricing.sellerEarnings);
  for (const enabled of [true, false]) {
    assert.deepEqual(routingParameters(bookRouting(new Map([['a', 'acct_a'], ['b', 'acct_b']]), pricing.total, pricing.sellerEarnings, enabled)), {});
  }
  assert.deepEqual(routingParameters(bookRouting(new Map([['a', 'acct_a']]), 1000, 800, false)), {});
  assert.deepEqual(routingParameters(bookRouting(new Map([['a', 'acct_a']]), 1000, 0, true)), {});
  assert.throws(() => bookRouting(new Map([['a', 'not-an-account']]), 1000, 800, true));
  assert.throws(() => bookRouting(new Map([['a', 'acct_a']]), 1000, 1001, true));
});

test('destination settlement verifies the actual transfer and application fee before crediting a sale', async () => {
  const payment = { status: 'succeeded', currency: 'usd', amount_received: 1000, application_fee_amount: 200, transfer_data: { destination: 'acct_author' }, latest_charge: { id: 'ch_platform', paid: true, amount_refunded: 0, disputed: false, transfer: 'tr_auto', application_fee: 'fee_auto' } } as unknown as Stripe.PaymentIntent;
  const transfer = { id: 'tr_auto', amount: 1000, currency: 'usd', destination: 'acct_author', source_transaction: 'ch_platform', reversed: false, amount_reversed: 0 };
  // The fee's charge is the connected-account charge, not the platform charge.
  const fee = { amount: 200, currency: 'usd', account: 'acct_author', charge: 'py_connected', originating_transaction: 'ch_platform', refunded: false, amount_refunded: 0 };
  const stripe = { transfers: { retrieve: async () => transfer }, applicationFees: { retrieve: async () => fee } } as unknown as Stripe;
  assert.deepEqual(await destinationSettlement(stripe, payment), { accountId: 'acct_author', chargeId: 'ch_platform', transferId: 'tr_auto', grossAmount: 1000, applicationFeeAmount: 200 });
  for (const change of [{ destination: 'acct_other' }, { amount: 800 }, { amount_reversed: 1 }, { source_transaction: 'ch_other' }]) {
    const invalid = { ...stripe, transfers: { retrieve: async () => ({ ...transfer, ...change }) } } as unknown as Stripe;
    await assert.rejects(destinationSettlement(invalid, payment), /mismatch/);
  }
  const refundedFee = { ...stripe, applicationFees: { retrieve: async () => ({ ...fee, amount_refunded: 1 }) } } as unknown as Stripe;
  await assert.rejects(destinationSettlement(refundedFee, payment), /mismatch/);
  await assert.rejects(destinationSettlement(stripe, { ...payment, latest_charge: { ...payment.latest_charge as Stripe.Charge, transfer: undefined } }), /not yet available/);
});

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

test('submitting Stripe details alone does not make an author payout-ready', () => {
  const account = { id: 'acct_fixture', details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' } };
  assert.equal(accountReadiness(account).stripeAccountStatus, 'active');
  for (const partial of [{ payouts_enabled: false }, { details_submitted: false }, { capabilities: { transfers: 'pending' } }, { deleted: true }, { requirements: { disabled_reason: 'requirements.past_due' } }]) {
    assert.equal(accountReadiness({ ...account, ...partial }).stripeAccountStatus, 'pending');
  }
  assert.deepEqual(accountReadiness({ ...account, requirements: { currently_due: null, past_due: null } }).stripeRequirementsDue, []);
});

test('bank payout amounts use Stripe minor units for both decimal and zero-decimal currencies', () => {
  assert.equal(formatStripeAmount(1500, 'usd'), '$15.00');
  assert.equal(formatStripeAmount(1500, 'jpy'), '¥1,500');
  assert.match(formatStripeAmount(500, 'ugx'), /5$/);
  assert.match(formatStripeAmount(500, 'isk'), /5$/);
});
