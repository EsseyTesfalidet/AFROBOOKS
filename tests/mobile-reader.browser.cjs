// Actual reader/session/preferences/pagination. Only account data is simulated.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const postcss = require('postcss');

async function main() {
  const bundle = await build({ bundle: true, write: false, outfile: 'reader.js', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import Reader from './components/reader/InAppReader';
import Shell from './components/shared/MobileAppShell';import Experience from './components/shared/AppExperience';
import {useReaderStore} from './store/readerStore';import {captureReaderPosition,readerPageMetrics} from './lib/utils/readerPosition';
const params=new URLSearchParams(location.search);window.language=params.get('lang')||'en';window.preview=params.has('preview');
window.saves=[];window.calls=[];window.prefs=useReaderStore;
const passages={en:'The morning light fell softly across the page. A story can carry us home, or take us somewhere we have never been.',ti:'ሰላም ዓለም። ምንባብ መጽሓፍ ታሪኽ ሰላም ዓለም ታሪኽ። መጽሓፍ ምንባብ ሓድሽ ዓለም ይኸፍት።',ar:'القراءة تفتح أبواب المعرفة والقصص الجميلة لكل إنسان. كان ضوء الصباح يتسلل بهدوء إلى صفحات الكتاب.',zh:'清晨的阳光落在书页上。阅读带我们走进故事，走向更广阔的世界。每一页都带来新的发现。'};
window.chapters=[1,2].map(i=>({id:'chapter-'+i,chapterNumber:i,isPreview:i===1,title:i===1?'A quiet beginning':'The journey continues',content:Array.from({length:params.has('heavy')?1100:55},(_,j)=>'<p>'+passages[window.language]+' '+passages[window.language]+'</p>').join('')}));
window.readState=()=>{const v=document.querySelector('.reader-viewport'),b=document.querySelector('.reader-content');return{...readerPageMetrics(v),...captureReaderPosition(v,b,1),height:v.clientHeight,scrollHeight:v.scrollHeight,width:v.clientWidth,left:v.getBoundingClientRect().left,right:v.getBoundingClientRect().right}};
createRoot(document.getElementById('root')).render(<Shell><Experience/><Reader book={{id:'fixture-'+window.language+(window.preview?'-preview':''),title:'The book of stories — a deliberately long title that must fit a phone',authorName:'AfroBooks Author',price:199,genre:'Fiction'}} userId={window.preview?null:'reader'} hasAccess={!window.preview}/></Shell>);
` }, plugins: [{ name: 'reader-boundaries', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, a => ({ path: a.path, namespace: 'framework' }));
      b.onLoad({ filter: /.*/, namespace: 'framework' }, () => ({ loader: 'jsx', resolveDir: process.cwd(), contents: `import React from 'react';const router={replace(){},push(){}};export const usePathname=()=>'/read/fixture';export const useRouter=()=>router;export default function Link(p){return <a {...p}/>}` }));
      b.onResolve({ filter: /^@\/lib\/firebase\/firestore$/ }, a => ({ path: a.path, namespace: 'data' }));
      b.onLoad({ filter: /.*/, namespace: 'data' }, () => ({ contents: `export const getChapters=async()=>{window.calls.push('full');return window.chapters};export const getPreviewChapters=async()=>{window.calls.push('preview');return window.chapters.filter(c=>c.isPreview)};export const getReadingProgress=async()=>null;export const saveReadingProgress=async(uid,id,p)=>{window.saves.push(p)};` }));
    } }],
  });
  const css = (await postcss([require('tailwindcss')({ content: ['components/reader/**/*.tsx'], theme: require('../tailwind.config.js').theme })]).process(fs.readFileSync('app/globals.css','utf8'),{from:undefined})).css
    + bundle.outputFiles.find(f=>f.path.endsWith('.css')).text + fs.readFileSync('app/app-appearance.css','utf8') + fs.readFileSync('app/app-themes.css','utf8');
  const js = bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const server=http.createServer((req,res)=>{
    if(req.url==='/reader.js'){res.setHeader('Content-Type','application/javascript');res.end(js);}
    else if(/^\/fonts\/[\w.-]+$/.test(req.url))res.end(fs.readFileSync('public'+req.url));
    else {res.setHeader('Content-Type','text/html');res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script src="/reader.js"></script></body></html>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});if(!localStorage.getItem('afrobooks-reader'))localStorage.setItem('afrobooks-reader',JSON.stringify({state:{readingMode:'pages',theme:'paper',themeExplicit:true},version:0}));});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const load=async suffix=>{await page.goto(base+'/read'+suffix);await page.locator('.reader-shell > .reader-viewport .reader-content').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>window.readState().count>2);await page.waitForTimeout(100);};
    const settled=()=>page.evaluate(()=>Promise.allSettled(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished)));
    async function geometry(){const s=await page.evaluate(()=>window.readState());assert.ok(s.left>=0&&s.right<=await page.evaluate(()=>innerWidth)+1);assert.ok(s.scrollHeight<=s.height+1,'paged text stays within vertical bounds');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal document overflow');return s;}
    await load('');
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    await page.waitForFunction(()=>window.readState().page===1);
    await page.waitForFunction(()=>document.querySelector('.reader-flip-leaf')?.getAnimations().some(a=>a.playState==='running'));
    assert.equal(await page.locator('.reader-shell > .reader-viewport > .reader-page').evaluate(el=>getComputedStyle(el).transform),'none','text geometry is never transformed');
    await page.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=110}));
    assert.equal(await page.locator('.reader-flip-layer').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'),true);
    assert.equal(await page.locator('.reader-flip-layer [id], .reader-flip-layer [role], .reader-flip-layer [href]').count(),0,'no duplicate IDs/live regions/links');
    assert.equal(await page.locator('[data-reader-snapshot]').evaluate(el=>el.scrollLeft),0,'outgoing sheet shows the page before navigation');
    assert.notEqual(await page.locator('.reader-flip-leaf').evaluate(el=>getComputedStyle(el).transform),'none','the paper sheet actually turns in 3D');
    assert.equal(await page.getByRole('main',{name:'Book reader'}).count(),1,'one accessible reader during the flip');
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/reader-page-flip.png'});
    const during=await page.evaluate(()=>window.readState());
    await page.evaluate(()=>document.getAnimations().forEach(a=>a.play()));await settled();
    assert.equal(await page.locator('[data-reader-snapshot]').count(),0,'temporary sheet removed after the turn');
    const pageBox=await page.locator('.reader-shell > .reader-viewport').boundingBox();
    await page.locator('.reader-shell > .reader-viewport').click({position:{x:pageBox.width-4,y:pageBox.height/2}});
    await page.waitForFunction(()=>window.readState().page===2);await settled();
    await page.locator('.reader-shell > .reader-viewport').click({position:{x:4,y:pageBox.height/2}});
    await page.waitForFunction(()=>window.readState().page===1);await settled();
    // Backward turns put the previous page on the moving sheet and retain the
    // outgoing page underneath until it lands.
    await page.getByRole('button',{name:'Previous page',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.reader-flip-leaf')?.getAnimations().length>0);
    assert.equal(await page.locator('.reader-flip-scene').getAttribute('data-direction'),'previous');
    assert.equal(await page.locator('.reader-flip-front [data-reader-snapshot]').evaluate(el=>el.scrollLeft),0);
    assert.ok(await page.locator('.reader-flip-base [data-reader-snapshot]').evaluate(el=>el.scrollLeft)>0);
    await settled();assert.equal((await geometry()).page,0);
    await page.getByRole('button',{name:'Next page',exact:true}).click();await settled();
    assert.deepEqual((await geometry()).positionAnchor,during.positionAnchor,'animation preserves text anchors');
    // Rapid turns replace the temporary sheet without losing a page or
    // leaving an old animation's completion handler to clear the newest one.
    const rapidStart=(await geometry()).page;
    await page.evaluate(()=>{const next=document.querySelector('button[aria-label="Next page"]');next.click();next.click();next.click()});
    await page.waitForFunction(()=>document.querySelector('.reader-flip-leaf')?.getAnimations().length>0);
    assert.equal(await page.locator('.reader-flip-leaf').count(),1);
    await settled();assert.equal((await geometry()).page,rapidStart+3);
    assert.equal(await page.locator('[data-reader-snapshot]').count(),0);
    const before=await geometry();
    await page.locator('.reader-shell > .reader-viewport').click({position:{x:100,y:100}});
    assert.equal(await page.locator('.reader-shell').getAttribute('data-reader-focus'),'true');
    await page.locator('.reader-shell > .reader-viewport').click({position:{x:pageBox.width/2,y:pageBox.height/2}});
    assert.equal(await page.locator('.reader-shell').getAttribute('data-reader-focus'),'false','a center tap brings reader controls back');
    await page.locator('.reader-shell > .reader-viewport').click({position:{x:pageBox.width/2,y:pageBox.height/2}});
    assert.equal(await page.locator('.reader-shell').getAttribute('data-reader-focus'),'true','a second center tap hides reader controls');
    assert.ok(await page.locator('.reader-toolbar').evaluate(el=>el.inert));
    assert.equal(await page.getByRole('button',{name:'Next page',exact:true}).count(),0,'hidden buttons are not accessible/focusable');
    const focused=await geometry();assert.equal(focused.height,before.height);assert.equal(focused.page,before.page);assert.deepEqual(focused.positionAnchor,before.positionAnchor);
    await page.getByRole('button',{name:'Show reader controls'}).click();
    await page.getByRole('button',{name:/Reading progress:/}).click();assert.match(await page.getByRole('button',{name:/Reading progress:/}).innerText(),/% of book/);
    await page.getByRole('button',{name:/Reading progress:/}).click();assert.match(await page.getByRole('button',{name:/Reading progress:/}).innerText(),/min left/);
    await page.getByRole('button',{name:/Reading progress:/}).click();
    const cdp=await context.newCDPSession(page);const box=await page.locator('.reader-shell > .reader-viewport').boundingBox();const startPage=(await geometry()).page;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.8,y:box.y+100,id:0}]});
    for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.8-i*20,y:box.y+100,id:0}]});await page.waitForTimeout(16);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(p=>window.readState().page===p+1,startPage);await settled();
    const selectionPage=(await geometry()).page;
    await page.evaluate(()=>{const p=document.querySelector('.reader-content p');const range=document.createRange();range.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.locator('.reader-shell > .reader-viewport').dispatchEvent('click');assert.equal(await page.locator('.reader-shell').getAttribute('data-reader-focus'),'false','selecting text does not hide controls');
    await page.locator('.reader-shell > .reader-viewport').dispatchEvent('keydown',{key:'ArrowRight'});assert.equal((await geometry()).page,selectionPage,'selection does not turn pages');
    await page.evaluate(()=>getSelection().removeAllRanges());
    await page.getByRole('button',{name:'Reading appearance',exact:true}).click();
    assert.ok((await page.getByLabel('Text appearance preview').innerText()).includes('morning light'));
    if(process.env.SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:process.env.SCREENSHOT_DIR+'/reader-appearance-paper.png'});
    await page.getByRole('button',{name:'Large text',exact:true}).click();assert.equal(await page.locator('.reader-live-preview p').evaluate(el=>getComputedStyle(el).fontSize),'27px');
    await page.getByRole('switch',{name:'Page-turn animation'}).uncheck();await page.getByRole('button',{name:'Close reading appearance'}).click();await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('afrobooks-reader')).state.pageMotion),false,'motion choice persists');
    await page.getByRole('button',{name:'Next page',exact:true}).click();assert.equal(await page.locator('.reader-flip-layer').evaluate(el=>el.childElementCount),0);
    await page.getByRole('button',{name:'Reading appearance',exact:true}).click();await page.getByRole('button',{name:'Comfortable',exact:true}).click();await page.getByRole('switch',{name:'Page-turn animation'}).check();await page.getByRole('button',{name:'Close reading appearance'}).click();
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);await page.getByRole('button',{name:'Next page',exact:true}).click();assert.equal(await page.locator('.reader-flip-layer').evaluate(el=>el.childElementCount),0);await page.emulateMedia({reducedMotion:'no-preference'});
    // Rotation and reduced-motion changes cancel an in-flight sheet immediately.
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    await page.waitForFunction(()=>!!document.querySelector('.reader-flip-leaf'));
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-reader-snapshot]').count(),0);await geometry();
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    await page.waitForFunction(()=>!!document.querySelector('.reader-flip-leaf'));
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-reader-snapshot]').count(),0);await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForTimeout(550);const saved=await geometry();await load('');assert.equal((await geometry()).page,saved.page,'reopening restores the same page');
    for(const lang of ['en','ti','ar','zh']){
      await load('?lang='+lang);const original=await page.locator('.reader-shell > .reader-viewport .reader-content').textContent();
      for(const size of [{width:320,height:568},{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(size);await page.waitForTimeout(100);await geometry();}
      await page.getByRole('button',{name:'Reading appearance',exact:true}).click();await page.getByRole('button',{name:'Large text',exact:true}).click();await page.getByRole('button',{name:'Close reading appearance'}).click();await page.waitForTimeout(100);await geometry();
      await page.getByRole('button',{name:'Next page',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.reader-flip-leaf')?.getAnimations().length>0);
      assert.equal(await page.locator('[data-reader-snapshot] .reader-content').textContent(),original,'flipping sheet preserves Unicode: '+lang);
      await settled();
      assert.equal(await page.locator('.reader-shell > .reader-viewport .reader-content').textContent(),original,'language text is preserved: '+lang);
      if(process.env.SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:process.env.SCREENSHOT_DIR+'/reader-paper-'+lang+'.png'});
    }
    // Turning through a chapter boundary and back restores the old chapter's
    // final column. Only already authorized chapter data is used for the sheet.
    await load('');
    await page.evaluate(()=>{const v=document.querySelector('.reader-shell > .reader-viewport');v.scrollLeft=v.scrollWidth;v.dispatchEvent(new Event('scroll',{bubbles:true}))});
    await page.waitForTimeout(30);const lastPage=(await geometry()).page;
    await page.getByRole('button',{name:'Next page',exact:true}).click();await settled();
    await page.waitForFunction(()=>document.getElementById('reader-chapter-title').textContent==='The journey continues');
    assert.equal((await geometry()).page,0);
    await page.getByRole('button',{name:'Previous page',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.reader-flip-front [data-reader-snapshot]'));
    assert.ok(await page.locator('.reader-flip-front [data-reader-snapshot]').evaluate(el=>el.scrollLeft)>0,'backward chapter flip shows restored final page');
    await settled();assert.equal((await geometry()).page,lastPage);
    // Large manuscripts and unavailable animation APIs still navigate.
    await load('?heavy=1');const heavyPage=(await geometry()).page;
    await page.getByRole('button',{name:'Next page',exact:true}).click();await page.waitForTimeout(30);
    assert.equal((await geometry()).page,heavyPage+1);assert.equal(await page.locator('[data-reader-snapshot]').count(),0);
    await load('');const noApiPage=(await geometry()).page;
    await page.evaluate(()=>{window.nativeAnimate=Element.prototype.animate;Element.prototype.animate=undefined});
    await page.getByRole('button',{name:'Previous page',exact:true}).click();assert.equal((await geometry()).page,noApiPage-1);
    await page.evaluate(()=>{Element.prototype.animate=window.nativeAnimate});
    await load('?preview=1');assert.deepEqual(await page.evaluate(()=>window.calls),['preview']);
    assert.equal(await page.getByText('The journey continues',{exact:true}).count(),0,'unpaid chapter is never fetched or rendered');
    await page.getByRole('button',{name:'Chapters',exact:true}).click();assert.equal(await page.locator('.reader-contents li').count(),1);await page.getByRole('button',{name:'Close chapters',exact:true}).click();
    await page.evaluate(()=>{const v=document.querySelector('.reader-shell > .reader-viewport');v.scrollLeft=v.scrollWidth;v.dispatchEvent(new Event('scroll',{bubbles:true}))});
    await page.waitForTimeout(50);const previewEnd=(await geometry()).page;
    await page.locator('.reader-shell > .reader-viewport').dispatchEvent('keydown',{key:'ArrowRight'});
    assert.equal((await geometry()).page,previewEnd);assert.equal(await page.locator('[data-reader-snapshot]').count(),0,'no phantom turn past the preview gate');
    await page.getByRole('button',{name:'Switch to scrolling',exact:true}).click();await page.waitForTimeout(100);assert.equal(await page.locator('.reader-shell').getAttribute('data-reading-mode'),'scroll');
    assert.equal(await page.locator('.reader-flip-layer').count(),0);assert.deepEqual(errors,[]);await context.close();
    const web=await browser.newContext({viewport:{width:390,height:844}});const website=await web.newPage();await website.goto(base+'/read');await website.locator('.reader-content').waitFor();assert.equal(await website.locator('.reader-mobile-controls').count(),0);assert.equal(await website.locator('.reader-running-head').count(),0);await web.close();
    console.log('PASS 3D paper reader: forward/backward flips, inert exact-page copies, cleanup, rapid turns, chapter boundaries, rotation, oversized chapter and unavailable API fallbacks; focus without repagination, compact progress, swipe, selection, appearance preview/presets, reduced motion/off, saved place, narrow/landscape and large text in English/Tigrinya/Arabic/Chinese, preview access, unchanged website.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
