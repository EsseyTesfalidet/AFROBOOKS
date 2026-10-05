// Actual linking UI and client helpers with only Firebase/network boundaries mocked.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs'); const http = require('node:http'); const assert = require('node:assert/strict');
async function main() {
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' }, define: { 'process.env': '{}', 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_AUTH_PHONE_ENABLED': '"true"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import RecoveryPhone from './components/shared/RecoveryPhone';import {useAuthStore} from './store/authStore';
    const mode=new URLSearchParams(location.search).get('mode')||'password';
    window.fixture={mode,linked:null,synced:false,reauth:[],sends:[],verifies:0,authTime:0,syncFail:false,collision:false};
    const f=window.fixture;f.current={uid:'original-reader',email:'reader@example.test',phoneNumber:null,providerData:[{providerId:mode==='google'?'google.com':'password'}],getIdToken:async()=> 'fixture',getIdTokenResult:async()=>({claims:{auth_time:f.authTime}}),reload:async()=>{}};
    if(mode==='linked'){f.linked=f.current.phoneNumber='+12025550123';f.synced=true;f.current.providerData.push({providerId:'phone',phoneNumber:f.linked})}
    useAuthStore.setState({loading:false,firebaseUser:f.current,userProfile:{uid:'original-reader',role:'both',phone:'unverified contact',firstName:'Reader'}});
    window.profile=()=>useAuthStore.getState().userProfile;
    createRoot(document.getElementById('root')).render(<main style={{maxWidth:540,margin:'auto',padding:16}}><RecoveryPhone uid="original-reader"/></main>);
  ` }, plugins: [{ name: 'phone-boundaries', setup(b) {
    b.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth', namespace: 'sdk' }));
    b.onLoad({ filter: /.*/, namespace: 'sdk' }, () => ({ contents: `
      export class GoogleAuthProvider{setCustomParameters(){}};export class OAuthProvider{constructor(id){this.id=id}addScope(){}};
      export class RecaptchaVerifier{clear(){}};export const browserPopupRedirectResolver={};export const EmailAuthProvider={credential:(email,password)=>({email,password})};
      export async function reauthenticateWithCredential(user,credential){const f=window.fixture;f.reauth.push('password');if(credential.password!=='correct-password')throw Error('auth/wrong-password');f.authTime=Math.floor(Date.now()/1000);return {user}}
      export async function reauthenticateWithPopup(user){const f=window.fixture;f.reauth.push('google.com');if(f.popupCancel)throw Error('auth/popup-closed-by-user');f.authTime=Math.floor(Date.now()/1000);return {user}}
      export async function linkWithPhoneNumber(user,number){const f=window.fixture;f.sends.push({uid:user.uid,number});return {confirm:async code=>{f.verifies++;if(code!=='123456')throw Error('auth/invalid-verification-code');if(f.collision)throw Error('auth/credential-already-in-use');f.linked=number;user.phoneNumber=number;user.providerData.push({providerId:'phone',phoneNumber:number});return {user}}}}
      export async function signInWithPhoneNumber(){throw Error('Linking must never create or switch accounts')};export async function signInWithPopup(){throw Error('Use reauthentication')};
    ` }));
    b.onResolve({ filter: /(?:^@\/lib\/firebase\/|^\.\/)(config|request)$/ }, a => ({ path: a.path.endsWith('config') ? 'config' : 'request', namespace: 'network' }));
    b.onLoad({ filter: /.*/, namespace: 'network' }, a => ({ contents: a.path === 'config' ? `export const auth={get currentUser(){return window.fixture.current}};` : `
      const status=()=>{const f=window.fixture;return{uid:f.current.uid,phoneNumber:f.linked,profileSynced:f.synced,providers:f.current.providerData.filter(p=>p.providerId!=='phone').map(p=>p.providerId)}};
      export async function authenticatedGet(){if(window.fixture.readFail)throw Error('offline');return status()};
      export async function authenticatedPost(path,body){const f=window.fixture;if(Object.keys(body).length)throw Error('No client identity data');if(f.syncFail){f.syncFail=false;throw Error('offline')}f.synced=true;return status()};
    ` }));
  } }] });
  const css = (await require('postcss')([require('tailwindcss')]).process(fs.readFileSync('app/globals.css', 'utf8').replace(/^@import.*$/gm, ''), { from: 'app/globals.css' })).css + ['app/app-appearance.css', 'app/app-themes.css', 'components/shared/recovery-phone.css'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (/^\/fonts\/[\w.-]+$/.test(req.url)) return res.end(fs.readFileSync('public' + req.url));
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html data-app-mode="installed" data-app-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('Browser error:', e.message); });
    async function start(mode = 'password') { await page.goto(base + '/?mode=' + mode); await page.getByRole('button', { name: 'Link recovery phone', exact: true }).click(); }
    async function password() { await page.getByLabel('Current password', { exact: true }).fill('correct-password'); await page.getByRole('button', { name: 'Confirm password', exact: true }).click(); await page.getByLabel('Recovery phone number').waitFor(); }
    async function send(expectCode = true) { await page.getByLabel('Country code').selectOption('US'); await page.getByLabel('Recovery phone number').fill('202 555 0123'); await page.getByRole('button', { name: 'Send verification code' }).click(); if (expectCode) await page.getByLabel('Verification code', { exact: true }).waitFor(); }
    async function verify(code = '123456') { await page.getByLabel('Verification code', { exact: true }).fill(code); await page.getByRole('button', { name: 'Verify and link phone' }).click(); }
    await start();
    await page.getByLabel('Current password', { exact: true }).fill('wrong'); await page.getByRole('button', { name: 'Confirm password', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.sends.length), 0);
    await password();
    await page.getByLabel('Recovery phone number').fill('+447400123456'); await page.getByRole('button', { name: 'Send verification code' }).click(); await page.getByRole('alert').filter({ hasText: 'Ghana, Nigeria and US' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.sends.length), 0);
    await send(); assert.equal(await page.getByRole('button', { name: /Resend in/ }).isDisabled(), true);
    await verify('000000'); await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.linked), null);
    await page.evaluate(() => window.fixture.collision = true); await verify(); await page.getByRole('alert').filter({ hasText: 'not been merged' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.current.uid), 'original-reader');
    await page.evaluate(() => { window.fixture.collision = false; window.fixture.syncFail = true; }); await verify();
    await page.getByRole('alert').filter({ hasText: 'do not need another code' }).waitFor();
    await page.getByRole('button', { name: 'Refresh account details' }).click(); await page.getByText('Verified for sign-in', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.sends.length), 1);
    assert.equal(await page.evaluate(() => window.profile().uid), 'original-reader'); assert.equal(await page.evaluate(() => window.profile().phone), '+12025550123'); assert.equal(await page.evaluate(() => window.profile().role), 'both');
    for (const theme of ['light', 'dark']) { await page.evaluate(theme => document.documentElement.dataset.appTheme = theme, theme); await page.screenshot({ path: `.vercel/recovery-phone-${theme}.png` }); }
    await page.evaluate(() => sessionStorage.clear()); await start(); await password(); await page.evaluate(() => window.fixture.authTime = 0); await send(false);
    await page.getByRole('alert').filter({ hasText: 'confirm your existing sign-in again' }).waitFor(); assert.equal(await page.evaluate(() => window.fixture.sends.length), 0);
    await page.evaluate(() => sessionStorage.clear()); await start('google'); await page.getByRole('button', { name: 'Confirm with Google' }).click(); await send();
    assert.deepEqual(await page.evaluate(() => window.fixture.reauth), ['google.com']);
    await page.evaluate(() => window.fixture.current.uid = 'different-account'); await verify(); await page.getByRole('alert').filter({ hasText: 'same account' }).waitFor(); assert.equal(await page.evaluate(() => window.fixture.verifies), 0);
    await page.goto(base + '/?mode=linked'); await page.getByText('Verified for sign-in', { exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Link recovery phone', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS existing identity confirmation, SMS allowlist/cooldown, wrong code, number collision, same UID, interrupted sync recovery, stale authentication, Google confirmation, account switch rejection, existing linked phone and both themes.');
  } catch (error) {
    const page = browser.contexts().flatMap(context => context.pages())[0];
    if (page) { console.log((await page.locator('body').innerText()).slice(0, 1600)); await page.screenshot({ path: '.vercel/recovery-phone-failure.png', fullPage: true }); }
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
