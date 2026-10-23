// Real public components and app gate; synthetic catalog/auth/media boundaries.
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {build} = require('esbuild');
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');

async function main() {
  const book = {id:'book',kind:'book',title:'ታሪኽ — A story',creator:'An author',description:'A story about home.\n\nAnother paragraph.',language:'Tigrinya',category:'History',format:'Book',image:'',href:'/african-books/book',publishedAt:'2026-10-01T00:00:00.000Z',hasTrailer:false,durationSeconds:0};
  const audio = {...book,id:'71bac968-f967-4e9b-9c1e-4d2ced07850f',kind:'audio',title:'An audio story',format:'Audiobooks',category:'Audiobooks',href:'/african-audio/audio',hasTrailer:true};
  const film = {...book,id:'film',kind:'video',title:'A documentary',format:'Documentaries',category:'Documentaries',href:'/african-films/film'};
  const fixtures = {book,audio,film};
  const bundle = await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Home from './app/page';import {PublicDiscovery,PublicRelease} from './components/discovery/PublicDiscovery';
    import Gate from './components/auth/MobileAccessGate';import {useAuthStore} from './store/authStore';
    const {book,audio,film}=${JSON.stringify(fixtures)};
    window.installed=new URLSearchParams(location.search).has('installed');window.changeAuth=profile=>useAuthStore.setState({userProfile:profile,firebaseUser:profile?{uid:'reader'}:null,loading:false});
    async function start(){const view=new URLSearchParams(location.search).get('view');const content=view==='book'?<PublicRelease item={book} related={[{...book,id:'related',title:'Related book',href:'/african-books/related'}]} bookSample={{title:'Sample chapter',text:'ትግርኛ paragraph.\\n\\nSecond paragraph.'}} action={{href:'/book/book',label:'View full book details'}}/>:view==='audio'?<PublicRelease item={audio} action={{href:'/listen?title='+audio.id,label:'Open Listen in the app'}}/>:view==='no-preview'?<PublicRelease item={{...audio,hasTrailer:false}} action={{href:'/listen',label:'Open Listen in the app'}}/>:view==='collection'?<PublicDiscovery path='/african-books' title='African books' description='Find a story.' sections={[{title:'Published books',items:[book]}]}/>:await Home();createRoot(document.getElementById('root')).render(<Gate>{content}</Gate>);}
    start();
  `},plugins:[{name:'public-fixtures',setup(builder){
    builder.onResolve({filter:/^next\/(link|image|navigation)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onResolve({filter:/^@\/lib\/server\/discoveryPages$/},()=>({path:'catalog',namespace:'fixture'}));
    builder.onResolve({filter:/^@\/hooks\/useInstalledApp$/},()=>({path:'installed',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),loader:'jsx',contents:path==='next/link'?`import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`:path==='next/image'?`import React from 'react';export default function Image({fill,priority,unoptimized,quality,sizes,...props}){return <img {...props} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{}}/>}`:path==='next/navigation'?`const router={replace:path=>window.lastNavigation=path};export const useRouter=()=>router;export const usePathname=()=>'/';`:path==='installed'?`export const useInstalledApp=()=>window.installed;`:`const items=${JSON.stringify(fixtures)};export const getPublicDiscoveryItems=async kind=>[items[kind==='book'?'book':kind==='video'?'film':'audio']];`}));
  }}]});
  const css = (await require('postcss')([require('tailwindcss')]).process(fs.readFileSync('app/globals.css','utf8').replace(/^@import.*$/gm,''),{from:'app/globals.css'})).css;
  const {Mp3Encoder} = await import('@breezystack/lamejs'); const encoder = new Mp3Encoder(1,22050,128),chunks=[];
  for(let start=0;start<44100;start+=1152)chunks.push(Buffer.from(encoder.encodeBuffer(Int16Array.from({length:Math.min(1152,44100-start)},(_,i)=>Math.round(Math.sin((start+i)*440*Math.PI*2/22050)*5000)))));
  chunks.push(Buffer.from(encoder.flush())); const recording=Buffer.concat(chunks);
  let previewRequests=0,failPreview=false;
  const server=http.createServer((request,response)=>{
    if(request.url==='/app.js'){response.setHeader('Content-Type','application/javascript');return response.end(bundle.outputFiles[0].text);}
    if(request.url.startsWith('/api/audio/public-preview')){previewRequests++;response.writeHead(failPreview?503:302,failPreview?{}:{Location:'/fixture.mp3'});return response.end();}
    if(request.url==='/fixture.mp3'){response.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':recording.length});return response.end(recording);}
    if(request.url.startsWith('/brand/')){response.setHeader('Content-Type','image/svg+xml');return response.end(fs.readFileSync('public/brand/afrobooks-mark.svg'));}
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.EDGE_PATH?{executablePath:process.env.EDGE_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.getByRole('heading',{level:1,name:'African Books, Films, Music & Stories.'}).waitFor();
    assert.equal(await page.evaluate(()=>document.querySelectorAll('article').length),3,'homepage renders real shelves while auth remains pending');
    assert.equal(await page.getByRole('link',{name:/Tigrinya Books & Stories/}).count(),1);
    assert.equal(await page.getByRole('link',{name:/African Documentaries/}).count(),1);
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`home fits ${width}px`);}
    await page.evaluate(()=>window.changeAuth(null));await page.getByRole('heading',{level:1}).waitFor();
    await page.evaluate(()=>window.changeAuth({uid:'reader',role:'buyer',status:'active'}));await page.getByRole('status').filter({hasText:'Opening your account'}).waitFor();assert.equal(await page.evaluate(()=>window.lastNavigation),'/browse');
    await page.goto(base+'?installed');await page.getByText('Opening your account…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{level:1}).count(),0,'installed app never exposes landing content before sign-in');
    await page.evaluate(()=>window.changeAuth(null));await page.getByText('Sign in to continue to AfroNarra.').waitFor();assert.equal(await page.evaluate(()=>window.lastNavigation),'/login');
    await page.goto(base+'?view=book');await page.getByRole('heading',{name:'Sample chapter'}).waitFor();assert.equal(await page.getByRole('link',{name:'Read a free sample',exact:true}).getAttribute('href'),'#book-sample');
    for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`release fits ${width}px`);}
    const breadcrumbs=await page.locator('script[type="application/ld+json"]').allTextContents();assert.ok(breadcrumbs.some(value=>JSON.parse(value)['@type']==='BreadcrumbList'));
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy caption & link'}).click();await page.getByRole('status').filter({hasText:'Caption and link copied.'}).waitFor();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/https:\/\/afrobs.com\/african-books\/book/);
    await page.goto(base+'?view=audio');await page.getByRole('heading',{name:'Listen to a free sample'}).waitFor();assert.equal(previewRequests,0,'audio does not fetch or autoplay until requested');
    await page.getByRole('heading',{level:1}).click();await page.locator('audio').evaluate(element=>element.play());await page.waitForFunction(()=>document.querySelector('audio').currentTime>.05);await page.locator('audio').evaluate(element=>element.pause());assert.equal(previewRequests,1);
    failPreview=true;await page.goto(base+'?view=audio');await page.getByRole('heading',{level:1}).click();await page.locator('audio').evaluate(element=>element.play().catch(()=>{}));await page.getByRole('button',{name:'Retry sample'}).waitFor();failPreview=false;await page.getByRole('button',{name:'Retry sample'}).click();await page.locator('audio').evaluate(element=>element.play());await page.waitForFunction(()=>document.querySelector('audio').currentTime>.05);
    await page.goto(base+'?view=no-preview');await page.getByRole('heading',{level:1}).waitFor();assert.equal(await page.locator('audio').count(),0);assert.equal(await page.getByRole('link',{name:'Hear a free sample'}).count(),0);
    await page.goto(base+'?view=collection');await page.getByRole('link',{name:/Tigrinya Books & Stories/}).waitFor();assert.deepEqual(errors,[]);
    console.log('PASS public landing during pending auth, installed-app protection, responsive layouts, release samples/breadcrumbs/related links, sharing, explicit sample playback, error recovery and unavailable-preview handling.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
