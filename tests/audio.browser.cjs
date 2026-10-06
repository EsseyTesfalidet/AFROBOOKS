// Real Listen UI, HTML audio decoding, navigation and studio forms; account,
// API and Storage upload boundaries are fixtures. No live payments or uploads.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
async function main() {
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import Catalog from './components/listen/ListenCatalog';import Player from './components/listen/AudioPlayer';import Studio from './components/listen/AudioStudio';import Nav from './components/buyer/BuyerBottomNav';import Shell from './components/shared/MobileAppShell';
    import{useAuthStore}from'./store/authStore';import{APP_MODE_BOOTSTRAP}from'./lib/app/installed';
    window.path=location.pathname;new Function(APP_MODE_BOOTSTRAP)();window.setUser=(uid='reader',role='buyer')=>useAuthStore.setState({loading:false,firebaseUser:{uid},userProfile:{uid,role,status:'active',firstName:'Test',lastName:'Reader'}});window.setUser();
    function App(){const[path,setPath]=useState(window.path);window.navigate=p=>{history.pushState(null,'',p);window.path=p;setPath(p)};return <Shell><div key={path}>{path==='/audio-studio'?<Studio/>:path==='/admin/audio'?<Studio admin/>:path==='/browse'?<h1>Browse</h1>:<Catalog library={path==='/library/audio'}/>}</div><Player/><Nav/></Shell>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, plugins: [{ name: 'boundaries', setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'next' }));
    b.onLoad({ filter: /.*/, namespace: 'next' }, a => ({ loader: 'jsx', resolveDir: process.cwd(), contents: a.path === 'next/image' ? `import React from 'react';export default p=><img {...p}/>` : `import React from 'react';export const usePathname=()=>window.path;export const useRouter=()=>({push:window.navigate,replace:window.navigate});export default function Link({href,onClick,children,...p}){return <a {...p} href={href} onClick={e=>{e.preventDefault();onClick?.(e);window.navigate(href)}}>{children}</a>}` }));
    b.onResolve({ filter: /^@\/lib\/firebase\/(request|auth|config)$/ }, a => ({ path: a.path, namespace: 'firebase' }));
    b.onLoad({ filter: /.*/, namespace: 'firebase' }, a => ({ contents: a.path.endsWith('config') ? 'export const storage={};' : a.path.endsWith('auth') ? 'export const updateUserProfile=async()=>{};' : `async function call(path,init){const r=await fetch(path,init);const value=await r.json();if(!r.ok)throw Error(value.error);return value}export const authenticatedGet=p=>call(p);export const authenticatedPost=(p,body)=>call(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});` }));
    b.onResolve({ filter: /^firebase\/storage$/ }, () => ({ path: 'storage', namespace: 'storage' }));
    b.onLoad({ filter: /.*/, namespace: 'storage' }, () => ({ contents: `export const ref=(_,path)=>path;export function uploadBytesResumable(path,file,metadata){window.lastUpload={path,size:file.size,metadata};return{cancel(){},on(_,progress,error,done){setTimeout(()=>{progress({bytesTransferred:file.size,totalBytes:file.size});done()},30)}}}` }));
    b.onResolve({ filter: /^@\/components\/(notifications\/NotificationBell|shared\/InstallPWA|shared\/WorkspaceSwitcher)$/ }, a => ({ path: a.path, namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export default ()=>null;' }));
  } }] });
  const css = (await require('postcss')([require('tailwindcss')]).process(fs.readFileSync('app/globals.css', 'utf8').replace(/^@import.*$/gm, ''), { from: 'app/globals.css' })).css + ['components/buyer/buyer-chrome.css', 'app/app-appearance.css', 'app/app-themes.css', 'components/watch/watch.css', 'components/listen/listen.css'].map(p => fs.readFileSync(p, 'utf8')).join('\n');
  // Valid MPEG-1 Layer III silent frames; exercises the browser's actual decoder.
  const frame = Buffer.alloc(417); Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame); const mp3 = Buffer.concat(Array(500).fill(frame));
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url.startsWith('/audio.mp3')) { res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Accept-Ranges', 'bytes'); const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || ''); const start = match ? Number(match[1]) : 0, end = match?.[2] ? Number(match[2]) : mp3.length - 1; if (match) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${mp3.length}`); } return res.end(mp3.subarray(start, end + 1)); }
    if (req.url.startsWith('/fonts/') || req.url.startsWith('/brand/')) { const path = 'public' + req.url; if (fs.existsSync(path)) return res.end(fs.readFileSync(path)); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  const title = (id, category, priceCents = 0) => ({ id, title: category === 'Music' ? 'ሙዚቃ ሃገረይ' : 'Stories of home', description: 'An original African recording for our listening community.', creatorId: 'creator', creatorName: 'Original Studio', category, language: 'Tigrinya', priceCents, status: 'published', durationSeconds: 13, ready: true, updatedAt: 1, reviewNote: '' });
  let titles = [title('music', 'Music'), title('book', 'Audiobooks', 199), title('podcast', 'Podcasts')]; let actions = []; let musicEnabled=false, musicActive=false; const musicCalls=[];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.addInitScript(() => { const mm = matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q); });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/music**', async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():null;if(body){musicCalls.push(body);if(body.action==='verify')musicActive=true;}await route.fulfill({json:{active:musicActive,available:musicEnabled,autoRenew:true,expiresAt:Date.now()+86400000,testOnly:true,productId:'afrobooks_music_monthly',accountId:'fixture-account',settings:{testEnabled:false,liveEnabled:false},orders:[]}})});
    await page.route('**/api/audio**', async route => {
      const request = route.request(), url = new URL(request.url()); let value;
      if (request.method() === 'POST') { const body = request.postDataJSON(); actions.push(body); if (body.action === 'create') { titles.push({ ...title('new-title', body.data.category), ...body.data, status: 'draft', ready: false }); value = { id: 'new-title' }; } else if (body.action === 'finish') { titles.find(t => t.id === body.data.id).ready = true; value = { ok: true }; } else if (body.action === 'submit') { titles.find(t => t.id === body.data.id).status = 'in_review'; value = { ok: true }; } else value = { ok: true }; }
      else { const view = url.searchParams.get('view'), item = titles.find(t => t.id === url.searchParams.get('id')); value = view === 'finances' ? { earnings: [], payouts: { payouts: [], funding: [], stripeReady: false } } : view === 'detail' ? { title: item, canPlay: !item.priceCents, offer: null } : view === 'playback' ? { title: item, url: base + '/audio.mp3', seconds: 2, expiresAt: Date.now() + 60000 } : { entries: titles.map(title => ({ title, saved: true, seconds: 2 })), next: null }; }
      await route.fulfill({ json: value });
    });
    await page.goto(base + '/listen'); await page.getByRole('button', { name: /ሙዚቃ ሃገረይ.*Original Studio/ }).waitFor();
    assert.deepEqual(await page.locator('.buyer-nav-item').allTextContents(), ['Browse', 'Screen', 'Listen', 'Library']);
    assert.equal(await page.locator('.buyer-nav-item[aria-current="page"]').innerText(), 'Listen');
    await page.getByRole('button', { name: 'Audiobooks', exact: true }).click(); assert.equal(await page.locator('.listen-card').count(), 1);
    await page.getByRole('button', { name: /Audiobooks.*Stories of home/ }).click(); await page.getByText('Purchases for this title are not available yet. Please check again later.').waitFor(); assert.equal(await page.locator('audio').count(), 0); await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Music', exact: true }).click(); await page.getByRole('button', { name: /Music.*ሙዚቃ/ }).click(); await page.getByRole('button', { name: 'Listen now' }).click();
    await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && a.readyState >= 2 && a.currentTime > 2; });
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click(); await page.locator('.listen-player-title').click();
    await page.getByRole('button', { name: 'Playback speed 1 times' }).click(); assert.equal(await page.locator('audio').evaluate(a => a.playbackRate), 1.25);
    await page.getByRole('slider', { name: 'Audio position' }).fill('5'); assert.ok((await page.locator('audio').evaluate(a => a.currentTime)) >= 5);
    await page.evaluate(() => window.navigate('/library/audio')); await page.getByRole('navigation', { name: 'Library format' }).waitFor(); assert.equal(await page.locator('.listen-player').count(), 1);
    for (const theme of ['light', 'dark']) { await page.evaluate(theme => document.documentElement.dataset.appTheme = theme, theme); for (const width of [320, 390, 844]) { await page.setViewportSize({ width, height: width === 844 ? 390 : 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); } }
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.navigate('/listen')); await page.screenshot({ path: '.vercel/listen-mobile.png' });
    await page.evaluate(() => window.setUser('another')); await page.waitForFunction(() => !document.querySelector('audio'));
    await page.evaluate(() => { window.setUser('creator', 'seller'); window.navigate('/audio-studio'); }); await page.getByRole('button', { name: 'Upload audio', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Our first music release'); await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('Music'); await page.getByLabel('Language', { exact: true }).fill('Tigrinya'); await page.getByLabel('Description', { exact: true }).fill('Original music recorded by our own studio.'); await page.getByLabel('MP3 file').setInputFiles({ name: 'test.mp3', mimeType: 'audio/mpeg', buffer: mp3 }); await page.getByRole('checkbox', {name:/I own this recording/}).check(); await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByRole('button', { name: 'Submit for review', exact: true }).waitFor(); assert.ok(actions.some(a => a.action === 'finish' && a.data.durationSeconds > 10)); assert.equal((await page.evaluate(() => window.lastUpload)).metadata.contentType, 'audio/mpeg');
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click(); await page.getByText('Music · in review').waitFor();
    await page.evaluate(() => { window.setUser('admin', 'admin'); window.navigate('/admin/audio'); }); await page.getByRole('button', { name: 'Approve and publish' }).click(); assert.ok(actions.some(a => a.action === 'review' && a.data.publish === true));
    musicEnabled=true;await page.evaluate(()=>{window.getDigitalGoodsService=async()=>({getDetails:async()=>[{itemId:'afrobooks_music_monthly',title:'AfroBooks Music',price:{currency:'USD',value:'2.99'}}],listPurchases:async()=>[]});window.PaymentRequest=class{constructor(methods,total){window.musicRequest={methods,total}}async show(){return{details:{purchaseToken:'MUSIC-FIXTURE-TOKEN'},complete:async()=>{}}}};window.setUser();window.navigate('/listen')});
    await page.getByRole('button',{name:'Music',exact:true}).click();await page.getByRole('button',{name:'Test subscription · $2.99/month',exact:true}).click();await page.getByText('Music pass active',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.musicRequest)).methods[0].data.sku,'afrobooks_music_monthly');assert.ok(musicCalls.some(call=>call.action==='verify'&&call.purchaseToken==='MUSIC-FIXTURE-TOKEN'));
    assert.deepEqual(errors, []); await context.close(); console.log('PASS Listen navigation, categories, paid gate, actual MP3 playback, seeking, speed, library continuity, account cleanup, themes/rotation, creator upload and admin approval.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
