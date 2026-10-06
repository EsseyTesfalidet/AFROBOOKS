import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { accountPageAccess } from '../lib/auth/routeAccess';
import { requireRequestUser } from '../lib/server/auth';

test('separate account entry and navigation ignore shared cookie role hints', () => {
  const first = proxy(new NextRequest('https://afrobs.com/login?account=separate', { headers: { cookie: '__session=main; ab_uid=main; ab_role=admin' } }));
  assert.equal(first.headers.get('location'), null);
  for (const path of ['/admin', '/dashboard', '/library', '/login']) {
    const response = proxy(new NextRequest(`https://afrobs.com${path}`, { headers: { cookie: 'ab_tab_accounts=1; ab_role=buyer' } }));
    assert.equal(response.headers.get('location'), null);
  }
  assert.equal(proxy(new NextRequest('https://afrobs.com/admin')).status, 307, 'normal navigation retains existing server redirect');
});

test('client route access checks the current identity, status and role', () => {
  const buyer = { uid: 'buyer', status: 'active', role: 'buyer' };
  const admin = { uid: 'admin', status: 'active', role: 'admin' };
  assert.equal(accountPageAccess('/admin/videos', 'buyer', buyer), 'denied');
  assert.equal(accountPageAccess('/audio-studio', 'buyer', buyer), 'denied');
  assert.equal(accountPageAccess('/library', 'buyer', buyer), 'allow');
  assert.equal(accountPageAccess('/admin/videos', 'buyer', admin), 'login');
  assert.equal(accountPageAccess('/admin/videos', 'admin', admin), 'allow');
  assert.equal(accountPageAccess('/library', 'buyer', { ...buyer, status: 'banned' }), 'login');
  assert.equal(accountPageAccess('/library', undefined, null), 'login');
  assert.equal(accountPageAccess('/browse', undefined, null), 'allow');
  assert.equal(accountPageAccess('/audio-studio', 'creator', { uid: 'creator', status: 'active', role: 'seller' }), 'allow');
});

test('separate account requests cannot authenticate with another tab’s cookie', async () => {
  await assert.rejects(requireRequestUser(new NextRequest('https://afrobs.com/api/account', {
    headers: { cookie: '__session=main; ab_uid=main; ab_role=admin', 'x-afrobooks-account-mode': 'tab' },
  })), /Unauthorized/);
});
