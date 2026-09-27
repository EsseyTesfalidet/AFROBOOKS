import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorAccountParameters,
  authorConnectFailure,
  authorOnboardingLink,
  createAuthorAccount,
} from '../lib/server/authorConnect';
import { connectFixture } from './connect-fixture';

test('author onboarding requests Express recipient capabilities and preserves country and ownership', () => {
  const params = authorAccountParameters('author', 'author@example.test', 'US');
  assert.equal(params.identity?.country, 'US');
  assert.equal(params.dashboard, 'express');
  assert.equal(params.metadata?.userId, 'author');
  assert.equal(
    params.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.requested,
    true,
  );
  assert.equal(params.configuration?.merchant, undefined);
  assert.deepEqual(params.defaults?.responsibilities, {
    fees_collector: 'application',
    losses_collector: 'application',
  });
  assert.equal(authorAccountParameters('author', null, 'CA').contact_email, undefined);
});

test('country-required merchant capability retries only a definitive Stripe validation rejection', async () => {
  const fixture = connectFixture();
  fixture.state.createError = {
    code: 'capability_not_available_without_other_capability',
    param: 'configuration.recipient.capabilities.stripe_balance.stripe_transfers',
    message: 'Please request configuration.merchant.capabilities.card_payments.',
  };
  await createAuthorAccount(fixture.connect, 'author', null, 'CA');
  assert.equal(fixture.state.creates.length, 2);
  assert.equal(
    fixture.state.creates[1].params.configuration?.merchant?.capabilities?.card_payments?.requested,
    true,
  );
  assert.notEqual(fixture.state.creates[0].key, fixture.state.creates[1].key);
  assert.equal(fixture.state.accounts.length, 1);
  for (const error of [
    new Error('timeout'),
    { code: 'platform_registration_required' },
    {
      code: 'capability_not_available_without_other_capability',
      param: 'different',
      message: 'configuration.merchant.capabilities.card_payments',
    },
  ]) {
    const failed = connectFixture();
    failed.state.createError = error;
    await assert.rejects(createAuthorAccount(failed.connect, 'author', null, 'US'));
    assert.equal(
      failed.state.creates.length,
      1,
      'Ambiguous failures must never create a second account',
    );
  }
});

test('v2 onboarding collects all applied payout configurations and returns directly to the payout screen', async () => {
  const fixture = connectFixture();
  fixture.state.configurations = ['recipient', 'merchant', 'customer'];
  const url = await authorOnboardingLink(
    fixture.stripe,
    fixture.connect,
    'acct_author',
    'v2',
    'https://afrobs.com',
  );
  assert.equal(new URL(url).hostname, 'connect.stripe.com');
  assert.deepEqual(fixture.state.links[0], {
    account: 'acct_author',
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient', 'merchant'],
        collection_options: { fields: 'eventually_due' },
        refresh_url: 'https://afrobs.com/dashboard?profile=payout&stripe=refresh',
        return_url: 'https://afrobs.com/dashboard?profile=payout&stripe=returned',
      },
    },
  });
  fixture.state.configurations = ['merchant'];
  await assert.rejects(
    authorOnboardingLink(
      fixture.stripe,
      fixture.connect,
      'acct_author',
      'v2',
      'https://afrobs.com',
    ),
    /payout configuration review/,
  );
  await assert.rejects(
    authorOnboardingLink(fixture.stripe, fixture.connect, 'acct_author', 'v2', 'http://afrobs.com'),
    /secure app address/,
  );
  assert.equal(fixture.state.links.length, 1);
});

test('existing legacy accounts retain their onboarding flow', async () => {
  const fixture = connectFixture();
  await authorOnboardingLink(
    fixture.stripe,
    fixture.connect,
    'acct_legacy',
    'v1',
    'https://afrobs.com',
  );
  assert.deepEqual(fixture.state.links[0], {
    account: 'acct_legacy',
    type: 'account_onboarding',
    collection_options: { fields: 'eventually_due' },
    refresh_url: 'https://afrobs.com/dashboard?profile=payout&stripe=refresh',
    return_url: 'https://afrobs.com/dashboard?profile=payout&stripe=returned',
  });
});

test('Connect failures distinguish platform setup, country eligibility and sign-in without leaking Stripe details', () => {
  const cases = [
    [{ code: 'platform_registration_required' }, 'platform_configuration', 503],
    [{ message: 'Stripe no longer recommends Accounts v1' }, 'platform_configuration', 503],
    [{ code: 'capability_not_available_in_country' }, 'country_unavailable', 400],
    [{ message: 'Unauthorized' }, 'sign_in_required', 401],
    [{ code: 'account_invalid' }, 'account_review', 409],
    [{ type: 'StripeAuthenticationError' }, 'platform_configuration', 503],
    [
      { message: 'Sensitive account details', requestId: 'req_fixture' },
      'connect_unavailable',
      503,
    ],
  ] as const;
  for (const [error, code, status] of cases) {
    const result = authorConnectFailure(error);
    assert.equal(result.code, code);
    assert.equal(result.status, status);
    assert.doesNotMatch(result.error, /Sensitive account details/);
  }
});
