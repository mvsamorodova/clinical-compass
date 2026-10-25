import manifest from './gigaam-model-manifest.json';
import {HealthError} from './health-api';
const version='gigaam-emo-8fad2a2c';
async function limited(stream:ReadableStream<Uint8Array>|null,max:number){
 if(!stream)throw new HealthError(400,'Нет файла');const reader=stream.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw new HealthError(413,'Файл слишком большой');}parts.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;
}
export async function modelAssetsApi(req:Request,path:string[],bucket:R2Bucket,key?:string):Promise<Response|null>{
 if(path[0]!=='model-assets')return null;
 const name=path[2],chunk=manifest.chunks.find(c=>c.url.endsWith('/'+name));
 if(path.length!==3||path[1]!==version||!chunk)throw new HealthError(404,'Файл модели не найден');
 if(!bucket)throw new HealthError(503,'Хранилище модели недоступно');
 const objectKey=`models/${version}/${name}`;
 if(req.method==='GET'){
  const object=await bucket.get(objectKey);if(!object||object.size!==chunk.bytes||object.customMetadata?.sha256!==chunk.sha256)throw new HealthError(503,'Модель пока подготавливается. Попробуйте позже.');
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
 }
 if(req.method!=='PUT'||!key||req.headers.get('X-Model-Upload-Key')!==key)throw new HealthError(403,'Загрузка модели недоступна');
 const compressed=req.headers.get('X-Model-Encoding')==='gzip';
 const input=await limited(req.body,chunk.bytes+1024);
 const bytes=compressed?await limited(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')),chunk.bytes):input;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==chunk.bytes||hash!==chunk.sha256)throw new HealthError(400,'Файл не соответствует проверенной версии модели');
 const existing=await bucket.head(objectKey);
 if(!existing)await bucket.put(objectKey,bytes,{customMetadata:{sha256:hash},httpMetadata:{contentType:'application/octet-stream',cacheControl:'public, max-age=31536000, immutable'}});
 else if(existing.size!==chunk.bytes||existing.customMetadata?.sha256!==hash)throw new HealthError(409,'В хранилище другая версия файла');
 return Response.json({ok:true,sha256:hash},{headers:{'Cache-Control':'no-store'}});
}
