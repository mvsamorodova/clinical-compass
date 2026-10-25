import assert from 'node:assert/strict';
import {cachedFiles} from '../lib/cache-files.ts';
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
