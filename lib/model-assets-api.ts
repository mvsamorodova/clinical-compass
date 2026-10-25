import manifest from './gigaam-model-manifest.json';
import {HealthError} from './health-api';
const version='gigaam-emo-8fad2a2c';
export async function modelAssetsApi(req:Request,path:string[],bucket:R2Bucket):Promise<Response|null>{
 if(path[0]!=='model-assets')return null;
 // Runtime access is read-only. Model assets are provisioned separately.
 if(req.method!=='GET')throw new HealthError(405,'Файлы модели доступны только для чтения');
 const name=path[2],chunk=manifest.chunks.find(c=>c.url.endsWith('/'+name));
 if(path.length!==3||path[1]!==version||!chunk)throw new HealthError(404,'Файл модели не найден');
 if(!bucket)throw new HealthError(503,'Хранилище модели недоступно');
 const object=await bucket.get(`models/${version}/${name}`);
 if(!object||object.size!==chunk.bytes||object.customMetadata?.sha256!==chunk.sha256)throw new HealthError(503,'Модель пока подготавливается. Попробуйте позже.');
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
}
