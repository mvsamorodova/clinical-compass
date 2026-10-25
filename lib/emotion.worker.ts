import * as ort from 'onnxruntime-web';
import type {InferenceSession} from 'onnxruntime-common';
import {gigaamFeatures} from './gigaam-features';
import {EMOTION_LABELS,type EmotionScores} from './voice-model';
import manifest from './gigaam-model-manifest.json';
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('/speech-runtime/',self.location.origin).href;
let model:InferenceSession|null=null,busy=false;
async function weights(){
 let cache:Cache|null=null;try{cache=await caches.open('compass-gigaam-emo-8fad2a2c');}catch{/* Caching is optional. */}
 const bytes=new Uint8Array(manifest.bytes);let offset=0;
 for(const chunk of manifest.chunks){
  const url=new URL(chunk.url,self.location.origin).href;
  let response=await cache?.match(url);const cached=!!response;
  if(!response){response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('Не удалось скачать GigaAM-Emo. Проверьте соединение.');}
  const part=new Uint8Array(await response.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',part))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(part.length!==chunk.bytes||hash!==chunk.sha256){await cache?.delete(url);throw Error('Проверка файла модели не пройдена. Повторите загрузку.');}
  bytes.set(part,offset);offset+=part.length;
  if(!cached)try{await cache?.put(url,new Response(part,{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* No free cache space: continue without caching. */}
  self.postMessage({type:'progress',progress:Math.floor(offset/bytes.length*100),label:cached?'Читаем модель из кэша':'Скачиваем GigaAM-Emo'});
 }
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.sha256)throw Error('Проверка модели не пройдена');
 return bytes;
}
self.onmessage=async(e:MessageEvent)=>{
 if(busy)return;busy=true;
 try{
  if(e.data.type==='load'){
   const bytes=await weights();self.postMessage({type:'progress',progress:100,label:'Подготавливаем модель на устройстве'});
   model=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
   if(model.inputNames.join()!=='features,feature_lengths'||model.outputNames.join()!=='probs')throw Error('Неожиданная структура модели');
   self.postMessage({type:'ready'});
  }else if(e.data.type==='analyze'){
   if(!model)throw Error('Сначала загрузите GigaAM-Emo');const pcm=e.data.audio;
   if(!(pcm instanceof Float32Array)||pcm.length<3200||pcm.length>65*16000||pcm.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Неподдерживаемая запись');
   const scores=Object.fromEntries(EMOTION_LABELS.map(k=>[k,0])) as EmotionScores;const segments=Math.ceil(pcm.length/160000);
   for(let i=0;i<segments;i++){
    const audio=pcm.subarray(Math.floor(i*pcm.length/segments),Math.floor((i+1)*pcm.length/segments));
    const {data,frames}=await gigaamFeatures(audio);
    const result=await model.run({features:new ort.Tensor('float32',data,[1,64,frames]),feature_lengths:new ort.Tensor('int64',BigInt64Array.from([BigInt(frames)]),[1])});
    const probs=result.probs.data;let sum=0;for(let j=0;j<4;j++){const p=Number(probs[j]);if(!Number.isFinite(p)||p<0||p>1)throw Error('Некорректный выход модели');scores[EMOTION_LABELS[j]]+=p*audio.length/pcm.length;sum+=p;}if(Math.abs(sum-1)>.001)throw Error('Некорректная сумма оценок');
    for(const value of Object.values(result))value.dispose();self.postMessage({type:'analyzing',completed:i+1,total:segments});
   }
   self.postMessage({type:'result',scores,segments});
  }
 }catch(e){self.postMessage({type:'error',message:e instanceof Error?e.message:'Не удалось выполнить анализ'});}
 finally{busy=false;}
};
