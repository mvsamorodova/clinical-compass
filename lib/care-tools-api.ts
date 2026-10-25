import {HealthError} from './health-api';
import {validateSafetyPlan} from './safety-plan';
import {mapStates,type MapRecord} from './recovery-map';
const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(req:Request){const text=await req.text();if(text.length>20000)fail(413,'Слишком большой запрос');try{const b=JSON.parse(text);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{return fail(400,'Некорректный запрос');}}
export async function careToolsApi(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 const direct=['safety-plan','recovery-map','alerts'].includes(path[0]);const doctorRoute=path[0]==='patients'&&['safety-plan','recovery-map'].includes(path[2]);if(!direct&&!doctorRoute)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 if(path[0]==='alerts'){
  if(u.role!=='doctor')fail(403,'Сигналы доступны лечащему врачу');
  if(req.method==='GET'&&path.length===1){const patientId=new URL(req.url).searchParams.get('patientId');if(patientId&&!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',patientId,u.id))fail(404,'Пациент не найден');const alerts=await all(`SELECT a.*,u.name AS patient_name,t.test_key FROM assessment_alerts a JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id JOIN users u ON u.id=a.patient_id JOIN test_results r ON r.id=a.result_id JOIN test_assignments t ON t.id=r.assignment_id WHERE a.doctor_id=? AND (? IS NULL OR a.patient_id=?) ORDER BY a.reviewed_at IS NOT NULL,a.created_at DESC LIMIT 100`,u.id,patientId,patientId);return json({alerts:alerts.map(a=>({id:a.result_id,patientId:a.patient_id,patientName:a.patient_name,testKey:a.test_key,reasons:JSON.parse(a.reasons_json),createdAt:a.created_at,reviewedAt:a.reviewed_at})),checkedAt:Date.now()});}
  if(req.method==='PATCH'&&path.length===2){const r=await db.prepare(`UPDATE assessment_alerts SET reviewed_at=COALESCE(reviewed_at,?),reviewed_by=? WHERE result_id=? AND doctor_id=? AND EXISTS(SELECT 1 FROM patient_records p WHERE p.patient_id=assessment_alerts.patient_id AND p.doctor_id=assessment_alerts.doctor_id)`).bind(Date.now(),u.id,path[1],u.id).run();if(!r.meta.changes)fail(404,'Сигнал не найден');return json({ok:true});}
  return fail(405,'Действие не поддерживается');
 }
 let patientId=u.id;if(doctorRoute){if(u.role!=='doctor')fail(403,'Только для лечащего врача');if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',path[1],u.id))fail(404,'Пациент не найден');patientId=path[1];if(req.method!=='GET'||path.length!==3)fail(405,'Врач может только просматривать этот раздел');}else if(u.role!=='patient')fail(403,'Раздел доступен пациенту');
 const resource=doctorRoute?path[2]:path[0];
 if(resource==='safety-plan'){
  if(req.method==='GET'&&(doctorRoute||path.length===1)){const plan=await row('SELECT * FROM safety_plans WHERE patient_id=?',patientId);const signals=await row('SELECT COUNT(*) AS count FROM assessment_alerts a JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id WHERE a.patient_id=? AND a.reviewed_at IS NULL',patientId);return json({plan:plan?{data:JSON.parse(plan.data_json),createdAt:plan.created_at}:null,signalCount:signals.count});}
  if(req.method==='POST'&&path.length===1&&!doctorRoute){const b=await body(req);if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/.test(b.id)||b.confirmed!==true)fail(400,'Подтвердите однократное сохранение проверенного плана');let data;try{data=validateSafetyPlan(b.plan);}catch(e){return fail(400,(e as Error).message);}const serialized=JSON.stringify(data);await db.prepare('INSERT INTO safety_plans(patient_id,request_id,data_json,created_at) VALUES(?,?,?,?) ON CONFLICT(patient_id) DO NOTHING').bind(patientId,b.id,serialized,Date.now()).run();const saved=await row('SELECT * FROM safety_plans WHERE patient_id=?',patientId);if(saved.request_id!==b.id||saved.data_json!==serialized)fail(409,'План уже сохранён и больше не изменяется');return json({plan:{data:JSON.parse(saved.data_json),createdAt:saved.created_at}});}
  return fail(405,'Сохранённый план можно только просматривать');
 }
 if(resource==='recovery-map'){
  const records=await all('SELECT * FROM map_progress WHERE patient_id=?',patientId) as MapRecord[];
  const preference=await row('SELECT branch FROM map_preferences WHERE patient_id=?',patientId);
  const diary=await row('SELECT (EXISTS(SELECT 1 FROM mood_entries WHERE patient_id=?) OR EXISTS(SELECT 1 FROM daily_diary_entries WHERE patient_id=?)) AS has_diary',patientId,patientId);
  const tracking=await row('SELECT COUNT(DISTINCT day) AS days FROM health_days WHERE patient_id=? AND (steps IS NOT NULL OR sleep_minutes IS NOT NULL OR active_minutes IS NOT NULL)',patientId);
  const readiness={hasDiary:!!diary.has_diary,trackedDays:tracking.days,branch:preference?.branch??null},nodes=mapStates(records,readiness);
  if(req.method==='GET'&&(doctorRoute||path.length===1))return json({nodes:doctorRoute?nodes.map(({key,title,status,updatedAt})=>({key,title,status,updatedAt})):nodes,branch:preference?.branch??null,readiness:{hasDiary:readiness.hasDiary,trackedDays:readiness.trackedDays}});
  if(req.method==='PUT'&&path.length===2&&path[1]==='branch'&&!doctorRoute){const b=await body(req);if(!records.some(r=>r.node_key==='understand'&&r.status==='completed'))fail(409,'Выбор тропы откроется после базового модуля');if(!['body','thoughts'].includes(b.branch))fail(400,'Выберите одну из двух троп');await db.prepare('INSERT INTO map_preferences(patient_id,branch) VALUES(?,?) ON CONFLICT(patient_id) DO UPDATE SET branch=excluded.branch').bind(patientId,b.branch).run();return json({ok:true});}
  if(req.method==='PUT'&&path.length===2&&!doctorRoute){const b=await body(req),node=nodes.find(n=>n.key===path[1]);if(!node)return fail(404,'Модуль не найден');if(node.status==='locked')fail(409,node.unlockHint);if(!['in_progress','completed'].includes(b.status)||typeof b.answer!=='string'||b.answer.length>1200)fail(400,'Проверьте ответ (до 1200 символов)');if(b.status==='completed'&&!b.answer.trim())fail(400,'Запишите хотя бы несколько слов о выбранном шаге');await db.prepare(`INSERT INTO map_progress(patient_id,node_key,status,answer,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(patient_id,node_key) DO UPDATE SET status=CASE WHEN map_progress.status='completed' THEN 'completed' ELSE excluded.status END,answer=excluded.answer,updated_at=excluded.updated_at`).bind(patientId,node.key,b.status,b.answer.trim(),Date.now()).run();return json({ok:true});}
  return fail(405,'Действие не поддерживается');
 }
 return null;
}
