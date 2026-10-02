// PLAYWRIGHT_PATH points to an installed Playwright; EDGE_PATH is optional.
// Real screens/storage/editor with fake Firebase and Stripe boundaries. No live writes or charges.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const postcss = require('postcss');

async function waitForAsync(page, condition) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (await page.evaluate(condition)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Asynchronous browser condition timed out');
}

async function main() {
  const bundled = await build({ bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY': '"pk_test_fixture"' },
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import Publish from './app/(seller)/publish/page';
      import Checkout from './components/buyer/CheckoutPaymentPanel';
      import Connection from './components/shared/ConnectionStatus';
      import Keyboard from './components/shared/MobileKeyboard';
      import { useAuthStore } from './store/authStore'; import { useCartStore } from './store/cartStore';
      import { readPublicationDraft, publicationDraftKey } from './lib/publishing/localDrafts';
      window.readDraft = () => readPublicationDraft(publicationDraftKey(useAuthStore.getState().userProfile.uid, new URLSearchParams(location.search).get('edit')));
      window.account = uid => useAuthStore.setState({loading:false, firebaseUser:{uid, getIdToken:async()=> 'fixture-token'}, userProfile:{uid,firstName:'Author',lastName:'Test',username:'author',role:'seller',activeRole:'seller'}});
      window.account('author'); window.confirmCalls = 0;
      useCartStore.setState({items:[{bookId:'book',title:'Test book',price:699,sellerId:'seller'}]});
      const screen = location.pathname === '/publish' ? <Publish/> : location.pathname === '/checkout' ? <Checkout/> : <>
        <nav className="buyer-bottom-nav fixed bottom-0">Mobile navigation</nav>
        <div className="profile-overlay fixed inset-0 flex items-end"><section className="profile-panel flex h-[94dvh] w-full flex-col overflow-hidden">
          <header>Account form</header><div className="min-h-0 flex-1 overflow-y-auto"><div style={{height:700}}/>
          <label>Email<input aria-label="Profile email" type="email" className="text-sm"/></label><button>Save changes</button></div><footer>Account footer</footer>
        </section></div></>;
      createRoot(document.getElementById('root')).render(<><Connection/><Keyboard/>{screen}</>);
    ` }, plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^(next\/navigation|next\/link)$/ }, a => ({ path: a.path, namespace: 'framework' }));
      b.onLoad({ filter: /.*/, namespace: 'framework' }, () => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `
        import React from 'react'; const router = {push:p=>window.destination=p,replace:p=>window.destination=p};
        export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);
        export default function Link({children,href,...p}){return <a href={href} {...p}>{children}</a>}
      ` }));
      b.onResolve({ filter: /^(@\/lib\/firebase\/(config|firestore|storage|request)|firebase\/firestore)$/ }, a => ({ path: a.path, namespace: 'firebase' }));
      b.onLoad({ filter: /.*/, namespace: 'firebase' }, () => ({ contents: `
        export const db={}; export const serverTimestamp=()=>null;
        export const doc=(...parts)=>({id:parts.at(-1),path:parts.join('/')}); export const collection=doc;
        export const getDoc=async ref=>({exists:()=>true,data:()=>ref.path.includes('sellers')?{verificationStatus:{idVerified:true}}:{sellerId:'author',title:'Published original',authorName:'Author',price:699}});
        export const getDocs=async()=>({docs:[]}); export const getSellerPublishedBooksCount=async()=>0;
        export const setDoc=async()=>{throw Error('Unexpected write')}; export const updateDoc=setDoc;
        export const writeBatch=()=>{throw Error('Unexpected write')};
        export const authenticatedPost=setDoc;export const uploadCoverImage=setDoc;export const uploadManuscript=setDoc;export const uploadMagazinePdf=setDoc;
      ` }));
      b.onResolve({ filter: /^@\/components\/seller\/(SellerHeader|ManuscriptUpload)$/ }, a => ({ path: a.path, namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export default function Stub(){return null}' }));
      b.onResolve({ filter: /^(@stripe\/react-stripe-js|@\/lib\/stripe\/client)$/ }, a => ({ path: a.path, namespace: 'stripe' }));
      b.onLoad({ filter: /.*/, namespace: 'stripe' }, () => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `
        import React from 'react';export const getStripe=()=>null;
        export const Elements=({children})=>children;export const CardElement=()=> <input aria-label="Card fixture"/>;
        export const useElements=()=>({getElement:()=>({})});
        export const useStripe=()=>({confirmCardPayment:async()=>{window.confirmCalls++;await new Promise(r=>setTimeout(r,100));return {error:{message:'Connection lost'}}}});
      ` }));
    } }] });
  const css = (await postcss([require('tailwindcss')({ content: ['components/**/*.tsx', 'app/**/*.tsx', 'tests/mobile-recovery.browser.cjs'], theme: require('../tailwind.config.js').theme })]).process(fs.readFileSync('app/globals.css', 'utf8'), { from: undefined })).css;
  const js = bundled.outputFiles[0].text;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); }
    else if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({connected:true,available:true,directSaleFee:15})); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>`); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto(base + '/publish');
    await page.getByLabel('Book Title', { exact: true }).fill('ታሪኽ — My unfinished book');
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('fixture-cover') });
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.getByRole('button', { name: '+ Add Chapter' }).click();
    await page.getByPlaceholder('Chapter title...').fill('ምዕራፍ 1');
    await page.locator('.tiptap-editor').fill('Unsaved chapter text — ትግርኛ العربية.');
    await waitForAsync(page, async () => (await window.readDraft())?.editorDraft?.content.includes('Unsaved chapter text'));
    await page.reload();
    await page.getByText('Your unfinished draft was restored on this device.', { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('Chapter title...').inputValue(), 'ምዕራፍ 1');
    assert.match(await page.locator('.tiptap-editor').innerText(), /ትግርኛ العربية/);
    assert.equal(await page.evaluate(async () => (await window.readDraft()).coverFile.name), 'cover.png');
    assert.equal(await page.evaluate(async () => await (await window.readDraft()).coverFile.text()), 'fixture-cover');
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
    await waitForAsync(page, async () => (await window.readDraft())?.chapters.length === 1 && (await window.readDraft()).editorDraft === null);
    // Leaving immediately flushes edits on unmount; another account cannot restore this draft.
    await page.getByRole('button', { name: /^Back/ }).click();
    await page.getByRole('button', { name: /^Back/ }).click();
    await page.getByLabel('Book Title', { exact: true }).fill('Latest before leaving');
    await page.evaluate(() => window.account('second-author'));
    await page.waitForFunction(() => document.querySelector('#publication-title')?.value === '');
    await page.getByLabel('Book Title', { exact: true }).fill('Second account draft');
    await waitForAsync(page, async () => (await window.readDraft())?.title === 'Second account draft');
    await page.evaluate(() => window.account('author'));
    await page.waitForFunction(() => document.querySelector('#publication-title')?.value === 'Latest before leaving');
    await page.goto(base + '/publish?edit=existing-book');
    await page.getByLabel('Book Title', { exact: true }).fill('Edited existing book');
    await waitForAsync(page, async () => (await window.readDraft())?.title === 'Edited existing book');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#publication-title')?.value === 'Edited existing book');
    await page.goto(base + '/publish');
    await page.waitForFunction(() => document.querySelector('#publication-title')?.value === 'Latest before leaving');
    await page.getByLabel('Book Title', { exact: true }).fill('Saved immediately before reload');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#publication-title')?.value === 'Saved immediately before reload');
    console.log('PASS draft reload, multilingual unfinished chapter, selected file bytes, immediate navigation flush, account and book isolation');

    let creates = 0, checks = 0, outcome = 'pending';
    await page.route('**/api/stripe/create-payment-intent', route => { creates++; return route.fulfill({json:{clientSecret:'fixture',orderIds:['order_saved'],amount:699,paymentStatus:'requires_payment_method'}}); });
    await page.route('**/api/stripe/recover-purchase', route => { checks++; return route.fulfill({json:{state:outcome}}); });
    await page.goto(base + '/checkout');
    await page.getByLabel('Cardholder Name').fill('Reader Test');
    await page.getByRole('button', { name: /^Pay/ }).dblclick();
    await page.getByRole('button', { name: 'Check payment status', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('button[type=button]')?.disabled);
    assert.equal(creates, 1); assert.equal(await page.evaluate(() => window.confirmCalls), 1);
    assert.equal(await page.getByRole('button', { name: /^Pay/ }).isDisabled(), true);
    await page.reload();
    await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
    await page.waitForFunction(() => window.destination === '/checkout/receipt?orders=order_saved');
    assert.equal(checks, 1); assert.equal(creates, 1); assert.equal(await page.evaluate(() => window.confirmCalls), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('afrobooks-pending-payment-author-cart')), null);
    // The current screen can safely recheck a declined intent and offer a manual retry.
    outcome = 'retryable';
    await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled);
    assert.equal(creates, 1);
    console.log('PASS double-tap protection, lost-confirmation recovery after reload, read-only paid check, manual retry only after status verification');

    await context.setOffline(true);
    await page.getByText('Connection interrupted.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Connection interrupted.', { exact: false }).waitFor();
    await context.setOffline(false);
    await page.getByText('Connection restored.', { exact: true }).waitFor();
    assert.equal(creates, 1);
    console.log('PASS offline banner, failed retry, verified reconnect with no payment replay');

    await page.goto(base + '/keyboard');
    await page.getByRole('textbox', { name: 'Profile email' }).focus();
    await page.evaluate(() => { Object.defineProperty(visualViewport,'height',{configurable:true,value:360}); visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'true');
    assert.equal(await page.locator('.buyer-bottom-nav').isVisible(), false);
    assert.equal(await page.locator('.profile-panel > footer').isVisible(), false);
    assert.ok((await page.locator('.profile-panel').boundingBox()).height <= 360);
    assert.ok(await page.getByRole('textbox', { name: 'Profile email' }).evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
    await page.waitForFunction(() => document.querySelector('input').getBoundingClientRect().bottom <= 360);
    await page.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded();
    assert.ok((await page.getByRole('button', { name: 'Save changes' }).boundingBox()).y < 360);
    await page.evaluate(() => { document.activeElement.blur(); Object.defineProperty(visualViewport,'height',{configurable:true,value:844});visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'false');
    assert.equal(await page.locator('.buyer-bottom-nav').isVisible(), true);
    for (const viewport of [{width:320,height:568},{width:844,height:390}]) {
      await page.setViewportSize(viewport); await page.goto(base + '/publish');
      await page.getByLabel('Book Title', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.getByRole('button', { name: 'Discard local draft', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#publication-title')?.value === '');
    await page.reload();
    await page.getByLabel('Book Title', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Book Title', { exact: true }).inputValue(), '');
    assert.deepEqual(errors, []);
    console.log('PASS keyboard viewport, reachable form actions, 16px inputs, portrait/landscape without horizontal overflow');
    await context.close();
    const blocked = await browser.newContext({viewport:{width:390,height:844}});
    await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', {value:{open(){throw new Error('Storage blocked')}}}));
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(base + '/publish');
    await blockedPage.getByText('Draft saving is unavailable on this device.', {exact:false}).waitFor();
    await blockedPage.getByLabel('Book Title', {exact:true}).fill('Work stays editable');
    assert.equal(await blockedPage.getByLabel('Book Title', {exact:true}).inputValue(), 'Work stays editable');
    await blocked.close();
    console.log('PASS explicit discard does not resurrect a draft; blocked storage warns without breaking the form');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
