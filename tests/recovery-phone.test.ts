import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/auth/recovery-phone/route';
import { hasRecentPhoneConfirmation, recoveryPhoneError } from '../lib/auth/recoveryPhone';
import { recoveryPhoneStatus } from '../lib/server/recoveryPhone';

const identity = { uid: 'original-reader', disabled: false, phoneNumber: '+12025550123', providerData: [{ providerId: 'password' }, { providerId: 'phone', phoneNumber: '+12025550123' }] } as UserRecord;
function fixture(profile?: Record<string, unknown>) {
  const writes: Record<string, unknown>[] = [];
  const db = { collection: (name: string) => { assert.equal(name, 'users'); return { doc: (uid: string) => { assert.equal(uid, identity.uid); return { uid }; } }; }, runTransaction: async (action: (tx: unknown) => unknown) => action({ get: async () => ({ exists: !!profile, data: () => profile }), update: (_ref: unknown, value: Record<string, unknown>) => writes.push(value) }) } as unknown as Firestore;
  return { db, writes };
}
test('phone status trusts Firebase credentials instead of editable profile contact text', async () => {
  const { db, writes } = fixture({ status: 'active', phone: '+12025550123' });
  const unlinked = { ...identity, phoneNumber: undefined, providerData: [{ providerId: 'password' }] } as UserRecord;
  assert.equal((await recoveryPhoneStatus(db, unlinked)).phoneNumber, null);
  await assert.rejects(recoveryPhoneStatus(db, unlinked, true), /PHONE_NOT_LINKED/);
  assert.equal((await recoveryPhoneStatus(db, { ...identity, providerData: [{ providerId: 'phone', phoneNumber: '+12025550124' }] } as UserRecord)).phoneNumber, null);
  assert.deepEqual(writes, []);
});
test('verified phone sync preserves the original identity, role, financial fields and preferences', async () => {
  const profile = { status: 'active', phone: 'unverified contact', role: 'both', stripeCustomerId: 'original', referralCredits: 250, firstName: 'Reader', readerPreferences: { theme: 'sepia' } };
  const { db, writes } = fixture(profile);
  const result = await recoveryPhoneStatus(db, identity, true);
  assert.equal(result.uid, 'original-reader'); assert.equal(result.phoneNumber, '+12025550123'); assert.equal(result.profileSynced, true);
  assert.deepEqual(result.providers, ['password']);
  assert.deepEqual(Object.keys(writes[0]).sort(), ['phone', 'updatedAt']);
  assert.equal(writes[0].phone, identity.phoneNumber); assert.equal(profile.phone, 'unverified contact');
  const synced = fixture({ ...profile, phone: identity.phoneNumber });
  await recoveryPhoneStatus(synced.db, identity, true); assert.deepEqual(synced.writes, []);
});
test('phone sync cannot recreate missing accounts or restore restricted accounts', async () => {
  for (const profile of [undefined, { status: 'suspended' }, { status: 'banned' }]) {
    const { db, writes } = fixture(profile);
    await assert.rejects(recoveryPhoneStatus(db, identity, true), /ACCOUNT_NOT_AVAILABLE/); assert.deepEqual(writes, []);
  }
  const { db } = fixture({ status: 'active' });
  await assert.rejects(recoveryPhoneStatus(db, { ...identity, disabled: true } as UserRecord, true), /ACCOUNT_NOT_AVAILABLE/);
});
test('phone linking requires recent authentication and explains collisions without suggesting a merge', () => {
  const now = 1800000000000;
  assert.equal(hasRecentPhoneConfirmation(now / 1000, now), true);
  assert.equal(hasRecentPhoneConfirmation(now / 1000 - 299, now), true);
  for (const value of [now / 1000 - 301, now / 1000 + 61, '1800000000', undefined, NaN]) assert.equal(hasRecentPhoneConfirmation(value, now), false);
  assert.match(recoveryPhoneError(new Error('auth/credential-already-in-use')), /not been merged/);
  assert.match(recoveryPhoneError(new Error('PHONE_ACCOUNT_CHANGED')), /same account/);
});
test('recovery phone endpoint rejects unsigned and cross-origin account edits', async () => {
  const url = 'https://afrobs.com/api/auth/recovery-phone';
  assert.equal((await GET(new NextRequest(url))).status, 401);
  assert.equal((await POST(new NextRequest(url, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }))).status, 403);
  assert.equal((await POST(new NextRequest(url, { method: 'POST', headers: { cookie: 'ab_uid=admin; ab_role=admin' }, body: JSON.stringify({ uid: 'admin', phone: '+12025550123' }) }))).status, 401);
});
