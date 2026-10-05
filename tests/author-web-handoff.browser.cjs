// Real author entry links, website-mode bootstrap and onboarding screen.
// Firebase methods are simulated; no roles, accounts or payouts are changed.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {build}=require('esbuild');const http=require('node:http');const fs=require('node:fs');const assert=require('node:assert/strict');const postcss=require('postcss');

async function main(){
 const bundle=await build({bundle:true,write:false,outfile:'handoff.js',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"test"','process.env.NEXT_PUBLIC_AUTH_PHONE_ENABLED':'"true"','process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED':'"false"'},stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Profile from './components/buyer/profile/ProfileAccount';import Role from './components/auth/RoleSelector';import Workspace from './components/shared/WorkspaceSwitcher';
import Author from './components/seller/AuthorStart';import ReturnBar from './components/shared/AuthorReturnBar';import Login from './components/auth/LoginForm';import Signup from './components/auth/SignupForm';
import Shell from './components/shared/MobileAppShell';import SellerHeader from './components/seller/SellerHeader';
import {useAuthStore} from './store/authStore';import {APP_MODE_BOOTSTRAP,isInstalledApp} from './lib/app/installed';
const params=new URLSearchParams(location.search);const scenario=params.get('case')||sessionStorage.getItem('fixture-case')||'buyer';sessionStorage.setItem('fixture-case',scenario);
window.roleChanges=[];window.workspaceChanges=[];window.updates=[];window.scenario=scenario;window.mode=isInstalledApp;
window.profile={uid:'reader',role:scenario==='author'?'both':'buyer',activeRole:'buyer',status:'active',firstName:'Reader',email:'reader@example.test'};
useAuthStore.setState({loading:false,userProfile:scenario==='guest'?null:window.profile,firebaseUser:scenario==='guest'?null:{uid:'reader',getIdToken:async()=>''}});
window.go=p=>{history.pushState(null,'',p);window.dispatchEvent(new Event('route'))};
function App(){const[path,setPath]=useState(location.pathname);React.useEffect(()=>{const changed=()=>setPath(location.pathname);addEventListener('route',changed);return()=>removeEventListener('route',changed)},[]);
const screen=path==='/author/start'?<Author/>:path==='/login'?<Login/>:path==='/signup'?<Signup/>:path==='/video-studio'?<><SellerHeader/><h1>Video editor destination</h1></>:path==='/dashboard'?<><SellerHeader/><main style={{minHeight:1600}}><p role="status">Author dashboard</p></main></>:<main><Role selected="buyer" onChange={role=>window.roleChanges.push(role)}/><Workspace activeRole="buyer" onChange={role=>window.workspaceChanges.push(role)}/>{scenario!=='guest'&&<Profile/>}</main>;
return <><ReturnBar/><Shell>{screen}</Shell></>}
createRoot(document.getElementById('root')).render(<App/>);
`},plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^next\/(navigation|link|image)$/},a=>({path:a.path,namespace:'framework'}));
 b.onLoad({filter:/.*/,namespace:'framework'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/image'?`import React from 'react';export default function Image({fill,priority,...p}){return <img {...p}/>} `:`import React from 'react';const router={replace:p=>window.go(p),push:p=>window.go(p)};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;export default function Link({href,children,...p}){return <a href={href} {...p} onClick={e=>{e.preventDefault();window.go(href)}}>{children}</a>}`}));
 b.onResolve({filter:/^@\/components\/shared\/AvatarUpload$/},a=>({path:a.path,namespace:'avatar'}));
 b.onLoad({filter:/.*/,namespace:'avatar'},()=>({contents:'export default ()=>null'}));
 b.onResolve({filter:/^@\/components\/notifications\/NotificationBell$/},a=>({path:a.path,namespace:'notifications'}));
 b.onLoad({filter:/.*/,namespace:'notifications'},()=>({contents:'export default ()=>null'}));
 b.onResolve({filter:/^@\/lib\/firebase\/(auth|request|session|mobileAuth)$/},a=>({path:a.path,namespace:'firebase'}));
 b.onLoad({filter:/.*/,namespace:'firebase'},()=>({contents:`
export async function updateUserProfile(uid,changes){window.updates.push(changes);if(window.scenario==='failure')throw Error('offline');window.profile={...window.profile,...changes}}
export const getUserProfile=async()=>window.profile;export const authenticatedPost=async()=>({});export const signUp=async()=>{throw Error('Unexpected signup')};
export const logIn=async()=>{throw Error('Unused email login')};export const logOut=async()=>{};export const signInWithGoogle=async()=>{};
export const clearAuthSession=async()=>{};export const syncAuthSession=async()=>true;export const setClientAuthHints=()=>{};
export const createPhoneVerifier=()=>({clear(){}});export const sendPhoneCode=async()=>({confirm:async()=>({user:{uid:'reader',getIdToken:async()=>''}})});
export const finishMobileIdentity=async()=>({isNewUser:false});export const mobileSocialSignIn=async()=>({user:{uid:'reader',getIdToken:async()=>''},isNewUser:false});
`}));
 }}]});
 const head=await build({bundle:true,write:false,platform:'node',format:'cjs',stdin:{resolveDir:process.cwd(),contents:`export {APP_MODE_BOOTSTRAP} from './lib/app/installed'`}});const mod={exports:{}};new Function('module','exports',head.outputFiles[0].text)(mod,mod.exports);
 const css=(await postcss([require('tailwindcss')({content:['components/auth/**/*.tsx','components/seller/AuthorWebStart.tsx','components/seller/MobileAuthorStart.tsx','components/seller/SellerHeader.tsx','components/shared/Logo.tsx'],theme:require('../tailwind.config.js').theme})]).process(fs.readFileSync('app/globals.css','utf8'),{from:undefined})).css+fs.readFileSync('app/app-appearance.css','utf8')+fs.readFileSync('app/app-themes.css','utf8')+(bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'');
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const server=http.createServer((req,res)=>{if(req.url==='/handoff.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(req.url.startsWith('/api/platform/public')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({newSellerSignupsOpen:!req.headers.cookie?.includes('closed=1')}))}else if(/^\/(fonts|brand)\/[\w.-]+$/.test(req.url)){if(req.url.endsWith('.svg'))res.setHeader('Content-Type','image/svg+xml');res.end(fs.readFileSync('public'+req.url))}else{res.setHeader('Content-Type','text/html');res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>'+mod.exports.APP_MODE_BOOTSTRAP+'</script><style>'+css+'</style></head><body><div id="root"></div><script src="/handoff.js"></script></body></html>')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
 try{
 for(const mode of ['ios','android']){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.addInitScript(mode=>{if(mode==='ios')Object.defineProperty(navigator,'standalone',{value:true});else Object.defineProperty(document,'referrer',{value:'android-app://com.afrobs.app'})},mode);
  const page=await context.newPage();const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/profile?case=buyer');
  for(const name of [/^Author Studio/,/^Become an author$/]){
   const link=page.getByRole('link',{name});await link.waitFor();assert.equal(await link.getAttribute('href'),'/author/start');assert.equal(await link.getAttribute('target'),null);await link.click();
   await page.getByRole('heading',{name:'Become an author',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.mode()),true);assert.deepEqual(await page.evaluate(()=>window.updates),[]);
   await page.getByRole('link',{name:'Back to reading'}).click();assert.equal(new URL(page.url()).pathname,'/browse');await page.goto(base+'/profile?case=buyer');
  }
  for(const name of [/^Author Continue on the website/,/^Become an author$/]){
   let link=page.getByRole('link',{name});await link.waitFor();
   if(name.source==='^Become an author$'){await link.click();link=page.getByRole('link',{name:'Open author tools on the website'});await link.waitFor()}
   assert.equal(await link.getAttribute('href'),'/author/start?view=web');assert.equal(await link.getAttribute('target'),'_blank');
   const popupEvent=context.waitForEvent('page');await link.click();const popup=await popupEvent;await popup.waitForLoadState('domcontentloaded');await popup.getByRole('heading',{name:'Share your stories'}).waitFor();
   assert.equal(await popup.evaluate(()=>window.opener),null);assert.equal(await popup.evaluate(()=>window.mode()),false);assert.equal(await popup.locator('html').getAttribute('data-app-mode'),'browser');
   assert.equal(await page.evaluate(()=>window.mode()),true);assert.equal(await page.evaluate(()=>sessionStorage.getItem('afrobooks:website-tab')),null);
   assert.deepEqual(await page.evaluate(()=>window.updates),[]);assert.deepEqual(await page.evaluate(()=>window.roleChanges),[]);assert.deepEqual(await page.evaluate(()=>window.workspaceChanges),[]);
   if(name.source==='^Become an author$'){await popup.getByRole('button',{name:'Enable author tools'}).click();await popup.getByRole('status').filter({hasText:'Author dashboard'}).waitFor();assert.deepEqual(await popup.evaluate(()=>window.updates),[{role:'both',activeRole:'seller'}]);await popup.reload();assert.equal(await popup.evaluate(()=>window.mode()),false)}
   await popup.getByRole('link',{name:'Back to app',exact:true}).waitFor();const closedPopup=popup.waitForEvent('close');await popup.getByRole('link',{name:'Back to app',exact:true}).click();await closedPopup;
   assert.equal(await page.evaluate(()=>window.mode()),true);await page.goto(base+'/profile?case=buyer');
  }
  await page.goto(base+'/profile?case=author');await page.getByRole('link',{name:'My author space'}).click();await page.getByRole('heading',{name:'Your author space'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.updates),[]);
  const studioLink=page.getByRole('link',{name:'Open Creator Studio'});assert.equal(await studioLink.getAttribute('href'),'/author/start?view=web&studio=video');
  const studioPopupEvent=context.waitForEvent('page');await studioLink.click();const studioPopup=await studioPopupEvent;await studioPopup.getByRole('button',{name:'Enable author tools',exact:true}).click();await studioPopup.getByRole('heading',{name:'Video editor destination'}).waitFor();await studioPopup.getByRole('link',{name:'Back to app',exact:true}).waitFor();await studioPopup.close();
  // In a browser that has no shared login storage, all original identity
  // methods remain available and return to the author entry after sign-in.
  const guest=await context.newPage();await guest.goto(base+'/author/start?view=web&case=guest');await guest.getByRole('link',{name:'Sign in to your account'}).click();await guest.locator('.author-web-login').waitFor();
  await guest.getByRole('button',{name:'Phone',exact:true}).click();await guest.getByLabel('Country code').selectOption('US');await guest.getByLabel('Phone number',{exact:true}).fill('6505550110');await guest.getByRole('button',{name:'Continue',exact:true}).click();await guest.getByRole('heading',{name:'Check your phone'}).waitFor();await guest.getByLabel('Digit 1',{exact:true}).fill('123456');await guest.getByRole('button',{name:'Enable author tools'}).waitFor();assert.equal(new URL(guest.url()).pathname,'/author/start');
  const videoGuest=await context.newPage();await videoGuest.goto(base+'/author/start?view=web&studio=video&case=guest');await videoGuest.getByRole('link',{name:'Sign in to your account'}).click();await videoGuest.getByRole('button',{name:'Phone',exact:true}).click();await videoGuest.getByLabel('Country code').selectOption('US');await videoGuest.getByLabel('Phone number',{exact:true}).fill('6505550110');await videoGuest.getByRole('button',{name:'Continue',exact:true}).click();await videoGuest.getByLabel('Digit 1',{exact:true}).fill('123456');await videoGuest.getByRole('button',{name:'Enable author tools'}).click();await videoGuest.getByRole('heading',{name:'Video editor destination'}).waitFor();assert.deepEqual(await videoGuest.evaluate(()=>window.updates),[{role:'both',activeRole:'seller'}]);await videoGuest.close();
  if(process.env.SCREENSHOT_DIR){await guest.goto(base+'/login?redirect=%2Fauthor%2Fstart%3Fview%3Dweb&case=guest');await guest.locator('.author-web-login').waitFor();await guest.locator('.mobile-signin').evaluate(async el=>{await document.fonts.ready;await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});await guest.screenshot({path:process.env.SCREENSHOT_DIR+'/author-web-login-'+mode+'.png',fullPage:true})}
  await context.addCookies([{name:'closed',value:'1',url:base}]);const closed=await context.newPage();await closed.goto(base+'/author/start?view=web&case=buyer');await closed.getByRole('status').filter({hasText:'New author setup is currently closed.'}).waitFor();assert.equal(await closed.getByRole('button',{name:'Enable author tools'}).count(),0);assert.deepEqual(await closed.evaluate(()=>window.updates),[]);
  // A host that reused its current window must still have an exit, even when
  // closing the window is refused. Existing handoff tabs get this fix too.
  const reused=await context.newPage();await reused.addInitScript(()=>{window.close=()=>{}});await reused.goto(base+'/author/start?view=web&case=author');await reused.getByRole('button',{name:'Open Author Studio',exact:true}).click();await reused.getByRole('status').filter({hasText:'Author dashboard'}).waitFor();
  await reused.getByRole('link',{name:'Back to app',exact:true}).click();await reused.waitForURL(base+'/browse?view=app');assert.equal(await reused.evaluate(()=>window.mode()),true);assert.equal(await reused.evaluate(()=>sessionStorage.getItem('afrobooks:website-tab')),null);assert.equal(await reused.locator('.author-return-bar').count(),0);
  await reused.reload();assert.equal(await reused.evaluate(()=>window.mode()),true);assert.deepEqual(await reused.evaluate(()=>window.updates),[]);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+mode+': small author page, reader return, website popup close, reused-window fallback, same-account setup, phone login, closed signups and no app role mutation.');
 }
 const android=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36'});
 await android.addInitScript(()=>Object.defineProperty(document,'referrer',{value:'android-app://com.afrobs.app'}));
 const phone=await android.newPage();await phone.goto(base+'/profile?case=buyer');await phone.getByRole('link',{name:'Become an author'}).click();
 const outbound=phone.getByRole('link',{name:'Open author tools in Chrome'});await outbound.waitFor();assert.match(await outbound.getAttribute('href'),/^intent:\/\/afrobs\.com\/author\/start\?view=web#Intent;scheme=https;package=com\.android\.chrome;/);
 for(const theme of ['light','dark']){
  await phone.evaluate(theme=>document.documentElement.dataset.appTheme=theme,theme);
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.SCREENSHOT_DIR)await phone.screenshot({path:process.env.SCREENSHOT_DIR+'/mobile-author-'+theme+'.png'});
 }
 // Browser simulations cannot launch native packages. Check the rendered
 // native link, then exercise its exact same-origin fallback route separately.
 await phone.goto(base+'/author/start?view=web');const back=phone.getByRole('link',{name:'Back to app',exact:true});await back.waitFor();const intent=await back.getAttribute('href');assert.match(intent,/package=com\.afrobs\.app;/);
 const fallback=new URL(decodeURIComponent(intent.match(/S\.browser_fallback_url=([^;]+)/)[1]));assert.equal(fallback.origin,'https://afrobs.com');
 await phone.goto(base+'/dashboard?case=author');await phone.locator('.seller-header').waitFor();
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await phone.setViewportSize(viewport);await phone.evaluate(()=>scrollTo(0,0));
  const bar=await phone.locator('.author-return-bar').boundingBox();const header=await phone.locator('.seller-header').boundingBox();
  assert.ok(Math.abs(header.y-(bar.y+bar.height))<=1,'author header must meet the return bar without overlap or extra gap');
  await phone.evaluate(()=>scrollTo(0,300));const pinned=await phone.locator('.author-return-bar').boundingBox();assert.ok(Math.abs(pinned.y)<=1,'return bar stays reachable while scrolling');
  if(process.env.SCREENSHOT_DIR)await phone.screenshot({path:process.env.SCREENSHOT_DIR+'/author-return-'+viewport.width+'.png'});
 }
 await phone.goto(base+fallback.pathname+fallback.search);assert.equal(await phone.evaluate(()=>window.mode()),true);
 await phone.getByRole('link',{name:/^Author Continue in Chrome/}).waitFor();assert.equal(await phone.locator('.author-return-bar').count(),0);await android.close();console.log('PASS Android native links: Chrome target, AfroBooks return package, HTTPS fallback and reader-mode restoration. Native app launching needs a physical device.');
 const web=await browser.newContext();const page=await web.newPage();await page.goto(base+'/profile');assert.equal(await page.locator('.author-return-bar').count(),0);await page.getByRole('button',{name:'Author Publish and earn from your ebooks'}).click();assert.deepEqual(await page.evaluate(()=>window.roleChanges),['seller']);await page.getByRole('button',{name:'Author Studio',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.workspaceChanges),['seller']);await page.goto(base+'/signup?role=seller&redirect=%2Fauthor%2Fstart');await page.getByRole('button',{name:'Author Publish and earn from your ebooks'}).waitFor();assert.match(await page.getByRole('button',{name:'Author Publish and earn from your ebooks'}).getAttribute('style'),/0\.72/);await web.close();console.log('PASS website: original role/workspace controls and author signup preselection.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
