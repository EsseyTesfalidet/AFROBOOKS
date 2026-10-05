import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as clientApp, deleteApp as deleteClient } from 'firebase/app';
import { getAuth as clientAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { recoveryPhoneStatus } from '../lib/server/recoveryPhone';
import { ensureMobileAuthProfile } from '../lib/server/mobileAuthProfile';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/auth/recovery-phone/route';

for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulators are required.');
const projectId = 'demo-afrobooks-recovery';
const app = initializeApp({ projectId }); const auth = getAuth(app); const db = getFirestore(app);
const client = clientApp({ projectId, apiKey: 'emulator-only-key', authDomain: `${projectId}.firebaseapp.com` });
const browserAuth = clientAuth(client); connectAuthEmulator(browserAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
after(async () => { await deleteClient(client); await deleteApp(app); });
// Phone auth is browser-only in the client SDK. Exercise the same emulator REST
// protocol here; the browser suite covers our actual SDK linking helper.
async function verifyPhone(phone: string, idToken?: string) {
  const base = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
  const response = await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=emulator-only-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: phone }) });
  assert.equal(response.status, 200); const { sessionInfo } = await response.json();
  const codes = await (await fetch(`${base}/emulator/v1/projects/${projectId}/verificationCodes`)).json();
  const record = codes.verificationCodes.find((value: { sessionInfo: string }) => value.sessionInfo === sessionInfo);
  assert.ok(record);
  const verified = await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=emulator-only-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionInfo, code: record.code, ...(idToken ? { idToken } : {}) }) });
  const result = await verified.json();
  if (!verified.ok || !result.localId || result.temporaryProof) throw new Error(result.error?.message || 'PHONE_COLLISION');
  return result as { localId: string; idToken: string };
}
test('real Firebase linking and later phone sign-in retain the same UID, purchased books and video access', async () => {
  const original = await auth.createUser({ email: 'original@example.test', password: 'Test-password-123' });
  await db.doc(`users/${original.uid}`).set({ uid: original.uid, status: 'active', role: 'both', firstName: 'Original', phone: '', stripeCustomerId: 'saved-customer', referralCredits: 123 });
  await db.doc(`library/owned-book`).set({ userId: original.uid, bookId: 'purchased-book', status: 'purchased' });
  await db.doc(`watchEntitlements/${original.uid}/videos/purchased-video`).set({ status: 'active', orderId: 'saved-order' });
  const login = await signInWithEmailAndPassword(browserAuth, 'original@example.test', 'Test-password-123');
  await reauthenticateWithCredential(login.user, EmailAuthProvider.credential('original@example.test', 'Test-password-123'));
  const linked = await verifyPhone('+12025550123', await login.user.getIdToken());
  assert.equal(linked.localId, original.uid);
  const status = await recoveryPhoneStatus(db, await auth.getUser(original.uid), true);
  assert.equal(status.phoneNumber, '+12025550123'); assert.equal(status.profileSynced, true);
  await signOut(browserAuth);
  const recovered = await verifyPhone('+12025550123');
  assert.equal(recovered.localId, original.uid);
  assert.deepEqual(await ensureMobileAuthProfile(db, await auth.getUser(original.uid)), { isNewUser: false });
  assert.equal((await db.doc('library/owned-book').get()).data()?.userId, recovered.localId);
  assert.equal((await db.doc(`watchEntitlements/${recovered.localId}/videos/purchased-video`).get()).data()?.status, 'active');
  const profile = (await db.doc(`users/${original.uid}`).get()).data();
  assert.equal(profile?.role, 'both'); assert.equal(profile?.stripeCustomerId, 'saved-customer'); assert.equal(profile?.referralCredits, 123);
  assert.equal((await auth.listUsers()).users.length, 1);
});
test('Firebase rejects linking a phone owned by another account without changing either identity', async () => {
  const other = await auth.createUser({ email: 'other@example.test', password: 'Test-password-123' });
  const login = await signInWithEmailAndPassword(browserAuth, 'other@example.test', 'Test-password-123');
  await assert.rejects(verifyPhone('+12025550123', await login.user.getIdToken()), /PHONE_COLLISION|PHONE_NUMBER_EXISTS|CREDENTIAL_ALREADY_IN_USE/);
  assert.equal(browserAuth.currentUser?.uid, other.uid);
  assert.equal((await auth.getUser(other.uid)).phoneNumber, undefined);
  assert.notEqual((await auth.getUserByPhoneNumber('+12025550123')).uid, other.uid);
  assert.equal((await db.collection('library').get()).size, 1);
  assert.equal((await auth.listUsers()).users.length, 2);
});
test('authenticated recovery API ignores contact text, rejects foreign identities and syncs only its token owner', async () => {
  const recovered = await verifyPhone('+12025550123');
  const url = 'https://afrobs.com/api/auth/recovery-phone';
  const headers = { authorization: `Bearer ${recovered.idToken}`, origin: 'https://afrobs.com', 'content-type': 'application/json' };
  const get = await GET(new NextRequest(url, { headers }));
  assert.equal(get.status, 200); assert.equal((await get.json()).uid, recovered.localId);
  assert.match(get.headers.get('cache-control') || '', /no-store/);
  const other = await auth.getUserByEmail('other@example.test');
  await db.doc(`users/${other.uid}`).set({ status: 'active', phone: 'unchanged', role: 'buyer' });
  const injected = await POST(new NextRequest(url, { method: 'POST', headers, body: JSON.stringify({ uid: other.uid, phone: '+12025550199' }) }));
  assert.equal(injected.status, 400);
  await db.doc(`users/${recovered.localId}`).update({ phone: 'unverified contact' });
  const synced = await POST(new NextRequest(url, { method: 'POST', headers, body: '{}' }));
  assert.equal(synced.status, 200); assert.equal((await synced.json()).phoneNumber, '+12025550123');
  assert.equal((await db.doc(`users/${other.uid}`).get()).data()?.phone, 'unchanged');
  await db.doc(`users/${recovered.localId}`).update({ status: 'suspended' });
  assert.equal((await POST(new NextRequest(url, { method: 'POST', headers, body: '{}' }))).status, 401);
  assert.equal((await db.doc(`users/${recovered.localId}`).get()).data()?.status, 'suspended');
});
