import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoutSetupState } from '../functions/src/stripe/payoutSetupState';
import { payoutReminderEmail, sendReminderEmail } from '../functions/src/notifications/payoutReminderEmail';
import type { ConnectedAccount } from '../functions/src/stripe/accountReadiness';
import { loginDestination, PAYOUT_SETUP_PATH } from '../lib/utils/loginDestination';
import { proxy } from '../proxy';
import { NextRequest } from 'next/server';

const ready: ConnectedAccount = {
  id: 'acct_author', details_submitted: true, payouts_enabled: true,
  capabilities: { transfers: 'active' }, metadata: { userId: 'author' },
};

test('payout reminders distinguish author action from Stripe review and restrictions', () => {
  assert.equal(payoutSetupState(null), 'needs_setup');
  assert.equal(payoutSetupState(ready), 'ready');
  assert.equal(payoutSetupState({ id: 'acct_new', details_submitted: false }), 'needs_details');
  assert.equal(payoutSetupState({ ...ready, payouts_enabled: false, requirements: { currently_due: ['external_account'] } }), 'needs_details');
  assert.equal(payoutSetupState({ ...ready, payouts_enabled: false, requirements: { past_due: ['external_account'], disabled_reason: 'requirements.past_due' } }), 'needs_details');
  assert.equal(payoutSetupState({ ...ready, payouts_enabled: false, requirements: { currently_due: ['identity'], pending_verification: ['identity'] } }), 'reviewing');
  assert.equal(payoutSetupState({ ...ready, payouts_enabled: false, requirements: { currently_due: ['external_account'], pending_verification: ['identity'] } }), 'needs_details');
  assert.equal(payoutSetupState({ ...ready, payouts_enabled: false, requirements: { disabled_reason: 'requirements.pending_verification' } }), 'reviewing');
  assert.equal(payoutSetupState({ ...ready, payouts_enabled: false }), 'reviewing');
  assert.equal(payoutSetupState({ ...ready, requirements: { disabled_reason: 'rejected.other', currently_due: ['external_account'] } }), 'unavailable');
  assert.equal(payoutSetupState({ ...ready, deleted: true }), 'unavailable');
});

const emailInput = { from: 'AfroBooks <noreply@example.test>', to: 'author@example.test', name: '<script>author</script>', appUrl: 'https://afrobs.com', followup: false };

test('reminder email escapes names and links to authenticated app settings instead of an expiring Stripe link', () => {
  const email = payoutReminderEmail(emailInput);
  assert.ok(!email.html.includes('<script>'));
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /href="https:\/\/afrobs.com\/dashboard\?profile=payout"/);
  assert.match(email.text, /Do not reply with financial information/);
  assert.match(payoutReminderEmail({ ...emailInput, followup: true }).subject, /^Reminder:/);
  for (const appUrl of ['http://afrobs.com', 'javascript:alert(1)', 'https://user:password@afrobs.com']) {
    assert.throws(() => payoutReminderEmail({ ...emailInput, appUrl }));
  }
});

test('email delivery requires provider acceptance and preserves the retry key', async t => {
  const email = payoutReminderEmail(emailInput);
  let response = new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, request: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails');
    requests.push(request);
    return response;
  });
  assert.equal(await sendReminderEmail('test-key', email, 'reminder/author/initial'), 'email_1');
  assert.equal((requests[0].headers as Record<string, string>)['Idempotency-Key'], 'reminder/author/initial');
  assert.deepEqual(JSON.parse(requests[0].body as string), email);
  response = new Response(JSON.stringify({ message: 'Unverified sender' }), { status: 403 });
  await assert.rejects(sendReminderEmail('test-key', email, 'reminder/author/initial'), /403/);
  response = new Response(JSON.stringify({ error: 'not accepted' }), { status: 200 });
  await assert.rejects(sendReminderEmail('test-key', email, 'reminder/author/initial'), /not confirmed/);
});

test('reminder links preserve payout settings through sign-in without accepting external redirects', () => {
  const anonymous = proxy(new NextRequest(`https://afrobs.com${PAYOUT_SETUP_PATH}`));
  const login = new URL(anonymous.headers.get('location')!);
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('redirect'), PAYOUT_SETUP_PATH);
  assert.equal(loginDestination({ role: 'both', activeRole: 'buyer' }, login.searchParams.get('redirect')), PAYOUT_SETUP_PATH);
  assert.equal(loginDestination({ role: 'buyer', activeRole: 'buyer' }, PAYOUT_SETUP_PATH), '/browse');
  for (const destination of ['https://attacker.test', '//attacker.test', '/\\attacker.test', 'javascript:alert(1)', '/admin', null]) {
    assert.equal(loginDestination({ role: 'seller', activeRole: 'seller' }, destination), '/dashboard');
  }
  const signedIn = proxy(new NextRequest(login, { headers: { cookie: 'ab_uid=author; ab_role=seller' } }));
  assert.equal(signedIn.headers.get('location'), `https://afrobs.com${PAYOUT_SETUP_PATH}`);
});
