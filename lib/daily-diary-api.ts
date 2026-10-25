import {DIARY_VERSION,DIARY_BLOCKS,validDiaryBlocks,validateDiaryAnswers,diaryDay} from './daily-diary';
import {HealthError} from './health-api';
const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const view=(r:any)=>({id:r.id,day:r.day,timeZone:r.time_zone,blocks:JSON.parse(r.blocks_json),answers:JSON.parse(r.answers_json),version:r.version,createdAt:r.created_at,sharedWithDoctor:!!r.shared_doctor_id});
async function body(req:Request){const s=await req.text();if(s.length>10000)fail(413,'Слишком большой запрос');try{const b=JSON.parse(s);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{fail(400,'Некорректный запрос');}}
export async function dailyDiaryApi(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 const doctor=path[0]==='patients'&&path[2]==='diary',patient=path[0]==='daily-diary';if(!doctor&&!patient)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 if(doctor){
  if(u.role!=='doctor')fail(403,'Доступно только врачу');const id=path[1];
  if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',id,u.id))fail(404,'Пациент не найден');
  if(req.method==='GET'&&path.length===3){const plan=await row('SELECT * FROM diary_plans WHERE patient_id=? AND doctor_id=?',id,u.id);return json({blocks:plan?JSON.parse(plan.blocks_json):[],revision:plan?.revision??null,entries:(await all('SELECT e.* FROM daily_diary_entries e JOIN patient_records p ON p.patient_id=e.patient_id AND p.doctor_id=e.shared_doctor_id WHERE e.patient_id=? AND e.shared_doctor_id=? ORDER BY e.day DESC LIMIT 100',id,u.id)).map(view)});}
  if(req.method==='PUT'&&path.length===3){const b=await body(req);if(!validDiaryBlocks(b.blocks))fail(400,'Выберите блоки из списка');const blocks=DIARY_BLOCKS.filter(x=>b.blocks.includes(x.key)).map(x=>x.key),revision=crypto.randomUUID();
   const result=await db.prepare(`INSERT INTO diary_plans(patient_id,doctor_id,blocks_json,revision,updated_at) SELECT patient_id,doctor_id,?,?,? FROM patient_records WHERE patient_id=? AND doctor_id=? ON CONFLICT(patient_id) DO UPDATE SET doctor_id=excluded.doctor_id,blocks_json=excluded.blocks_json,revision=excluded.revision,updated_at=excluded.updated_at`).bind(JSON.stringify(blocks),revision,Date.now(),id,u.id).run();if(!result.meta.changes)fail(409,'Связь с пациентом изменилась');return json({blocks,revision});}
  fail(404,'Страница не найдена');
 }
 if(u.role!=='patient')fail(403,'Дневник доступен только пациенту');
 const plan=await row('SELECT d.*,u.name AS doctor_name FROM diary_plans d JOIN patient_records p ON p.patient_id=d.patient_id AND p.doctor_id=d.doctor_id JOIN users u ON u.id=d.doctor_id WHERE d.patient_id=?',u.id);
 if(req.method==='GET'&&path.length===1)return json({plan:plan?{blocks:JSON.parse(plan.blocks_json),revision:plan.revision,doctorId:plan.doctor_id,doctorName:plan.doctor_name}:null,version:DIARY_VERSION,entries:(await all('SELECT * FROM daily_diary_entries WHERE patient_id=? ORDER BY day DESC LIMIT 100',u.id)).map(view)});
 if(req.method==='POST'&&path.length===1){const b=await body(req);if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/.test(b.id))fail(400,'Некорректный идентификатор');
  const existing=await row('SELECT * FROM daily_diary_entries WHERE id=? AND patient_id=?',b.id,u.id);
  if(existing){let clean;try{clean=validateDiaryAnswers(b.answers,JSON.parse(existing.blocks_json));}catch{fail(409,'Эта отправка уже сохранена с другими ответами');}if(existing.answers_json!==JSON.stringify(clean)||existing.day!==b.day||existing.plan_revision!==b.revision||existing.version!==b.version||existing.time_zone!==b.timeZone||typeof b.shared!=='boolean'||existing.shared_doctor_id!==(b.shared?b.doctorId:null))fail(409,'Эта отправка уже сохранена с другими ответами');return json({entry:view(existing)});}
  if(!plan||!JSON.parse(plan.blocks_json).length)fail(409,'Врач пока не назначил блоки дневника');
  if(b.version!==DIARY_VERSION||b.revision!==plan.revision)fail(409,'Врач изменил блоки. Обновите дневник перед заполнением.');
  let day;try{day=diaryDay(b.timeZone);}catch(e){fail(400,(e as Error).message);}if(day!==b.day)fail(409,'Наступил новый день. Обновите дневник.');
  if(typeof b.shared!=='boolean'||b.shared&&b.doctorId!==plan.doctor_id)fail(409,'Проверьте получателя записи');let answers;try{answers=validateDiaryAnswers(b.answers,JSON.parse(plan.blocks_json));}catch(e){fail(400,(e as Error).message);}
  const result=await db.prepare(`INSERT INTO daily_diary_entries(id,patient_id,day,time_zone,version,plan_revision,blocks_json,answers_json,shared_doctor_id,created_at) SELECT ?,d.patient_id,?,?,?,?,d.blocks_json,?,?,? FROM diary_plans d JOIN patient_records p ON p.patient_id=d.patient_id AND p.doctor_id=d.doctor_id WHERE d.patient_id=? AND d.revision=? AND d.doctor_id=? ON CONFLICT DO NOTHING`).bind(b.id,day!,b.timeZone,DIARY_VERSION,b.revision,JSON.stringify(answers),b.shared?plan.doctor_id:null,Date.now(),u.id,b.revision,plan.doctor_id).run();
  if(!result.meta.changes)fail(409,'Запись за сегодня уже есть или план изменился. Обновите дневник.');return json({entry:view(await row('SELECT * FROM daily_diary_entries WHERE id=? AND patient_id=?',b.id,u.id))});
 }
 if(req.method==='PATCH'&&path.length===2){const b=await body(req);if(typeof b.shared!=='boolean')fail(400,'Укажите видимость записи');if(b.shared){if(!plan||b.doctorId!==plan.doctor_id)fail(409,'Проверьте лечащего врача');const r=await db.prepare('UPDATE daily_diary_entries SET shared_doctor_id=? WHERE id=? AND patient_id=? AND EXISTS(SELECT 1 FROM patient_records WHERE patient_id=? AND doctor_id=?)').bind(plan.doctor_id,path[1],u.id,u.id,plan.doctor_id).run();if(!r.meta.changes)fail(404,'Запись или связь с врачом не найдена');}else{await db.prepare('UPDATE daily_diary_entries SET shared_doctor_id=NULL WHERE id=? AND patient_id=?').bind(path[1],u.id).run();}return json({ok:true});}
 return fail(404,'Страница не найдена');
}
