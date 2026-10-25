import manifest from './gigaam-model-manifest.json';
import {HealthError} from './health-api';
const version='gigaam-emo-8fad2a2c';
// v4 has independent storage. The original model is public, immutable and
// pinned by hash; only these allowlisted assets may use the shared origin.
const modelOrigin='https://clinical-compass-v3.feyzebra.chatgpt.site';
export async function modelAssetsApi(req:Request,path:string[],bucket:R2Bucket):Promise<Response|null>{
 if(path[0]!=='model-assets')return null;
 // Runtime access is read-only. Model assets are provisioned separately.
 if(req.method!=='GET')throw new HealthError(405,'Файлы модели доступны только для чтения');
 const name=path[2],chunk=manifest.chunks.find(c=>c.url.endsWith('/'+name));
 if(path.length!==3||path[1]!==version||!chunk)throw new HealthError(404,'Файл модели не найден');
 const object=bucket?await bucket.get(`models/${version}/${name}`):null;
 let body:ReadableStream|ArrayBuffer;
 if(object&&object.size===chunk.bytes&&object.customMetadata?.sha256===chunk.sha256)body=object.body;
 else{
  try{
   // No account headers, cookies, or patient data are forwarded to the origin.
   const response=await fetch(new URL(chunk.url,modelOrigin).href,{redirect:'manual'});
   if(!response.ok)throw Error('Model origin unavailable');
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength!==chunk.bytes)throw Error('Model size mismatch');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==chunk.sha256)throw Error('Model checksum mismatch');
   body=bytes;
  }catch(error){console.warn('Model asset unavailable',error instanceof Error?error.message:'Network error');throw new HealthError(503,'Модель пока недоступна. Попробуйте позже.');}
 }
 return new Response(body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(chunk.bytes),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
}
