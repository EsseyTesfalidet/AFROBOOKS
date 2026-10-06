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
    b.onLoad({ filter: /.*/, namespace: 'next' }, a => ({ loader: 'jsx', resolveDir: process.cwd(), contents: a.path === 'next/image' ? `import React from 'react';export default function Image({unoptimized,...p}){return <img {...p}/>} ` : `import React from 'react';export const usePathname=()=>window.path;export const useRouter=()=>({push:window.navigate,replace:window.navigate});export default function Link({href,onClick,children,...p}){return <a {...p} href={href} onClick={e=>{e.preventDefault();onClick?.(e);window.navigate(href)}}>{children}</a>}` }));
    b.onResolve({ filter: /^@\/lib\/firebase\/(request|auth|config)$/ }, a => ({ path: a.path, namespace: 'firebase' }));
    b.onLoad({ filter: /.*/, namespace: 'firebase' }, a => ({ contents: a.path.endsWith('config') ? 'export const storage={};export const auth={currentUser:{getIdToken:async()=>"test-token"}};' : a.path.endsWith('auth') ? 'export const updateUserProfile=async()=>{};' : `async function call(path,init){const r=await fetch(path,init);const value=await r.json();if(!r.ok)throw Error(value.error);return value}export const authenticatedGet=p=>call(p);export const authenticatedPost=(p,body)=>call(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});` }));
    b.onResolve({ filter: /^firebase\/storage$/ }, () => ({ path: 'storage', namespace: 'storage' }));
    b.onLoad({ filter: /.*/, namespace: 'storage' }, () => ({ contents: `export const ref=(_,path)=>path;export function uploadBytesResumable(path,file,metadata){window.lastUpload={path,size:file.size,metadata};(window.uploads||=[]).push(path);return{cancel(){},on(_,progress,error,done){setTimeout(()=>{progress({bytesTransferred:file.size,totalBytes:file.size});done()},30)}}}` }));
    b.onResolve({ filter: /^@\/components\/(notifications\/NotificationBell|shared\/InstallPWA|shared\/WorkspaceSwitcher)$/ }, a => ({ path: a.path, namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export default ()=>null;' }));
  } }] });
  const css = (await require('postcss')([require('tailwindcss')]).process(fs.readFileSync('app/globals.css', 'utf8').replace(/^@import.*$/gm, ''), { from: 'app/globals.css' })).css + ['components/buyer/buyer-chrome.css', 'app/app-appearance.css', 'app/app-themes.css', 'components/watch/watch.css', 'components/listen/listen.css'].map(p => fs.readFileSync(p, 'utf8')).join('\n');
  // Valid MPEG-1 Layer III silent frames; exercises the browser's actual decoder.
  const frame = Buffer.alloc(417); Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame); const mp3 = Buffer.concat(Array(500).fill(frame));
  const cover=await require('sharp')({create:{width:160,height:160,channels:3,background:'#ac6345'}}).png().toBuffer();
  const server = http.createServer((req, res) => {
    if(req.url==='/cover.png'){res.setHeader('Content-Type','image/png');return res.end(cover);}
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url.startsWith('/audio.mp3')) { res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Accept-Ranges', 'bytes'); const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || ''); const start = match ? Number(match[1]) : 0, end = match?.[2] ? Number(match[2]) : mp3.length - 1; if (match) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${mp3.length}`); } return res.end(mp3.subarray(start, end + 1)); }
    if (req.url.startsWith('/fonts/') || req.url.startsWith('/brand/')) { const path = 'public' + req.url; if (fs.existsSync(path)) return res.end(fs.readFileSync(path)); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  const title = (id, category, priceCents = 0) => ({ id, title: category === 'Music' ? 'ሙዚቃ ሃገረይ' : 'Stories of home', description: 'An original African recording for our listening community.', creatorId: 'creator', creatorName: 'Original Studio', category, language: 'Tigrinya', priceCents, status: 'published', durationSeconds: 13, ready: true, updatedAt: 1, reviewNote: '' });
  let titles = [title('music', 'Music'), {...title('book', 'Audiobooks', 199),previewReady:true,previewSeconds:5}, {...title('podcast', 'Podcasts'),coverUrl:base+'/cover.png',durationSeconds:26,mainDurationSeconds:13,mainTitle:'Episode one',parts:[{id:'part-two',title:'Episode two',durationSeconds:13,bytes:208500,ready:true}],chapters:[{title:'Opening',startSeconds:0},{title:'Next story',startSeconds:16}]}]; let actions = []; let musicEnabled=false, musicActive=false; const musicCalls=[];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.addInitScript(() => { const mm = matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q); });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/music**', async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():null;if(body){musicCalls.push(body);if(body.action==='verify')musicActive=true;}await route.fulfill({json:{active:musicActive,available:musicEnabled,autoRenew:true,expiresAt:Date.now()+86400000,testOnly:true,productId:'afrobooks_music_monthly',accountId:'fixture-account',settings:{testEnabled:false,liveEnabled:false},orders:[]}})});
    await page.route('**/api/audio**', async route => {
      const request = route.request(), url = new URL(request.url()); let value;
      if (url.pathname === '/api/audio/sample') { const item=titles.find(t=>t.id===request.postDataJSON().id); item.previewReady=true;item.previewSeconds=13;value={seconds:13}; }
      else if (url.pathname === '/api/audio/cover') { value={coverUrl:base+'/cover.png'}; }
      else if (request.method() === 'POST') {
        const body=request.postDataJSON();actions.push(body);const item=titles.find(t=>t.id===body.data.id);
        if(body.action==='create'){titles.push({...title('new-title',body.data.category),...body.data,status:'draft',ready:false,parts:[]});value={id:'new-title'};}
        else if(body.action==='edit'){Object.assign(item,body.data);value={ok:true};}
        else if(body.action==='finish'){
          if(!(await page.evaluate(()=>window.uploads||[])).some(path=>path.endsWith(body.data.id+'/source.mp3')))return route.fulfill({status:409,json:{error:'Upload the MP3 first.'}});
          item.ready=true;item.mainDurationSeconds=body.data.durationSeconds;item.durationSeconds=body.data.durationSeconds;value={ok:true};
        }
        else if(body.action==='prepare_part'){const partId='00000000-0000-4000-8000-000000000001';item.parts.push({id:partId,title:body.data.title,ready:false,durationSeconds:0,bytes:body.data.bytes});value={partId};}
        else if(body.action==='finish_part'){
          if(!(await page.evaluate(()=>window.uploads||[])).some(path=>path.endsWith('part-source-'+body.data.partId+'.mp3')))return route.fulfill({status:409,json:{error:'Upload this part first.'}});
          Object.assign(item.parts.find(p=>p.id===body.data.partId),{ready:true,durationSeconds:body.data.durationSeconds});item.durationSeconds=item.mainDurationSeconds+item.parts.reduce((n,p)=>n+p.durationSeconds,0);value={title:item};
        }
        else if(body.action==='submit'){item.status='in_review';value={ok:true};}
        else value={ok:true};
      } else {
        const view=url.searchParams.get('view'),item=titles.find(t=>t.id===url.searchParams.get('id')),position=Number(url.searchParams.get('position')??2);
        value=view==='finances'?{earnings:[],payouts:{payouts:[],funding:[],stripeReady:false}}:view==='detail'?{title:item,canPlay:!item.priceCents,offer:null}:view==='preview'?{title:item,url:base+'/audio.mp3?sample='+item.id,seconds:0,preview:true,expiresAt:Date.now()+60000}:view==='playback'?{title:item,url:base+'/audio.mp3?part='+(position>=13?'two':'main')+'&id='+item.id,seconds:position,partId:position>=13?'part-two':'main',partStartSeconds:position>=13?13:0,expiresAt:Date.now()+60000}:{entries:titles.map(title=>({title,saved:true,seconds:2})),next:null};
      }
      await route.fulfill({ json: value });
    });
    await page.goto(base + '/listen'); await page.getByRole('button', { name: /ሙዚቃ ሃገረይ.*Original Studio/ }).waitFor();
    assert.deepEqual(await page.locator('.buyer-nav-item').allTextContents(), ['Browse', 'Screen', 'Listen', 'Library']);
    assert.equal(await page.locator('.buyer-nav-item[aria-current="page"]').innerText(), 'Listen');
    await page.getByRole('button', { name: 'Audiobooks', exact: true }).click(); assert.equal(await page.locator('.listen-card').count(), 1);
    await page.getByRole('button', { name: /Audiobooks.*Stories of home/ }).click(); await page.getByText('Purchases for this title are not available yet. Please check again later.').waitFor(); assert.equal(await page.locator('audio').count(), 0);
    const beforeSample=actions.filter(a=>a.action==='progress').length;
    await page.getByRole('button',{name:/Free sample/}).click();await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>0);
    await page.locator('.listen-player-title').click();assert.equal(await page.getByRole('slider',{name:'Audio position'}).getAttribute('max'),'5');
    await page.getByRole('button',{name:'Pause audio',exact:true}).click();await page.getByRole('button',{name:'Close audio player'}).click();
    assert.equal(actions.filter(a=>a.action==='progress').length,beforeSample,'Samples must not save paid listening progress');
    await page.getByRole('button', { name: 'Music', exact: true }).click(); await page.getByRole('button', { name: /Music.*ሙዚቃ/ }).click(); await page.getByRole('button', { name: 'Listen now' }).click();
    await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && a.readyState >= 2 && a.currentTime > 2; });
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click(); await page.locator('.listen-player-title').click();
    await page.getByRole('button', { name: 'Playback speed 1 times' }).click(); assert.equal(await page.locator('audio').evaluate(a => a.playbackRate), 1.25);
    await page.getByRole('slider', { name: 'Audio position' }).fill('5'); assert.ok((await page.locator('audio').evaluate(a => a.currentTime)) >= 5);
    await page.evaluate(() => window.navigate('/library/audio')); await page.getByRole('navigation', { name: 'Library format' }).waitFor(); assert.equal(await page.locator('.listen-player').count(), 1);
    for (const theme of ['light', 'dark']) { await page.evaluate(theme => document.documentElement.dataset.appTheme = theme, theme); for (const width of [320, 390, 844]) { await page.setViewportSize({ width, height: width === 844 ? 390 : 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); } }
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.navigate('/listen')); await page.screenshot({ path: '.vercel/listen-mobile.png' });
    await page.getByRole('button',{name:'Close audio player'}).click();
    await page.getByRole('button',{name:'Podcasts',exact:true}).click();await page.getByRole('button',{name:/Podcasts.*Stories of home/}).click();await page.getByRole('button',{name:'Listen now'}).click();
    await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>2);await page.locator('.listen-player-title').click();
    assert.equal(await page.locator('.listen-now-playing .listen-sound-bars').getAttribute('data-playing'),'true');
    await page.getByRole('button',{name:'Next recording',exact:true}).click();await page.waitForFunction(()=>document.querySelector('audio')?.src.includes('part=two'));await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>0);
    await page.getByRole('button',{name:'Pause audio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.listen-sound-bars')?.dataset.playing==='false');
    assert.equal(await page.getByRole('slider',{name:'Audio position'}).getAttribute('max'),'26');assert.ok(actions.some(a=>a.action==='progress'&&a.data.id==='podcast'&&a.data.seconds>=13));
    await page.getByRole('button',{name:'Previous recording',exact:true}).click();await page.waitForFunction(()=>document.querySelector('audio')?.src.includes('part=main'));
    await page.waitForFunction(()=>Number.isFinite(document.querySelector('audio')?.duration));await page.evaluate(()=>{const a=document.querySelector('audio');a.currentTime=a.duration-.1;a.play()});await page.waitForFunction(()=>document.querySelector('audio')?.src.includes('part=two'));
    await page.getByRole('button',{name:'Pause audio',exact:true}).click();
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.listen-sound-bars i').first().evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByRole('slider',{name:'Volume',exact:true}).fill('0.4');assert.equal(await page.locator('audio').evaluate(a=>a.volume),.4);await page.locator('.listen-expanded').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'.vercel/audio-player-upgraded.png'});
    assert.equal(await page.locator('.listen-now-playing .listen-art img').count(),1);await page.locator('.listen-player-atmosphere').waitFor();
    for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.appTheme=t,theme);for(const width of [320,390,844]){await page.setViewportSize({width,height:width===844?390:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dataset.appTheme='light');await page.screenshot({path:'.vercel/audio-player-light.png'});await page.evaluate(()=>document.documentElement.dataset.appTheme='dark');
    await page.evaluate(() => window.setUser('another')); await page.waitForFunction(() => !document.querySelector('audio'));
    await page.evaluate(() => { window.setUser('creator', 'seller'); window.navigate('/audio-studio'); }); await page.getByRole('button', { name: 'Upload audio', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Our first music release'); await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('Music'); await page.getByLabel('Language', { exact: true }).fill('Tigrinya'); await page.getByLabel('Description', { exact: true }).fill('Original music recorded by our own studio.'); await page.getByLabel('MP3 file').setInputFiles({ name: 'test.mp3', mimeType: 'audio/mpeg', buffer: mp3 }); await page.getByLabel('Add tracks, episodes or parts').setInputFiles({name:'Episode two.mp3',mimeType:'audio/mpeg',buffer:mp3});
    await page.getByRole('button',{name:'Add chapter',exact:true}).click();await page.getByLabel('Chapter 1',{exact:true}).fill('መጀመርታ');
    await page.getByRole('button',{name:'Add chapter',exact:true}).click();await page.getByLabel('Chapter 2',{exact:true}).fill('Next story');await page.getByLabel('Start time 2',{exact:true}).fill('0:16');
    await page.getByLabel('Upload cover',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:cover});await page.getByRole('checkbox', {name:/I own this recording/}).check(); await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByRole('button', { name: 'Submit for review', exact: true }).waitFor(); assert.ok(actions.some(a => a.action === 'finish' && a.data.durationSeconds > 10)); assert.equal((await page.evaluate(() => window.lastUpload)).metadata.contentType, 'audio/mpeg');
    assert.ok(actions.some(a=>a.action==='finish_part'));assert.ok(actions.some(a=>a.action==='edit'&&a.data.chapters?.[1]?.startSeconds===16));await page.getByRole('button', { name: 'Submit for review', exact: true }).click(); await page.getByText('Music · in review').waitFor();
    await page.evaluate(() => { window.setUser('admin', 'admin'); window.navigate('/admin/audio'); }); await page.getByRole('button', { name: 'Approve and publish' }).click(); assert.ok(actions.some(a => a.action === 'review' && a.data.publish === true));
    musicEnabled=true;await page.evaluate(()=>{window.getDigitalGoodsService=async()=>({getDetails:async()=>[{itemId:'afrobooks_music_monthly',title:'AfroBooks Music',price:{currency:'USD',value:'2.99'}}],listPurchases:async()=>[]});window.PaymentRequest=class{constructor(methods,total){window.musicRequest={methods,total}}async show(){return{details:{purchaseToken:'MUSIC-FIXTURE-TOKEN'},complete:async()=>{}}}};window.setUser();window.navigate('/listen')});
    await page.getByRole('button',{name:'Music',exact:true}).click();await page.getByRole('button',{name:'Test subscription · $2.99/month',exact:true}).click();await page.getByText('Music pass active',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.musicRequest)).methods[0].data.sku,'afrobooks_music_monthly');assert.ok(musicCalls.some(call=>call.action==='verify'&&call.purchaseToken==='MUSIC-FIXTURE-TOKEN'));
    const desktop=await browser.newContext({viewport:{width:1280,height:900}});const web=await desktop.newPage();
    await web.route('**/api/audio**',r=>r.fulfill({json:{entries:[],next:null,earnings:[],payouts:{payouts:[],funding:[],stripeReady:false}}}));
    await web.goto(base+'/audio-studio');await web.getByRole('button',{name:'Upload audio',exact:true}).click();
    const upload=web.getByRole('button',{name:'Save draft',exact:true}),close=web.getByRole('button',{name:'Close',exact:true});
    const a=await upload.boundingBox(),b=await close.boundingBox();assert.equal(a.y,b.y);assert.ok(a.width<240&&b.width<160);assert.equal(a.height,b.height);
    await web.screenshot({path:'.vercel/audio-studio-desktop.png',fullPage:true});assert.ok(await web.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await desktop.close();
    assert.deepEqual(errors, []); await context.close(); console.log('PASS protected sample UI, real MP3 playback, automatic next recording, chapter uploads, covers, sound bars, reduced motion, volume, light/dark rotation, desktop button alignment, account cleanup and existing checkout UI.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
