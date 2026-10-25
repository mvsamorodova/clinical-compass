import {HealthError} from './health-api';

const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const view=(r:any)=>({id:r.id,name:r.name,dose:r.dose,frequency:r.frequency,notes:r.notes,status:r.status,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at});
async function body(req:Request){
 const text=await req.text();if(text.length>6000)fail(413,'Слишком большой запрос');
 try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{fail(400,'Некорректный запрос');}
}
function field(value:unknown,label:string,max:number,optional=false){
 if(typeof value!=='string'||value.trim().length>max||(!optional&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail(400,'Проверьте поле «'+label+'»');
 return (value as string).trim();
}
const fields=(b:any)=>({name:field(b.name,'Название лекарства',120),dose:field(b.dose,'Доза за один приём',120),frequency:field(b.frequency,'Частота и время приёма',180),notes:field(b.notes??'','Дополнительные указания',1000,true)});

export async function medicationsApi(req:Request,path:string[],u:any,db:D1Database):Promise<Response|null>{
 const mine=path[0]==='my-treatment',doctor=path[0]==='patients'&&path[2]==='medications';
 if(!mine&&!doctor)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 if(mine){
  if(u.role!=='patient')fail(403,'Раздел доступен пациенту');
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
  const b=await body(req),data=fields(b),now=Date.now();
  if(typeof b.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.id))fail(400,'Некорректный идентификатор назначения');
  await db.prepare("INSERT INTO medication_orders(id,patient_id,doctor_id,name,dose,frequency,notes,status,revision,created_at,updated_at) SELECT ?,patient_id,doctor_id,?,?,?,?,'active',1,?,? FROM patient_records WHERE patient_id=? AND doctor_id=? ON CONFLICT(id) DO NOTHING").bind(b.id,data.name,data.dose,data.frequency,data.notes,now,now,patientId,u.id).run();
  const saved=await row('SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.id=? AND m.patient_id=? AND m.doctor_id=?',b.id,patientId,u.id);
  if(!saved||saved.status!=='active'||Object.entries(data).some(([key,value])=>saved[key]!==value))fail(409,'Назначение или связь с пациентом изменились. Обновите список');
  return json({medication:view(saved)});
 }
 if(req.method==='PATCH'&&path.length===4){
  const b=await body(req);
  if(!Number.isSafeInteger(b.revision)||b.revision<1)fail(400,'Проверьте версию назначения');
  const previous=await row('SELECT * FROM medication_orders WHERE id=? AND patient_id=? AND doctor_id=?',path[3],patientId,u.id);
  if(!previous)fail(404,'Назначение не найдено');
  if(previous.status!=='active'||previous.revision!==b.revision)fail(409,'Назначение изменилось. Обновите список и откройте редактирование заново');
  if(b.status!==undefined&&b.status!=='stopped')fail(400,'Некорректный статус назначения');
  if(b.status===undefined&&!['name','dose','frequency','notes'].some(key=>b[key]!==undefined))fail(400,'Укажите изменения');
  const data=fields({...previous,...b}),status=b.status??'active';
  const updated=await db.prepare("UPDATE medication_orders SET name=?,dose=?,frequency=?,notes=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND patient_id=? AND doctor_id=? AND revision=? AND status='active' AND EXISTS(SELECT 1 FROM patient_records p WHERE p.patient_id=medication_orders.patient_id AND p.doctor_id=medication_orders.doctor_id)").bind(data.name,data.dose,data.frequency,data.notes,status,Date.now(),path[3],patientId,u.id,b.revision).run();
  if(!updated.meta.changes)fail(409,'Назначение или связь с пациентом изменились. Обновите список');
  const saved=await row('SELECT m.* FROM medication_orders m JOIN patient_records p ON p.patient_id=m.patient_id AND p.doctor_id=m.doctor_id WHERE m.id=? AND m.patient_id=? AND m.doctor_id=?',path[3],patientId,u.id);
  if(!saved)fail(409,'Связь с пациентом изменилась. Обновите список');
  return json({medication:view(saved)});
 }
 return fail(405,'Действие не поддерживается');
}
