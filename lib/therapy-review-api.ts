import {HealthError} from './health-api';
import {digest} from './security';
import {CHECKS,DAY,THERAPY_RULE_VERSION,ageAt,assessReview,emptyChecks,longitudinalEvidence,withPatientFacts,type AssessmentRow,type TherapyChecks,type TherapyReview} from './therapy-review';

const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const parse=(s:string,fallback:any)=>{try{return JSON.parse(s)}catch{return fallback}};
function validChecks(v:any):v is TherapyChecks{
 return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===CHECKS.length&&CHECKS.every(c=>['unknown','yes','no'].includes(v[c.key]));
}
export async function therapyReviewApi(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 if(path[0]!=='patients'||path[2]!=='therapy-review')return null;
 if(u.role!=='doctor')fail(403,'Подсказка доступна только лечащему врачу');
 if(path.length!==3)fail(404,'Раздел не найден');
 if(!['GET','PUT'].includes(req.method))fail(405,'Действие не поддерживается');
 const patientId=path[1],row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 async function current(){
  const patient=await row('SELECT u.birth_date,p.summary,p.updated_at FROM users u JOIN patient_records p ON p.patient_id=u.id WHERE p.patient_id=? AND p.doctor_id=?',patientId,u.id);
  if(!patient)fail(404,'Пациент не найден');
  const results:AssessmentRow[]=await all("SELECT r.id,r.answers,r.test_version,r.submitted_at,r.entry_mode,a.test_key FROM test_results r JOIN test_assignments a ON a.id=r.assignment_id WHERE a.patient_id=? AND a.doctor_id=? AND a.test_key IN ('gad7','hars','bai','dass42','phq9') AND r.submitted_at>=? ORDER BY r.submitted_at DESC,r.rowid DESC",patientId,u.id,Date.now()-56*DAY);
  const latestAny=await row('SELECT r.id,r.test_version,r.submitted_at FROM test_results r JOIN test_assignments a ON a.id=r.assignment_id WHERE a.patient_id=? AND a.doctor_id=? ORDER BY r.submitted_at DESC,r.rowid DESC LIMIT 1',patientId,u.id);
  const {evidence,measures}=longitudinalEvidence(results,Date.now());
  const meds=await all('SELECT id,name,dose,frequency,created_at,revision,status,updated_at FROM medication_orders WHERE patient_id=? AND doctor_id=? ORDER BY id',patientId,u.id);
  const alerts=await all('SELECT result_id,reasons_json,reviewed_at FROM assessment_alerts WHERE patient_id=? AND doctor_id=? ORDER BY result_id',patientId,u.id);
  const unreviewedSafety=alerts.some(a=>a.reviewed_at===null&&parse(a.reasons_json,[]).some((r:any)=>r.kind==='safety'));
  const context=await digest(JSON.stringify([THERAPY_RULE_VERSION,patientId,u.id,patient.birth_date,patient.summary,patient.updated_at,results,latestAny,meds,alerts]));
  const saved=await row('SELECT * FROM therapy_reviews WHERE patient_id=? AND doctor_id=?',patientId,u.id);
  const fresh=!!saved&&saved.context_hash===context&&saved.rule_version===THERAPY_RULE_VERSION&&Date.now()-saved.reviewed_at<=14*DAY;
  const stored=parse(saved?.checks_json??'',{});
  const history=fresh?saved.history:'',age=ageAt(patient.birth_date,Date.now());
  const checks=withPatientFacts(fresh&&validChecks(stored)?stored:emptyChecks(),age,patient.birth_date,unreviewedSafety);
  let decision=assessReview(checks,history,age,unreviewedSafety);
  if(!unreviewedSafety&&patient.birth_date&&age===null)decision={status:'blocked',reasons:['Проверьте дату рождения в профиле пациента.']};
  // Recheck the link after reads; an unlinked doctor must not receive a cached review.
  if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',patientId,u.id))fail(404,'Пациент не найден');
  const patientFacts={birthDate:patient.birth_date,summary:patient.summary,unreviewedSafety,medications:meds.map(m=>({id:m.id,name:m.name,dose:m.dose,frequency:m.frequency,status:m.status,createdAt:m.created_at}))};
  const review:TherapyReview={active:!!evidence,context,revision:saved?.revision??0,stale:!!saved&&!fresh,age,patientFacts,evidence,measures,checks,history,reviewedAt:fresh?saved.reviewed_at:null,...decision};
  if(!evidence){review.status='needs_review';review.reasons=[];return review;}
  review.suggestion={title:'Рассмотреть назначение Авиандра',text:'Авиандр (маритупирдин) — один из вариантов при подтверждённом ГТР и недостаточном эффекте первых двух линий терапии. Перед назначением проверьте пять условий рядом.'};
  return review;
 }
 if(req.method==='GET')return json({review:await current()});
 const raw=await req.text();if(raw.length>12000)fail(413,'Слишком большой запрос');
 let b:any;try{b=JSON.parse(raw)}catch{return fail(400,'Некорректный запрос')}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['context','revision','checks','history'].includes(k))||!validChecks(b.checks)||typeof b.history!=='string'||b.history.length>2000||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.context!=='string')fail(400,'Проверьте данные оценки');
 const before=await current();
 if(!before.active||b.context!==before.context||b.revision!==before.revision)fail(409,'Данные изменились. Обновите подсказку и повторите оценку');
 const checks=withPatientFacts(b.checks,before.age,before.patientFacts.birthDate,before.patientFacts.unreviewedSafety);
 const result=await db.prepare(`INSERT INTO therapy_reviews(patient_id,doctor_id,context_hash,rule_version,checks_json,history,revision,reviewed_at)
  SELECT ?,?,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM patient_records WHERE patient_id=? AND doctor_id=?) AND ?=COALESCE((SELECT revision FROM therapy_reviews WHERE patient_id=? AND doctor_id=?),0)
  ON CONFLICT(patient_id,doctor_id) DO UPDATE SET context_hash=excluded.context_hash,rule_version=excluded.rule_version,checks_json=excluded.checks_json,history=excluded.history,revision=therapy_reviews.revision+1,reviewed_at=excluded.reviewed_at WHERE therapy_reviews.revision=?`)
  .bind(patientId,u.id,b.context,THERAPY_RULE_VERSION,JSON.stringify(checks),b.history.trim(),Date.now(),patientId,u.id,b.revision,patientId,u.id,b.revision).run();
 if(!result.meta.changes)fail(409,'Оценка или связь с пациентом изменились. Обновите подсказку');
 return json({review:await current()});
}
