import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import Connect from 'stripe-connect';
import { destinationSettlement } from '../lib/server/destinationPayment';
import { bookRouting, routingParameters } from '../lib/stripe/bookRouting';
import { calculateCartPricing } from '../lib/utils/fees';

async function main() {
  const env = parseEnv(readFileSync('.env.local', 'utf8'));
  assert.ok(env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Only Stripe test mode is allowed');
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10', timeout: 15000, maxNetworkRetries: 1 });
  const attempt = randomUUID();
  const connect = new Connect(env.STRIPE_SECRET_KEY!, { apiVersion: '2026-08-26.dahlia', timeout: 15000 });
  const account = await connect.v2.core.accounts.create({
    dashboard: 'none', contact_email: 'afrobooks-destination@example.test',
    configuration: { merchant: { mcc: '5734', capabilities: { card_payments: { requested: true } } }, recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
    defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' }, profile: { business_url: 'https://afrobs.com', product_description: 'Synthetic ebook payment test' } },
    identity: { country: 'US', entity_type: 'individual',
      individual: { given_name: 'Test', surname: 'Author', email: 'afrobooks-destination@example.test', phone: '+12025550123', date_of_birth: { day: 1, month: 1, year: 1902 }, address: { line1: 'address_full_match', city: 'New York', state: 'NY', postal_code: '10001', country: 'US' }, id_numbers: [{ type: 'us_ssn', value: '222222222' }] },
      attestations: { terms_of_service: { account: { date: new Date().toISOString(), ip: '127.0.0.1' } } },
    },
    metadata: { diagnostic: 'afrobooks-destination-test', userId: 'synthetic-author' },
  }, { idempotencyKey: `destination-account-${attempt}` });
  let payment: Stripe.PaymentIntent | undefined;
  let refunded = false;
  try {
    assert.equal(account.livemode, false);
    await stripe.accounts.createExternalAccount(account.id, { external_account: 'btok_us_verified' });
    let ready = await stripe.accounts.retrieve(account.id);
    for (let attempt = 0; !ready.payouts_enabled && attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      ready = await stripe.accounts.retrieve(account.id);
    }
    console.log(JSON.stringify({ testAccount: account.id, transfers: ready.capabilities?.transfers, payoutsEnabled: ready.payouts_enabled, requirements: ready.requirements?.currently_due, pendingVerification: ready.requirements?.pending_verification, disabledReason: ready.requirements?.disabled_reason }));
    assert.equal(ready.capabilities?.transfers, 'active');
    // Destination settlement requires active transfers. Bank payout readiness is
    // a separate production checkout guard; no test bank payout is requested.
    const pricing = calculateCartPricing([1000]);
    const routing = bookRouting(new Map([['synthetic-author', account.id]]), pricing.total, pricing.sellerEarnings, true);
    payment = await stripe.paymentIntents.create({ amount: pricing.total, currency: 'usd', ...routingParameters(routing), payment_method_types: ['card'], payment_method: 'pm_card_visa', confirm: true, metadata: { diagnostic: 'afrobooks-destination-test' } }, { idempotencyKey: `destination-payment-${attempt}` });
    assert.equal(payment.livemode, false);
    let latest = await stripe.paymentIntents.retrieve(payment.id, { expand: ['latest_charge'] });
    for (let retry = 0; typeof latest.latest_charge !== 'object' || !latest.latest_charge?.transfer; retry++) {
      if (retry >= 10) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
      latest = await stripe.paymentIntents.retrieve(payment.id, { expand: ['latest_charge'] });
    }
    console.log(JSON.stringify({ routing, paymentStatus: latest.status, charge: typeof latest.latest_charge === 'object' ? { id: latest.latest_charge?.id, paid: latest.latest_charge?.paid, transfer: latest.latest_charge?.transfer, fee: latest.latest_charge?.application_fee } : latest.latest_charge }));
    const settlement = await destinationSettlement(stripe, latest);
    assert.equal(settlement.grossAmount - settlement.applicationFeeAmount, pricing.sellerEarnings);
    console.log(JSON.stringify({ paymentSucceeded: payment.status === 'succeeded', transferVerified: true, grossCents: settlement.grossAmount, retainedCents: settlement.applicationFeeAmount, authorNetCents: pricing.sellerEarnings, liveMode: false }));
    const refund = await stripe.refunds.create({ payment_intent: payment.id, reverse_transfer: true, refund_application_fee: true }, { idempotencyKey: `destination-refund-${attempt}` });
    refunded = refund.status === 'succeeded';
    assert.equal(refunded, true);
    assert.equal((await stripe.transfers.retrieve(settlement.transferId)).reversed, true);
    console.log(JSON.stringify({ syntheticRefundVerified: true, syntheticTransferReversed: true }));
  } finally {
    if (payment?.status === 'succeeded' && !refunded) await stripe.refunds.create({ payment_intent: payment.id, reverse_transfer: true, refund_application_fee: true }, { idempotencyKey: `destination-refund-${attempt}` });
    await connect.v2.core.accounts.close(account.id, { applied_configurations: ['merchant', 'recipient'] });
    console.log(JSON.stringify({ syntheticAccountDeleted: true }));
  }
}
main().catch(error => { console.error(JSON.stringify({ type: error.type || error.name, code: error.code, message: String(error.message).replace(/(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g, '[REDACTED]') })); process.exitCode = 1; });
