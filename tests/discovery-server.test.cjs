const {test} = require('node:test');
const assert = require('node:assert/strict');
const {build} = require('esbuild');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const path = require('node:path');

test('public sample loaders reject private records and sign only the generated preview', async () => {
  let book = {status:'live'}, chapters = [{isPreview:false,chapterNumber:0,content:'PAID CONTENT'}, {isPreview:true,chapterNumber:1,title:'Public chapter',content:'<p>Public sample</p>'}];
  const id = '71bac968-f967-4e9b-9c1e-4d2ced07850f';
  let audio = {id,creatorId:'creator',status:'published',ready:true,previewReady:true,previewVersion:'version',previewSeconds:60};
  const queries = [], signedPaths = [];
  const db = {doc(key) {
    if(key.startsWith('books/')) return {get:async()=>({exists:!!book,data:()=>book,ref:{collection(name){
      assert.equal(name,'chapters'); return {where(field,op,value){queries.push([field,op,value]);return {limit(){return {get:async()=>({docs:chapters.filter(chapter=>chapter[field]===value).map(chapter=>({data:()=>chapter}))})}}}}};
    }}})};
    assert.equal(key,`audioTitles/${id}`); return {get:async()=>({exists:!!audio,id,data:()=>audio})};
  }};
  const fixture = {getAdminDb:async()=>db,getAdminBucket:async()=>({file(asset){signedPaths.push(asset);return {getSignedUrl:async()=>['https://storage.example.test/generated-sample']}}})};
  const bundle = await build({bundle:true,write:false,platform:'node',format:'cjs',packages:'external',stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export { getPublicBookSample } from './lib/server/discoveryPages'; export { getPublicAudioSampleUrl } from './lib/server/publicAudioSample';`},plugins:[{name:'admin-boundary',setup(builder){
    builder.onResolve({filter:/^@\/lib\/firebase\/admin$/},()=>({path:'admin',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getAdminDb=()=>globalThis.fixture.getAdminDb();export const getAdminBucket=()=>globalThis.fixture.getAdminBucket();',loader:'js'}));
  }}]});
  const loadedModule = {exports:{}};
  const context = {module:loadedModule,exports:loadedModule.exports,require:createRequire(path.join(process.cwd(),'package.json')),fixture,console,Buffer,process,URL,TextEncoder,TextDecoder,setTimeout,clearTimeout};
  vm.runInNewContext(bundle.outputFiles[0].text,context);
  const {getPublicBookSample,getPublicAudioSampleUrl} = loadedModule.exports;
  const sample = await getPublicBookSample('published-book');
  assert.equal(sample.text,'Public sample'); assert.doesNotMatch(sample.text,/PAID/);
  assert.deepEqual(queries,[['isPreview','==',true]]);
  for(const fields of [{status:'draft'},{status:'live',deletionPending:true},{status:'live',contentFormat:'pdf'},{status:'live',isPreorder:true}]) {
    book=fields; assert.equal(await getPublicBookSample('published-book'),null);
  }
  assert.equal(queries.length,1,'private and unreleased books never query chapters');
  assert.equal(await getPublicBookSample('../private'),null);
  assert.equal(await getPublicAudioSampleUrl(id),'https://storage.example.test/generated-sample');
  assert.deepEqual(signedPaths,[`audio/creator/${id}/preview-version.mp3`]);
  for(const fields of [{status:'removed'},{status:'draft'},{ready:false},{previewReady:false},{previewVersion:'../playback'},{previewSeconds:65}]){
    audio={id,creatorId:'creator',status:'published',ready:true,previewReady:true,previewVersion:'version',previewSeconds:60,...fields};
    assert.equal(await getPublicAudioSampleUrl(id),null);
  }
  assert.equal(signedPaths.length,1,'unpublished and malformed records never receive a signature');
  await assert.rejects(getPublicAudioSampleUrl('../private'));
});
