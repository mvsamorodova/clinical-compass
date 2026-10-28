import {HealthError} from './health-api';

const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const view=(r:any)=>({id:r.id,name:r.name,dose:r.dose,frequency:r.frequency,notes:r.notes,status:r.status,revision:r.revision,intervalHours:r.interval_hours??null,nextDueAt:r.next_due_at??null,lastTakenAt:r.last_taken_at??null,createdAt:r.created_at,updatedAt:r.updated_at});
async function body(req:Request){
 const text=await req.text();if(text.length>6000)fail(413,'Слишком большой запрос');
 try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{fail(400,'Некорректный запрос');}
}
function field(value:unknown,label:string,max:number,optional=false){
 if(typeof value!=='string'||value.trim().length>max||(!optional&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail(400,'Проверьте поле «'+label+'»');
 return (value as string).trim();
}
function schedule(b:any){
 const hours=b.intervalHours!==undefined?b.intervalHours:b.interval_hours??null,due=b.nextDueAt!==undefined?b.nextDueAt:b.next_due_at??null;
 if(hours===null&&due===null)return {hours:null,due:null};
 if(!Number.isSafeInteger(hours)||hours<1||hours>168||!Number.isSafeInteger(due)||due<=0||due>8640000000000000)fail(400,'Укажите интервал от 1 до 168 часов и дату первого приёма');
 return {hours,due};
}
const fields=(b:any)=>({name:field(b.name,'Название лекарства',120),dose:field(b.dose,'Доза за один приём',120),frequency:field(b.frequency,'Частота и время приёма',180),notes:field(b.notes??'','Дополнительные указания',1000,true)});

export async function medicationsApi(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 const mine=path[0]==='my-treatment',doctor=path[0]==='patients'&&path[2]==='medications';
 if(!mine&&!doctor)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 if(mine){
  if(u.role!=='patient')fail(403,'Раздел доступен пациенту');
  if(req.method==='POST'&&path.length===3&&path[2]==='intakes'){
   const b=await body(req),now=Date.now();
   if(typeof b.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.id)||!Number.isSafeInteger(b.revision)||!Number.isSafeInteger(b.dueAt))fail(400,'Обновите назначение перед отметкой приёма');
   const m=await row("SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.id=? AND m.patient_id=? AND m.status='active'",path[1],u.id);
   if(!m)fail(404,'Назначение не найдено');
   const existing=await row('SELECT * FROM medication_intakes WHERE id=? AND medication_id=? AND patient_id=?',b.id,m.id,u.id);
   if(existing){if(existing.order_revision!==b.revision||existing.due_at!==b.dueAt)fail(409,'Эта отметка уже сохранена для другого приёма');return json({takenAt:existing.taken_at,nextDueAt:existing.next_due_at});}
   if(!m.interval_hours||m.next_due_at===null)fail(409,'Врач пока не указал расписание приёма');
   if(m.revision!==b.revision||m.next_due_at!==b.dueAt)fail(409,'Назначение или отметка изменились. Обновите список');
   if(m.next_due_at>now)fail(409,'Время следующего приёма ещё не наступило');
   const interval=m.interval_hours*3600000,nextDueAt=m.next_due_at+(Math.floor((now-m.next_due_at)/interval)+1)*interval;
   await db.batch([
    db.prepare("INSERT INTO medication_intakes(id,medication_id,patient_id,order_revision,due_at,taken_at,next_due_at) SELECT ?,m.id,m.patient_id,m.revision,m.next_due_at,?,? FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.id=? AND m.patient_id=? AND m.status='active' AND m.revision=? AND m.next_due_at=? ON CONFLICT DO NOTHING").bind(b.id,now,nextDueAt,m.id,u.id,b.revision,b.dueAt),
    db.prepare('UPDATE medication_orders SET last_taken_at=?,next_due_at=?,revision=revision+1 WHERE id=? AND patient_id=? AND revision=? AND next_due_at=? AND EXISTS(SELECT 1 FROM medication_intakes i WHERE i.id=? AND i.medication_id=medication_orders.id)').bind(now,nextDueAt,m.id,u.id,b.revision,b.dueAt,b.id)
   ]);
   const saved=await row('SELECT * FROM medication_intakes WHERE id=? AND medication_id=? AND patient_id=?',b.id,m.id,u.id);
   if(!saved)fail(409,'Этот приём уже отмечен или назначение изменилось. Обновите список');
   return json({takenAt:saved.taken_at,nextDueAt:saved.next_due_at});
  }
  if(req.method!=='GET'||path.length!==1)fail(405,'Лечение назначает врач');
  const result=await db.prepare("SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.patient_id=? AND m.status='active' ORDER BY m.created_at DESC,m.id DESC").bind(u.id).all<any>();
  return json({medications:result.results.map(view)});
 }
 if(u.role!=='doctor')fail(403,'Лекарства назначает лечащий врач');
 const patientId=path[1];
 if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',patientId,u.id))fail(404,'Пациент не найден');
 if(req.method==='GET'&&path.length===3){
  const result=await db.prepare('SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.patient_id=? AND m.doctor_id=? ORDER BY m.created_at DESC,m.id DESC').bind(patientId,u.id).all<any>();
  return json({medications:result.results.map(view)});
 }
 if(req.method==='POST'&&path.length===3){
  const b=await body(req),data=fields(b),timing=schedule(b),now=Date.now();
  if(typeof b.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.id))fail(400,'Некорректный идентификатор назначения');
  await db.prepare("INSERT INTO medication_orders(id,patient_id,doctor_id,name,dose,frequency,notes,interval_hours,next_due_at,status,revision,created_at,updated_at) SELECT ?,patient_id,doctor_id,?,?,?,?,?,?,'active',1,?,? FROM patient_records WHERE patient_id=? AND doctor_id=? ON CONFLICT(id) DO NOTHING").bind(b.id,data.name,data.dose,data.frequency,data.notes,timing.hours,timing.due,now,now,patientId,u.id).run();
  const saved=await row('SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.id=? AND m.patient_id=? AND m.doctor_id=?',b.id,patientId,u.id);
  if(!saved||saved.status!=='active'||saved.interval_hours!==timing.hours||saved.next_due_at!==timing.due||Object.entries(data).some(([key,value])=>saved[key]!==value))fail(409,'Назначение или связь с пациентом изменились. Обновите список');
  return json({medication:view(saved)});
 }
 if(req.method==='PATCH'&&path.length===4){
  const b=await body(req);
  if(!Number.isSafeInteger(b.revision)||b.revision<1)fail(400,'Проверьте версию назначения');
  const previous=await row('SELECT * FROM medication_orders WHERE id=? AND patient_id=? AND doctor_id=?',path[3],patientId,u.id);
  if(!previous)fail(404,'Назначение не найдено');
  if(previous.status!=='active'||previous.revision!==b.revision)fail(409,'Назначение изменилось. Обновите список и откройте редактирование заново');
  if(b.status!==undefined&&b.status!=='stopped')fail(400,'Некорректный статус назначения');
  if(b.status===undefined&&!['name','dose','frequency','notes','intervalHours','nextDueAt'].some(key=>b[key]!==undefined))fail(400,'Укажите изменения');
  const data=fields({...previous,...b}),timing=schedule({...previous,...b}),status=b.status??'active';
  const updated=await db.prepare("UPDATE medication_orders SET name=?,dose=?,frequency=?,notes=?,interval_hours=?,next_due_at=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND patient_id=? AND doctor_id=? AND revision=? AND status='active' AND EXISTS(SELECT 1 FROM patient_records p WHERE p.patient_id=medication_orders.patient_id AND p.doctor_id=medication_orders.doctor_id)").bind(data.name,data.dose,data.frequency,data.notes,timing.hours,timing.due,status,Date.now(),path[3],patientId,u.id,b.revision).run();
  if(!updated.meta.changes)fail(409,'Назначение или связь с пациентом изменились. Обновите список');
  const saved=await row('SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.id=? AND m.patient_id=? AND m.doctor_id=?',path[3],patientId,u.id);
  if(!saved)fail(409,'Связь с пациентом изменилась. Обновите список');
  return json({medication:view(saved)});
 }
 return fail(405,'Действие не поддерживается');
}
