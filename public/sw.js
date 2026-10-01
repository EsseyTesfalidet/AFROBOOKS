/* Only immutable, public application bundles are cached. Never cache APIs,
 * authenticated HTML, book files, remote URLs or requests with credentials in headers. */
const CACHE = 'afrobooks-public-v1';
const LEGACY = new Set([
  'apis', 'others', 'cross-origin', 'start-url', 'next-data', 'next-image',
  'google-fonts-webfonts', 'google-fonts-stylesheets', 'static-font-assets',
  'static-image-assets', 'static-audio-assets', 'static-video-assets',
  'static-js-assets', 'static-style-assets', 'static-data-assets',
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request('/offline.html', { cache: 'reload', credentials: 'omit' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (LEGACY.has(name) || name.startsWith('workbox-') || (name.startsWith('afrobooks-public-') && name !== CACHE)) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;

  if (request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(async () =>
      (await (await caches.open(CACHE)).match('/offline.html')) || Response.error()));
    return;
  }

  // Next's content-hashed bundles contain public code/styles, never user data.
  if (!url.pathname.startsWith('/_next/static/') || url.search || request.headers.has('range')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !response.redirected &&
        !/private|no-store/i.test(response.headers.get('cache-control') || '')) {
      try {
        await cache.put(request, response.clone());
        const keys = (await cache.keys()).filter((key) => new URL(key.url).pathname !== '/offline.html');
        for (const key of keys.slice(0, Math.max(0, keys.length - 80))) await cache.delete(key);
      } catch { /* Storage limits must not prevent a successful network response. */ }
    }
    return response;
  })());
});
