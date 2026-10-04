// Actual app gate, auth provider and cart, with Firebase boundaries replaced.
// PLAYWRIGHT_PATH and EDGE_PATH select local browser tooling. No live accounts.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {build}=require('esbuild');const http=require('node:http');const fs=require('node:fs');const assert=require('node:assert/strict');
async function main(){
const bundle=await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"test"'},stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Gate from './components/auth/MobileAccessGate';import Provider from './components/shared/AuthProvider';import Experience from './components/shared/AppExperience';
import {useAuthStore} from './store/authStore';import {useCartStore} from './store/cartStore';
import {mobileAuthDestination,mobileAuthSwitchHref} from './lib/auth/mobileAccess';
import {APP_MODE_BOOTSTRAP} from './lib/app/installed';
window.bootstrap=APP_MODE_BOOTSTRAP;window.path=location.pathname;
const book={id:'story',title:'Story',authorName:'Author',price:199};
window.add=()=>useCartStore.getState().addItem(book);window.cart=()=>useCartStore.getState().items;
window.setAuth=state=>useAuthStore.setState(state);window.finishLogin=()=>window.navigate(mobileAuthDestination(location.search,'/browse'));
function App(){const[path,setPath]=useState(window.path);window.navigate=p=>{history.replaceState(null,'',p);window.path=location.pathname;setPath(window.path)};
const publicPage=['/login','/signup','/terms','/privacy'].includes(path);
return <Provider><Gate><Experience/><main><h1>{publicPage?path.slice(1):'App content'}</h1>{!publicPage&&<button onClick={()=>window.add()}>Add story</button>}{path==='/login'&&<a href={mobileAuthSwitchHref('/signup',location.search,'/signup')}>Sign up</a>}</main></Gate></Provider>}
createRoot(document.getElementById('root')).render(<App/>);
`},plugins:[{name:'boundaries',setup(b){
b.onResolve({filter:/^(next\/navigation|next\/link)$/},a=>({path:a.path,namespace:'framework'}));
b.onLoad({filter:/.*/,namespace:'framework'},()=>({loader:'jsx',resolveDir:process.cwd(),contents:`import React from 'react';const router={replace:p=>window.navigate(p)};export const useRouter=()=>router;export const usePathname=()=>window.path;export default function Link({href,children,...props}){return <a href={href} {...props} onClick={e=>{e.preventDefault();window.navigate(href)}}>{children}</a>}`}));
b.onResolve({filter:/^(firebase\/auth|@\/lib\/firebase\/(auth|config|session))$/},a=>({path:a.path,namespace:'firebase'}));
b.onLoad({filter:/.*/,namespace:'firebase'},a=>({resolveDir:process.cwd(),contents:a.path==='@/lib/firebase/config'?`export const auth={currentUser:null,signOut:async()=>{await window.emitAuth(null)}};`:`
import {auth} from '@/lib/firebase/config';
export const onAuthStateChanged=(_,callback)=>{window.emitAuth=async user=>{auth.currentUser=user;await callback(user)};return()=>{}};
export const getUserProfile=async uid=>({uid,role:'buyer',status:'active'});
export const clearAuthSession=async()=>{};export const setClientAuthHints=()=>{};export const syncAuthSession=async()=>true;
`}));
}}]});
// Bundle the exact early bootstrap separately for a before-hydration check.
const bootstrap=await build({bundle:true,write:false,platform:'node',format:'cjs',stdin:{resolveDir:process.cwd(),contents:`export {APP_MODE_BOOTSTRAP} from './lib/app/installed'`}});
const mod={exports:{}};new Function('module','exports',bootstrap.outputFiles[0].text)(mod,mod.exports);
const css=fs.readFileSync('app/app-appearance.css','utf8');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<html><head><script>'+mod.exports.APP_MODE_BOOTSTRAP+'</script><style>'+css+'</style></head><body><div id="root"><div data-mobile-access="pending"><h1>Initial protected content</h1></div></div><script src="/app.js"></script></body></html>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
try{for(const mode of ['browser','mobile-browser','standalone','ios','android']){
 const context=await browser.newContext({viewport:{width:mode==='browser'?1280:390,height:844}});
 await context.addInitScript(mode=>{if(mode==='ios')Object.defineProperty(navigator,'standalone',{value:true});if(mode==='android'&&location.pathname==='/browse')Object.defineProperty(document,'referrer',{value:'android-app://com.afrobs.app'});if(mode==='standalone'){const mm=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('display-mode')?{matches:true,addEventListener(){},removeEventListener(){}}:mm(q)}},mode);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const installed=!mode.includes('browser');
 await page.route('**/app.js',r=>r.abort());await page.goto(base+'/browse');
 assert.equal(await page.getByRole('heading',{name:'Initial protected content'}).isVisible(),!installed,'first paint '+mode);
 await page.unroute('**/app.js');await page.reload();await page.waitForFunction(()=>typeof window.emitAuth==='function');
 if(installed)assert.equal(await page.getByRole('heading',{name:'App content'}).count(),0);
 await page.evaluate(()=>window.emitAuth(null));
 if(!installed){await page.getByRole('heading',{name:'App content'}).waitFor();assert.equal(await page.evaluate(()=>window.add()),true);assert.equal(await page.evaluate(()=>window.cart().length),1);await page.evaluate(()=>window.navigate('/sample/story'));await page.getByRole('heading',{name:'App content'}).waitFor();console.log('PASS '+mode+' still permits guest browsing, previews and cart');}
 else{
 await page.getByRole('heading',{name:'login',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.add()),false);assert.equal(await page.evaluate(()=>window.cart().length),0);
 for(const path of ['/','/book/story','/read/story','/sample/story','/cart','/author/author','/about-help','/community','/dashboard']){await page.evaluate(p=>window.navigate(p),path);await page.getByRole('heading',{name:'login',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'App content'}).count(),0)}
 for(const path of ['/signup','/privacy','/terms']){await page.evaluate(p=>window.navigate(p),path);await page.getByRole('heading',{name:path.slice(1),exact:true}).waitFor()}
 await page.evaluate(()=>window.navigate('/read/story'));await page.getByRole('heading',{name:'login',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('appReturn'),'/read/story');
 const signup=new URL(await page.getByRole('link',{name:'Sign up'}).getAttribute('href'),base);assert.equal(signup.searchParams.get('appReturn'),'/read/story');
 await page.evaluate(()=>window.emitAuth({uid:'reader',getIdToken:async()=>'fixture'}));await page.evaluate(()=>window.finishLogin());await page.getByRole('heading',{name:'App content'}).waitFor();assert.equal(new URL(page.url()).pathname,'/read/story');assert.equal(await page.evaluate(()=>window.add()),true);assert.equal(await page.evaluate(()=>window.cart().length),1);
 await page.evaluate(()=>window.emitAuth(null));await page.getByRole('heading',{name:'login',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.cart().length),1,'sign-out preserves shared website cart');assert.equal(await page.evaluate(()=>window.add()),false);assert.equal(await page.evaluate(()=>window.cart().length),1);
 await page.evaluate(()=>window.navigate('/gifts/claim#token='+'a'.repeat(64)));await page.getByRole('heading',{name:'login',exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('afrobooks-gift-token')),'a'.repeat(64));assert.ok(!page.url().includes('aaaa'));
 await page.evaluate(()=>window.setAuth({loading:false,firebaseUser:null,userProfile:{uid:'forged',status:'active'}}));await page.evaluate(()=>window.navigate('/cart'));await page.getByRole('heading',{name:'login',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.add()),false);
 if(mode==='android'){await page.goto(base+'/login');await page.waitForFunction(()=>typeof window.emitAuth==='function');assert.equal(await page.locator('html').getAttribute('data-app-mode'),'installed')}
 console.log('PASS '+mode+' guest gate, first-paint protection, legal pages, authenticated cart, sign-out, deep links and gift links');
 }
 assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r))}}
main().catch(e=>{console.error(e);process.exitCode=1});
