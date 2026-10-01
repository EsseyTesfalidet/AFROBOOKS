import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { isSameOriginMutation } from '../lib/server/requestOrigin';
import { welcomeEmail, purchaseReceiptEmail, payoutEmail, subscriptionConfirmationEmail } from '../lib/email/templates';
import { POST as sendEmail } from '../app/api/email/route';
import { POST as setRole } from '../app/api/admin/set-role/route';
import { POST as createSession, DELETE as deleteSession } from '../app/api/auth/session/route';
import { requireRequestUser } from '../lib/server/auth';
import { POST as syncLibrary } from '../app/api/library/sync/route';
import { POST as settlePayments } from '../app/api/admin/settle-payments/route';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

test('library recovery requires authentication and ignores a claimed buyer in the request body', async () => {
  const response = await syncLibrary(new NextRequest('https://afrobs.com/api/library/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'another-reader' }),
  }));
  assert.equal(response.status, 401);
});

test('payment settlement rejects forged admin claims before contacting Stripe', async () => {
  const response = await settlePayments(new NextRequest('https://afrobs.com/api/admin/settle-payments', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'ab_uid=admin; ab_role=admin' },
    body: JSON.stringify({ sellerId: 'author', settled: true, role: 'admin' }),
  }));
  assert.equal(response.status, 401);
});

test('cross-site browser mutations and opaque origins fail; same-origin and non-browser requests work', () => {
  for (const origin of ['https://evil.example', 'https://afrobs.com.evil.example', 'http://afrobs.com', 'null', 'invalid']) {
    assert.equal(isSameOriginMutation(new Request('https://afrobs.com/api/auth/session', { method: 'POST', headers: { origin } })), false);
  }
  assert.equal(isSameOriginMutation(new Request('https://afrobs.com/api/test', { method: 'DELETE', headers: { 'sec-fetch-site': 'cross-site' } })), false);
  assert.equal(isSameOriginMutation(new Request('https://afrobs.com/api/test', { method: 'POST', headers: { origin: 'https://afrobs.com' } })), true);
  assert.equal(isSameOriginMutation(new Request('https://afrobs.com/api/test', { method: 'POST' })), true);
});

test('session endpoints reject cross-site login/logout before reading credentials or contacting Firebase', async () => {
  const request = new NextRequest('https://afrobs.com/api/auth/session', { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal((await createSession(request)).status, 403);
  assert.equal((await deleteSession(new NextRequest(request.url, { method: 'DELETE', headers: request.headers }))).status, 403);
});

test('forged navigation hints and cross-site session cookies do not authorize API access', async () => {
  await assert.rejects(requireRequestUser(new NextRequest('https://afrobs.com/api/admin/test', { headers: { cookie: 'ab_uid=admin; ab_role=admin' } })), /Unauthorized/);
  await assert.rejects(requireRequestUser(new NextRequest('https://afrobs.com/api/test', { method: 'POST', headers: { cookie: '__session=anything', origin: 'https://evil.example' } })), /Unauthorized/);
});

test('retired public email and role proxies never dispatch requests', async () => {
  assert.equal((await sendEmail()).status, 410);
  assert.equal((await setRole()).status, 410);
});

test('revoked bearer and legacy session tokens are rejected using revocation verification', async () => {
  const app = initializeApp({ projectId: 'demo-afrobooks-security' }, 'security-unit');
  const auth = getAuth(app);
  const verify = mock.method(auth, 'verifyIdToken', async (_token: string, checkRevoked?: boolean) => {
    assert.equal(checkRevoked, true);
    throw new Error('auth/id-token-revoked');
  });
  const session = mock.method(auth, 'verifySessionCookie', async (_token: string, checkRevoked?: boolean) => {
    assert.equal(checkRevoked, true);
    throw new Error('auth/session-cookie-revoked');
  });
  try {
    for (const headers of [new Headers({ authorization: 'Bearer revoked' }), new Headers({ cookie: '__session=revoked' })]) {
      await assert.rejects(requireRequestUser(new NextRequest('https://afrobs.com/api/test', { headers })), /Unauthorized/);
    }
    assert.equal(verify.mock.callCount(), 2);
    assert.equal(session.mock.callCount(), 1);
  } finally {
    verify.mock.restore(); session.mock.restore(); await deleteApp(app);
  }
});

test('transactional email displays user text without interpreting injected markup', () => {
  const attack = '<img src=x onerror="alert(1)">&';
  const outputs = [
    welcomeEmail(attack),
    purchaseReceiptEmail({ buyerName: attack, items: [{ title: attack, authorName: attack, priceCents: 100 }], totalCents: 100, orderId: 'abc<img>' }),
    payoutEmail({ sellerName: attack, amountCents: 100, periodLabel: attack }),
    subscriptionConfirmationEmail({ userName: attack, plan: 'basic', amountCents: 100 }),
  ];
  for (const { html } of outputs) {
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;'));
  }
});
