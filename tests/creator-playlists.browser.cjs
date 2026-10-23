// Real creator editor and audience shelves; account and API boundaries use
// synthetic records. No production publications or accounts are changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');

async function main() {
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Studio from './components/experience/CreatorPlaylistsStudio';import {CreatorPlaylists} from './components/experience/MediaShelves';import {useAuthStore} from './store/authStore';
    window.setAccount=uid=>useAuthStore.setState({firebaseUser:{uid},loading:false});window.setAccount('author');
    createRoot(document.getElementById('root')).render(location.search.includes('viewer')?<CreatorPlaylists creatorId="author"/>:<Studio/>);
  ` }, plugins: [{ name: 'playlist-fixtures', setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\/hooks\/useInstalledApp$/ }, () => ({ path: 'installed', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\/components\/watch\/WatchUI$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\/lib\/firebase\/request$/ }, () => ({ path: 'request', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path}) => ({ loader: 'jsx', resolveDir: process.cwd(), contents: path === 'link' ? `import React from 'react';export default function Link(props){return <a {...props}/>}` : path === 'installed' ? 'export const useInstalledApp=()=>true;' : path === 'request' ? `
      import {useAuthStore} from '@/store/authStore';async function call(path,options={}){const response=await fetch(path,{...options,headers:{...options.headers,'X-Fixture-Uid':useAuthStore.getState().firebaseUser?.uid||''}});const value=await response.json();if(!response.ok)throw Error(value.error);return value}export const authenticatedGet=path=>call(path);export const authenticatedPost=(path,data)=>call(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    ` : `
      import {useEffect,useState} from 'react';import {authenticatedGet} from '@/lib/firebase/request';import {useAuthStore} from '@/store/authStore';
      export function useWatchResource(path){const uid=useAuthStore(state=>state.firebaseUser?.uid);const [attempt,setAttempt]=useState(0),[data,setData]=useState(null);useEffect(()=>{let active=true;authenticatedGet(path).then(value=>{if(active)setData(value)});return()=>{active=false}},[path,uid,attempt]);return{data,error:'',loading:!data,retry:()=>setAttempt(value=>value+1)}}
    ` }));
  } }] });
  const css = (await require('postcss')([require('tailwindcss')]).process(fs.readFileSync('app/globals.css', 'utf8').replace(/^@import.*$/gm, ''), {from:'app/globals.css'})).css + fs.readFileSync('components/experience/experience.css','utf8');
  const server = http.createServer((request, response) => {
    if (request.url === '/app.js') { response.setHeader('Content-Type','application/javascript'); return response.end(bundle.outputFiles[0].text); }
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#10100f;color:#f5f2eb;font:16px Arial}'+css+'</style><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const media=[{kind:'book',id:'book',title:'Book from home',href:'/book/book'},{kind:'video',id:'film',title:'Film from home',href:'/watch/film'},{kind:'audio',id:'audio',title:'Audio from home',href:'/listen?title=audio'}].map(item=>({...item,creator:'Test Author',language:'Tigrinya',cover:''}));
    let playlists=[];let failSave=false;
    const view=value=>({...value,items:value.items.map(ref=>media.find(item=>item.kind===ref.kind&&item.id===ref.id)).filter(Boolean)});
    await page.route('**/api/experience**',async route=>{
      const request=route.request(),url=new URL(request.url()),uid=request.headers()['x-fixture-uid'];
      if(request.method()==='POST'){
        if(failSave)return route.fulfill({status:503,json:{error:'Please retry saving this playlist.'}});
        const {action,data}=request.postDataJSON();
        if(action==='creator_playlist')playlists=[...playlists.filter(item=>item.id!==data.id),{...data,creatorId:uid,updatedAt:Date.now()}];
        else playlists=playlists.filter(item=>item.id!==data.id);
        return route.fulfill({json:{ok:true}});
      }
      return route.fulfill({json:url.searchParams.get('view')==='creator_catalog'?{items:media.filter(item=>item.kind===url.searchParams.get('kind')),next:null}:{playlists:playlists.filter(item=>item.creatorId===uid).map(view)}});
    });
    await page.route('**/api/creators/author/playlists',route=>route.fulfill({json:{playlists:playlists.filter(item=>item.published).map(view)}}));
    await page.goto(base);await page.getByRole('button',{name:'Create playlist'}).click();
    await page.getByLabel('Playlist title').fill('Stories together');await page.getByLabel('Description',{exact:true}).fill('Read, watch, and listen.');
    await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft · 0 titles',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('.experience-row').filter({hasText:'Book from home'}).getByRole('button',{name:'Add',exact:true}).click();
    await page.getByRole('button',{name:'Videos',exact:true}).click();await page.locator('.experience-row').filter({hasText:'Film from home'}).getByRole('button',{name:'Add',exact:true}).click();
    await page.getByRole('button',{name:'Audio',exact:true}).click();await page.locator('.experience-row').filter({hasText:'Audio from home'}).getByRole('button',{name:'Add',exact:true}).click();
    await page.getByRole('button',{name:'Move title 3 up',exact:true}).click();
    assert.deepEqual(await page.locator('.experience-row:has(button[aria-label^="Move title"]) strong').allTextContents(),['Book from home','Audio from home','Film from home']);
    failSave=true;await page.getByRole('button',{name:'Publish playlist',exact:true}).click();await page.getByRole('alert').filter({hasText:'Please retry'}).waitFor();assert.equal(await page.getByLabel('Playlist title').inputValue(),'Stories together');
    failSave=false;await page.getByRole('button',{name:'Publish playlist',exact:true}).click();await page.getByText('Published · 3 titles',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile editor fits the screen');
    await page.goto(base+'?viewer');await page.getByRole('heading',{name:'Playlists & series'}).waitFor();await page.locator('summary').click();
    assert.deepEqual(await page.locator('.experience-card').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),['/book/book','/listen?title=audio','/watch/film']);
    await page.screenshot({path:'.vercel/creator-playlists-mobile.png',fullPage:true});
    await page.goto(base);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Save draft / Unpublish'}).click();await page.getByText('Draft · 3 titles',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Playlist title').fill('Private unfinished edit');await page.evaluate(()=>window.setAccount('another-author'));await page.getByRole('button',{name:'Create playlist'}).waitFor();assert.equal(await page.getByLabel('Playlist title').count(),0,'account switch clears the previous creator’s draft');
    await page.goto(base+'?viewer');await page.waitForTimeout(250);assert.equal(await page.getByRole('heading',{name:'Playlists & series'}).count(),0,'unpublished playlists disappear from the audience page');
    await page.goto(base);await page.getByRole('button',{name:'Delete',exact:true}).waitFor();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('heading',{name:'Give your releases a home'}).waitFor();
    await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'desktop editor fits the screen');assert.deepEqual(errors,[]);
    console.log('PASS empty drafts, mixed media selection/order, failed-save recovery, publish/audience links, unpublish, account isolation, deletion, and mobile/desktop width.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
