import { digest, randomToken } from './security';
import { HealthError } from './health-api';
import { normalizeShortcut } from './health-shortcut';
const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(req:Request,limit:number){
 const reader=req.body?.getReader();if(!reader)fail(400,'Пустой запрос');const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader!.read();if(done)break;size+=value.byteLength;if(size>limit){await reader!.cancel();fail(413,'Слишком много данных');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{fail(400,'Некорректный запрос');}
}
// Native Shortcuts sends no web cookie. This token can only submit one preview.
export async function shortcutUpload(req:Request,path:string[],db:D1Database):Promise<Response|null>{
 if(path[0]!=='health-shortcut')return null;
 if(req.method!=='POST'||path.length!==2||!['verify','upload'].includes(path[1]))fail(404,'Страница не найдена');
 const b=await body(req,path[1]==='verify'?1000:5500000);
 if(typeof b.token!=='string'||! /^[a-f0-9]{64}$/.test(b.token))fail(401,'Откройте кабинет и нажмите «Получить данные с iPhone»');
 const hash=await digest(b.token),now=Date.now();
 const ticket=await db.prepare('SELECT h.*,u.name FROM health_sync_requests h JOIN users u ON u.id=h.patient_id WHERE h.token_hash=? AND h.expires_at>?').bind(hash,now).first<any>();
 if(!ticket||ticket.received_at)fail(410,'Код истёк или уже использован. Запустите обновление из кабинета снова.');
 if(path[1]==='verify')return json({state:'ready',message:'Кабинет пациента: '+ticket.name+'. Сон, шаги и упражнения будут отправлены на clinical-compass-v3.feyzebra.chatgpt.site для предпросмотра. Продолжайте только если это ваш кабинет. Исходные записи не сохраняются: остаются суточные итоги. Доступ врачу включается отдельно.'});
 let preview;try{preview=normalizeShortcut(b,now);}catch(e){fail(400,(e as Error).message);}
 const result=await db.prepare('UPDATE health_sync_requests SET received_at=?,preview_json=? WHERE token_hash=? AND received_at IS NULL AND expires_at>?').bind(now,JSON.stringify(preview),hash,now).run();
 if(!result.meta.changes)fail(410,'Код уже использован. Откройте кабинет.');
 return json({state:'received',message:'Данные получены. Вернитесь в «Сон и активность», проверьте показатели и нажмите «Сохранить выбранные данные».'});
}
export async function shortcutManagement(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 if(path[0]!=='health'||path[1]!=='shortcut')return null;
 if(u.role!=='patient')fail(403,'Обновление доступно только пациенту');
 const now=Date.now();
 // Expired previews have no value to the patient. Keep no raw samples or tokens.
 await db.prepare('DELETE FROM health_sync_requests WHERE expires_at<?').bind(now-3600000).run();
 if(req.method==='POST'&&path.length===2){
  const recent=await db.prepare('SELECT created_at FROM health_sync_requests WHERE patient_id=? ORDER BY created_at DESC LIMIT 1').bind(u.id).first<any>();
  if(recent&&now-recent.created_at<10000)fail(429,'Подождите несколько секунд перед повторным запуском');
  const id=crypto.randomUUID(),token=randomToken(),expiresAt=now+15*60000;
  await db.batch([db.prepare('DELETE FROM health_sync_requests WHERE patient_id=?').bind(u.id),db.prepare('INSERT INTO health_sync_requests(id,patient_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)').bind(id,u.id,await digest(token),now,expiresAt)]);
  return json({id,token,expiresAt});
 }
 if(req.method==='GET'&&path.length===2){
  const t=await db.prepare('SELECT id,expires_at,received_at,preview_json FROM health_sync_requests WHERE patient_id=? ORDER BY created_at DESC LIMIT 1').bind(u.id).first<any>();
  if(!t)return json({state:'idle'});
  return json(t.received_at?{id:t.id,state:'received',preview:JSON.parse(t.preview_json)}:{id:t.id,state:t.expires_at>now?'waiting':'expired'});
 }
 if(req.method==='DELETE'&&path.length===3){await db.prepare('DELETE FROM health_sync_requests WHERE id=? AND patient_id=?').bind(path[2],u.id).run();return json({ok:true});}
 return fail(404,'Страница не найдена');
}
