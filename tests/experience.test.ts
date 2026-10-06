import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferLanguages } from '../lib/utils/languagePreference';
import { sleepReached } from '../lib/audio/sleep';
import { useAudioStore } from '../store/audioStore';

test('language preference ranks matches without hiding other languages or mutating catalog order',()=>{
  const items=[{id:1,language:'English'},{id:2,language:'ትግርኛ'},{id:3,language:'Swahili'},{id:4,language:'Tigrina'}];
  assert.deepEqual(preferLanguages(items,['Tigrinya'],item=>item.language).map(item=>item.id),[2,4,1,3]);
  assert.deepEqual(items.map(item=>item.id),[1,2,3,4]);assert.equal(preferLanguages(items,[],item=>item.language),items);
});
test('sleep deadline uses wall clock, chapter timer applies only to the selected title',()=>{
  assert.equal(sleepReached({mode:'time',deadline:1000},'a',1,999),false);
  assert.equal(sleepReached({mode:'time',deadline:1000},'a',1,1001),true);
  assert.equal(sleepReached({mode:'chapter',titleId:'a',position:40},'a',39),false);
  assert.equal(sleepReached({mode:'chapter',titleId:'a',position:40},'a',40),true);
  assert.equal(sleepReached({mode:'chapter',titleId:'a',position:40},'b',50),false);
});
test('queue prioritizes Play next, supports reorder/removal and clears across accounts',()=>{
  const store=useAudioStore.getState();store.close();
  store.enqueue({id:'a',title:'A',creator:'Creator'},'reader');store.enqueue({id:'b',title:'B',creator:'Creator'},'reader');
  store.enqueue({id:'b',title:'B',creator:'Creator'},'reader',true);
  assert.deepEqual(useAudioStore.getState().queue.map(item=>item.id),['b','a']);
  store.moveQueued(0,1);assert.deepEqual(useAudioStore.getState().queue.map(item=>item.id),['a','b']);
  store.removeQueued(0);assert.equal(useAudioStore.getState().queue[0].id,'b');
  store.setSleep({mode:'time',deadline:1000});store.setPreviousTitle({id:'old',title:'Old title',creator:'Creator',seconds:20});store.enqueue({id:'c',title:'C',creator:'Creator'},'another');
  assert.deepEqual(useAudioStore.getState().queue.map(item=>item.id),['c']);assert.equal(useAudioStore.getState().sleep,null);assert.equal(useAudioStore.getState().previousTitle,null);store.close();
  assert.equal(useAudioStore.getState().queue.length,0);
});
