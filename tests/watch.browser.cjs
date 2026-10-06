// Render the actual app shell, header, navigation and Watch components. Only
// Firebase, Next routing, API responses and the external player are fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http'); const assert = require('node:assert/strict');
async function main() {
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import Catalog from './components/watch/WatchCatalog';import Detail from './components/watch/WatchDetail';import Library from './components/watch/WatchLibrary';
    import Studio from './components/watch/WatchStudio';import AdminVideos from './app/(admin)/admin/videos/page';
    import ProfileAccount from './components/buyer/profile/ProfileAccount';import Shell from './components/shared/MobileAppShell';import Nav from './components/buyer/BuyerBottomNav';
    import {useAuthStore} from './store/authStore';import {useAppAppearanceStore} from './store/appAppearanceStore';import {APP_MODE_BOOTSTRAP} from './lib/app/installed';
    useAuthStore.setState({loading:false,firebaseUser:{uid:'reader'},userProfile:{uid:'reader',role:'buyer',status:'active',firstName:'Test',lastName:'Reader'}});
    window.setTheme=mode=>useAppAppearanceStore.getState().setThemeMode(mode);window.path=location.pathname;new Function(APP_MODE_BOOTSTRAP)();
    window.setRole=role=>{const uid=role==='admin'?'staff':'creator';useAuthStore.setState({loading:false,firebaseUser:{uid,getIdToken:async()=>'fixture'},userProfile:{uid,role,status:'active',firstName:'Test',lastName:'Creator'}})};
    function App(){const[current,setCurrent]=useState(window.path);window.navigate=p=>{history.pushState(null,'',p);window.path=location.pathname;setCurrent(window.path)};
      return <Shell><div key={current}>{current==='/profile'?<ProfileAccount/>:current==='/video-studio'?<Studio/>:current==='/admin/videos'?<div className="admin-workspace"><main className="admin-page"><AdminVideos/></main></div>:current==='/library/videos'?<Library/>:current.startsWith('/watch/creator/')?<Catalog creatorId={current.split('/').pop()}/>:current==='/watch'?<Catalog/>:current.startsWith('/watch/')?<Detail id={current.split('/').pop()}/>:<h1>Books</h1>}</div>{!['/video-studio','/admin/videos'].includes(current)&&<><div className="buyer-nav-space h-[92px]"/><Nav/></>}</Shell>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, plugins: [{ name: 'test-boundaries', setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|image|dynamic)$/ }, a => ({ path: a.path, namespace: 'next-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'next-fixture' }, a => ({ loader: 'jsx', resolveDir: process.cwd(), contents:
      a.path === 'next/dynamic' ? `import React from 'react';export default function dynamic(loader){const C=React.lazy(loader);return p=><React.Suspense fallback={<p>Opening player…</p>}><C {...p}/></React.Suspense>}` :
      a.path === 'next/image' ? `import React from 'react';export default function Image(p){return <img {...p}/>} ` :
      `import React from 'react';export const usePathname=()=>window.path;export const useRouter=()=>({push:window.navigate,replace:window.navigate});export default function Link({href,children,...p}){return <a {...p} href={href} onClick={e=>{e.preventDefault();window.navigate(href)}}>{children}</a>}` }));
    b.onResolve({ filter: /^@\/lib\/firebase\/(request|auth)$/ }, a => ({ path: a.path, namespace: 'auth-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, a => ({ resolveDir: process.cwd(), contents: a.path.endsWith('/auth') ? `export const updateUserProfile=async()=>{};` : `async function call(path,init){const r=await fetch(path,init);const v=await r.json();if(!r.ok)throw Error(v.error);return v}export const authenticatedGet=p=>call(p);export const authenticatedPost=(p,body)=>call(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});` }));
    b.onResolve({ filter: /^@\/components\/notifications\/NotificationBell$/ }, () => ({ path: 'bell', namespace: 'empty-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'empty-fixture' }, () => ({ contents: 'export default function Bell(){return null}' }));
    b.onResolve({ filter: /^@\/components\/shared\/AvatarUpload$/ }, () => ({ path:'avatar', namespace:'empty-fixture' }));
    b.onResolve({ filter: /^hls\.js$/ }, () => ({path:'hls',namespace:'hls-fixture'}));
    b.onLoad({filter:/.*/,namespace:'hls-fixture'},()=>({contents:`export default class Hls{static isSupported(){return true}static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};constructor(){}on(){}loadSource(){}attachMedia(){}stopLoad(){}destroy(){}}`}));
    b.onResolve({ filter: /^@vidstack\/react(?:\/player\/layouts\/default)?$/ }, () => ({ path: 'stream', namespace: 'stream-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'stream-fixture' }, () => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `import React,{useEffect,forwardRef} from 'react';export const MediaPlayer=forwardRef(function Player({onTimeUpdate,onPlay,onPause,onCanPlay,currentTime,autoPlay},ref){useEffect(()=>{ref.current={currentTime:currentTime||0,pause:async()=>{}};onCanPlay();return()=>{ref.current=null}},[]);return <div style={{color:'white',padding:20}}><p data-autoplay={String(!!autoPlay)}>Provider playback fixture</p><button onClick={()=>{onPlay();ref.current.currentTime=45;onTimeUpdate()}}>Advance video</button><button onClick={()=>onPause()}>Pause video</button></div>});export const MediaProvider=()=>null;export const Poster=()=>null;export const DefaultVideoLayout=()=>null;export const PlayButton=()=>null;export const SeekButton=()=>null;export const PIPButton=()=>null;export const defaultLayoutIcons={};export const isHLSProvider=()=>false;export const useMediaState=()=>true;export const useMediaRemote=()=>({changePlaybackRate(){}});` }));
    b.onResolve({ filter: /^@\/lib\/watch\/upload$/ }, () => ({ path: 'metadata', namespace: 'metadata-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'metadata-fixture' }, () => ({ resolveDir: process.cwd(), contents: `export const readVideoDuration=async()=>119;export {uploadReservation} from './lib/watch/upload';` }));
    b.onResolve({ filter: /^tus-js-client$/ }, () => ({ path: 'tus', namespace: 'tus-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'tus-fixture' }, () => ({ contents: `export class Upload{constructor(file,options){this.file=file;this.options=options}start(){this.timer=setTimeout(()=>{if(window.failUploadOnce){window.failUploadOnce=false;this.options.onError(Error("Interrupted test upload"));return}this.options.onProgress(this.file.size,this.file.size);this.options.onSuccess()},20)}async abort(){clearTimeout(this.timer)}}` }));
  } }] });
  const baseCss = (await require('postcss')([require('tailwindcss')]).process(fs.readFileSync('app/globals.css', 'utf8').replace(/^@import.*$/gm, ''), { from: 'app/globals.css' })).css;
  const css = baseCss + ['components/buyer/buyer-chrome.css', 'app/app-appearance.css', 'app/app-themes.css', 'app/(admin)/admin.css', 'components/watch/watch.css', 'components/watch/watch-studio.css'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url.startsWith('/fonts/') || req.url === '/brand/afrobooks-mark.svg') { const file = path.join(process.cwd(), 'public', req.url); res.setHeader('Content-Type', req.url.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2'); return res.end(fs.readFileSync(file)); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g"><stop stop-color="#814634"/><stop offset="1" stop-color="#273d45"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="605" cy="105" r="48" fill="#e2b676"/><path d="M0 380L210 170L410 340L620 190L800 390V450H0" fill="#142d33"/></svg>');
  const fixture = (id, title, category, priceCents) => ({ id, title, category, priceCents, creatorId: 'studio', creatorName: 'Original Studio', language: 'Tigrinya', description: 'An original African story, told through music and memories. This is a test fixture, never a live catalog entry.', currency: 'usd', posterUrl: poster, durationSeconds: 180, hasTrailer: true, status: 'published', publishedAt: 10, newsDate: '', updatedAt: 10 });
  const videos = [fixture('free-film', 'Stories of home', 'Documentaries', 0), fixture('paid-film', 'ሙዚቃ ሃገረይ', 'Music', 249), fixture('short-film', 'A journey together', 'Short films', 99)];
  videos[0].posterUrl = ''; // Existing published video without a custom cover.
  try {
    for (const installed of (process.env.STUDIO_ONLY ? [] : [false, true])) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await context.addInitScript(installed => { if (installed) { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q); } }, installed);
      const page = await context.newPage(); const errors = []; let calls = []; let saved = false, following = false, seconds = 0; let outage = false;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/watch**', async route => {
        const request = route.request(); const url = new URL(request.url()); calls.push({ url: url.pathname, body: request.postData() });
        if (outage) return route.fulfill({ status: 503, json: { error: 'Test connection lost. Try again.' } });
        if (url.pathname.endsWith('/poster')) return route.fulfill({json:{posterUrl:poster}});
        if (url.pathname.endsWith('/action')) { const input = request.postDataJSON(); if (input.action === 'save') saved = input.data.saved; if (input.action === 'follow') following = input.data.following; if (input.action === 'progress') seconds = input.data.seconds; return route.fulfill({ json: { ok: true } }); }
        if (url.pathname.endsWith('/playback') && request.postDataJSON().preview) return route.fulfill({json:{playback:{token:'PREVIEW-ONLY',expiresAt:9999999999,seconds:0,duration:20},trailer:true}});
        if (url.searchParams.get('view') === 'related') return route.fulfill({json:{videos:videos.filter(v=>v.id!==url.searchParams.get('id'))}});
        if (url.pathname.endsWith('/playback')) return route.fulfill({ json: { token: 'FIXTURE-NO-LIVE-TOKEN', expiresAt: 9999999999, seconds, duration: 180 } });
        if (url.searchParams.get('view') === 'detail') { const video = videos.find(v => v.id === url.searchParams.get('id')); return route.fulfill({ json: { video, state: { saved, following, seconds, owned: false }, canPlay: video.priceCents === 0, hostingReady: true, purchasesReady: false } }); }
        if (url.searchParams.get('view') === 'library') return route.fulfill({ json: { entries: [{ video: videos[0], state: { saved, following, seconds, owned: false } }], limited: false } });
        return route.fulfill({ json: { videos, next: null, channel: url.searchParams.has('creator') ? { name: 'Original Studio', uid: 'studio', following } : null } });
      });
      await page.goto(base + '/watch');
      if (!installed) {
        await page.getByRole('heading', { name: 'AfroBooks Screen is in the app' }).waitFor();
        assert.equal(calls.length, 0); assert.equal(await page.getByRole('link', { name: 'Screen', exact: true }).count(), 0);
        console.log('PASS mobile website keeps existing navigation and does not fetch the video catalog'); await context.close(); continue;
      }
      await page.getByRole('heading', { name: 'Screen', exact: true }).waitFor();
      assert.equal(await page.getByRole('link', { name: /Creator studio/i }).count(), 0);
      await page.locator('[data-preview-id="free-film"]').evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.waitForFunction(()=>{const img=document.querySelector('[data-preview-id="free-film"] img');return img?.complete&&img.naturalWidth>0;});
      await page.waitForFunction(()=>document.querySelectorAll('.watch-feed-preview video').length===1);
      assert.equal(await page.locator('.watch-feed-preview video').evaluate(el=>el.muted&&el.playsInline),true);
      await page.getByRole('button',{name:'Options for Stories of home'}).click();
      await page.getByRole('dialog').waitFor();
      await page.waitForFunction(()=>!document.querySelector('.watch-feed-preview video'));
      await page.getByRole('button',{name:'Save to video library'}).click();
      await page.getByRole('button',{name:'Saved in your library'}).waitFor();
      assert.equal(saved,true); saved=false;
      assert.equal(await page.getByRole('link',{name:'Visit creator channel'}).getAttribute('href'),'/watch/creator/studio');
      await page.keyboard.press('Escape');
      await page.locator('[data-preview-id="short-film"]').evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.waitForFunction(()=>document.querySelector('[data-preview-id="short-film"] video'));
      assert.equal(await page.locator('.watch-feed-preview video').count(),1);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>!document.querySelector('.watch-feed-preview video'));
      assert.equal(await page.locator('[data-preview-id="free-film"] img').evaluate(img=>img.complete&&img.naturalWidth>0),true,'The video frame remains visible when motion is disabled');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.getByRole('button',{name:'Video previews: On'}).click();
      await page.waitForFunction(()=>!document.querySelector('.watch-feed-preview video'));
      await page.evaluate(()=>window.navigate('/profile'));
      const studioShortcut = page.getByRole('link', { name: /Creator studio/i });
      assert.equal(await studioShortcut.getAttribute('href'), '/author/start?view=web&studio=video');
      assert.equal(await studioShortcut.getAttribute('target'), '_blank');
      await page.evaluate(()=>window.navigate('/watch'));
      await page.getByRole('heading', { name: 'Stories of home' }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Reader navigation' }).getByRole('link').count(), 4);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => window.setTheme(theme), theme);
        await page.waitForFunction(theme => document.documentElement.dataset.appTheme === theme, theme);
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.watch-chips button[aria-pressed="true"]')).backgroundColor === 'rgb(233, 189, 115)');
        const colors = await page.locator('.watch-surface').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color }));
        assert.equal(colors.bg, theme === 'light' ? 'rgb(247, 245, 241)' : 'rgb(16, 17, 20)');
        assert.equal(colors.text, theme === 'light' ? 'rgb(37, 39, 44)' : 'rgb(245, 243, 239)');
        const raised = await page.locator('.buyer-nav-item[data-active="true"] .buyer-nav-icon').boundingBox();
        const dock = await page.locator('.buyer-bottom-nav-shell').boundingBox();
        assert.ok(raised.y < dock.y,'The selected Screen icon rises above the floating dock');
        assert.equal(await page.locator('.buyer-nav-item[data-active="true"] .buyer-nav-icon').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
        await page.getByRole('searchbox').focus();
        await page.screenshot({ path: `.vercel/watch-${theme}-integrated.png` });
      }
      await page.getByRole('button', { name: 'Music', exact: true }).click(); assert.equal(await page.locator('.watch-card').count(), 1);
      await page.getByRole('button', { name: 'All', exact: true }).click();
      await page.getByRole('searchbox').fill('ሙዚቃ'); assert.equal(await page.locator('.watch-card').count(), 1);
      await page.getByRole('button',{name:'Clear video search'}).click();
      assert.equal(await page.locator('.watch-card').count(),3);
      await page.getByRole('searchbox').fill('ሙዚቃ');
      await page.getByRole('heading', { name: 'ሙዚቃ ሃገረይ' }).click();
      await page.getByRole('button', { name: /Buy.*coming soon/ }).waitFor(); assert.equal(await page.getByRole('button', { name: /Buy.*coming soon/ }).isDisabled(), true);
      await page.getByText('Provider playback fixture').waitFor();
      assert.equal(await page.locator('[data-autoplay]').getAttribute('data-autoplay'),'true');
      await page.getByRole('heading',{name:'More to watch'}).waitFor();
      await page.locator('.watch-description-panel summary').click();
      assert.equal(await page.locator('.watch-description-panel').evaluate(el=>el.open),true);
      for (const theme of ['light','dark']) {
        await page.evaluate(theme=>window.setTheme(theme),theme);
        await page.locator('.mobile-app-viewport').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
        await page.screenshot({path:`.vercel/watch-detail-modern-${theme}.png`});
      }
      await page.locator('.mobile-app-viewport').evaluate(el=>el.scrollTo({top:340,behavior:'instant'}));
      const pinned=await page.locator('.watch-detail-player').boundingBox();
      const header=await page.locator('.buyer-header').boundingBox();
      assert.ok(Math.abs(pinned.y-(header.y+header.height))<2,'Player stays below the app header while reading details');
      assert.equal(await page.locator('.watch-related [data-preview-id="paid-film"]').count(),0);
      await page.getByRole('button', { name: 'Advance video' }).click();
      assert.equal(calls.filter(call => call.body?.includes('"progress"')).length, 0, 'Trailers must not overwrite full-video progress');
      await page.evaluate(() => window.navigate('/watch/free-film'));
      await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.getByRole('button', { name: 'Saved', exact: true }).waitFor(); assert.equal(saved, true);
      await page.getByRole('button', { name: 'Follow · free', exact: true }).click(); await page.getByRole('button', { name: 'Following', exact: true }).waitFor(); assert.equal(following, true);
      await page.getByText('Provider playback fixture').waitFor(); await page.getByRole('button', { name: 'Advance video' }).click();
      await page.waitForFunction(() => document.querySelector('.watch-player'));
      await page.getByRole('button', { name: 'Pause video' }).click(); assert.equal(seconds, 45);
      await page.getByRole('button', { name: 'Report this video' }).click(); await page.getByRole('dialog').waitFor();
      await page.getByRole('textbox').fill('This is a test report for rights review.'); await page.getByRole('button', { name: 'Send report' }).click();
      await page.getByText('Your report has been sent for review.').waitFor();
      await page.evaluate(() => window.navigate('/library/videos'));
      await page.getByRole('heading', { name: 'Stories of home' }).waitFor();
      await page.locator('.watch-resume-card').waitFor();
      await page.getByRole('searchbox',{name:'Search your videos'}).fill('no such video');
      await page.getByRole('heading',{name:'No matching videos'}).waitFor();
      await page.getByRole('button',{name:'Clear library search'}).click();
      await page.screenshot({path:'.vercel/watch-library-modern.png'});
      await page.getByRole('button', { name: 'Continue watching', exact: true }).click(); assert.equal(await page.locator('.watch-card').count(), 1);
      await page.getByRole('button', { name: 'Purchased', exact: true }).click(); await page.getByRole('heading', { name: 'Your video collection starts here' }).waitFor();
      await page.screenshot({ path: '.vercel/watch-empty-library.png' });
      await page.getByRole('link', { name: 'Screen', exact: true }).click();
      await page.evaluate(()=>window.navigate('/watch/creator/studio'));
      await page.getByRole('heading',{name:'Original Studio',exact:true}).waitFor();
      assert.equal(await page.locator('.watch-channel-header .watch-follow').getAttribute('aria-pressed'),'true');
      await page.screenshot({path:'.vercel/watch-channel-modern.png'});
      await page.evaluate(()=>window.navigate('/watch'));
      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport); await page.getByRole('heading', { name: 'Stories of home' }).waitFor();
        const sizing = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, width: innerWidth, scrollbars: getComputedStyle(document.querySelector('.mobile-app-viewport')).scrollbarWidth }));
        assert.ok(sizing.body <= sizing.width, `No horizontal overflow at ${viewport.width}`); assert.equal(sizing.scrollbars, 'none');
        const nav = await page.getByRole('navigation', { name: 'Reader navigation' }).boundingBox(); assert.ok(nav.y + nav.height <= viewport.height + 1);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.navigate('/watch/free-film')); await page.getByRole('button', { name: 'Report this video' }).click();
      assert.equal(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).animationName), 'none'); await page.keyboard.press('Escape');
      outage = true; await page.evaluate(() => window.navigate('/watch')); await page.getByRole('alert').waitFor(); outage = false;
      await page.getByRole('button', { name: 'Try again' }).click(); await page.getByRole('heading', { name: 'Stories of home' }).waitFor();
      assert.deepEqual(errors, []); console.log('PASS installed Screen navigation, light/dark themes, categories, Tigrinya search, saved library, follow, paid gate, trailer isolation, resume, reports, retry, portrait/landscape and reduced motion');
      await context.close();
    }

    if (!process.env.STUDIO_ONLY) {
    const billingContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await billingContext.addInitScript(() => {
      const mm = window.matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q);
      window.playOwned = false; window.paymentRequests = [];
      window.getDigitalGoodsService = async method => {
        if (method !== 'https://play.google.com/billing') throw Error('Wrong provider');
        return { getDetails: async ids => ids.map(itemId => ({ itemId, title: 'Test film', price: { currency: 'EUR', value: '3.49' } })), listPurchases: async () => window.playOwned ? [{ itemId: 'afrobooks_video_test', purchaseToken: 'TEST-PURCHASE-TOKEN' }] : [] };
      };
      window.PaymentRequest = class {
        constructor(methods, details) { window.paymentRequests.push({ methods, details }); }
        async show() { window.playOwned = true; return { details: { purchaseToken: 'TEST-PURCHASE-TOKEN' }, complete: async result => { window.paymentCompletion = result; } }; }
      };
    });
    const billingPage = await billingContext.newPage(); billingPage.setDefaultTimeout(15000);
    const billingErrors = []; billingPage.on('pageerror', error => billingErrors.push(error.message));
    let purchased = false, verifyOutage = false, revoked = false, pendingPayment = true;
    const offer = { productId: 'afrobooks_video_test', accountId: 'a'.repeat(64), testOnly: true };
    await billingPage.route('**/api/watch**', async route => {
      const url = new URL(route.request().url());
      if(url.searchParams.get('view')==='related')return route.fulfill({json:{videos:[]}});
      if(url.pathname.endsWith('/playback'))return route.fulfill({json:{token:'BILLING-FIXTURE',expiresAt:9999999999,seconds:0,duration:180}});
      if (url.pathname === '/api/watch/play') {
        const body = route.request().postDataJSON();
        if (body.action === 'prepare') return route.fulfill({ json: offer });
        if (body.action === 'verify') {
          if (verifyOutage) { verifyOutage = false; return route.fulfill({ status: 503, json: { error: 'Verification interrupted. Use Restore purchases before paying again.' } }); }
          purchased = !pendingPayment && !revoked;
          return route.fulfill({ json: { videoId: 'paid-film', status: revoked ? 'revoked' : pendingPayment ? 'pending' : 'active', acknowledged: purchased } });
        }
        if (body.action === 'reconcile') { if (revoked) purchased = false; return route.fulfill({ json: { results: [], next: null } }); }
      }
      if (url.searchParams.get('view') === 'library') return route.fulfill({ json: { entries: [{ video: videos[1], state: { saved: true, following: false, seconds: 0, owned: purchased } }], limited: false } });
      return route.fulfill({ json: { video: videos[1], state: { saved: false, following: false, seconds: 0, owned: purchased }, canPlay: purchased, hostingReady: true, purchasesReady: false, playOffer: purchased ? null : offer } });
    });
    await billingPage.goto(base + '/watch/paid-film');
    await billingPage.getByRole('button', { name: /Test purchase.*3[.,]49/ }).click();
    await billingPage.getByRole('alert').filter({ hasText: 'Payment is pending.' }).waitFor();
    assert.equal(await billingPage.getByRole('button', { name: 'Watch now · Purchased' }).count(), 0);
    const nativeRequest = await billingPage.evaluate(() => window.paymentRequests[0]);
    assert.equal(nativeRequest.methods[0].supportedMethods, 'https://play.google.com/billing');
    assert.equal(nativeRequest.methods[0].data.obfuscatedAccountId, offer.accountId);
    assert.equal(nativeRequest.details.total.amount.currency, 'EUR');
    pendingPayment = false;
    await billingPage.getByRole('button', { name: 'Restore purchases' }).click(); await billingPage.getByRole('button', { name: 'Watch now · Purchased' }).waitFor();
    await billingPage.evaluate(() => window.navigate('/library/videos'));
    await billingPage.getByRole('button', { name: 'Purchased', exact: true }).click(); await billingPage.getByRole('heading', { name: 'ሙዚቃ ሃገረይ' }).waitFor();
    revoked = true; await billingPage.evaluate(() => { window.playOwned = false; });
    await billingPage.getByRole('button', { name: 'Restore purchases' }).click(); await billingPage.getByRole('heading', { name: 'Your video collection starts here' }).waitFor();
    revoked = false; verifyOutage = true; offer.testOnly = false;
    await billingPage.evaluate(() => window.navigate('/watch/paid-film'));
    await billingPage.getByRole('button', { name: /Buy video.*3[.,]49/ }).click();
    await billingPage.getByRole('alert').filter({ hasText: 'Verification interrupted.' }).waitFor();
    await billingPage.getByRole('button', { name: 'Restore purchases' }).click(); await billingPage.getByRole('button', { name: 'Watch now · Purchased' }).waitFor();
    assert.equal(await billingPage.evaluate(() => window.paymentRequests.length), 2, 'Restoring must never launch another charge.');
    assert.deepEqual(billingErrors, []);
    console.log('PASS test and live Play checkout use store price and account binding; pending payments stay locked; restore recovers interrupted verification, saves library access and removes refunded ownership');
    await billingContext.close();

    }
    const studioContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const studioPage = await studioContext.newPage(); const studioErrors = []; const mutations = [];
    studioPage.on('pageerror', error => { studioErrors.push(error.message); console.error('Studio render error:', error.message); });
    studioPage.setDefaultTimeout(15000);
    let creator = null; const entries = new Map(); let failFirstSave = true; let failNextRevision = false; let failNextSubmission = false; let failNextStudioRead = false; let processingReady = false; let hosting = false;
    await studioPage.route('**/api/watch**', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.pathname.endsWith('/playback')) { mutations.push({action:'preview',data:request.postDataJSON()}); return route.fulfill({json:{token:'FIXTURE',duration:120,seconds:45,expiresAt:9999999999}}); }
      if (url.pathname.endsWith('/poster')) {
        const entry = [...entries.values()][0];
        if(['published','unlisted'].includes(entry.video.status)){entry.private.stagedCover={id:'cover-fixture',url:poster};return route.fulfill({json:{posterUrl:poster,coverId:'cover-fixture'}})}
        entry.video.posterUrl = poster; return route.fulfill({ json: { posterUrl: poster } });
      }
      if (url.pathname.endsWith('/action')) {
        const { action, data } = request.postDataJSON(); mutations.push({ action, data });
        if (action === 'apply') creator = { uid: 'creator', name: data.name, status: 'pending', allowanceSeconds: 0, reservedSeconds: 0, createdAt: 1 };
        if (action === 'admin_creator') Object.assign(creator, { status: data.status, allowanceSeconds: data.allowanceSeconds });
        if (action === 'draft') {
          const old = entries.get(data.id); const { rightsStatement, rightsAccepted, ...metadata } = data.draft;
          entries.set(data.id, { video: { ...fixture(data.id, metadata.title, metadata.category, metadata.priceCents), posterUrl: '', publishedAt: null, ...old?.video, ...metadata, creatorId: 'creator', status: 'draft' }, private: { ...old?.private, rightsStatement, rightsAcceptedAt: rightsAccepted ? Date.now() : null, reviewNote: old?.private.reviewNote || '' } });
          if (failFirstSave) { failFirstSave = false; return route.fulfill({ status: 503, json: { error: 'Test save response interrupted. Retry saving.' } }); }
          return route.fulfill({ json: { id: data.id } });
        }
        if (action === 'upload') {
          const entry = entries.get(data.id); if(entry.private[data.kind]) return route.fulfill({json:{uploadUrl:entry.private[data.kind].uploadUrl}}); entry.private[data.kind] = { uid: data.kind, uploadUrl: 'https://upload.videodelivery.net/fixture', expiresAt: Date.now() + 86400000, maximumSeconds: data.maximumSeconds, size: data.size, ready: false, duration: 120, captions: [] };
          creator.reservedSeconds += data.maximumSeconds;
          return route.fulfill({ json: { uploadUrl: 'https://upload.videodelivery.net/fixture' } });
        }
        if (action === 'refresh') { const entry = entries.get(data.id); for (const kind of ['full', 'trailer']) if (entry.private[kind]) entry.private[kind].ready = processingReady; if (processingReady && entry.video.status === 'processing') entry.video.status = 'in_review'; return route.fulfill({ json: { ready: processingReady } }); }
        if (action === 'captions') entries.get(data.id).private[data.kind].captions = [data.language];
        if (action === 'submit') { const entry = entries.get(data.id); entry.video.status = processingReady ? 'in_review' : 'processing'; if(failNextSubmission){failNextSubmission=false;return route.fulfill({status:503,json:{error:'Test submission response lost.'}})} return route.fulfill({json:{ok:true,status:entry.video.status}}); }
        if (action === 'admin_review') { const entry = entries.get(data.id); entry.video.status = data.decision; if(data.decision==='published') entry.video.publishedAt=Date.now(); entry.private.reviewNote = data.note; }
        if (action === 'creator_revision') { const entry = entries.get(data.id); entry.private.pendingRevision = {id:data.revisionId,draft:data.draft,requestedAt:Date.now(),...(data.coverId?{cover:entry.private.stagedCover}:{})}; if(failNextRevision){failNextRevision=false;return route.fulfill({status:503,json:{error:'Test revision response lost.'}});} }
        if (action === 'creator_withdraw_revision') entries.get(data.id).private.pendingRevision=null;
        if (action === 'admin_revision') { const entry=entries.get(data.id); if(data.decision==='approve'){const{rightsAccepted,rightsStatement,...metadata}=entry.private.pendingRevision.draft;Object.assign(entry.video,metadata);if(entry.private.pendingRevision.cover)entry.video.posterUrl=entry.private.pendingRevision.cover.url;entry.private.rightsStatement=rightsStatement;}entry.private.pendingRevision=null;entry.private.revisionReviewNote=data.note||'Changes approved.'; }
        if (action === 'cancel_submission') entries.get(data.id).video.status='draft';
        if (action === 'creator_remove') { const entry=entries.get(data.id); entry.video.status=['published','unlisted'].includes(entry.video.status)?'unlisted':'removed';entry.private.pendingRevision=null;entry.private.creatorRemovedAt=Date.now();return route.fulfill({json:{ok:true,status:entry.video.status}}); }

        return route.fulfill({ json: { ok: true } });
      }
      if (url.searchParams.get('view') === 'hosting') return route.fulfill({json:{connected:true,storage:{usedMinutes:0,limitMinutes:1000}}});
      if (url.searchParams.get('view') === 'admin') return route.fulfill({ json: { creators: creator ? [creator] : [], videos: [...entries.values()], reports: [], hostingReady: hosting, purchasesReady: false } });
      if(failNextStudioRead){failNextStudioRead=false;return route.fulfill({status:503,json:{error:'Test studio refresh interrupted.'}})}
      return route.fulfill({ json: { creator, videos: [...entries.values()], hostingReady: hosting, purchasesReady: false } });
    });
    await studioPage.goto(base + '/video-studio'); await studioPage.evaluate(() => window.setRole('seller'));
    await studioPage.getByLabel('Creator or organization name').fill('Eritrean Film Studio');
    await studioPage.getByRole('button', { name: 'Request creator access' }).click();
    await studioPage.getByText(/Application awaiting review/).waitFor();
    assert.equal(await studioPage.getByRole('button', { name: 'New video', exact: true }).count(), 0);
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.getByRole('heading', { name: 'AfroBooks Screen', exact: true }).waitFor();
    await studioPage.locator('select[name="status"]').selectOption('approved');
    await studioPage.getByLabel('Total upload allowance (minutes)').fill('120');
    await studioPage.getByRole('button', { name: 'Save creator settings' }).click();
    await studioPage.getByText('Changes saved.').waitFor();
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    await studioPage.getByRole('button', { name: 'New video', exact: true }).click();
    await studioPage.getByLabel('Title', { exact: true }).fill('ሙዚቃ ሃገረይ');
    const coverImage={name:'cover.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64')};
    const coverPicker=studioPage.getByLabel('Cover photo (optional)',{exact:true});
    assert.equal(await coverPicker.getAttribute('required'),null);
    await coverPicker.setInputFiles({name:'not-an-image.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
    await studioPage.getByText('Choose a PNG, JPG or WebP image up to 3 MB.').waitFor();
    await coverPicker.setInputFiles(coverImage);
    await studioPage.getByRole('img',{name:'Selected cover photo preview'}).waitFor();
    await studioPage.getByRole('button',{name:'Remove selected photo'}).click();
    assert.equal(await studioPage.getByRole('img',{name:'Selected cover photo preview'}).count(),0);
    await coverPicker.setInputFiles(coverImage);

    await studioPage.getByLabel('Description', { exact: true }).fill('A documentary about the music and stories of Eritrea.');
    await studioPage.getByLabel('Category').selectOption('Documentaries');
    await studioPage.getByLabel('Spoken language').fill('Tigrinya');
    await studioPage.getByLabel('Rights declaration').fill('Our studio owns all footage and has permission to distribute the music.');
    await studioPage.getByRole('checkbox').check();
    studioPage.once('dialog', dialog => dialog.dismiss()); await studioPage.getByRole('button', { name: 'Your videos', exact: true }).click();
    assert.equal(await studioPage.getByLabel('Title', { exact: true }).inputValue(), 'ሙዚቃ ሃገረይ');
    studioPage.once('dialog', dialog => dialog.dismiss()); await studioPage.getByRole('link', { name: 'Books', exact: true }).first().click();
    assert.equal(new URL(studioPage.url()).pathname, '/video-studio');
    await studioPage.getByRole('button', { name: 'Save draft' }).click(); await studioPage.getByRole('alert').getByText('Test save response interrupted. Retry saving.').waitFor();
    await studioPage.getByRole('button', { name: 'Save draft' }).click(); await studioPage.getByText('Draft saved. You can return to it from Your videos.').waitFor();
    assert.equal(entries.size, 1); assert.equal(mutations.filter(item => item.action === 'draft')[0].data.id, mutations.filter(item => item.action === 'draft')[1].data.id);
    await studioPage.getByLabel(/Main video or clip file/).waitFor(); assert.equal(await studioPage.getByLabel(/Main video or clip file/).isDisabled(), true);
    assert.equal(await studioPage.getByRole('button', { name: 'Submit' }).isDisabled(), true);
    await studioPage.screenshot({ path: '.vercel/screen-creator-editor.png', fullPage: true });
    await studioPage.getByRole('button', { name: 'Your videos', exact: true }).click();
    await studioPage.getByRole('searchbox', { name: 'Search your videos' }).fill('no-match'); await studioPage.getByText('No videos match this search and status.').waitFor();
    await studioPage.getByRole('searchbox', { name: 'Search your videos' }).fill('ሙዚቃ');
    await studioPage.getByRole('button', { name: 'Published', exact: true }).click(); await studioPage.getByText('No videos match this search and status.').waitFor();
    await studioPage.getByRole('button', { name: 'Drafts', exact: true }).click();
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.getByRole('button', { name: 'Awaiting review (0)', exact: true }).click();
    await studioPage.getByText('No videos are awaiting review. Check Preparing or Drafts to see what is still needed.').waitFor();
    await studioPage.getByRole('button', { name: 'Drafts (1)', exact: true }).click();
    await studioPage.locator('summary').filter({ hasText: 'ሙዚቃ ሃገረይ' }).click();
    assert.equal(await studioPage.getByRole('button', { name: 'Approve and publish', exact: true }).isDisabled(), true);
    await studioPage.getByText(/A saved draft is not a submission/).waitFor();
    await studioPage.getByRole('button',{name:'No video uploaded',exact:true}).waitFor();
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    hosting = true; await studioPage.reload(); await studioPage.evaluate(() => window.setRole('seller'));
    await studioPage.getByRole('button', { name: /ሙዚቃ ሃገረይ/ }).click();
    assert.equal([...entries.values()][0].video.posterUrl, poster);
    await studioPage.getByLabel('Cover photo (optional)',{exact:true}).setInputFiles(coverImage);
    await studioPage.getByLabel(/Main video or clip file/).setInputFiles({ name: 'film.mp4', mimeType: 'video/mp4', buffer: Buffer.from('VIDEO-FIXTURE') });
    await studioPage.getByRole('checkbox').check();
    await studioPage.getByRole('button', { name: 'Save draft' }).click();
    await studioPage.getByText('Draft saved. You can return to it from Your videos.').waitFor();
    await studioPage.getByText('Optional trailer and subtitles', {exact:true}).click();
    await studioPage.getByLabel('Cover photo (optional)', {exact:true}).waitFor();
    await studioPage.getByLabel(/Optional trailer file/).setInputFiles({ name: 'trailer.mp4', mimeType: 'video/mp4', buffer: Buffer.from('TRAILER-FIXTURE') });
    await studioPage.getByText('Trailer received. Preparation is checked automatically.').waitFor();
    assert.deepEqual(mutations.filter(item => item.action === 'upload').map(item => item.data.maximumSeconds), [120, 120]);
    assert.equal(await studioPage.getByRole('button', { name: 'Submit', exact: true }).isDisabled(), false);
    assert.equal(await studioPage.getByRole('button', { name: 'Check processing status' }).count(), 0);
    const savedDescription = await studioPage.getByLabel('Description').inputValue();
    await studioPage.getByLabel('Description').fill(savedDescription + ' Unsaved notes.');
    failNextStudioRead = true; processingReady = true;
    await studioPage.getByRole('alert').getByText('Test studio refresh interrupted.').waitFor();
    assert.equal(await studioPage.getByLabel('Description').inputValue(), savedDescription + ' Unsaved notes.');
    await studioPage.getByLabel('Subtitle language code').waitFor({timeout:30000});
    assert.equal(await studioPage.getByLabel('Description').inputValue(), savedDescription + ' Unsaved notes.');
    await studioPage.getByLabel('Description').fill(savedDescription);
    await studioPage.locator('fieldset:not([disabled])').getByLabel(/Subtitles for main video or clip/).setInputFiles({ name: 'ti.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nሰላም\n') });
    await studioPage.getByText('Subtitles saved. Preview the video to check their timing.').waitFor();
    assert.equal(mutations.find(item => item.action === 'captions').data.language, 'ti');
    const previewWrites = mutations.filter(item=>item.action==='progress').length;
    await studioPage.getByRole('button',{name:'Preview video',exact:true}).click();
    await studioPage.getByRole('button',{name:'Advance video',exact:true}).click();
    await studioPage.getByRole('button',{name:'Pause video',exact:true}).click();
    const creatorPlayer = await studioPage.locator('.watch-studio-preview .watch-player').boundingBox();
    assert.ok(creatorPlayer.width > 500 && creatorPlayer.height > 200);
    await studioPage.getByRole('button',{name:'Close video preview',exact:true}).click();
    assert.equal(mutations.filter(item=>item.action==='progress').length,previewWrites);
    await studioPage.getByText('Preview optional trailer',{exact:true}).click();
    await studioPage.getByRole('button',{name:'Preview trailer',exact:true}).click();
    await studioPage.getByRole('button',{name:'Close trailer preview',exact:true}).click();
    assert.equal(mutations.filter(item=>item.action==='preview').at(-1).data.trailer,true);

    await studioPage.getByRole('button', { name: 'Submit' }).click(); await studioPage.getByText(/Status: Awaiting review/).waitFor();
    assert.equal(await studioPage.getByLabel('Title', { exact: true }).isDisabled(), true);
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.locator('summary').filter({ hasText: 'ሙዚቃ ሃገረይ' }).click();
    await studioPage.getByRole('button',{name:'Preview video',exact:true}).click();
    await studioPage.getByRole('button',{name:'Advance video',exact:true}).click();
    await studioPage.getByRole('button',{name:'Pause video',exact:true}).click();
    assert.equal(mutations.filter(item=>item.action==='progress').length,previewWrites);
    for(const width of [390,1280]) {
      await studioPage.setViewportSize({width,height:900});
      const bounds=await studioPage.locator('.watch-studio-preview .watch-player').boundingBox();
      assert.ok(bounds.width > (width===390?250:500));
      assert.ok(bounds.x + bounds.width <= width + 1);
      await studioPage.screenshot({path:`.vercel/admin-preview-${width}.png`,fullPage:true});
    }
    await studioPage.getByRole('button',{name:'Close video preview',exact:true}).click();
    await studioPage.getByRole('button',{name:'Preview video',exact:true}).click();
    await studioPage.getByRole('button',{name:'Advance video',exact:true}).waitFor();
    await studioPage.locator('summary').filter({hasText:'ሙዚቃ ሃገረይ'}).click();
    await studioPage.getByRole('button',{name:'Advance video',exact:true}).waitFor({state:'detached'});
    await studioPage.locator('summary').filter({hasText:'ሙዚቃ ሃገረይ'}).click();
    await studioPage.getByLabel('Review note').fill('Please include the original production date.');
    await studioPage.getByRole('button', { name: 'Request changes' }).click(); await studioPage.getByText('Changes saved.').waitFor();
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    await studioPage.getByRole('button', { name: /ሙዚቃ ሃገረይ/ }).click();
    await studioPage.getByText('Review note: Please include the original production date.').waitFor();
    await studioPage.getByLabel('Description').fill('A documentary produced in 2025 about music and stories of Eritrea.'); await studioPage.getByRole('checkbox').check();
    await studioPage.getByRole('button', { name: 'Submit' }).click(); await studioPage.getByText(/Status: Awaiting review/).waitFor();
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.locator('summary').filter({ hasText: 'ሙዚቃ ሃገረይ' }).click();
    assert.equal(await studioPage.getByRole('button', { name: 'Approve and publish', exact: true }).isEnabled(), true);
    await studioPage.locator('summary').filter({hasText:'Hosting and checkout setup'}).click();
    await studioPage.getByRole('button',{name:'Check video hosting',exact:true}).click();
    await studioPage.getByRole('status').filter({hasText:'Storage: 0 of 1000 minutes used.'}).waitFor();
    await studioPage.getByRole('button',{name:'Test upload access',exact:true}).click();
    await studioPage.getByRole('status').filter({hasText:'Upload access verified.'}).waitFor();
    await studioPage.locator('summary').filter({hasText:'Hosting and checkout setup'}).click();
    await studioPage.getByLabel('Review note').fill('Video, subtitles and rights reviewed.');
    await studioPage.getByRole('button', { name: 'Approve and publish' }).click(); await studioPage.getByText('Changes saved.').waitFor();
    assert.equal([...entries.values()][0].video.status, 'published');
    const originalId=[...entries.values()][0].video.id;
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    await studioPage.getByRole('button',{name:/ሙዚቃ ሃገረይ/}).click();
    await studioPage.getByRole('button',{name:'Edit details',exact:true}).click();
    await studioPage.getByLabel('Cover photo (optional)',{exact:true}).setInputFiles(coverImage);
    await studioPage.getByLabel('Description', {exact:true}).fill('Updated description for the original music documentary.');
    await studioPage.setViewportSize({width:390,height:844});
    assert.ok(await studioPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await studioPage.screenshot({path:'.vercel/creator-edit-mobile.png',fullPage:true});
    await studioPage.setViewportSize({width:1280,height:900});
    studioPage.once('dialog',dialog=>dialog.dismiss());await studioPage.getByRole('link',{name:'Books',exact:true}).first().click();
    assert.equal(new URL(studioPage.url()).pathname,'/video-studio');
    await studioPage.getByRole('checkbox').check();
    failNextRevision=true;
    await studioPage.getByRole('button',{name:'Submit changes for review',exact:true}).click();
    await studioPage.getByRole('button',{name:'Check submitted changes',exact:true}).click();
    await studioPage.getByRole('heading',{name:'Changes awaiting review',exact:true}).waitFor();
    assert.notEqual(entries.get(originalId).video.description,'Updated description for the original music documentary.');
    const requests=mutations.filter(item=>item.action==='creator_revision');assert.equal(requests.at(-1).data.revisionId,requests.at(-2).data.revisionId);
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.locator('summary').filter({hasText:'ሙዚቃ ሃገረይ'}).click();
    await studioPage.getByRole('heading',{name:'Creator changes awaiting review'}).waitFor();
    await studioPage.getByRole('button',{name:'Review creator changes',exact:true}).click();
    await studioPage.getByText('Changes saved.',{exact:true}).waitFor();
    assert.equal(entries.get(originalId).video.description,'Updated description for the original music documentary.');
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    await studioPage.getByRole('button',{name:/ሙዚቃ ሃገረይ/}).click();
    await studioPage.getByRole('button',{name:'Edit details',exact:true}).click();
    await studioPage.getByLabel('Description',{exact:true}).fill('Another correction for the published music documentary.');
    await studioPage.getByRole('checkbox').check();await studioPage.getByRole('button',{name:'Submit changes for review',exact:true}).click();
    await studioPage.getByRole('button',{name:'Withdraw changes',exact:true}).click();
    await studioPage.getByRole('button',{name:'Edit details',exact:true}).waitFor();
    assert.equal(entries.get(originalId).private.pendingRevision,null);

    studioPage.once('dialog',dialog=>dialog.dismiss());await studioPage.getByRole('button',{name:'Remove from Screen',exact:true}).click();
    assert.equal(entries.get(originalId).video.status,'published');
    studioPage.once('dialog',dialog=>dialog.accept());await studioPage.getByRole('button',{name:'Remove from Screen',exact:true}).click();
    await studioPage.getByRole('button',{name:'New video',exact:true}).waitFor();
    assert.equal(await studioPage.getByRole('button',{name:/ሙዚቃ ሃገረይ/}).count(),0);
    assert.equal(await studioPage.getByRole('button',{name:'Removed',exact:true}).count(),0);
    await studioPage.reload(); await studioPage.evaluate(()=>window.setRole('seller'));
    await studioPage.getByRole('button',{name:'New video',exact:true}).waitFor();
    assert.equal(await studioPage.getByRole('button',{name:/ሙዚቃ ሃገረይ/}).count(),0);
    assert.equal(entries.get(originalId).video.status,'unlisted');


    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    await studioPage.getByRole('button', { name: 'New video', exact: true }).click();
    for (const width of [390, 1280]) {
      await studioPage.setViewportSize({width,height:900});
      await studioPage.screenshot({path: `.vercel/upload-studio-${width}.png`,fullPage:true});
      assert.ok(await studioPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    processingReady = false;
    await studioPage.getByLabel(/Main video or clip file/).setInputFiles({ name: 'Original music.mp4', mimeType: 'video/mp4', buffer: Buffer.from('VIDEO-FIXTURE') });
    await studioPage.getByLabel('Description').fill('An original music video, created and performed by our studio.');
    await studioPage.getByLabel('Category').selectOption('Music');
    await studioPage.getByLabel('Rights declaration').fill('Our studio owns all video footage, musical compositions and performances.');
    await studioPage.getByRole('checkbox').check();
    await studioPage.evaluate(()=>window.failUploadOnce=true);
    await studioPage.getByRole('button',{name:'Submit',exact:true}).click();
    await studioPage.getByRole('alert').getByText(/Upload interrupted/).waitFor();
    const musicId = [...entries.values()].find(entry=>entry.video.title==='Original music').video.id;
    failNextSubmission = true;
    await studioPage.getByRole('button',{name:'Submit',exact:true}).click();
    await studioPage.getByRole('button',{name:'Check submission',exact:true}).waitFor();
    const uploadRequests = mutations.filter(item=>item.action==='upload' && item.data.id===musicId).length;
    await studioPage.getByRole('button',{name:'Check submission',exact:true}).click();
    await studioPage.getByText('Status: Preparing', {exact:true}).waitFor();
    assert.equal(mutations.filter(item=>item.action==='upload' && item.data.id===musicId).length,uploadRequests);
    assert.equal(entries.get(musicId).private.trailer, undefined);
    assert.equal(entries.get(musicId).video.posterUrl, '');
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.getByRole('button',{name:'Preparing (1)',exact:true}).click();
    await studioPage.locator('summary').filter({hasText:'Original music'}).click();
    assert.equal(await studioPage.getByRole('button',{name:'Approve and publish',exact:true}).isDisabled(),true);
    await studioPage.getByRole('button',{name:'Refresh status',exact:true}).click();
    await studioPage.getByText('Changes saved.',{exact:true}).waitFor();
    assert.equal(entries.get(musicId).video.status,'processing');
    await studioPage.getByLabel('Review note',{exact:true}).fill('Keep this review note during processing updates.');
    processingReady = true;
    await studioPage.getByRole('button',{name:'Awaiting review (1)',exact:true}).waitFor();
    // The Preparing filter empties when polling advances the submission.
    await studioPage.getByRole('button',{name:'Awaiting review (1)',exact:true}).click();
    await studioPage.locator('summary').filter({hasText:'Original music'}).click();
    await studioPage.getByRole('button',{name:'Preview video',exact:true}).waitFor();
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    // Automatic polling survives reload and transitions without another Submit.
    await studioPage.reload(); await studioPage.evaluate(()=>window.setRole('seller'));
    await studioPage.getByRole('button',{name:/Original music/}).click();
    processingReady = true;
    await studioPage.getByText('Status: Awaiting review',{exact:true}).waitFor();
    assert.equal(entries.get(musicId).video.status,'in_review');
    await studioPage.getByRole('button',{name:'Return to draft',exact:true}).click();
    await studioPage.getByText('Status: Draft',{exact:true}).waitFor();
    assert.equal(await studioPage.getByLabel('Title',{exact:true}).isDisabled(),false);
    studioPage.once('dialog',dialog=>dialog.accept());await studioPage.getByRole('button',{name:'Remove video',exact:true}).click();
    await studioPage.getByRole('button',{name:'New video',exact:true}).waitFor();
    assert.equal(await studioPage.getByRole('button',{name:/Original music/}).count(),0);
    assert.equal(await studioPage.getByText('Status: Removed',{exact:true}).count(),0);
    await studioPage.reload(); await studioPage.evaluate(()=>window.setRole('seller'));
    await studioPage.getByRole('button',{name:'New video',exact:true}).waitFor();
    assert.equal(await studioPage.getByRole('button',{name:/Original music/}).count(),0);
    const adminUnlisted=structuredClone(entries.get(originalId));
    adminUnlisted.video.id='admin-unlisted';adminUnlisted.video.title='Reviewable unlisted film';delete adminUnlisted.private.creatorRemovedAt;
    entries.set('admin-unlisted',adminUnlisted);
    assert.equal(entries.get(musicId).video.status,'removed');
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.locator('select[name="status"]').selectOption('paused'); await studioPage.getByRole('button', { name: 'Save creator settings' }).click();
    await studioPage.getByText('Changes saved.').waitFor();
    await studioPage.evaluate(() => { window.setRole('seller'); window.navigate('/video-studio'); });
    await studioPage.getByText(/Uploads paused — contact support/).waitFor();
    assert.equal(await studioPage.getByRole('button', { name: 'New video', exact: true }).count(), 0);
    await studioPage.getByRole('button', { name: /Reviewable unlisted film/ }).click(); await studioPage.getByText(/Creator access is paused/).waitFor();
    assert.equal(await studioPage.getByRole('button', {name:'Edit details',exact:true}).count(),0);
    await studioPage.evaluate(() => { window.setRole('admin'); window.navigate('/admin/videos'); });
    await studioPage.getByLabel('Earnings month').fill('2026-09');
    await studioPage.getByLabel('Stripe top-up ID').fill('tu_fixture');
    await studioPage.getByRole('checkbox', { name: /Google has paid/ }).check();
    await studioPage.getByRole('button', { name: 'Verify funding and enable payouts' }).click();
    await studioPage.getByRole('status').filter({ hasText: 'Saved. The payout worker' }).waitFor();
    assert.deepEqual(mutations.find(item => item.action === 'payout_funding').data, { period: '2026-09', topupId: 'tu_fixture', settled: true });
    assert.equal(await studioPage.getByRole('button', { name: 'Check pending payouts now' }).count(), 1);
    await studioPage.getByRole('button', { name: 'All videos (1)', exact: true }).waitFor();
    assert.equal(await studioPage.locator('summary').filter({ hasText: 'ሙዚቃ ሃገረይ' }).count(), 0);
    assert.equal(await studioPage.locator('summary').filter({ hasText: 'Original music' }).count(), 0);
    assert.equal(await studioPage.getByRole('button', { name: /^Removed \(/ }).count(), 0);
    await studioPage.getByRole('button', { name: 'Unlisted (1)', exact: true }).click();
    await studioPage.locator('summary').filter({ hasText: 'Reviewable unlisted film' }).click();
    for (const width of [1280, 390]) {
      await studioPage.setViewportSize({ width, height: 900 });
      await studioPage.screenshot({ path: `.vercel/watch-admin-${process.env.ADMIN_VISUAL_LABEL || 'current'}-${width}.png`, fullPage: true });
    }
    await studioPage.getByLabel('Review note', { exact: true }).fill('Distribution rights have been withdrawn.');
    await studioPage.locator('summary').filter({ hasText: 'More publication actions' }).click();
    await studioPage.getByRole('button', { name: 'Remove and block access', exact: true }).click();
    await studioPage.getByRole('button', { name: 'All videos (0)', exact: true }).waitFor();
    assert.equal(await studioPage.locator('summary').filter({ hasText: 'Reviewable unlisted film' }).count(), 0);
    await studioPage.reload(); await studioPage.evaluate(() => window.setRole('admin'));
    await studioPage.getByRole('button', { name: 'All videos (0)', exact: true }).waitFor();
    assert.equal(await studioPage.locator('.watch-status-badge').count(), 0);
    assert.equal(entries.size, 3, 'Hiding removed videos must retain their underlying records.');
    assert.deepEqual(studioErrors, []);
    console.log('PASS creator/admin previews, uploads, automatic review, published edits and lost-response retry, visible approval controls and blocked-state explanations, withdrawal, removed titles hidden from creator and admin after reload, mobile layout, paused access and funding');
    await studioContext.close();
  } catch (error) {
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages.length) { fs.writeFileSync('.vercel/screen-test-failure.html', await pages[pages.length - 1].content()); await pages[pages.length - 1].screenshot({ path: '.vercel/screen-test-failure.png', fullPage: true }); }
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
