// Real Vidstack + hls.js + browser video decoding. Auth/API are fixtures; the HLS
// source is Vidstack's public demo, with a synthetic Tigrinya caption track.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild'); const fs = require('node:fs'); const http = require('node:http'); const assert = require('node:assert/strict');
async function main() {
  const demo = 'https://files.vidstack.io/sprite-fight/hls/stream.m3u8';
  const manifest = await (await fetch(demo, { signal: AbortSignal.timeout(15000) })).text();
  assert.ok(manifest.startsWith('#EXTM3U'));
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' }, define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import Player from './components/watch/WatchPlayer';import Feed from './components/watch/WatchFeed';import {useAuthStore} from './store/authStore';
    window.fixture={calls:[],denyRetry:false};window.setAccount=uid=>useAuthStore.setState({firebaseUser:uid?{uid}:null});window.setAccount('reader');
    const rows=[{id:'one',title:'First preview'},{id:'two',title:'Second preview'},{id:'three',title:'Third preview'}];
    createRoot(document.getElementById('root')).render(location.search.includes('feed')?<main className="watch-page" style={{paddingBlock:'50vh'}}><Feed videos={rows}/></main>:<main className="watch-page watch-detail"><h1>AfroBooks Screen</h1><Player id="film" title="Sprite Fight · Player preview" autoPlay={location.search.includes('autoplay')} trailer={location.search.includes('trailer')} playback={{token:'fixture',seconds:20,duration:600,expiresAt:0}}/></main>);
  ` }, plugins: [{ name: 'player-http-boundary', setup(b) {
    b.onResolve({ filter: /^(\.\/WatchUI|@\/lib\/firebase\/request)$/ }, () => ({ path: 'network', namespace: 'network' }));
    b.onLoad({ filter: /.*/, namespace: 'network' }, () => ({ loader:'jsx',resolveDir:process.cwd(),contents: `
      import React from 'react';export function WatchCard({video,preview}){return <article><div data-preview-id={video.id} className="watch-art">{preview}</div><h2>{video.title}</h2></article>}
      export async function authenticatedPost(path,body){const f=window.fixture;f.calls.push({path,body});if(body.preview)return{playback:{token:'preview-fixture',seconds:0,duration:600,expiresAt:9999999999},trailer:true};if(path.endsWith('/playback')){if(f.denyRetry)throw Error('Purchase access is required to watch this video.');return{token:'fixture-retry',seconds:3,duration:600,expiresAt:9999999999}}return{ok:true}};
      export const watchActionRequest=(action,data)=>authenticatedPost('/api/watch/action',{action,data});
    ` }));
  } }] });
  const css = ['node_modules/@vidstack/react/player/styles/default/theme.css', 'node_modules/@vidstack/react/player/styles/default/layouts/video.css', 'components/watch/watch.css', 'components/watch/watch-player.css', 'app/app-themes.css'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url === '/subs.m3u8') { res.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); return res.end('#EXTM3U\n#EXT-X-TARGETDURATION:600\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:600,\n/subs.vtt\n#EXT-X-ENDLIST\n'); }
    if (req.url === '/subs.vtt') { res.setHeader('Content-Type', 'text/vtt'); return res.end('WEBVTT\n\n00:00:00.000 --> 00:10:00.000\nሰላም · Tigrinya caption test\n'); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html data-app-mode="installed" data-app-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:16px Arial;background:var(--app-canvas);color:var(--app-text)}button{font:inherit;border:0}h1{margin:0 0 20px}'+css+'</style><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', error => { errors.push(error.message); console.log('Browser error:', error.stack); });
    await page.route('https://videodelivery.net/**', route => {
      const body = manifest.split('\n').map(line => line.startsWith('#EXT-X-STREAM-INF:') ? line + ',SUBTITLES="subs"' : line && !line.startsWith('#') ? new URL(line, demo).href : line).join('\n').replace('#EXTM3U', `#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tigrinya",LANGUAGE="ti",AUTOSELECT=NO,DEFAULT=NO,URI="${base}/subs.m3u8"`);
      return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    });
    if (!process.env.DISCOVERY_ONLY) {
    await page.goto(base); await page.waitForFunction(() => document.querySelector('[data-media-player]')?.hasAttribute('data-can-play'), { timeout: 45000 });
    const video = page.locator('video'); const surface = page.locator('[data-media-player]');
    await page.waitForFunction(() => { const el = document.querySelector('video'); return Math.abs(el.currentTime - 20) < 1 && !el.seeking && el.readyState >= 3; });
    assert.equal(await video.evaluate(el => el.paused), true, 'No unrequested autoplay');
    assert.equal(await video.evaluate(el => getComputedStyle(el).objectFit), 'contain');
    await page.getByRole('button', { name: 'Go back 10 seconds' }).click(); await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 10) < 1);
    await page.getByRole('button', { name: 'Go forward 10 seconds' }).click(); await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 20) < 1);
    await page.waitForFunction(() => !document.querySelector('video').seeking);
    const touchBounds = await surface.boundingBox();
    for (let tap = 0; tap < 2; tap++) await page.touchscreen.tap(touchBounds.x + 18, touchBounds.y + touchBounds.height / 2);
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 10) < 1 && !document.querySelector('video').seeking);
    for (let tap = 0; tap < 2; tap++) await page.touchscreen.tap(touchBounds.x + touchBounds.width - 18, touchBounds.y + touchBounds.height / 2);
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 20) < 1 && !document.querySelector('video').seeking);
    await surface.hover();
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 20.2);
    await surface.hover();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: /Speed/ }).click();
    const speedSlider = page.getByRole('slider', { name: 'Speed', exact: true }); await speedSlider.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('video').playbackRate === 1.25);
    await page.keyboard.press('Escape');
    await page.getByRole('menuitem', { name: 'Quality', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '360p', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('menuitem', { name: /Captions/ }).click();
    await page.getByRole('menuitemradio', { name: 'Tigrinya', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.vds-captions')?.textContent.includes('Tigrinya caption test'));
    await page.screenshot({ path: '.vercel/watch-player-settings.png' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.appTheme = value, theme);
      for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} fits ${size.width}`);
        const bounds = await surface.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= size.width + 1);
      }
      await page.setViewportSize({ width: 390, height: 844 }); await surface.hover(); await page.screenshot({ path: `.vercel/watch-player-${theme}.png` });
    }
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await page.waitForFunction(() => !!document.fullscreenElement); await surface.hover(); await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await page.waitForFunction(() => !document.fullscreenElement);
    await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.getByRole('status').filter({ hasText: 'offline' }).waitFor(); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const before = await video.evaluate(el => el.currentTime);
    await video.evaluate(el => { Object.defineProperty(el, 'error', { configurable: true, value: { code: 3, message: 'Test decode error' } }); el.dispatchEvent(new Event('error')); });
    await page.getByRole('button', { name: 'Retry playback' }).click();
    await page.waitForFunction(time => { const el = document.querySelector('video'); return el?.readyState >= 2 && Math.abs(el.currentTime - time) < 1; }, before, { timeout: 45000 });
    await page.evaluate(() => window.setAccount('another-reader')); await page.locator('video').waitFor({ state: 'detached' });
    }
    await page.goto(base+'?autoplay');
    await page.locator('[data-media-player]').waitFor();
    // An explicit user gesture allows the requested detail playback with sound.
    await page.mouse.click(10,10);
    await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&!video.paused&&video.currentTime>20;},null,{timeout:45000});
    await page.goto(base+'?feed');
    await page.locator('[data-preview-id="one"]').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.waitForFunction(()=>{const video=document.querySelector('[data-preview-id="one"] video');return video&&video.muted&&!video.paused&&video.currentTime>.2;},null,{timeout:45000});
    await page.locator('[data-preview-id="two"]').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.waitForFunction(()=>{const video=document.querySelector('[data-preview-id="two"] video');return video&&video.muted&&!video.paused&&video.currentTime>.2;},null,{timeout:45000});
    assert.equal(await page.locator('video').count(),1,'Only the centered preview is mounted');
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))});
    await page.locator('video').waitFor({state:'detached'});
    await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))});
    await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&!video.paused&&video.currentTime>.2;},null,{timeout:45000});
    await page.locator('video').evaluate(el=>el.currentTime=20.2);
    await page.waitForFunction(()=>document.querySelector('video').paused);

    assert.equal(await page.evaluate(()=>window.fixture.calls.filter(c=>c.body.action==='progress').length),0,'Browsing does not write watch progress');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('video').waitFor({state:'detached'});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByRole('button',{name:'Video previews: On'}).click();
    await page.locator('video').waitFor({state:'detached'});
    assert.deepEqual(errors, []);
    console.log('PASS muted HLS feed previews, centered switching, one active player, no watch-history writes, reduced motion and preview toggle.');
    if (!process.env.DISCOVERY_ONLY) console.log('PASS real HLS decoding, resume, play/pause, touch skip controls, settings, fullscreen, themes/rotation, retry preserving position and account switching.');
  } catch (error) {
    const page = browser.contexts().flatMap(context => context.pages())[0]; if (page) { console.log((await page.locator('body').innerText()).slice(0, 1800)); console.log(await page.locator('video').evaluate(el => ({time:el.currentTime,duration:el.duration,ready:el.readyState,paused:el.paused})).catch(()=>({}))); await page.screenshot({ path: '.vercel/watch-player-failure.png' }); }
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
