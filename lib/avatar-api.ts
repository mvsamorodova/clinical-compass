import {HealthError} from './health-api';
import {avatarUrl,jpegDimensions,MAX_AVATAR_BYTES} from './avatars';
const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
export async function avatarImage(user:any,bucket:R2Bucket){
 if(!user?.avatar_key)fail(404,'Фото не добавлено');if(!bucket)fail(503,'Фото временно недоступно');
 const image=await bucket.get(user.avatar_key);if(!image)fail(404,'Фото не найдено');
 return new Response(image!.body,{headers:{'Content-Type':'image/jpeg','Content-Length':String(image!.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
}
async function imageBytes(req:Request){
 const reader=req.body?.getReader();if(!reader)fail(400,'Выберите фото');
 let size=0;const parts:Uint8Array[]=[];
 try{while(true){const r=await reader!.read();if(r.done)break;size+=r.value.length;if(size<=MAX_AVATAR_BYTES)parts.push(r.value);}}finally{reader!.releaseLock();}
 if(size>MAX_AVATAR_BYTES)fail(413,'Подготовленное фото должно быть меньше 1 МБ');
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;
}
export async function avatarApi(req:Request,path:string[],u:any,db:D1Database,bucket:R2Bucket):Promise<Response|null>{
 const own=path[0]==='me'&&path[1]==='avatar';if(!own&&path[0]!=='avatars')return null;
 if(own){
  if(path.length!==2)fail(404,'Страница не найдена');
  if(!['PUT','DELETE'].includes(req.method))fail(405,'Действие не поддерживается');
  if(!bucket)fail(503,'Хранилище фото временно недоступно');
  const previous=u.avatar_key??null;let next:string|null=null;
  if(req.method==='PUT'){
   const bytes=await imageBytes(req);if(req.headers.get('content-type')?.split(';')[0]!=='image/jpeg')fail(415,'Фото должно быть подготовлено в формате JPG');
   try{jpegDimensions(bytes);}catch(e){fail(400,(e as Error).message);}
   next=`avatars/${u.id}/${crypto.randomUUID()}.jpg`;await bucket.put(next,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  }
  let result;
  try{result=await db.prepare('UPDATE users SET avatar_key=? WHERE id=? AND avatar_key IS ?').bind(next,u.id,previous).run();}
  catch(e){if(next)await bucket.delete(next);throw e;}
  if(!result.meta.changes){if(next)await bucket.delete(next);fail(409,'Фото изменилось в другой вкладке. Обновите профиль и повторите действие');}
  if(previous)try{await bucket.delete(previous);}catch{/* The old key is no longer served. */}
  return Response.json({avatarUrl:avatarUrl({id:u.id,avatar_key:next})},{headers:{'Cache-Control':'no-store'}});
 }
 if(req.method!=='GET'||path.length!==2)fail(405,'Действие не поддерживается');
 const id=path[1];
 const permitted=u.id===id||(u.role==='patient'&&await db.prepare('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?').bind(u.id,id).first())||(u.role==='doctor'&&await db.prepare('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?').bind(id,u.id).first());
 if(!permitted)fail(404,'Фото не найдено');
 const owner=await db.prepare("SELECT avatar_key FROM users WHERE id=?").bind(id).first();
 return avatarImage(owner,bucket);
}
