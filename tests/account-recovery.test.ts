import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import type { UserRecord } from 'firebase-admin/auth';
import { phoneRecoveryAccount } from '../lib/server/accountRecovery';

function fixture(options: { exists?: boolean; profile?: Record<string, unknown>; providers?: { providerId: string; phoneNumber?: string }[]; email?: string; disabled?: boolean; creationTime?: string } = {}) {
  const db = { collection: (name: string) => {
    assert.equal(name, 'users');
    return { doc: () => ({ get: async () => ({ exists: options.exists ?? true, data: () => options.profile ?? { status: 'active' } }) }) };
  } } as unknown as Firestore;
  const identity = {
    uid: 'verified-reader', disabled: options.disabled ?? false, phoneNumber: '+12025550123',
    email: options.email ?? 'reader@example.test',
    metadata: { creationTime: options.creationTime ?? new Date(Date.now() - 30_000).toUTCString() },
    providerData: options.providers ?? [{ providerId: 'password' }, { providerId: 'phone', phoneNumber: '+12025550123' }],
  } as UserRecord;
  return { db, identity };
}

test('a verified linked phone can recover only an active account email and providers', async () => {
  const { db, identity } = fixture();
  assert.deepEqual(await phoneRecoveryAccount(db, identity), {
    account: { email: 'reader@example.test', providers: ['password'] }, safeToDelete: false,
  });
});

test('recovery never creates or reveals an account for an unlinked number', async () => {
  const { db, identity } = fixture({ exists: false, providers: [{ providerId: 'phone', phoneNumber: '+12025550123' }], email: undefined });
  assert.deepEqual(await phoneRecoveryAccount(db, identity), { account: null, safeToDelete: true });
  const old = fixture({ exists: false, providers: [{ providerId: 'phone', phoneNumber: '+12025550123' }], email: undefined, creationTime: new Date(Date.now() - 11 * 60_000).toUTCString() });
  assert.deepEqual(await phoneRecoveryAccount(old.db, old.identity), { account: null, safeToDelete: false });
});

test('recovery blocks phone-only, suspended, disabled, and unverified identities', async () => {
  const phoneOnly = fixture({ providers: [{ providerId: 'phone', phoneNumber: '+12025550123' }], email: undefined });
  assert.deepEqual(await phoneRecoveryAccount(phoneOnly.db, phoneOnly.identity), { account: null, safeToDelete: false });
  const suspended = fixture({ profile: { status: 'suspended' } });
  assert.equal((await phoneRecoveryAccount(suspended.db, suspended.identity)).account, null);
  const disabled = fixture({ disabled: true });
  assert.equal((await phoneRecoveryAccount(disabled.db, disabled.identity)).account, null);
  const mismatched = fixture({ providers: [{ providerId: 'phone', phoneNumber: '+12025550124' }] });
  assert.equal((await phoneRecoveryAccount(mismatched.db, mismatched.identity)).account, null);
});
