import {assessmentRisk} from './assessment-risk';
import { CATALOGUE, validAnswers, validateFields, scoreAssessment, type AssessmentDefinition } from './assessments';

export class AssessmentError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new AssessmentError(status, message); }
const json = (data: unknown) => Response.json(data, {headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const definition = (key: string) => CATALOGUE.find(t => t.key === key);
const metadata = (t: AssessmentDefinition, forDoctor=false) => ({key:t.key,version:t.version,name:t.name,shortName:t.shortName,description:t.description,recallLabel:t.recallLabel,variantLabel:t.variantLabel,questionCount:t.externalCount??t.questions.length,respondent:t.respondent??'patient',...(forDoctor?{doctorDescription:t.doctorDescription,scoreDefinitions:t.scoreDefinitions,scoringNote:t.scoringNote,keyNotes:t.keyNotes,sources:t.sources}:{})});
const form = (t:AssessmentDefinition,doctor=false)=>({...metadata(t,doctor),instruction:t.instruction,questions:t.questions,options:t.options,itemOptions:t.itemOptions,fields:t.fields,safetyItems:t.safetyItems});
const assignmentView = (a: any, forDoctor=false) => ({id:a.id,test:metadata(definition(a.test_key)!,forDoctor),status:a.status,nextDueAt:a.next_due_at,createdAt:a.created_at,intervalDays:a.interval_days});
const DAY=86400000;
function interval(value:unknown){if(!Number.isInteger(value)||Number(value)<1||Number(value)>365)fail(400,'Интервал должен быть целым числом от 1 до 365 дней');return Number(value);}
const receipt = (r: any) => ({id:r.id,assignmentId:r.assignment_id,submittedAt:r.submitted_at,nextDueAt:r.submitted_at+r.interval_days*DAY,intervalDays:r.interval_days});
async function body(req: Request) { const s=await req.text();if(s.length>40000)fail(413,'Слишком большой запрос');try{const b=JSON.parse(s);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Некорректный запрос');return b;}catch{fail(400,'Некорректный запрос');} }

async function saveResult(req:Request,a:any,u:any,db:D1Database){
 const now=Date.now(),b=await body(req),test=definition(a.test_key);
 if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/.test(b.id))fail(400,'Некорректный идентификатор отправки');
 if(!test||test.version!==a.test_version||b.version!==a.test_version)fail(409,'Версия теста изменилась. Откройте форму заново.');
 if(!validAnswers(b.answers,test))fail(400,'Выберите допустимый ответ для каждого вопроса');
 let extra:Record<string,string|number>={};try{extra=validateFields(test,b.extra??{});}catch(e){fail(400,(e as Error).message);}
 const scores=scoreAssessment(test,b.answers);
 if(test.respondent==='external')for(const s of test.scoreDefinitions){if(typeof extra[s.key]==='number')scores[s.key]=extra[s.key] as number;}
 const riskReasons=assessmentRisk(test.key,test.version,scores,b.answers,extra);
 const answers=JSON.stringify(test.fields?.length?{answers:b.answers,extra}:b.answers);
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const existing=await row('SELECT * FROM test_results WHERE id=? AND assignment_id=?',b.id,a.id);
 if(existing){if(existing.answers!==answers||existing.cycle_due_at!==b.dueAt)fail(409,'Эта отправка уже сохранена с другими ответами');return json({result:receipt(existing)});}
 if(a.status!=='active')fail(409,'Врач приостановил назначение');
 if(a.next_due_at>now)fail(409,'Следующее прохождение ещё не доступно');
 if(b.dueAt!==a.next_due_at)fail(409,'Это прохождение уже завершено. Обновите список тестов.');
 await db.batch([
  db.prepare(`INSERT INTO test_results(id,assignment_id,cycle_due_at,submitted_at,test_version,answers,depression,anxiety,stress,scores_json,interval_days,recorded_by,entry_mode)
   SELECT ?,a.id,a.next_due_at,?,a.test_version,?,?,?,?,?,a.interval_days,?,? FROM test_assignments a JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id
   WHERE a.id=? AND a.patient_id=? AND a.doctor_id=? AND a.status='active' AND a.next_due_at=? AND a.next_due_at<=? ON CONFLICT DO NOTHING`)
   .bind(b.id,now,answers,scores.depression??0,scores.anxiety??0,scores.stress??0,JSON.stringify(scores),u.id,test.respondent??'patient',a.id,a.patient_id,a.doctor_id,b.dueAt,now),
  db.prepare(`UPDATE test_assignments SET next_due_at=(SELECT submitted_at+interval_days*86400000 FROM test_results WHERE id=?),updated_at=? WHERE id=? AND next_due_at=? AND EXISTS(SELECT 1 FROM test_results WHERE id=? AND assignment_id=test_assignments.id AND cycle_due_at=?)`).bind(b.id,now,a.id,b.dueAt,b.id,b.dueAt),
  ...(riskReasons.length?[db.prepare(`INSERT INTO assessment_alerts(result_id,patient_id,doctor_id,reasons_json,created_at) SELECT r.id,a.patient_id,a.doctor_id,?,? FROM test_results r JOIN test_assignments a ON a.id=r.assignment_id WHERE r.id=? AND a.id=? AND r.answers=? AND r.cycle_due_at=? ON CONFLICT(result_id) DO NOTHING`).bind(JSON.stringify(riskReasons),now,b.id,a.id,answers,b.dueAt)]:[])
 ]);
 const saved=await row('SELECT * FROM test_results WHERE id=? AND assignment_id=?',b.id,a.id);
 if(!saved)fail(409,'Назначение изменилось или ответы уже отправлены. Обновите список тестов.');
 if(saved.answers!==answers||saved.cycle_due_at!==b.dueAt)fail(409,'Эта отправка уже сохранена с другими ответами');
 return json({result:receipt(saved)});
}

export async function assessmentApi(req: Request, path: string[], u: any, db: D1Database): Promise<Response | null> {
 if(path[0]==='assessment-preview'){
  if(u.role!=='doctor')fail(403,'Предпросмотр теста доступен врачу');
  if(req.method!=='GET')fail(405,'Предпросмотр не сохраняет ответы');
  if(path.length!==2)fail(404,'Тест не найден');
  const test=definition(path[1]);if(!test)fail(404,'Тест не найден');
  return json({definition:form(test,true)});
 }
 const patientRoute=path[0]==='tests', doctorRoute=path[0]==='patients'&&path[2]==='tests';
 if(!patientRoute&&!doctorRoute)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 const method=req.method, now=Date.now();
 if(doctorRoute){
  if(u.role!=='doctor')fail(403,'Назначать тесты может только врач');
  const patientId=path[1];
  if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',patientId,u.id))fail(404,'Пациент не найден');
  if(method==='GET'&&path.length===5&&path[3]==='results'){
   const r=await row('SELECT r.*,a.test_key FROM test_results r JOIN test_assignments a ON a.id=r.assignment_id JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id WHERE r.id=? AND a.patient_id=? AND a.doctor_id=?',path[4],patientId,u.id);if(!r)fail(404,'Результат не найден');
   return json({definition:form(definition(r.test_key)!,true),response:JSON.parse(r.answers),version:r.test_version,recordedBy:r.recorded_by,entryMode:r.entry_mode,submittedAt:r.submitted_at});
  }
  if((method==='GET'&&path.length===4)||(method==='POST'&&path.length===5&&path[4]==='results')){
   const a=await row('SELECT * FROM test_assignments WHERE id=? AND patient_id=? AND doctor_id=?',path[3],patientId,u.id);if(!a)fail(404,'Назначение не найдено');const t=definition(a.test_key)!;
   if(!t.respondent||t.respondent==='patient')fail(403,'Этот опросник заполняет пациент в своём кабинете');
   if(method==='GET')return json({assignment:assignmentView(a,true),definition:form(t,true)});
   return saveResult(req,a,u,db);
  }
  if(method==='GET'&&path.length===3){
   const assignments=await all('SELECT * FROM test_assignments WHERE patient_id=? AND doctor_id=? ORDER BY created_at DESC',patientId,u.id);
   const results=await all('SELECT r.* FROM test_results r JOIN test_assignments a ON a.id=r.assignment_id WHERE a.patient_id=? AND a.doctor_id=? ORDER BY r.submitted_at DESC LIMIT 100',patientId,u.id);
   return json({catalogue:CATALOGUE.map(t=>metadata(t,true)),assignments:assignments.map(a=>assignmentView(a,true)),results:results.map(r=>({...receipt(r),version:r.test_version,entryMode:r.entry_mode,scores:r.scores_json?JSON.parse(r.scores_json):{depression:r.depression,anxiety:r.anxiety,stress:r.stress}}))});
  }
  if(method==='POST'&&path.length===3){
   const b=await body(req), test=definition(b.testKey);if(!test)fail(400,'Выберите тест из каталога');const days=interval(b.intervalDays??7);
   // Creation and reactivation are conditional on the current doctor–patient relationship.
   await db.prepare(`INSERT INTO test_assignments(id,patient_id,doctor_id,test_key,test_version,status,next_due_at,created_at,updated_at,interval_days)
    SELECT ?,patient_id,doctor_id,?,?,'active',?,?,?,? FROM patient_records WHERE patient_id=? AND doctor_id=?
    ON CONFLICT(patient_id,doctor_id,test_key) DO UPDATE SET status='active',updated_at=excluded.updated_at,
    next_due_at=CASE WHEN excluded.interval_days<>test_assignments.interval_days THEN COALESCE((SELECT MAX(excluded.updated_at,MAX(r.submitted_at)+excluded.interval_days*86400000) FROM test_results r WHERE r.assignment_id=test_assignments.id),test_assignments.next_due_at) ELSE test_assignments.next_due_at END,interval_days=excluded.interval_days`)
    .bind(crypto.randomUUID(),test!.key,test!.version,now,now,now,days,patientId,u.id).run();
   const a=await row('SELECT a.* FROM test_assignments a JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id WHERE a.patient_id=? AND a.doctor_id=? AND a.test_key=?',patientId,u.id,test!.key);
   if(!a)fail(409,'Связь с пациентом изменилась. Обновите карточку.');
   return json({assignment:assignmentView(a,true)});
  }
  if(method==='PATCH'&&path.length===4){
   const b=await body(req);const hasStatus=b.status!==undefined,hasInterval=b.intervalDays!==undefined;
   if(!hasStatus&&!hasInterval)fail(400,'Укажите частоту или статус назначения');
   if(hasStatus&&!['active','paused'].includes(b.status))fail(400,'Некорректный статус назначения');
   const days=hasInterval?interval(b.intervalDays):null;
   const result=await db.prepare(`UPDATE test_assignments SET status=COALESCE(?,status),
    next_due_at=CASE WHEN ? IS NOT NULL AND ?<>interval_days THEN COALESCE((SELECT MAX(?,MAX(r.submitted_at)+?*86400000) FROM test_results r WHERE r.assignment_id=test_assignments.id),next_due_at) ELSE next_due_at END,
    interval_days=COALESCE(?,interval_days),updated_at=? WHERE id=? AND patient_id=? AND doctor_id=? AND EXISTS(SELECT 1 FROM patient_records p WHERE p.patient_id=test_assignments.patient_id AND p.doctor_id=test_assignments.doctor_id)`)
    .bind(hasStatus?b.status:null,days,days,now,days,days,now,path[3],patientId,u.id).run();
   if(!result.meta.changes)fail(404,'Назначение не найдено');
   return json({ok:true});
  }
  fail(404,'Страница не найдена');
 }
 if(u.role!=='patient')fail(403,'Прохождение тестов доступно только пациенту');
 const linked=`FROM test_assignments a JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id WHERE a.patient_id=?`;
 if(method==='GET'&&path.length===1){
  const assignments=await all(`SELECT a.* ${linked} ORDER BY a.created_at DESC`,u.id);
  // Patients receive completion receipts, never computed scores or automated interpretation.
  const results=await all(`SELECT r.id,r.assignment_id,r.submitted_at,r.interval_days FROM test_results r JOIN test_assignments a ON a.id=r.assignment_id JOIN patient_records p ON p.patient_id=a.patient_id AND p.doctor_id=a.doctor_id WHERE a.patient_id=? ORDER BY r.submitted_at DESC LIMIT 100`,u.id);
  const self=assignments.filter(a=>!definition(a.test_key)?.respondent||definition(a.test_key)?.respondent==='patient');
  return json({assignments:self.map(a=>assignmentView(a)),results:results.filter(r=>self.some(a=>a.id===r.assignment_id)).map(receipt)});
 }
 const a=await row(`SELECT a.* ${linked} AND a.id=?`,u.id,path[1]||'');if(!a)fail(404,'Назначение не найдено');
 const t=definition(a.test_key)!;if(t.respondent&&t.respondent!=='patient')fail(403,'Эту оценку проводит врач');
 if(method==='GET'&&path.length===2)return json({assignment:assignmentView(a),definition:form(t)});
 if(method==='POST'&&path.length===3&&path[2]==='results')return saveResult(req,a,u,db);
 fail(404,'Страница не найдена');
}
