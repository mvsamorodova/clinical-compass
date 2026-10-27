import {HealthError} from './health-api';
import {STATIONS,ANCHOR_CATEGORIES} from './recovery-map';
import {EDUCATION,STORIES} from './recovery-content';
const fail=(s:number,m:string):never=>{throw new HealthError(s,m)};
const json=(v:unknown)=>Response.json(v,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
async function body(req:Request){const t=await req.text();if(t.length>7000)fail(413,'Слишком большой запрос');try{const v=JSON.parse(t);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}catch{return fail(400,'Некорректный запрос')}}
function text(v:unknown,max=3000){if(typeof v!=='string'||!v.trim()||v.length>max)fail(400,`Введите текст до ${max} символов`);return (v as string).trim()}
export async function recoveryApi(req:Request,path:string[],u:any,db:D1Database,bucket:R2Bucket):Promise<Response|null>{
 const doctor=path[0]==='patients'&&path[2]==='recovery-map';if(path[0]!=='recovery-map'&&!doctor)return null;
 const row=(sql:string,...a:any[])=>db.prepare(sql).bind(...a).first<any>();
 const all=async(sql:string,...a:any[])=>(await db.prepare(sql).bind(...a).all<any>()).results;
 const run=(sql:string,...a:any[])=>db.prepare(sql).bind(...a).run();
 const route=doctor?path.slice(3):path.slice(1),patientId=doctor?path[1]:u.id;
 if(doctor&&u.role!=='doctor'||!doctor&&u.role!=='patient')fail(403,'Раздел недоступен для этой роли');
 const connection=await row('SELECT doctor_id FROM patient_records WHERE patient_id=?',patientId);
 if(doctor&&connection?.doctor_id!==u.id)fail(404,'Пациент не найден');
 if(route[0]==='messages'){
  if(!connection)fail(409,'Сначала подключитесь к лечащему врачу');
  const doctorId=connection.doctor_id;
  if(req.method==='GET'&&route.length===1){const messages=await all('SELECT * FROM recovery_messages WHERE patient_id=? AND doctor_id=? ORDER BY created_at DESC,id DESC LIMIT 100',patientId,doctorId);return json({messages:messages.reverse().map(m=>({id:m.id,text:m.text,sender:m.sender,createdAt:m.created_at,readAt:m.read_at}))});}
  if(req.method==='POST'&&route.length===1){const b=await body(req);if(!uuid(b.id))fail(400,'Некорректный идентификатор');const value=text(b.text),sender=doctor?'doctor':'patient';await run('INSERT INTO recovery_messages(id,patient_id,doctor_id,sender,text,created_at) SELECT ?,patient_id,doctor_id,?,?,? FROM patient_records WHERE patient_id=? AND doctor_id=? ON CONFLICT(id) DO NOTHING',b.id,sender,value,Date.now(),patientId,doctorId);const saved=await row('SELECT * FROM recovery_messages WHERE id=? AND patient_id=? AND doctor_id=? AND sender=?',b.id,patientId,doctorId,sender);if(!saved||saved.text!==value)fail(409,'Сообщение или связь с врачом изменились');return json({ok:true});}
  if(req.method==='POST'&&route[1]==='seen'&&route.length===2){await run('UPDATE recovery_messages SET read_at=COALESCE(read_at,?) WHERE patient_id=? AND doctor_id=? AND sender=?',Date.now(),patientId,doctorId,doctor?'patient':'doctor');return json({ok:true});}
  return fail(405,'Действие не поддерживается');
 }
 if(req.method==='GET'&&!route.length){
  const activity=await all('SELECT kind,item_key AS key,created_at AS createdAt FROM recovery_activity WHERE patient_id=?',patientId);
  const stations=STATIONS.map(s=>({...s,visited:activity.some(a=>a.kind==='visit'&&a.key===s.key)}));
  if(doctor)return json({thoughtEntries:await all("SELECT id,text,created_at AS createdAt FROM recovery_entries WHERE patient_id=? AND category='thought' AND shared_doctor_id=? ORDER BY created_at DESC,id DESC LIMIT 200",patientId,u.id),nodes:stations.map(s=>({key:s.key,title:s.title,status:s.visited?'in_progress':'available'})),branch:null});
  const entries=await all('SELECT * FROM recovery_entries WHERE patient_id=? ORDER BY created_at DESC,id DESC LIMIT 200',patientId);
  const diary=await row('SELECT (SELECT COUNT(*) FROM mood_entries WHERE patient_id=?)+(SELECT COUNT(*) FROM daily_diary_entries WHERE patient_id=?) AS total,(SELECT COUNT(*) FROM mood_entries WHERE patient_id=? AND created_at>=?)+(SELECT COUNT(*) FROM daily_diary_entries WHERE patient_id=? AND created_at>=?) AS week',patientId,patientId,patientId,Date.now()-7*86400000,patientId,Date.now()-7*86400000);
  const unread=connection?await row("SELECT COUNT(*) AS n FROM recovery_messages WHERE patient_id=? AND doctor_id=? AND sender='doctor' AND read_at IS NULL",patientId,connection.doctor_id):{n:0};
  const assignments=connection?await row("SELECT COUNT(*) AS n FROM test_assignments WHERE patient_id=? AND doctor_id=? AND status='active'",patientId,connection.doctor_id):{n:0};
  const legacy=await all("SELECT node_key AS title,answer,updated_at AS updatedAt FROM map_progress WHERE patient_id=? AND answer<>'' ORDER BY updated_at DESC",patientId);
  return json({doctorId:connection?.doctor_id??null,stations,activity,entries:entries.map(e=>({id:e.id,category:e.category,text:e.text,sharedWithDoctor:!!e.shared_doctor_id,mediaType:e.media_type,mediaUrl:e.media_key?'/api/recovery-map/media/'+e.id:null,createdAt:e.created_at})),counts:{anchors:entries.filter(e=>e.category==='bad-day'||ANCHOR_CATEGORIES.some(c=>c.key===e.category)).length,diaryTotal:diary.total,diaryWeek:diary.week,learned:activity.filter(a=>a.kind==='learned').length,watched:activity.filter(a=>a.kind==='watched').length,unread:unread.n,assignments:assignments.n},days:Math.max(1,Math.floor((Date.now()-u.created_at)/86400000)+1),legacy});
 }
 if(doctor)return fail(405,'Личные опоры и записи доступны только пациенту');
 if(route[0]==='activity'&&route.length===1&&req.method==='PUT'){
  const b=await body(req);const keys=b.kind==='visit'?STATIONS.map(s=>s.key):b.kind==='learned'?EDUCATION.map(r=>r.id):b.kind==='watched'?STORIES.map(s=>s.id):[];
  if(!keys.includes(b.key)||typeof b.active!=='boolean')fail(400,'Неизвестная отметка');
  if(b.active)await run('INSERT INTO recovery_activity(patient_id,kind,item_key,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',patientId,b.kind,b.key,Date.now());else await run('DELETE FROM recovery_activity WHERE patient_id=? AND kind=? AND item_key=?',patientId,b.kind,b.key);
  return json({ok:true});
 }
 // Retain the former category for older clients and saved private notes.
 const categories=[...ANCHOR_CATEGORIES.map(c=>c.key),'bad-day','reflection','thought'];
 if(route[0]==='entries'&&route.length===1&&req.method==='POST'){
  const b=await body(req);if(!uuid(b.id)||!categories.includes(b.category))fail(400,'Проверьте запись');const value=text(b.text);
  if(b.category==='people'&&b.consent!==true)fail(400,'Подтвердите сохранение контакта в личных опорах');
  if((await row('SELECT COUNT(*) AS n FROM recovery_entries WHERE patient_id=?',patientId)).n>=200)fail(409,'В опорах уже 200 записей. Можно удалить ненужные');
  await run('INSERT INTO recovery_entries(id,patient_id,category,text,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',b.id,patientId,b.category,value,Date.now());
  const saved=await row('SELECT * FROM recovery_entries WHERE id=? AND patient_id=?',b.id,patientId);if(!saved||saved.text!==value||saved.category!==b.category)fail(409,'Запись изменилась');return json({ok:true});
 }
 if(route[0]==='entries'&&route.length===2&&req.method==='PATCH'){
  const b=await body(req);if(typeof b.shared!=='boolean')fail(400,'Укажите доступ к записи');
  if(b.shared&&(!connection||connection.doctor_id!==b.doctorId))fail(409,'Лечащий врач изменился. Обновите дневник');
  const result=b.shared?await run("UPDATE recovery_entries SET shared_doctor_id=? WHERE id=? AND patient_id=? AND category='thought' AND EXISTS(SELECT 1 FROM patient_records WHERE patient_id=? AND doctor_id=?)",b.doctorId,route[1],patientId,patientId,b.doctorId):await run("UPDATE recovery_entries SET shared_doctor_id=NULL WHERE id=? AND patient_id=? AND category='thought'",route[1],patientId);
  if(!result.meta.changes)fail(404,'Запись или связь с врачом не найдена');return json({ok:true});
 }
 if(route[0]==='entries'&&route.length===2&&req.method==='DELETE'){
  const e=await row('SELECT * FROM recovery_entries WHERE id=? AND patient_id=?',route[1],patientId);if(!e)fail(404,'Запись не найдена');await run('DELETE FROM recovery_entries WHERE id=? AND patient_id=?',e.id,patientId);if(e.media_key&&bucket)await bucket.delete(e.media_key);return json({ok:true});
 }
 if(route[0]==='media'&&route.length===2){
  const id=route[1];if(!uuid(id))fail(404,'Файл не найден');if(!bucket)fail(503,'Хранилище временно недоступно');
  if(req.method==='GET'){const e=await row('SELECT media_key,media_type FROM recovery_entries WHERE id=? AND patient_id=?',id,patientId);if(!e?.media_key)fail(404,'Файл не найден');const obj=await bucket.get(e.media_key);if(!obj)fail(404,'Файл не найден');return new Response(obj!.body,{headers:{'Content-Type':e.media_type,'Content-Length':String(obj!.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});}
  if(req.method==='PUT'){
   const category=new URL(req.url).searchParams.get('category')??'holds',type=req.headers.get('content-type')?.split(';')[0]??'';
   if(!['holds','words','techniques','joys'].includes(category)||!['image/jpeg','image/png','audio/webm','audio/mp4','audio/ogg'].includes(type))fail(415,'Поддерживаются JPG, PNG и голосовые записи браузера');
   if((await row('SELECT COUNT(*) AS n FROM recovery_entries WHERE patient_id=?',patientId)).n>=200)fail(409,'Достигнут лимит записей');
   const reader=req.body?.getReader();if(!reader)fail(400,'Нет файла');let size=0;const parts:Uint8Array[]=[];
   try{while(true){const v=await reader!.read();if(v.done)break;size+=v.value.length;if(size>4_000_000){await reader!.cancel();fail(413,'Файл должен быть меньше 4 МБ')}parts.push(v.value)}}finally{reader!.releaseLock()}
   const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}const magic=String.fromCharCode(...bytes.slice(0,12));
   const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/png'?magic.startsWith('\x89PNG\r\n\x1a\n'):type==='audio/webm'?bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163:type==='audio/mp4'?magic.slice(4,8)==='ftyp':magic.startsWith('OggS');
   if(!valid)fail(400,'Формат файла не совпадает с содержимым');
   if(await row('SELECT id FROM recovery_entries WHERE id=?',id))fail(409,'Файл уже сохранён');
   const key='recovery/'+patientId+'/'+id;await bucket.put(key,bytes,{httpMetadata:{contentType:type}});
   try{await run('INSERT INTO recovery_entries(id,patient_id,category,text,media_key,media_type,created_at) VALUES(?,?,?,\'\',?,?,?)',id,patientId,category,key,type,Date.now())}catch(e){await bucket.delete(key);throw e}return json({ok:true});
  }
 }
 return fail(405,'Действие не поддерживается');
}
