// Real app screens and interaction components; Firebase and Stripe are fixtures.
// No live accounts, payment requests, or vibration hardware are used.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const postcss = require('postcss');

async function main() {
  const result = await build({ bundle: true, write: false, outfile: 'appearance.js', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY': '"pk_test_fixture"' },
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Shell from './components/shared/MobileAppShell';import Experience from './components/shared/AppExperience';
import Browse from './app/(buyer)/browse/page';import Book from './app/(buyer)/book/[id]/page';
import Checkout from './app/(buyer)/checkout/page';import Receipt from './app/(buyer)/checkout/receipt/page';
import Reader from './components/reader/InAppReader';import Header from './components/buyer/BuyerHeader';
import Chrome from './components/buyer/BuyerChrome';import Settings from './components/shared/AppAppearanceSettings';
import {useAuthStore} from './store/authStore';import {useCartStore} from './store/cartStore';
import {useAppAppearanceStore} from './store/appAppearanceStore';import {useReaderStore} from './store/readerStore';
import {appHaptic} from './lib/app/haptics';
const cover=(color,title)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="'+color+'"/><text x="20" y="130" fill="white" font-size="24">'+title+'</text></svg>');
window.books=[{id:'one',title:'Ada’s Rain',authorName:'AfroBooks Author',sellerId:'author',price:199,genre:'Fiction',status:'live',language:'English',description:'A moving story of home, memory, and new beginnings.',coverBgColor:'#aa7058',coverUrl:cover('#b85a3c','Ada’s Rain'),coverAccentColor:'#b85a3c',pageCount:160,publicationType:'book'},
{id:'two',title:'Sunbird',authorName:'Another Author',sellerId:'author',price:299,genre:'Fiction',status:'live',language:'English',description:'A journey towards the light.',coverBgColor:'#514995',coverUrl:cover('#423c91','Sunbird'),coverAccentColor:'#423c91',publicationType:'book'}];
window.chapters=[1,2].map(i=>({id:'ch'+i,chapterNumber:i,title:'A new beginning '+i,content:Array.from({length:50},()=>'<p>Reading brings us closer to stories and ideas. A quiet afternoon, a new chapter, and a world to discover.</p>').join('')}));
window.orderStatus='pending';window.orderListeners=[];
window.setOrderStatus=s=>{window.orderStatus=s;window.orderListeners.forEach(cb=>cb())};
window.path=location.pathname;window.vibrations=[];
Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>{window.vibrations.push(pattern);return true}});
useAuthStore.setState({loading:false,firebaseUser:{uid:'fixture',getIdToken:async()=>'fixture'},userProfile:{uid:'fixture',role:'buyer',activeRole:'buyer',status:'active',firstName:'Reader'}});
useCartStore.setState({items:window.books.map(b=>({...b,bookId:b.id}))});
window.appPrefs=useAppAppearanceStore;window.readerPrefs=useReaderStore;window.tap=appHaptic;
window.fetch=async()=>new Response(JSON.stringify({available:true}),{status:200,headers:{'Content-Type':'application/json'}});
function App(){const[path,setPath]=useState(window.path);window.navigate=p=>{history.pushState(null,'',p);window.path=p.split('?')[0];setPath(p)};
const route=path.split('?')[0];return <Shell><Experience/>{route==='/browse'?<Browse/>:route.startsWith('/book/')?<Book/>:route==='/checkout'?<Checkout/>:route==='/checkout/receipt'?<Receipt/>:route.startsWith('/read/')?<Reader book={window.books[0]} userId="fixture" hasAccess/>:<><Header/><main className="app-page" style={{padding:24}}><Settings/></main></>}<Chrome/></Shell>}
createRoot(document.getElementById('root')).render(<App/>);
` }, plugins: [{ name: 'fixtures', setup(b) {
      b.onResolve({ filter: /^(next\/navigation|next\/link|next\/image|next\/dynamic)$/ }, a => ({ path: a.path, namespace: 'framework' }));
      b.onLoad({ filter: /.*/, namespace: 'framework' }, a => ({ resolveDir: process.cwd(), loader: 'jsx', contents:
        a.path === 'next/image' ? `import React from 'react';export default function Image({fill,priority,unoptimized,...p}){return <img {...p}/>}` :
        a.path === 'next/dynamic' ? `import React,{lazy,Suspense} from 'react';export default load=>{const C=lazy(load);return p=><Suspense><C {...p}/></Suspense>}` :
        `import React from 'react';const router={push:p=>window.navigate(p),replace:p=>window.navigate(p)};export const usePathname=()=>window.path;export const useParams=()=>({id:window.path.split('/').pop()});export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>router;export default function Link({children,href,onClick,...p}){return <a href={href} {...p} onClick={e=>{e.preventDefault();onClick?.(e);window.navigate(href)}}>{children}</a>}` }));
      b.onResolve({ filter: /^(@\/lib\/firebase\/(firestore|config|auth)|@\/hooks\/(useCatalog|useBookOwnership|useBookPreview|useOwnedCart))$/ }, a => ({ path: a.path, namespace: 'data' }));
      b.onLoad({ filter: /.*/, namespace: 'data' }, () => ({ contents: `
export const db={};export const auth={};export const useCatalog=()=>({books:window.books,loading:false});export const useBookOwnership=()=>({owned:false,checking:false});export const useBookPreview=()=>({status:'available',retry:()=>{}});export const useOwnedCart=()=>({loading:false});
export const getBook=async id=>window.books.find(b=>b.id===id);export const getBookReviews=async()=>[];export const getSimilarBooks=async()=>window.books;export const isBookInWishlist=async()=>false;export const toggleWishlist=async()=>true;export const getFollowedSellerIds=async()=>[];export const getActiveReadingProgress=async()=>[];
export const getChapters=async()=>window.chapters;export const getPreviewChapters=getChapters;export const getReadingProgress=async()=>null;export const saveReadingProgress=async()=>{};
export const logOutAndRedirect=()=>{throw Error('Unexpected signout')};export const updateUserProfile=()=>{throw Error('Unexpected profile change')};
` }));
      b.onResolve({ filter: /^firebase\/firestore$/ }, a => ({ path: a.path, namespace: 'orders' }));
      b.onLoad({ filter: /.*/, namespace: 'orders' }, () => ({ contents: `export const doc=(_,collection,id)=>({id});export const onSnapshot=(ref,options,callback)=>{const emit=()=>callback({id:ref.id,exists:()=>true,metadata:{fromCache:false},data:()=>({id:ref.id,buyerId:'fixture',bookId:'one',status:window.orderStatus,finalPrice:199,receiptEmailSent:true,createdAt:{toDate:()=>new Date()}})});window.orderListeners.push(emit);emit();return()=>{window.orderListeners=window.orderListeners.filter(f=>f!==emit)}};` }));
      b.onResolve({ filter: /^(@stripe\/react-stripe-js|@\/lib\/stripe\/client)$/ }, a => ({ path: a.path, namespace: 'stripe' }));
      b.onLoad({ filter: /.*/, namespace: 'stripe' }, () => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `import React from 'react';export const getStripe=()=>null;export const Elements=({children})=>children;const stripe={confirmCardPayment:()=>{throw Error('Unexpected payment')}};export const useStripe=()=>stripe;export const useElements=()=>({getElement:()=>null});export const CardElement=({options})=><input aria-label="Fixture card" style={{color:options.style.base.color}}/>;` }));
      b.onResolve({ filter: /(CatalogSync|ReaderResumeBar|ProfileLinkHandler|NotificationBell|WorkspaceSwitcher|InstallPWA|FollowButton|ReviewForm|ReviewCard|profile\/ProfileAccount|profile\/ProfileSettings|profile\/ProfileCollections)$/ }, a => ({ path: a.path, namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, a => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `import React from 'react';export default function Stub(){return ${a.path.endsWith('NotificationBell') ? '<button className="icon-button" aria-label="Notifications">N</button>' : 'null'}}` }));
    } }],
  });
  const css = (await postcss([require('tailwindcss')({ content: ['app/**/*.tsx', 'components/**/*.tsx'], theme: require('../tailwind.config.js').theme })]).process(fs.readFileSync('app/globals.css', 'utf8'), { from: undefined })).css
    + (result.outputFiles.find(f => f.path.endsWith('.css'))?.text || '') + fs.readFileSync('app/app-appearance.css', 'utf8') + fs.readFileSync('app/app-themes.css', 'utf8');
  const js = result.outputFiles.find(f => f.path.endsWith('.js')).text;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); }
    else if (/^\/(fonts|brand)\/[\w.-]+$/.test(req.url)) { if(req.url.endsWith('.svg'))res.setHeader('Content-Type','image/svg+xml');res.end(fs.readFileSync('public' + req.url)); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); window.testHour = 12; Date.prototype.getHours = function() { return window.testHour; }; });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/browse'); await page.getByRole('heading', { name: 'Stories to get lost in.' }).waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.appTheme === 'light');
    for (const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize(size);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const actions=await page.locator('.buyer-header-actions').boundingBox();assert.ok(actions.x+actions.width<=size.width,'all header controls fit');
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button', { name: 'App theme: Auto. Switch to light.' }).click();
    await page.getByRole('button', { name: 'App theme: Light. Switch to dark.' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.appTheme === 'dark');
    await page.reload(); await page.getByRole('button', { name: 'App theme: Dark. Switch to auto.' }).waitFor();
    await page.getByRole('button', { name: 'App theme: Dark. Switch to auto.' }).click();
    await page.evaluate(() => { window.testHour=18; window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => document.documentElement.dataset.appTheme === 'dark');
    await page.evaluate(() => { window.testHour=6; window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => document.documentElement.dataset.appTheme === 'light');
    await page.evaluate(() => window.navigate('/book/one')); await page.getByRole('heading', { name: 'Ada’s Rain', exact:true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.app-book-scene')?.getAttribute('style')?.includes('#b85a3c'));
    assert.notEqual(await page.locator('.app-detail-cover').evaluate(el=>getComputedStyle(el).boxShadow),'none');
    assert.match(await page.locator('.app-book-scene').evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
    if(process.env.SCREENSHOT_DIR){await page.evaluate(()=>document.fonts.ready);await page.screenshot({animations:'disabled',path:process.env.SCREENSHOT_DIR+'/book-light.png'});}
    await page.getByRole('button', { name: /App theme:/ }).click(); await page.getByRole('button', { name: /App theme:/ }).click();
    if(process.env.SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:process.env.SCREENSHOT_DIR+'/book-dark.png'});
    await page.evaluate(() => window.navigate('/book/two'));await page.getByRole('heading', {name:'Sunbird',exact:true}).waitFor();
    await page.waitForFunction(() => document.querySelector('.app-book-scene')?.getAttribute('style')?.includes('#423c91'));
    await page.evaluate(() => { window.books[0].coverUrl='data:image/png;base64,broken'; window.navigate('/book/one'); });
    await page.getByRole('heading',{name:'Ada’s Rain',exact:true}).waitFor();
    await page.waitForFunction(() => document.querySelector('.app-book-scene')?.getAttribute('style')?.includes('#aa7058'));
    await page.evaluate(() => { window.books[0].coverUrl=window.books[1].coverUrl; });
    await page.evaluate(() => window.navigate('/checkout'));await page.getByLabel('Fixture card').waitFor();
    await page.evaluate(() => window.appPrefs.getState().setThemeMode('light'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[aria-label="Fixture card"]')).color === 'rgb(37, 39, 44)');
    if(process.env.SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:process.env.SCREENSHOT_DIR+'/checkout-light.png'});
    await page.evaluate(() => { window.navigate('/read/one');window.appPrefs.getState().setThemeMode('dark'); });
    await page.getByRole('main',{name:'Book reader'}).waitFor();
    await page.waitForFunction(() => document.querySelector('.reader-shell').style.getPropertyValue('--reader-bg')==='#0d0e10');
    await page.getByRole('button',{name:'Reading appearance',exact:true}).click();await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('radio',{name:'Night',exact:true}).isChecked(),true);
    await page.getByRole('radio',{name:'Sepia',exact:true}).check();await page.getByRole('radio',{name:'Pages',exact:true}).check();
    await page.getByRole('button',{name:'Close reading appearance'}).click();
    await page.evaluate(()=>window.appPrefs.getState().setThemeMode('light'));
    assert.equal(await page.locator('.reader-shell').evaluate(el=>el.style.getPropertyValue('--reader-bg')),'#f3e7d0');
    await page.waitForTimeout(150);await page.evaluate(()=>window.vibrations=[]);
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.vibrations.length),1,'one tap for a page turn');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
    await page.getByRole('button',{name:'Next page',exact:true}).click();assert.equal(await page.evaluate(()=>window.vibrations.length),1,'reduced motion disables haptics');
    await page.getByRole('button',{name:'Reading appearance',exact:true}).click();
    assert.equal(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.getByRole('button',{name:'Close reading appearance'}).click();await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.navigate('/settings'));await page.getByRole('switch').uncheck();
    await page.evaluate(()=>window.tap());assert.equal(await page.evaluate(()=>window.vibrations.length),1,'feedback switch disables taps');
    await page.getByRole('switch').check();await page.waitForTimeout(100);await page.evaluate(()=>window.vibrations=[]);
    await page.evaluate(()=>window.navigate('/checkout/receipt?orders=order1'));await page.getByRole('heading',{name:'Confirming your purchase'}).waitFor();
    assert.equal(await page.evaluate(()=>window.vibrations.length),0,'pending orders do not celebrate');
    await page.evaluate(()=>window.setOrderStatus('completed'));await page.getByRole('heading',{name:'Purchase confirmed'}).waitFor();
    await page.waitForFunction(()=>window.vibrations.length===1);
    await page.evaluate(()=>window.setOrderStatus('completed'));assert.equal(await page.evaluate(()=>window.vibrations.length),1,'repeat snapshots do not repeat feedback');
    await page.evaluate(()=>window.setOrderStatus('refunded'));await page.getByRole('heading',{name:'Purchase refunded'}).waitFor();assert.equal(await page.evaluate(()=>window.vibrations.length),1);
    await page.evaluate(()=>{Object.defineProperty(navigator,'vibrate',{value:undefined});window.tap()});
    assert.deepEqual(errors,[]);await context.close();
    console.log('PASS themes, persistence, time boundaries, real book tints, checkout contrast, reader choice, motion, haptics and confirmed-only receipt feedback');
    const legacy=await browser.newContext({viewport:{width:390,height:844}});
    await legacy.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});localStorage.setItem('afrobooks-reader',JSON.stringify({state:{theme:'sepia'},version:0}));localStorage.setItem('afrobooks-app-appearance',JSON.stringify({state:{themeMode:'dark'},version:0}));});
    const old=await legacy.newPage();await old.goto(base+'/read/one');await old.getByRole('main',{name:'Book reader'}).waitFor();assert.equal(await old.locator('.reader-shell').evaluate(el=>el.style.getPropertyValue('--reader-bg')),'#f3e7d0');await legacy.close();
    const website=await browser.newContext({viewport:{width:390,height:844}});const web=await website.newPage();await web.goto(base+'/book/one');await web.getByRole('heading',{name:'Ada’s Rain',exact:true}).waitFor();assert.equal(await web.locator('.app-theme-toggle').count(),0);assert.equal(await web.locator('html').getAttribute('data-app-theme'),null);assert.equal(await web.locator('.app-book-scene').getAttribute('style'),null);assert.equal(await web.evaluate(()=>window.tap()),false);await website.close();
    console.log('PASS legacy reader choices preserved and regular website unchanged');
  } finally { await browser.close();await new Promise(r=>server.close(r)); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
