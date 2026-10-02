import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueWelcome, consumeWelcome } from '../lib/auth/welcome';
import { beginAuthFlow, waitForAuthFlow } from '../lib/auth/flow';

test('welcome survives navigation but is consumed once and bound to the account', () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    setItem: (key: string, value: string) => values.set(key, value),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    assert.equal(consumeWelcome('reader'), null); // ordinary session restoration
    queueWelcome('reader', 'signup');
    assert.equal(consumeWelcome('reader'), 'signup');
    assert.equal(consumeWelcome('reader'), null); // refresh / repeated effect
    queueWelcome('reader', 'signin');
    assert.equal(consumeWelcome('other-reader'), null);
    assert.equal(consumeWelcome('reader'), null);
    queueWelcome('author', 'signin');
    assert.equal(consumeWelcome('author'), 'signin');
    for (const value of ['invalid JSON', 'null', JSON.stringify({ uid: 'reader', kind: 'signup', at: Date.now() - 31 * 60_000 }), JSON.stringify({ uid: 'reader', kind: 'signup', at: Date.now() + 60_000 })]) {
      values.set('afrobooks:welcome', value);
      assert.equal(consumeWelcome('reader'), null);
    }
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Storage disabled'); } });
    assert.doesNotThrow(() => queueWelcome('reader', 'signin'));
    assert.equal(consumeWelcome('reader'), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('auth observer waits for account/profile setup and releases after failure too', async () => {
  const finish = beginAuthFlow();
  let observed = false;
  const observer = waitForAuthFlow().then(() => { observed = true; });
  await Promise.resolve();
  assert.equal(observed, false);
  finish();
  await observer;
  assert.equal(observed, true);
  const finishFailed = beginAuthFlow();
  try { throw new Error('Profile save failed'); } catch { /* form reports failure */ }
  finally { finishFailed(); }
  await waitForAuthFlow();
});
