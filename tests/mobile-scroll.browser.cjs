// Actual shell, Embla shelves, buyer navigation and keyboard handling.
// Only network/account boundaries are fixtures; no live account or purchases.
// PLAYWRIGHT_PATH and EDGE_PATH select local browser tooling.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const postcss = require('postcss');

async function main() {
  const bundle = await build({
    bundle: true, write: false, outfile: 'mobile-scroll.js', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Shell from './components/shared/MobileAppShell';import Experience from './components/shared/AppExperience';
import Keyboard from './components/shared/MobileKeyboard';import Rail from './components/buyer/BookRail';
import Header from './components/buyer/BuyerHeader';import Chrome from './components/buyer/BuyerChrome';
import {useAuthStore} from './store/authStore';
window.path=location.pathname;useAuthStore.setState({loading:false,firebaseUser:{uid:'fixture'},userProfile:{uid:'fixture',firstName:'Reader',lastName:'Test',status:'active',role:'buyer',activeRole:'buyer'}});
const books=Array.from({length:8},(_,i)=>({id:'book-'+i,title:i===1?'ታሪኽ — ትግርኛ':i===0?'How Eurocentric Perspectives Shape the Stories We Tell':'Story '+(i+1),authorName:'AfroBooks Author',price:199,coverBgColor:['#423647','#29434c','#464335'][i%3]}));
function App(){const [path,setPath]=useState(window.path);const[loaded,setLoaded]=useState(true);
window.navigate=(p,delayed=false)=>{history.pushState(null,'',p);window.path=p;setPath(p);setLoaded(!delayed);if(delayed)setTimeout(()=>setLoaded(true),150)};
const reader=path.startsWith('/read/');return <><Keyboard/><Shell><Experience/>{reader?<div className="reader-shell"><div className="reader-viewport" data-testid="reader"><article style={{padding:24}}><h1>Reader</h1>{Array.from({length:40},(_,i)=><p key={i} style={{marginBlock:24}}>A readable paragraph with room to breathe. ታሪኽ — ትግርኛ</p>)}</article></div></div>:<div className="min-h-screen app-canvas"><Header/><main className="app-page" style={{paddingInline:20}}><h1>{path==='/browse'?'Discover your next read':'Library'}</h1>{loaded&&<><Rail title="Featured stories" subtitle="Stories from across Africa" books={books}/>{Array.from({length:24},(_,i)=><p key={i} style={{marginBlock:36}}>Page paragraph {i+1}. Selectable text and space for a growing library.</p>)}<label htmlFor="note">Reading note</label><input id="note" style={{display:'block',height:48,color:'black'}}/><p data-testid="last" style={{marginBlock:32}}>End of content</p></>}</main><Chrome/></div>}</Shell></>}
createRoot(document.getElementById('root')).render(<App/>);
` },
    plugins: [{ name: 'account-and-framework-fixtures', setup(b) {
      b.onResolve({ filter: /^(next\/navigation|next\/link|next\/image|@\/lib\/firebase\/auth)$/ }, a => ({ path: a.path, namespace: 'framework' }));
      b.onLoad({ filter: /.*/, namespace: 'framework' }, a => ({ resolveDir: process.cwd(), loader: 'jsx', contents: a.path === 'next/image'
        ? `import React from 'react';export default function Image({fill,priority,unoptimized,...p}){return <img {...p}/>} `
        : `import React from 'react';export const usePathname=()=>window.path;export const useRouter=()=>({push:window.navigate,replace:window.navigate});export default function Link({children,href,onClick,...p}){return <a href={href} {...p} onClick={e=>{e.preventDefault();onClick?.(e);window.navigate(href)}}>{children}</a>};export function logOutAndRedirect(){throw Error('Unexpected signout')};export function updateUserProfile(){throw Error('Unexpected profile update')}` }));
      b.onResolve({ filter: /(CatalogSync|ReaderResumeBar|ProfileLinkHandler|NotificationBell|WorkspaceSwitcher|InstallPWA|profile\/ProfileAccount|profile\/ProfileSettings|profile\/ProfileCollections)$/ }, a => ({ path: a.path, namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, a => ({ resolveDir: process.cwd(), loader: 'jsx', contents: `import React from 'react';export default function Stub(){return ${a.path.includes('ProfileAccount') ? '<h2>Reader account</h2>' : 'null'}}` }));
    } }],
  });
  const css = (await postcss([require('tailwindcss')({ content: ['components/**/*.tsx'], theme: require('../tailwind.config.js').theme })])
    .process(fs.readFileSync('app/globals.css', 'utf8'), { from: undefined })).css
    + (bundle.outputFiles.find(f => f.path.endsWith('.css'))?.text || '')
    + fs.readFileSync('components/reader/reader.css', 'utf8')
    + fs.readFileSync('app/app-appearance.css', 'utf8')
    + fs.readFileSync('app/app-themes.css', 'utf8');
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); }
    else if (req.url.startsWith('/fonts/')) { res.end(fs.readFileSync('public' + req.url)); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    for (const mode of ['browser', 'standalone', 'ios', 'android']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await context.addInitScript(mode => {
        if (mode === 'ios') Object.defineProperty(navigator, 'standalone', { value: true });
        if (mode === 'android') Object.defineProperty(document, 'referrer', { value: 'android-app://com.afrobs.app' });
        if (mode === 'standalone') { const original = window.matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode') ? { matches: true, addEventListener() {}, removeEventListener() {} } : original(q); }
      }, mode);
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/browse'); await page.locator('html[data-app-mode]').waitFor();
      const shell = page.locator('.mobile-app-viewport');
      if (mode === 'browser') {
        assert.equal(await shell.evaluate(el => getComputedStyle(el).display), 'contents');
        assert.equal(await page.locator('.app-swipe-shelf').count(), 0);
        assert.equal(await page.locator('.app-book-rail-items').evaluate(el => getComputedStyle(el).overflowX), 'auto');
        await page.mouse.move(370, 700); await page.mouse.wheel(0, 450); await page.waitForFunction(() => scrollY > 100);
        assert.notEqual(await shell.evaluate(el => getComputedStyle(el).scrollbarWidth), 'none');
        console.log('PASS mobile browser retains document scrolling and native shelves');
      } else {
        await page.locator('.app-swipe-shelf[data-ready=true]').waitFor();
        assert.equal(await shell.evaluate(el => getComputedStyle(el).scrollbarWidth), 'none');
        const headerBefore = await page.locator('.app-header').boundingBox(); const navBefore = await page.locator('.buyer-bottom-nav').boundingBox();
        await page.mouse.move(370, 700); await page.mouse.wheel(0, 450);
        await page.waitForFunction(() => document.querySelector('.mobile-app-viewport').scrollTop > 100);
        assert.equal(await page.evaluate(() => scrollY), 0);
        assert.ok(Math.abs((await page.locator('.app-header').boundingBox()).y - headerBefore.y) < 1);
        assert.ok(Math.abs((await page.locator('.buyer-bottom-nav').boundingBox()).y - navBefore.y) < 1);
        const saved = await shell.evaluate(el => el.scrollTop);
        await page.evaluate(() => window.navigate('/library')); await page.waitForFunction(() => document.querySelector('.mobile-app-viewport').scrollTop === 0);
        await page.evaluate(() => window.navigate('/browse', true));
        await page.waitForFunction(saved => Math.abs(document.querySelector('.mobile-app-viewport').scrollTop - saved) < 2, saved);
        await shell.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
        await page.locator('.app-swipe-shelf[data-ready=true]').waitFor();
        const track = page.locator('.app-shelf-track'); const shelf = page.locator('.app-shelf-viewport');
        const offset = () => track.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
        const next = page.getByRole('button', { name: 'Next in Featured stories' });
        await next.click(); await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.app-shelf-track')).transform).m41 < -50);
        await shelf.focus(); await page.keyboard.press('End');
        assert.ok(await offset() < -700); assert.ok(await next.isDisabled());
        await page.keyboard.press('Home'); assert.ok(Math.abs(await offset()) < 1);
        await page.keyboard.press('ArrowRight'); await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.app-shelf-track')).transform).m41 < -50);
        await page.keyboard.press('Home');
        const box = await shelf.boundingBox(); const x = box.x + box.width - 30; const y = box.y + 80;
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 220, y, { steps: 12 }); await page.mouse.up();
        assert.equal(await page.evaluate(() => window.path), '/browse', 'drag must not open book');
        assert.ok(await offset() < -50, 'mouse drag moves shelf');
        await shelf.focus(); await page.keyboard.press('Home'); await page.mouse.move(x, y); await page.mouse.wheel(260, 0);
        await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.app-shelf-track')).transform).m41 < -50);
        await page.mouse.wheel(0, 400); await page.waitForFunction(() => document.querySelector('.mobile-app-viewport').scrollTop > 100);
        await shell.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
        await shelf.focus(); await page.keyboard.press('Home');
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 25, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.ok(await offset() < -50, 'touch swipe moves shelf');
        await page.locator('.app-book-card').last().focus();
        await page.waitForFunction(() => { const r = document.querySelectorAll('.app-book-card')[7].getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
        for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
          await page.setViewportSize(viewport);
          await shell.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
          assert.equal(await page.evaluate(() => scrollY), 0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          const last = await page.getByTestId('last').boundingBox(); const nav = await page.locator('.buyer-bottom-nav').boundingBox();
          assert.ok(last.y >= 0 && last.y + last.height <= nav.y, 'last content reachable above navigation');
          assert.ok(Math.abs((await page.locator('.app-header').boundingBox()).y) < 1, 'header stays fixed in rotation');
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Account', exact: true }).click(); await page.getByRole('dialog').waitFor();
        assert.ok(await shell.evaluate(el => Boolean(el.closest('[inert]'))));
        await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
        await page.getByLabel('Reading note').fill('My next read');
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, 'height', { configurable: true, value: 480 });
          visualViewport.dispatchEvent(new Event('resize'));
        });
        await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen === 'true');
        await page.waitForFunction(() => { const r = document.querySelector('#note').getBoundingClientRect(); return r.y >= 0 && r.bottom <= 480; });
        assert.ok((await shell.boundingBox()).height <= 481);
        await page.evaluate(() => { document.activeElement.blur(); delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
        await page.waitForFunction(() => document.documentElement.dataset.keyboardOpen !== 'true');
        await shell.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
        if (process.env.SCREENSHOT_PATH && mode === 'standalone') await page.screenshot({ path: process.env.SCREENSHOT_PATH });
        await page.evaluate(() => window.navigate('/read/book-0'));
        const reader = page.getByTestId('reader'); await reader.waitFor();
        assert.equal(await page.locator('.buyer-bottom-nav').count(), 0);
        assert.equal(await reader.evaluate(el => getComputedStyle(el).scrollbarWidth), 'none');
        await page.mouse.move(300, 400); await page.mouse.wheel(0, 500);
        await page.waitForFunction(() => document.querySelector('.reader-viewport').scrollTop > 100);
        assert.equal(await page.evaluate(() => scrollY), 0);
        await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => window.navigate('/browse'));
        await page.locator('.app-swipe-shelf[data-ready=true]').waitFor(); await shelf.focus(); await page.keyboard.press('End'); assert.ok(await next.isDisabled());
        console.log('PASS ' + mode + ' fixed frame, route restoration, drag/swipe/wheel, keyboard controls, rotation, drawers, virtual keyboard and reader scrolling');
      }
      assert.deepEqual(errors, []); await context.close();
    }
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
