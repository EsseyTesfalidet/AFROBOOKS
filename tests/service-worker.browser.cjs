// Run with PLAYWRIGHT_PATH pointing to an installed Playwright module.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(fs.readFileSync('public/sw.js'));
    } else if (req.url.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(JSON.stringify({ private: req.headers.authorization || 'guest' }));
    } else if (req.url === '/_next/static/public.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end('/* public bundle */');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(req.url === '/offline.html' ? '<h1>Offline fallback</h1>' : '<h1>Online page</h1>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(async () => {
      for (const name of ['apis', 'others', 'cross-origin', 'static-data-assets', 'workbox-precache-v2-test']) {
        const cache = await caches.open(name);
        await cache.put('/api/private', new Response('old private data'));
      }
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['afrobooks-public-v1']);
    for (const account of ['account-A', 'account-B']) {
      const data = await page.evaluate(async (token) => (await fetch('/api/private', { headers: { authorization: token } })).json(), account);
      assert.equal(data.private, account);
    }
    await page.evaluate(async () => { await fetch('/api/private'); await fetch('/_next/static/public.js'); });
    const paths = await page.evaluate(async () => (await (await caches.open('afrobooks-public-v1')).keys()).map(key => new URL(key.url).pathname));
    assert.deepEqual(paths.sort(), ['/_next/static/public.js', '/offline.html'].sort());
    await context.setOffline(true);
    assert.equal(await page.evaluate(async () => { try { await fetch('/api/private'); return 'leaked'; } catch { return 'blocked'; } }), 'blocked');
    assert.equal(await page.evaluate(async () => (await fetch('/_next/static/public.js')).text()), '/* public bundle */');
    await page.goto(base + '/library');
    assert.equal(await page.locator('h1').textContent(), 'Offline fallback');
    console.log('PASS legacy caches purged; account responses isolated; private APIs unavailable offline; public bundles and generic offline fallback work');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
