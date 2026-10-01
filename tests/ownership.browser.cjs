// Run with PLAYWRIGHT_PATH pointing to Playwright; EDGE_PATH is optional.
// Bundles the actual ownership hook with controlled auth/Firestore boundaries.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const http = require('node:http');
const assert = require('node:assert/strict');

async function main() {
  const bundle = await build({
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React, { useSyncExternalStore } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useBookOwnership } from './hooks/useBookOwnership';
      import { fixture } from 'test-boundaries';
      function Screen() {
        const { owned, checking, error } = useBookOwnership('book');
        return <main>{checking ? 'Checking' : error ? 'Payment check unavailable' : owned ? 'Read' : 'Buy'}</main>;
      }
      const root = createRoot(document.getElementById('root'));
      window.fixture = fixture;
      root.render(<Screen />);
    ` },
    plugins: [{ name: 'controlled-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(test-boundaries|firebase\/firestore|@\/lib\/firebase\/(config|syncLibrary)|@\/store\/authStore)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        if (args.path !== 'test-boundaries') return { contents: 'export * from "test-boundaries";', resolveDir: process.cwd() };
        return { resolveDir: process.cwd(), contents: `
          import { useSyncExternalStore } from 'react';
          let state = { firebaseUser: { uid: 'reader' }, loading: false };
          const subscribers = new Set(), listeners = new Map(), data = new Map();
          let resolveSync, rejectSync;
          export const db = {};
          export const useAuthStore = selector => selector(useSyncExternalStore(cb => { subscribers.add(cb); return () => subscribers.delete(cb); }, () => state));
          export const doc = (_, collection, id) => id;
          const snapshot = (id, cached = false) => ({ data: () => data.get(id), metadata: { fromCache: cached } });
          export function onSnapshot(ref, options, next, error) { listeners.set(ref, next); return () => listeners.delete(ref); }
          export const getDocFromServer = async ref => snapshot(ref);
          export const syncPurchasedLibrary = () => new Promise((resolve, reject) => { resolveSync = resolve; rejectSync = reject; });
          export const fixture = {
            emit(uid, owned, cached = false) {
              const id = uid + '_book';
              data.set(id, owned ? { userId: uid, bookId: 'book', purchaseType: 'bought' } : undefined);
              listeners.get(id)?.(snapshot(id, cached));
            },
            resolve() { resolveSync({ pendingOrderIds: [] }); },
            reject() { rejectSync(new Error('Provider unavailable')); },
            user(uid) { state = { firebaseUser: uid ? { uid } : null, loading: false }; subscribers.forEach(cb => cb()); },
            listening(uid) { return listeners.has(uid + '_book'); },
          };
        ` };
      });
    } }],
  });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const screen = text => page.waitForFunction(expected => document.querySelector('main')?.textContent === expected, text);
    await screen('Checking');
    await page.waitForFunction(() => fixture.listening('reader'));
    await page.evaluate(() => fixture.emit('reader', false, true));
    await screen('Checking');
    await page.evaluate(() => fixture.emit('reader', false));
    await page.evaluate(() => fixture.resolve());
    await screen('Buy');
    await page.evaluate(() => fixture.emit('reader', true));
    await screen('Read');
    console.log('PASS cached missing ownership waits for server; a purchase changes Buy to Read without reloading');
    await page.evaluate(() => fixture.emit('reader', false));
    await screen('Buy');
    await page.evaluate(() => fixture.emit('reader', true));
    await screen('Read');
    console.log('PASS a server refund removes ownership without reloading; a later valid copy restores Read');

    await page.evaluate(() => fixture.user('second-reader'));
    await screen('Checking');
    await page.waitForFunction(() => fixture.listening('second-reader'));
    await page.evaluate(() => { fixture.emit('reader', true); fixture.emit('second-reader', false); });
    await page.evaluate(() => fixture.reject());
    await screen('Payment check unavailable');
    assert.equal(await page.getByText('Buy', { exact: true }).count(), 0);
    await page.evaluate(() => fixture.emit('second-reader', false));
    await screen('Payment check unavailable');
    console.log('PASS account switching clears ownership; failed recovery never exposes Buy');

    await page.evaluate(() => fixture.user('third-reader'));
    await page.waitForFunction(() => fixture.listening('third-reader'));
    await page.evaluate(() => fixture.emit('third-reader', false));
    await page.evaluate(() => fixture.emit('third-reader', true));
    await screen('Read');
    await page.evaluate(() => fixture.reject());
    await screen('Read');
    await page.evaluate(() => fixture.user(null));
    await screen('Buy');
    assert.deepEqual(errors, []);
    console.log('PASS a confirmed purchase survives a concurrent recovery failure; signing out clears ownership');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
