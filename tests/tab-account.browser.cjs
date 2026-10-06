// Same browser context, real Firebase Auth/Firestore emulators, real session API.
// No live accounts or payments. Run with firebase.auth.test.json emulators.
require('tsx/cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { NextRequest } = require('next/server');
const { POST, DELETE } = require('../app/api/auth/session/route.ts');
const { requireRequestUser } = require('../lib/server/auth.ts');
const { proxy } = require('../proxy.ts');

async function main() {
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
  const projectId = 'demo-afrobooks-recovery';
  const app = initializeApp({ projectId });
  const admin = getAuth(app), db = getFirestore(app);
  for (const [uid, role] of [['first', 'admin'], ['second', 'seller'], ['third', 'buyer']]) {
    await admin.createUser({ uid, email: `${uid}@example.test`, password: 'Test-password-123' });
    await db.doc(`users/${uid}`).set({ uid, email: `${uid}@example.test`, role, activeRole: role === 'admin' ? 'buyer' : role, status: 'active', firstName: uid });
  }
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: {
    'process.env.NODE_ENV': '"test"',
    'process.env': '{}',
    'process.env.NEXT_PUBLIC_FIREBASE_API_KEY': '"emulator-only-key"',
    'process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID': JSON.stringify(projectId),
    'process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN': JSON.stringify(`${projectId}.firebaseapp.com`),
    'process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': JSON.stringify(`${projectId}.appspot.com`),
  }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{auth,db}from'./lib/firebase/config';import{connectAuthEmulator}from'firebase/auth';import{connectFirestoreEmulator}from'firebase/firestore';
    import Provider from'./components/shared/AuthProvider';import Gate from'./components/auth/AccountRouteGate';
    import Login from'./components/auth/LoginForm';import SeparateLink from'./components/auth/SeparateAccountLink';
    import{useAuthStore}from'./store/authStore';import{useCartStore}from'./store/cartStore';
    import{authenticatedGet}from'./lib/firebase/request';import{accountFetch}from'./lib/network';import{logOutAndRedirect}from'./lib/firebase/auth';
    import{usePathname}from'next/navigation';
    connectAuthEmulator(auth,'http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}',{disableWarnings:true});
    connectFirestoreEmulator(db,...${JSON.stringify(process.env.FIRESTORE_EMULATOR_HOST.split(':'))}.map((x,i)=>i?Number(x):x));
    window.auth=auth;window.cart=()=>useCartStore.getState().items;
    window.identity=()=>authenticatedGet('/api/whoami');window.noToken=async()=> (await accountFetch('/api/whoami',{credentials:'include'})).status;
    function Content(){const state=useAuthStore();const items=useCartStore(s=>s.items);const path=usePathname();
      if(path==='/login')return <Login/>;
      return <Gate><h1>Account: {state.userProfile?.uid||'guest'}</h1><SeparateLink/>
      <button onClick={()=>useCartStore.getState().addItem({id:state.userProfile.uid,title:'Book',authorName:'Author',price:1})}>Add a book</button>
      <p data-testid="cart">{items.map(x=>x.bookId).join(',')}</p>
      <button onClick={()=>void logOutAndRedirect()}>Sign out</button></Gate>;
    }createRoot(document.getElementById('root')).render(<Provider><Content/></Provider>);
  ` }, plugins: [{ name: 'next-fixture', setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/navigation' ? `
      import{useSyncExternalStore}from'react';const sub=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn)};
      export const usePathname=()=>useSyncExternalStore(sub,()=>location.pathname);
      const move=p=>{history.replaceState({},'',p);window.dispatchEvent(new Event('popstate'))};const router={replace:move,push:move,refresh:()=>{}};
      export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);
    ` : args.path === 'next/image' ? `import React from'react';export default({fill,priority,unoptimized,...p})=><img {...p}/>;` : `import React from'react';export default({children,prefetch,...p})=><a {...p}>{children}</a>;` }));
  } }] });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
      const parts = []; for await (const part of req) parts.push(part);
      const request = new NextRequest(url, { method: req.method, headers: req.headers, ...(parts.length ? { body: Buffer.concat(parts) } : {}) });
      let result;
      if (url.pathname === '/api/auth/session') result = await (req.method === 'DELETE' ? DELETE : POST)(request);
      else if (url.pathname === '/api/whoami') {
        try { result = Response.json(await requireRequestUser(request)); } catch { result = new Response('Unauthorized', { status: 401 }); }
      } else {
        const route = proxy(request);
        if (route.headers.has('location')) result = route;
        else { res.setHeader('Content-Type', 'text/html'); return res.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
      }
      res.statusCode = result.status;
      result.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
      const cookies = result.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.end(await result.text());
    } catch (e) { console.error(e); res.statusCode = 500; res.end('Test server error'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  // NextRequest normalizes loopback IPs to localhost; use that same origin in
  // the browser so the real session endpoint's CSRF checks remain meaningful.
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', e => { errors.push(e.message); console.error('Browser page error:', e.message); }));
    async function login(page, uid) {
      await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
      await page.getByLabel('Password', { exact: true }).fill('Test-password-123');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('heading', { name: `Account: ${uid}`, exact: true }).waitFor();
    }
    const first = await context.newPage(); await first.goto(base + '/login'); await login(first, 'first');
    await first.getByRole('button', { name: 'Add a book' }).click();
    const cookie = (await context.cookies()).find(c => c.name === '__session');
    assert.ok(cookie, 'the normal account must create its secure server session');
    const mainSession = cookie.value;
    const nextTab = context.waitForEvent('page'); await first.getByRole('link', { name: /Sign in to another account/ }).click();
    const second = await nextTab; await second.waitForLoadState();
    assert.equal(await second.evaluate(() => window.opener), null);
    await login(second, 'second');
    assert.equal(await first.evaluate(() => window.identity().then(x => x.uid)), 'first');
    assert.equal(await second.evaluate(() => window.identity().then(x => x.uid)), 'second');
    assert.equal((await context.cookies()).find(c => c.name === '__session').value, mainSession, 'tab login does not replace server cookie');
    assert.equal(await second.evaluate(() => window.noToken()), 401, 'no fallback to main cookie');
    assert.equal(await second.getByTestId('cart').textContent(), '');
    await second.getByRole('button', { name: 'Add a book' }).click();
    await first.reload(); await first.getByRole('heading', { name: 'Account: first', exact: true }).waitFor();
    await second.reload(); await second.getByRole('heading', { name: 'Account: second', exact: true }).waitFor();
    assert.equal(await first.getByTestId('cart').textContent(), 'first');
    assert.equal(await second.getByTestId('cart').textContent(), 'second');
    const third = await context.newPage(); await third.goto(base + '/login?account=separate'); await login(third, 'third');
    await third.goto(base + '/admin'); await third.waitForURL('**/browse');
    assert.equal(await third.evaluate(() => window.identity().then(x => x.role)), 'buyer');
    await second.goto(base + '/audio-studio'); await second.getByRole('heading', { name: 'Account: second', exact: true }).waitFor();
    await second.getByRole('button', { name: 'Sign out', exact: true }).click();
    await second.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    assert.equal(await first.evaluate(() => window.identity().then(x => x.uid)), 'first');
    assert.equal(await third.evaluate(() => window.identity().then(x => x.uid)), 'third');
    await login(second, 'second'); assert.equal(await second.getByTestId('cart').textContent(), '');
    await first.getByRole('button', { name: 'Sign out', exact: true }).click();
    await first.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    await second.reload(); await second.getByRole('heading', { name: 'Account: second', exact: true }).waitFor();
    assert.equal(await second.evaluate(() => window.identity().then(x => x.uid)), 'second');
    await third.close(); const fresh = await context.newPage(); await fresh.goto(base + '/login?account=separate');
    await fresh.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    await fresh.waitForFunction(() => window.auth?.currentUser === null);
    assert.deepEqual(errors, []);
    console.log('PASS three real accounts in one browser: real login form, isolated cookies/tokens/carts, reloads, creator/admin routes, sign-out both directions and fresh tabs.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); await deleteApp(app); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
