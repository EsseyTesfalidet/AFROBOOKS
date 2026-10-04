// Real reader, app shell and preview CTA; generated text and Firebase boundaries.
// Navigation uses real document requests, with no accounts or purchase writes.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const postcss = require('postcss');

async function main() {
  const bundle = await build({ bundle: true, write: false, outfile: 'reader.js', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Reader from './components/reader/InAppReader';import Shell from './components/shared/MobileAppShell';import Experience from './components/shared/AppExperience';
import {useReaderStore} from './store/readerStore';import {readerPageMetrics} from './lib/utils/readerPosition';
const params=new URLSearchParams(location.search);window.prefs=useReaderStore;window.metrics=()=>readerPageMetrics(document.querySelector('.reader-shell > .reader-viewport'));
const ti='ሰላም ዓለም። ምንባብ መጽሓፍ ታሪኽ ሰላም ዓለም ታሪኽ። መጽሓፍ ምንባብ ሓድሽ ዓለም ይኸፍት።';
window.chapters=[{id:'one',chapterNumber:1,isPreview:true,title:'Reading section 1',content:Array.from({length:params.has('long')?1100:35},()=>'<p>'+ti+'</p>').join('')}];
createRoot(document.getElementById('root')).render(<Shell><Experience/><Reader book={{id:'tigrinya-book',title:'ሰላም ዓለም። መጽሓፍ ምንባብ ሓድሽ ዓለም ይኸፍት።',authorName:'Author',price:599,genre:'Fiction'}} userId={null} hasAccess={false}/></Shell>);
` }, plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, a => ({ path: a.path, namespace: 'framework' }));
      b.onLoad({ filter: /.*/, namespace: 'framework' }, () => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `import React from 'react';const router={replace(){},push(){}};export const usePathname=()=>'/read/tigrinya-book';export const useRouter=()=>router;export default function Link(p){return <a {...p}/>}` }));
      b.onResolve({ filter: /^@\/lib\/firebase\/firestore$/ }, a => ({ path: a.path, namespace: 'data' }));
      b.onLoad({ filter: /.*/, namespace: 'data' }, () => ({ contents: `export const getPreviewChapters=async()=>window.chapters;export const getChapters=async()=>{throw Error('Full content must remain protected')};export const getReadingProgress=async()=>null;export const saveReadingProgress=async()=>{throw Error('Guest sample must not write account data')};` }));
    } }] });
  const css = (await postcss([require('tailwindcss')({ content: ['components/reader/**/*.tsx'], theme: require('../tailwind.config.js').theme })]).process(fs.readFileSync('app/globals.css','utf8'),{from:undefined})).css
    + bundle.outputFiles.find(f=>f.path.endsWith('.css')).text + fs.readFileSync('app/app-appearance.css','utf8') + fs.readFileSync('app/app-themes.css','utf8');
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
  let bookRequests=0;
  const server=http.createServer((req,res)=>{
    if(req.url==='/reader.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}
    else if(/^\/fonts\/[\w.-]+$/.test(req.url))res.end(fs.readFileSync('public'+req.url));
    else if(req.url==='/book/tigrinya-book'){bookRequests++;res.setHeader('Content-Type','text/html');res.end('<h1>Book details</h1>')}
    else {res.setHeader('Content-Type','text/html');res.end('<!DOCTYPE html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body><div id="root"></div><script src="/reader.js"></script></body></html>')}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
  try{
    for(const mode of ['android','ios','browser']){
      const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      await context.addInitScript(mode=>{if(mode==='ios')Object.defineProperty(navigator,'standalone',{value:true});if(mode==='android')Object.defineProperty(document,'referrer',{value:'android-app://com.afrobs.app'});localStorage.setItem('afrobooks-reader',JSON.stringify({state:{readingMode:'pages',theme:'paper',themeExplicit:true},version:0}))},mode);
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      async function open(suffix=''){
        await page.goto(base+'/sample/tigrinya-book'+suffix);await page.locator('.reader-content').waitFor();await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(80);await page.locator('.reader-shell > .reader-viewport').evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(80);
      }
      async function activate(input, fractional=false){
        const link=page.locator('.reader-shell > .reader-viewport .reader-purchase-link');assert.equal(await link.getAttribute('href'),'/book/tigrinya-book');
        // Fractional viewport/column alignment on phones must not turn backward
        // when focus lands a fraction of a pixel before the column boundary.
        if(fractional)await link.evaluate(el=>el.style.transform='translateX(-0.75px)');
        const before=await page.evaluate(()=>window.metrics());
        const box=await link.boundingBox();assert.ok(box.x>=0&&box.y>=0);
        const prior=bookRequests;
        if(input==='keyboard'){
          await page.keyboard.press('Tab');await link.focus();assert.equal((await page.evaluate(()=>window.metrics())).page,before.page);await page.keyboard.press('Enter');
        }else if(input==='mouse')await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
        else await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
        try { await page.getByRole('heading',{name:'Book details'}).waitFor({timeout:5000}); }
        catch(error) { console.error({mode,input,pageBefore:before.page,pageAfter:await page.evaluate(()=>window.metrics?.().page),destination:page.url()});throw error; }
        assert.equal(page.url(),base+'/book/tigrinya-book');assert.equal(bookRequests,prior+1);
      }
      await open();await activate('mouse',true);
      await open();await activate('touch');
      await open();await activate('keyboard',true);
      // Keyboard navigation must still reveal a link on another page.
      await open();await page.locator('.reader-shell > .reader-viewport').evaluate(el=>el.scrollLeft=0);await page.waitForTimeout(80);await page.keyboard.press('Tab');
      await page.locator('.reader-shell > .reader-viewport .reader-purchase-link').focus();assert.ok((await page.evaluate(()=>window.metrics())).page>0);await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Book details'}).waitFor();
      await page.setViewportSize({width:568,height:320});await open();await activate('touch');
      await page.setViewportSize({width:320,height:568});await open('?long=1');await activate('touch');
      await open();await page.getByRole('button',{name:'Switch to scrolling',exact:true}).click();await page.locator('.reader-shell > .reader-viewport').evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(80);await activate('touch');
      assert.deepEqual(errors,[]);await context.close();console.log('PASS '+mode+': preview-to-book navigation by touch, pointer and keyboard; fractional columns, landscape, large chapter, saved preview position and scroll mode');
    }
  }finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
