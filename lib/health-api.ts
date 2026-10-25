import { PROVIDERS, validateHealthDays } from './health-data';
export class HealthError extends Error{constructor(public status:number,message:string){super(message);}}
const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(req:Request){const s=await req.text();if(s.length>25000)fail(413,'Слишком большой запрос');try{const b=JSON.parse(s);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{fail(400,'Некорректный запрос');}}
const view=(r:any)=>({day:r.day,provider:r.provider,steps:r.steps,sleepMinutes:r.sleep_minutes,activeMinutes:r.active_minutes,stepsSource:r.steps_source,sleepSource:r.sleep_source,activitySource:r.activity_source,updatedAt:r.updated_at});
export async function healthApi(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 const own=path[0]==='health',doctor=path[0]==='patients'&&path[2]==='health';if(!own&&!doctor)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 if(doctor){
  if(u.role!=='doctor')fail(403,'Доступно только врачу');if(req.method!=='GET'||path.length!==3)fail(404,'Страница не найдена');
  if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',path[1],u.id))fail(404,'Пациент не найден');
  const shared=!!await row('SELECT patient_id FROM health_sharing WHERE patient_id=? AND doctor_id=?',path[1],u.id);
  const entries=shared?await all('SELECT * FROM (SELECT h.*,ROW_NUMBER() OVER(PARTITION BY h.provider ORDER BY h.day DESC) AS position FROM health_days h JOIN health_sharing s ON s.patient_id=h.patient_id JOIN patient_records p ON p.patient_id=s.patient_id AND p.doctor_id=s.doctor_id WHERE h.patient_id=? AND s.doctor_id=?) WHERE position<=366 ORDER BY day DESC,provider',path[1],u.id):[];
  return json({shared,entries:entries.map(view)});
 }
 if(u.role!=='patient')fail(403,'Импорт доступен только пациенту');
 if(req.method==='GET'&&path.length===1){
  const doctor=await row('SELECT u.id,u.name FROM patient_records p JOIN users u ON u.id=p.doctor_id WHERE p.patient_id=?',u.id);
  const shared=!!await row('SELECT s.patient_id FROM health_sharing s JOIN patient_records p ON p.patient_id=s.patient_id AND p.doctor_id=s.doctor_id WHERE s.patient_id=?',u.id);
  return json({entries:(await all('SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY provider ORDER BY day DESC) AS position FROM health_days WHERE patient_id=?) WHERE position<=366 ORDER BY day DESC,provider',u.id)).map(view),doctor:doctor??null,shared});
 }
 if(req.method==='POST'&&path[1]==='import'&&path.length===2){
  const b=await body(req);if(!Object.hasOwn(PROVIDERS,b.provider))fail(400,'Выберите источник данных');
  let days;try{days=validateHealthDays(b.days);}catch(e){fail(400,(e as Error).message);}
  const now=Date.now();await db.batch(days!.map(d=>db.prepare(`INSERT INTO health_days(patient_id,provider,day,steps,sleep_minutes,active_minutes,steps_source,sleep_source,activity_source,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(patient_id,provider,day) DO UPDATE SET steps=COALESCE(excluded.steps,steps),sleep_minutes=COALESCE(excluded.sleep_minutes,sleep_minutes),active_minutes=COALESCE(excluded.active_minutes,active_minutes),
   steps_source=CASE WHEN excluded.steps IS NULL THEN steps_source ELSE excluded.steps_source END,sleep_source=CASE WHEN excluded.sleep_minutes IS NULL THEN sleep_source ELSE excluded.sleep_source END,activity_source=CASE WHEN excluded.active_minutes IS NULL THEN activity_source ELSE excluded.activity_source END,updated_at=excluded.updated_at`)
   .bind(u.id,b.provider,d.day,d.steps,d.sleepMinutes,d.activeMinutes,d.stepsSource,d.sleepSource,d.activitySource,now)));
  return json({saved:days!.length});
 }
 if(req.method==='PATCH'&&path[1]==='sharing'&&path.length===2){
  const b=await body(req);if(typeof b.shared!=='boolean')fail(400,'Укажите доступ врачу');
  if(!b.shared){await db.prepare('DELETE FROM health_sharing WHERE patient_id=?').bind(u.id).run();return json({shared:false});}
  if(typeof b.doctorId!=='string')fail(400,'Укажите врача');
  const result=await db.prepare(`INSERT INTO health_sharing(patient_id,doctor_id) SELECT patient_id,doctor_id FROM patient_records WHERE patient_id=? AND doctor_id=? ON CONFLICT(patient_id) DO UPDATE SET doctor_id=excluded.doctor_id`).bind(u.id,b.doctorId).run();
  if(!result.meta.changes)fail(409,'Лечащий врач изменился. Обновите страницу.');return json({shared:true});
 }
 return fail(404,'Страница не найдена');
}
