import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { isSupportedSmsNumber, normalizePhone, signInError } from '../lib/auth/mobileSignIn';
import { ensureMobileAuthProfile } from '../lib/server/mobileAuthProfile';
import { POST } from '../app/api/auth/mobile-profile/route';

test('phone numbers accept national and international forms without extensions or embedded text', () => {
  assert.equal(normalizePhone('0803 123 4567', 'NG'), '+2348031234567');
  assert.equal(normalizePhone('0712 123456', 'KE'), '+254712123456');
  assert.equal(normalizePhone('+2917123456', 'NG'), '+2917123456');
  assert.equal(normalizePhone('+12025550123', 'NG'), '+12025550123');
  for (const value of ['123', 'call +12025550123', '+12025550123 ext. 1', 'hello']) assert.equal(normalizePhone(value, 'NG'), null);
});

test('SMS rollout accepts only allowed countries, including pasted international numbers', () => {
  for (const number of ['+12025550123', '+2348031234567', '+233241234567']) assert.equal(isSupportedSmsNumber(number), true);
  for (const number of ['+2917123456', '+254712123456', '+14165550123', '+447400123456', 'invalid']) assert.equal(isSupportedSmsNumber(number), false);
  assert.match(signInError(new Error('sms-region-not-allowed')), /email or Google/);
});

function fixture(data?: Record<string, unknown>) {
  const writes: Record<string, unknown>[] = [];
  const db = { collection: () => ({ doc: (uid: string) => { assert.equal(uid, 'verified-uid'); return { id: uid }; } }),
    runTransaction: async (fn: (transaction: unknown) => Promise<unknown>) => fn({
      get: async () => ({ exists: data !== undefined, data: () => data }),
      create: (_ref: unknown, value: Record<string, unknown>) => writes.push(value),
    }),
  } as unknown as Firestore;
  const identity = { uid: 'verified-uid', disabled: false, email: undefined, phoneNumber: '+12025550123',
    metadata: { creationTime: new Date().toUTCString() }, providerData: [{ providerId: 'phone' }] } as UserRecord;
  return { db, writes, identity };
}

test('mobile profile creation trusts Firebase identity and gives only the buyer role', async () => {
  const { db, identity, writes } = fixture();
  assert.deepEqual(await ensureMobileAuthProfile(db, identity), { isNewUser: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].uid, identity.uid); assert.equal(writes[0].phone, identity.phoneNumber);
  assert.equal(writes[0].email, ''); assert.equal(writes[0].role, 'buyer');
  assert.equal(writes[0].stripeCustomerId, null); assert.equal(writes[0].subscriptionStatus, 'none');
});

test('repeat sign-in leaves roles, purchases, balances and preferences untouched', async () => {
  for (const role of ['buyer', 'seller', 'both', 'admin']) {
    const { db, identity, writes } = fixture({ role, status: 'active', stripeCustomerId: 'saved', referralCredits: 42 });
    assert.deepEqual(await ensureMobileAuthProfile(db, identity), { isNewUser: false });
    assert.deepEqual(writes, []);
  }
});

test('restricted accounts and missing old profiles cannot be recreated', async () => {
  for (const status of ['suspended', 'banned']) {
    const { db, identity, writes } = fixture({ status });
    await assert.rejects(ensureMobileAuthProfile(db, identity), /ACCOUNT_/); assert.deepEqual(writes, []);
  }
  const { db, identity, writes } = fixture();
  await assert.rejects(ensureMobileAuthProfile(db, { ...identity, disabled: true } as UserRecord), /ACCOUNT_/);
  await assert.rejects(ensureMobileAuthProfile(db, { ...identity, metadata: { ...identity.metadata, creationTime: new Date(0).toUTCString() } } as UserRecord), /ACCOUNT_/);
  await assert.rejects(ensureMobileAuthProfile(db, { ...identity, providerData: [] } as unknown as UserRecord), /ACCOUNT_/);
  assert.deepEqual(writes, []);
});

test('profile endpoint rejects cross-site and unauthenticated account claims before Firebase', async () => {
  const url = 'https://afrobs.com/api/auth/mobile-profile';
  assert.equal((await POST(new NextRequest(url, { method: 'POST', headers: { origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await POST(new NextRequest(url, { method: 'POST', headers: { cookie: 'ab_uid=admin; ab_role=admin' }, body: JSON.stringify({ uid: 'admin', role: 'admin' }) }))).status, 401);
});

test('account collisions guide readers to their original identity; SMS errors are actionable', () => {
  assert.match(signInError(new Error('auth/account-exists-with-different-credential')), /original sign-in method/);
  assert.match(signInError(new Error('auth/code-expired')), /new code/);
  assert.match(signInError(new Error('auth/quota-exceeded')), /wait/);
});
