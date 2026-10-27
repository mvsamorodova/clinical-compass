import assert from 'node:assert/strict';
import {cachedFiles} from '../lib/cache-files.ts';
import {createModelCacheState} from '../lib/model-cache-state.ts';
let entries=new Map(),opens=0;const urls=['https://models.example/encoder-v1','https://models.example/decoder-v1'];
const freshStorage=()=>({has:async name=>name==='model-v1',open:async()=>{opens++;return {match:async url=>entries.has(url)?new Response(entries.get(url),{status:200}):undefined};}});
globalThis.caches=freshStorage();
assert.equal(await cachedFiles('model-v1',urls),false);
entries.set(urls[0],'public model bytes A');assert.equal(await cachedFiles('model-v1',urls),false);
entries.set(urls[1],'public model bytes B');assert.equal(await cachedFiles('model-v1',urls),true);
// A fresh page/storage object still reads the persisted artifacts. No network or account-specific flags.
globalThis.caches=freshStorage();assert.equal(await cachedFiles('model-v1',urls),true);
assert.equal(await cachedFiles('model-v2',urls),false);assert.equal(await cachedFiles('model-v1',[...urls,'https://models.example/new-version']),false);
entries.delete(urls[0]);assert.equal(await cachedFiles('model-v1',urls),false);
globalThis.caches={has:async()=>{throw Error('storage denied');}};assert.equal(await cachedFiles('model-v1',urls),false);
delete globalThis.caches;assert.equal(await cachedFiles('model-v1',urls),false);assert.ok(opens>=5);
console.log('PASS: model cache detects complete/partial downloads, fresh-page reuse, evicted files, changed versions and denied/unavailable storage without network.');

// Several mounted fields share one probe and immediately receive the same state.
let calls=0,filesPresent=false,changesA=0,changesB=0;
const state=createModelCacheState(async()=>{calls++;return filesPresent;});
assert.equal(state.getSnapshot(),null);
const offA=state.subscribe(()=>changesA++),offB=state.subscribe(()=>changesB++);
await Promise.all([state.refresh(),state.refresh(),state.refresh()]);
assert.equal(calls,1);assert.equal(state.getSnapshot(),false);
filesPresent=true;
await Promise.all([state.invalidate(),state.invalidate(),state.invalidate()]);
assert.equal(calls,2);assert.equal(state.getSnapshot(),true);assert.equal(changesA,2);assert.equal(changesB,2);
offA();offB();
// Reopening another question reads a true snapshot without a false download flash.
assert.equal(state.getSnapshot(),true);assert.equal(await state.refresh(),true);
filesPresent=false;await state.refresh();assert.equal(state.getSnapshot(),false);
const broken=createModelCacheState(async()=>{throw Error('storage unavailable')});
assert.equal(await broken.refresh(),false);
// A pre-download probe finishing late must not overwrite the completed download.
const resolvers=[];
const racing=createModelCacheState(()=>new Promise(resolve=>resolvers.push(resolve)));
const older=racing.refresh();await Promise.resolve();
const newer=racing.invalidate();await Promise.resolve();await Promise.resolve();
resolvers[1](true);await newer;resolvers[0](false);await older;
assert.equal(racing.getSnapshot(),true);
console.log('PASS: shared cache probes, field remounts, completed downloads, event coalescing, eviction, denied storage and late-probe races.');
