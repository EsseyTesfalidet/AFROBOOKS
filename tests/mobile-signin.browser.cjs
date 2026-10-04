// Actual sign-in form, validation, shell and keyboard handler with fake auth.
// No account is created and no real sign-in request is sent.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {build}=require('esbuild');const http=require('node:http');const fs=require('node:fs');const assert=require('node:assert/strict');const postcss=require('postcss');
async function main(){
  const bundle=await build({bundle:true,write:false,outfile:'signin.js',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"test"','process.env.NEXT_PUBLIC_AUTH_PHONE_ENABLED':'"true"','process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED':'"true"'},stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Login from './components/auth/LoginForm';import Shell from './components/shared/MobileAppShell';
import Experience from './components/shared/AppExperience';import Keyboard from './components/shared/MobileKeyboard';
import {useAuthStore} from './store/authStore';
useAuthStore.setState({loading:false,userProfile:null,firebaseUser:null});window.loginCalls=0;window.smsCalls=0;window.verifyCalls=0;window.socialCalls=[];
createRoot(document.getElementById('root')).render(<><Keyboard/><Shell><Experience/><Login/></Shell></>);
`},plugins:[{name:'auth-boundaries',setup(b){
    b.onResolve({filter:/^(next\/navigation|next\/link|next\/image)$/},a=>({path:a.path,namespace:'framework'}));
    b.onLoad({filter:/.*/,namespace:'framework'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/image'?`import React from 'react';export default function Image({priority,fill,...p}){return <img {...p}/>} `:`import React from 'react';const router={replace:p=>{window.destination=p}};export const useRouter=()=>router;export const usePathname=()=>'/login';export default function Link({children,href,...p}){return <a href={href} {...p}>{children}</a>}`}));
    b.onResolve({filter:/^@\/lib\/firebase\/(auth|session|mobileAuth)$/},a=>({path:a.path,namespace:'auth'}));
    b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:`const user={uid:'reader',getIdToken:async()=>'fake-token'};export const logIn=async()=>{window.loginCalls++;throw Error('auth/invalid-credential')};export const logOut=async()=>{};export const signInWithGoogle=async()=>{throw Error('auth/network-request-failed')};export const getUserProfile=async()=>({uid:'reader',status:'active',role:'buyer',activeRole:'buyer'});export const clearAuthSession=async()=>{};export const setClientAuthHints=()=>{};export const syncAuthSession=async()=>true;export const createPhoneVerifier=()=>({clear(){}});export const sendPhoneCode=async number=>{window.smsCalls++;window.sentNumber=number;return {confirm:async code=>{window.verifyCalls++;if(code!=='123456')throw Error('auth/invalid-verification-code');return {user}}}};export const finishMobileIdentity=async()=>({isNewUser:false});export const mobileSocialSignIn=async provider=>{window.socialCalls.push(provider);return {user,isNewUser:false}};`}));
  }}]});
  const css=(await postcss([require('tailwindcss')({content:['components/auth/**/*.tsx','components/shared/**/*.tsx'],theme:require('../tailwind.config.js').theme})]).process(fs.readFileSync('app/globals.css','utf8'),{from:undefined})).css
    +fs.readFileSync('app/app-appearance.css','utf8')+fs.readFileSync('app/app-themes.css','utf8')+(bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'');
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(/^\/(fonts|brand)\/[\w.-]+$/.test(req.url)){if(req.url.endsWith('.svg'))res.setHeader('Content-Type','image/svg+xml');res.end(fs.readFileSync('public'+req.url))}else{res.setHeader('Content-Type','text/html');res.end('<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body><div id="root"></div><script src="/app.js"></script></body></html>')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
  try{for(const mode of ['browser','standalone','ios','android']){
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    await context.addInitScript(mode=>{if(mode==='ios')Object.defineProperty(navigator,'standalone',{value:true});if(mode==='android')Object.defineProperty(document,'referrer',{value:'android-app://com.afrobs.app'});if(mode==='standalone'){const mm=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('display-mode')?{matches:true,addEventListener(){},removeEventListener(){}}:mm(q)}},mode);
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/login?appReturn=%2Flibrary');await page.getByRole('heading',{name:'Welcome back'}).waitFor();await page.evaluate(()=>document.fonts.ready);
    const card=page.locator(mode==='browser'?'.app-login-card':'.signin-panel');const shell=page.locator('.mobile-app-viewport');
    if(mode==='browser'){
      assert.ok(await page.getByText('Saved library',{exact:true}).isVisible());
      assert.equal(await shell.evaluate(el=>getComputedStyle(el).display),'contents');
      await page.setViewportSize({width:320,height:568});await page.mouse.move(300,400);await page.mouse.wheel(0,400);await page.waitForFunction(()=>scrollY>100);
      console.log('PASS mobile website keeps its existing sign-in layout and document scrolling');
    }else{
      for(const size of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:412,height:915},{width:844,height:390},{width:568,height:320}]){
        await page.setViewportSize(size);
        await page.locator('.signin-panel').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});
        assert.ok(await card.evaluate(el=>el.scrollHeight<=el.clientHeight+1),mode+' sign-in fits '+JSON.stringify(size)+' '+await card.evaluate(el=>[el.scrollHeight,el.clientHeight]));
        for(const name of ['Email','Password']){const r=await page.getByLabel(name,{exact:true}).boundingBox();assert.ok(r.y>=0&&r.y+r.height<=size.height,name+' fits');}
        const signup=await page.getByRole('link',{name:'Sign up',exact:true}).boundingBox();assert.ok(signup.y>=0&&signup.y+signup.height<=size.height,'signup stays visible');
        await page.mouse.move(size.width-22,size.height/2);await page.mouse.wheel(0,500);assert.equal(await shell.evaluate(el=>el.scrollTop),0);assert.equal(await card.evaluate(el=>el.scrollTop),0);assert.equal(await page.evaluate(()=>scrollY),0);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
      await page.setViewportSize({width:320,height:568});
      // Submit bypasses native email bubbles so actual schema messages are exercised.
      await page.locator('form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      await page.getByText('Enter a valid email',{exact:true}).waitFor();await page.getByText('Password must be at least 6 characters',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.loginCalls),0);
      assert.equal(await page.getByLabel('Email',{exact:true}).getAttribute('aria-invalid'),'true');
      assert.ok(await card.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'field errors fit on small portrait screen '+await card.evaluate(el=>[el.scrollHeight,el.clientHeight]));
      await page.getByLabel('Email',{exact:true}).fill('reader@example.com');await page.getByLabel('Password',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Incorrect email or password.'}).waitFor();assert.equal(await page.evaluate(()=>window.loginCalls),1);
      assert.ok(await card.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'credential error fits');
      await page.getByRole('button',{name:'Show password'}).click();assert.equal(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');
      assert.equal(new URL(await page.getByRole('link',{name:'Sign up',exact:true}).getAttribute('href'),base).searchParams.get('appReturn'),'/library');
      await page.setViewportSize({width:390,height:844});await page.getByLabel('Password',{exact:true}).focus();
      await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:300});visualViewport.dispatchEvent(new Event('resize'))});
      await page.waitForFunction(()=>document.documentElement.dataset.keyboardOpen==='true');
      await page.waitForFunction(()=>{const r=document.getElementById('password').getBoundingClientRect();return r.top>=0&&r.bottom<=300});
      await page.getByRole('button',{name:'Continue',exact:true}).scrollIntoViewIfNeeded();
      const submit=await page.getByRole('button',{name:'Continue',exact:true}).boundingBox();assert.ok(submit.y>=0&&submit.y+submit.height<=300,'keyboard leaves submit reachable');assert.equal(await shell.evaluate(el=>el.scrollTop),0);
      await page.evaluate(()=>{document.activeElement.blur();delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'))});await page.waitForFunction(()=>document.documentElement.dataset.keyboardOpen!=='true');
      await card.evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
      if(process.env.SCREENSHOT_DIR&&mode==='standalone'){await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:process.env.SCREENSHOT_DIR+'/signin-fixed.png',animations:'disabled'});}
      await page.addStyleTag({content:'.mobile-signin :is(input,p,label,button,a,h1){font-size:24px!important;line-height:1.5!important}'});
      await page.setViewportSize({width:320,height:568});await page.getByRole('link',{name:'Sign up',exact:true}).scrollIntoViewIfNeeded();
      const end=await page.getByRole('link',{name:'Sign up',exact:true}).boundingBox();assert.ok(end.y>=0&&end.y+end.height<=568,'enlarged text remains reachable');assert.equal(await page.evaluate(()=>scrollY),0);
      console.log('PASS '+mode+' stationary sign-in, six portrait/landscape sizes, validation, password reveal, return links, keyboard and enlarged text');
      await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor();await page.setViewportSize({width:390,height:844});
      await page.getByRole('button',{name:'Phone',exact:true}).click();
      assert.deepEqual(await page.getByLabel('Country code',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>o.value)),['GH','NG','US']);
      await page.getByLabel('Phone number',{exact:true}).fill('+2917123456');await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Please use email or Google for other countries.'}).waitFor();assert.equal(await page.evaluate(()=>window.smsCalls),0);
      await page.getByLabel('Country code',{exact:true}).selectOption('NG');
      await page.getByLabel('Phone number',{exact:true}).fill('08031234567');await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.getByRole('heading',{name:'Check your phone'}).waitFor();assert.equal(await page.evaluate(()=>window.sentNumber),'+2348031234567');
      assert.ok(await page.getByRole('button',{name:/Resend in/}).isDisabled());
      await page.getByLabel('Digit 1',{exact:true}).fill('1');await page.getByLabel('Digit 2',{exact:true}).fill('2');
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Digit 3');
      await page.getByLabel('Digit 3',{exact:true}).press('Backspace');assert.equal(await page.getByLabel('Digit 2',{exact:true}).inputValue(),'');
      await page.getByLabel('Digit 1',{exact:true}).fill('000000');await page.getByRole('alert').filter({hasText:'That code is incorrect.'}).waitFor();
      assert.equal(await page.evaluate(()=>window.verifyCalls),1);assert.equal(await page.getByLabel('Digit 1',{exact:true}).inputValue(),'');
      await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+31000});await page.getByRole('button',{name:'Resend code',exact:true}).waitFor();
      await page.getByRole('button',{name:'Resend code',exact:true}).click();assert.equal(await page.evaluate(()=>window.smsCalls),2);
      if(process.env.SCREENSHOT_DIR&&mode==='standalone')await page.screenshot({path:process.env.SCREENSHOT_DIR+'/signin-code.png',animations:'disabled'});
      await page.getByLabel('Digit 1',{exact:true}).evaluate(el=>{const data=new DataTransfer();data.setData('text','123456');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:data}))});
      await page.getByRole('status').filter({hasText:'You’re in.'}).waitFor();await page.waitForFunction(()=>window.destination==='/library');
      assert.equal(await page.evaluate(()=>window.verifyCalls),2);
      await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor();await page.getByRole('button',{name:'Continue with Apple',exact:true}).click();await page.waitForFunction(()=>window.destination==='/library');assert.deepEqual(await page.evaluate(()=>window.socialCalls),['apple']);
      await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor();await page.getByRole('button',{name:'Continue with Google',exact:true}).click();await page.waitForFunction(()=>window.destination==='/library');assert.deepEqual(await page.evaluate(()=>window.socialCalls),['google']);
      await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor();await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.signin-brand').evaluate(el=>getComputedStyle(el).animationName),'none');
      console.log('PASS '+mode+' phone country selection, auto-advance/backspace/paste, failed code retry, cooldown/resend, success navigation, social providers and reduced motion (mocked providers)');
    }
    assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
