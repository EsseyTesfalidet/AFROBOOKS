// Real app shell and gesture policy, with no account or payment requests.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const postcss = require('postcss');

async function main() {
  const bundle = await build({ bundle: true, write: false, outfile: 'zoom.js', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from './components/shared/MobileAppShell';import Experience from './components/shared/AppExperience';
createRoot(document.getElementById('root')).render(<Shell><Experience/><main style={{padding:24}}>
<h1>App content</h1><label htmlFor="note">Reading note</label><input id="note" style={{display:'block'}}/>
<button type="button" onClick={()=>{window.taps=(window.taps||0)+1}}>Tap action</button>
{Array.from({length:35},(_,i)=><p key={i} style={{marginBlock:40}}>Swipe to scroll through your library. Paragraph {i+1}.</p>)}
</main></Shell>);
` }, plugins: [{ name: 'navigation-fixture', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const router={replace(){}};export const usePathname=()=>'/browse';export const useRouter=()=>router;` }));
    } }],
  });
  const css = (await postcss([require('tailwindcss')({ content: ['components/shared/**/*.tsx'], theme: require('../tailwind.config.js').theme })])
    .process(fs.readFileSync('app/globals.css', 'utf8'), { from: undefined })).css
    + fs.readFileSync('app/app-appearance.css', 'utf8') + fs.readFileSync('app/app-themes.css', 'utf8');
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
  const originalViewport = 'width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content';
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); }
    else if (/^\/fonts\/[\w.-]+$/.test(req.url)) res.end(fs.readFileSync('public' + req.url));
    else { res.setHeader('Content-Type', 'text/html'); res.end('<html><head><meta charset="utf-8"><meta name="viewport" content="' + originalViewport + '"><style>' + css + '</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    for (const mode of ['browser', 'standalone', 'ios', 'android']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await context.addInitScript(mode => {
        if (mode === 'ios') Object.defineProperty(navigator, 'standalone', { value: true });
        if (mode === 'android') Object.defineProperty(document, 'referrer', { value: 'android-app://com.afrobs.app' });
        const original = window.matchMedia.bind(window);
        const listeners = new Set();
        const display = { matches: mode === 'standalone', addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn) };
        window.matchMedia = q => q.includes('display-mode') ? display : original(q);
        window.setStandalone = value => { display.matches = value; listeners.forEach(fn => fn()); };
      }, mode);
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/browse');
      await page.locator('html[data-app-mode]').waitFor();
      const installed = mode !== 'browser';
      const viewport = page.locator('meta[name="viewport"]');
      if (installed) await page.waitForFunction(() => document.querySelector('meta[name="viewport"]').content.includes('user-scalable=no'));
      const content = await viewport.getAttribute('content');
      assert.equal(content.includes('maximum-scale=1'), installed);
      assert.ok(content.includes('viewport-fit=cover') && content.includes('interactive-widget=resizes-content'));
      if (!installed) assert.equal(content, originalViewport);
      // Safari event handling and trackpad zoom must leave normal wheel scrolling alone.
      const events = await page.evaluate(() => {
        const dispatch = event => { document.dispatchEvent(event); return event.defaultPrevented; };
        return {
          gestureStart: dispatch(new Event('gesturestart', { cancelable: true })),
          gestureChange: dispatch(new Event('gesturechange', { cancelable: true })),
          pinchWheel: dispatch(new WheelEvent('wheel', { ctrlKey: true, deltaY: -80, cancelable: true })),
          scrollWheel: dispatch(new WheelEvent('wheel', { deltaY: 80, cancelable: true })),
        };
      });
      assert.deepEqual(events, { gestureStart: installed, gestureChange: installed, pinchWheel: installed, scrollWheel: false });
      assert.ok(await page.getByLabel('Reading note').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
      const cdp = await context.newCDPSession(page);
      // Native Chromium gesture, not a synthetic DOM event or a forced page scale.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 155, y: 350, id: 0 }, { x: 235, y: 350, id: 1 }] });
      for (let step = 1; step <= 12; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 155 - step * 7, y: 350, id: 0 }, { x: 235 + step * 7, y: 350, id: 1 }] });
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (installed) {
        assert.ok(Math.abs(await page.evaluate(() => visualViewport.scale) - 1) < .01, mode + ' page stays at 1x after pinch');
        await page.touchscreen.tap(195, 350); await page.touchscreen.tap(195, 350);
        assert.ok(Math.abs(await page.evaluate(() => visualViewport.scale) - 1) < .01, 'double tap stays at 1x');
        await page.getByRole('button', { name: 'Tap action' }).tap();
        assert.equal(await page.evaluate(() => window.taps), 1, 'ordinary taps still activate controls');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 650 }] });
        for (let step = 1; step <= 12; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 650 - step * 25 }] });
          await new Promise(resolve => setTimeout(resolve, 16));
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('.mobile-app-viewport').scrollTop > 100);
        assert.equal(await page.evaluate(() => scrollY), 0);
        const nextViewport = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=overlays-content';
        await viewport.evaluate((el, value) => { el.content = value; }, nextViewport);
        await page.waitForFunction(() => document.querySelector('meta[name="viewport"]').content.includes('user-scalable=no'));
        assert.ok((await viewport.getAttribute('content')).includes('interactive-widget=overlays-content'));
        // Exercise replacement metadata as well as updates to an existing node.
        await viewport.evaluate((el, value) => { const next = document.createElement('meta'); next.name = 'viewport'; next.content = value; el.replaceWith(next); }, nextViewport);
        await page.waitForFunction(() => document.querySelector('meta[name="viewport"]').content.includes('user-scalable=no'));
        if (mode === 'standalone') {
          await page.evaluate(() => window.setStandalone(false));
          await page.locator('html[data-app-mode="browser"]').waitFor();
          assert.equal(await viewport.getAttribute('content'), nextViewport, 'original browser viewport restored');
          assert.equal(await page.evaluate(() => { const e = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; }), false);
          assert.equal(await page.evaluate(() => { const e = new WheelEvent('wheel', { ctrlKey: true, cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; }), false);
        }
        console.log('PASS ' + mode + ' pinch/double-tap lock, normal taps and swipe scrolling, gesture handling, focus sizing and route metadata');
      } else {
        await page.waitForFunction(() => visualViewport.scale > 1.2);
        console.log('PASS regular mobile website still zooms with a real pinch and retains its viewport');
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
