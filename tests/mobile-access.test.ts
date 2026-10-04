import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { APP_MODE_BOOTSTRAP } from '../lib/app/installed';
import { hasMobileAccount, isPublicMobilePage, mobileReturnPath } from '../lib/auth/mobileAccess';
import { authorReturnPath, loginDestination } from '../lib/utils/loginDestination';
import { mobileSignInDestination } from '../lib/auth/mobileSignIn';

test('author website handoff stays in its own tab through authentication and leaves the reader app installed', () => {
  const values = new Map<string, string>();
  const env = {
    URLSearchParams, location: { pathname: '/author/start', search: '?view=web' },
    document: { referrer: 'android-app://com.afrobs.app', documentElement: { dataset: {} as Record<string, string> } },
    navigator: { standalone: true }, matchMedia: () => ({ matches: true }),
    sessionStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
  };
  runInNewContext(APP_MODE_BOOTSTRAP, env);
  assert.equal(env.document.documentElement.dataset.appMode, 'browser');
  for (const path of ['/login', '/signup', '/dashboard']) {
    env.location = { pathname: path, search: '' }; env.document.documentElement.dataset = {};
    runInNewContext(APP_MODE_BOOTSTRAP, env); assert.equal(env.document.documentElement.dataset.appMode, 'browser');
  }
  values.clear(); env.location = { pathname: '/browse', search: '?view=web' }; env.document.documentElement.dataset = {};
  runInNewContext(APP_MODE_BOOTSTRAP, env); assert.equal(env.document.documentElement.dataset.appMode, 'installed');
  env.location = { pathname: '/author/start', search: '?view=web' };
  Object.defineProperty(env, 'sessionStorage', { get() { throw Error('Storage blocked'); } });
  runInNewContext(APP_MODE_BOOTSTRAP, env); assert.equal(env.document.documentElement.dataset.appMode, 'browser');
});

test('author sign-in returns only to the author entry; installed author accounts default to their library', () => {
  const author = { role: 'both', activeRole: 'seller' };
  for (const path of ['/author/start', '/author/start?view=web']) {
    assert.equal(authorReturnPath(path), path);
    assert.equal(loginDestination(author, path), path);
    assert.equal(mobileSignInDestination(author, '?redirect=' + encodeURIComponent(path)), path);
  }
  for (const path of ['https://evil.test', '//evil.test', '/author/start?next=evil', '/author/start?view=web&redirect=evil', '/author/start#token', '/author/other']) assert.equal(authorReturnPath(path), null);
  assert.equal(mobileSignInDestination(author, ''), '/library');
});

test('installed entry requires a matching active Firebase account, not a profile or cookie hint alone', () => {
  const valid = { loading: false, firebaseUser: { uid: 'reader' }, userProfile: { uid: 'reader', status: 'active' } };
  assert.equal(hasMobileAccount(valid), true);
  assert.equal(hasMobileAccount({ ...valid, userProfile: { uid: 'reader', status: 'warned' } }), true);
  for (const invalid of [
    { ...valid, loading: true }, { ...valid, firebaseUser: null }, { ...valid, userProfile: null },
    { ...valid, userProfile: { uid: 'different', status: 'active' } },
    ...['suspended', 'banned', 'unknown'].map(status => ({ ...valid, userProfile: { uid: 'reader', status } })),
  ]) assert.equal(hasMobileAccount(invalid), false);
});

test('only authentication and legal screens stay visible to installed-app guests', () => {
  for (const path of ['/login', '/signup', '/privacy', '/terms']) assert.equal(isPublicMobilePage(path), true);
  for (const path of ['/', '/browse', '/cart', '/read/book', '/sample/book', '/author/author', '/about-help', '/login/other', '/dashboard', '/community']) assert.equal(isPublicMobilePage(path), false);
});

test('mobile deep-link returns are local screens and cannot redirect into authentication, another host or a gift-secret fragment', () => {
  for (const path of ['/read/book_123', '/book/book-123', '/cart', '/browse', '/gifts/claim', '/checkout/receipt?orderIds=one,two', '/dashboard?profile=payout']) assert.equal(mobileReturnPath(path), path);
  for (const path of [null, 'https://evil.test', '//evil.test', '/\\evil.test', '/read/../login', '/read/%2e%2e/login', '/login', '/signup?next=/browse', '/api/admin', '/gifts/claim#token=secret', '/read/book\n', '/book/💥']) assert.equal(mobileReturnPath(path), null);
});

test('head bootstrap distinguishes website, installed PWA, iOS, and Android and retains Android mode only within its tab', () => {
  for (const mode of ['browser', 'fullscreen', 'standalone', 'ios', 'android']) {
    const values = new Map<string, string>();
    const env = {
      document: { referrer: mode === 'android' ? 'android-app://com.afrobs.app/' : '', documentElement: { dataset: {} as Record<string, string> } },
      navigator: { standalone: mode === 'ios' },
      matchMedia: (query: string) => ({ matches: mode === 'standalone' && query.includes('standalone') }),
      sessionStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
    };
    runInNewContext(APP_MODE_BOOTSTRAP, env);
    assert.equal(env.document.documentElement.dataset.appMode, ['browser', 'fullscreen'].includes(mode) ? 'browser' : 'installed');
    if (mode === 'android') {
      env.document.referrer = 'https://afrobs.com/login';
      runInNewContext(APP_MODE_BOOTSTRAP, env);
      assert.equal(env.document.documentElement.dataset.appMode, 'installed');
      values.clear(); runInNewContext(APP_MODE_BOOTSTRAP, env);
      assert.equal(env.document.documentElement.dataset.appMode, 'browser');
    }
    Object.defineProperty(env, 'sessionStorage', { get() { throw Error('Storage blocked'); } });
    assert.doesNotThrow(() => runInNewContext(APP_MODE_BOOTSTRAP, env));
  }
});
