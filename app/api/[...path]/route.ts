import {avatarApi,avatarImage} from '../../../lib/avatar-api';
import {avatarUrl} from '../../../lib/avatars';
import {modelAssetsApi} from '../../../lib/model-assets-api';
import {voiceApi} from '../../../lib/voice-api';
import {careToolsApi} from '../../../lib/care-tools-api';
import {validateReflections} from '../../../lib/reflection';
import { healthApi, HealthError } from '../../../lib/health-api';
import { dailyDiaryApi } from '../../../lib/daily-diary-api';
import { shortcutUpload, shortcutManagement } from '../../../lib/health-shortcut-api';
import { env } from 'cloudflare:workers';
import { EMOTIONS, safetyNotice } from '../../../lib/patient-chat';
import { digest, randomToken, passwordHash, passwordMatches } from '../../../lib/security';
import { assessmentApi, AssessmentError } from '../../../lib/assessment-api';
export const dynamic='force-dynamic';
const DAY=86400000;
const db=()=>{if(!env.DB)throw new Error('Database unavailable');return env.DB;};
const row=(sql:string,...args:any[])=>db().prepare(sql).bind(...args).first<any>();
const run=(sql:string,...args:any[])=>db().prepare(sql).bind(...args).run();
const all=async(sql:string,...args:any[])=>(await db().prepare(sql).bind(...args).all<any>()).results;
class ApiError extends Error {constructor(public status:number,message:string,public code?:string){super(message);}}
function fail(status:number,message:string):never {throw new ApiError(status,message);}
function requestId(value:unknown){if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))fail(400,'Некорректный идентификатор записи');return value;}
function entryView(r:any){return {id:r.id,mood:r.mood,emotions:JSON.parse(r.emotions),note:r.note,reflections:JSON.parse(r.reflections_json||'[]'),sharedWithDoctor:!!r.shared_doctor_id,createdAt:r.created_at};}
function clean(value:any,max=5000){if(typeof value!=='string')return '';return value.trim().slice(0,max);}
function publicUser(u:any){return {id:u.id,role:u.role,name:u.name,email:u.email,birthDate:u.birth_date,phone:u.phone,specialty:u.specialty,clinic:u.clinic,bio:u.bio,contactEmail:u.contact_email,schedule:u.schedule,isDemo:!!u.demo_group,avatarUrl:avatarUrl(u)};}
function doctorProfile(u:any){return {id:u.id,name:u.name,specialty:u.specialty,clinic:u.clinic,bio:u.bio,phone:u.phone,contactEmail:u.contact_email,schedule:u.schedule,avatarUrl:avatarUrl(u)};}
function respond(data:any,status=200,cookie?:string){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});}
function sessionToken(req:Request){return /(?:^|;\s*)compass_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('cookie')||'')?.[1];}
async function current(req:Request){const token=sessionToken(req);if(!token)fail(401,'Войдите в аккаунт');const u=await row('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?',await digest(token),Date.now());if(!u)fail(401,'Сессия завершена. Войдите снова');const expected=req.headers.get('x-compass-user');if(expected && expected!==u.id)throw new ApiError(409,'Аккаунт изменился в другой вкладке. Обновите кабинет. Для приглашения пациента войдите как врач.','SESSION_CHANGED');return u;}
async function signIn(req:Request,u:any){const token=randomToken();await run('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(token),u.id,Date.now()+7*DAY);return respond({user:publicUser(u)},200,`compass_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(req.url).protocol==='https:'?'; Secure':''}`);}
async function body(req:Request){const text=await req.text();if(text.length>30000)fail(413,'Слишком большой запрос');try{return JSON.parse(text);}catch{fail(400,'Некорректный запрос');}}
async function throttle(req:Request,kind:string,key:string,limit=10){const id=await digest(kind+':'+(req.headers.get('cf-connecting-ip')||'local')+':'+key);const now=Date.now();await run('INSERT INTO login_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END',id,now+15*60000,now,now);const r=await row('SELECT count FROM login_attempts WHERE key=?',id);if(r.count>limit)fail(429,'Слишком много попыток. Попробуйте через 15 минут');}
async function handle(req:Request){
 const url=new URL(req.url), path=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean), method=req.method;
 if(method!=='GET'){const origin=req.headers.get('origin');if(origin && origin!==url.origin)fail(403,'Запрос с другого сайта запрещён');if(req.headers.get('sec-fetch-site')==='cross-site')fail(403,'Запрос с другого сайта запрещён');}
 const modelResponse=await modelAssetsApi(req,path,env.BUCKET);if(modelResponse)return modelResponse;
 const shortcutResponse=await shortcutUpload(req,path,db());if(shortcutResponse)return shortcutResponse;
 if(path[0]==='auth' && method==='POST'){
  const b=await body(req);
  if(path[1]==='logout'){if(req.headers.has('x-compass-user'))await current(req);const token=sessionToken(req);if(token)await run('DELETE FROM sessions WHERE token=?',await digest(token));return respond({ok:true},200,'compass_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');}
  const email=clean(b.email,254).toLowerCase(),password=typeof b.password==='string'?b.password:'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Укажите корректную электронную почту');
  if(password.length<8 || password.length>128)fail(400,'Пароль должен содержать от 8 до 128 символов');
  await throttle(req,'auth',email);
  if(path[1]==='register'){
   const name=clean(b.name,100),role=b.role;if(!name || !['doctor','patient'].includes(role))fail(400,'Укажите имя и роль');
   if(await row('SELECT id FROM users WHERE email=?',email))fail(409,'Аккаунт с такой почтой уже существует');
   const id=crypto.randomUUID();try{await run('INSERT INTO users(id,email,password,role,name,created_at) VALUES(?,?,?,?,?,?)',id,email,await passwordHash(password),role,name,Date.now());}catch(e){if(await row('SELECT id FROM users WHERE email=?',email))fail(409,'Аккаунт с такой почтой уже существует');throw e;}
   return signIn(req,await row('SELECT * FROM users WHERE id=?',id));
  }
  if(path[1]==='login'){const u=await row('SELECT * FROM users WHERE email=?',email);const valid=await passwordMatches(password,u?.password||('0'.repeat(64)+':'+ '0'.repeat(64)));if(!u||!valid)fail(401,'Неверная почта или пароль');return signIn(req,u);}
 }
 if(path[0]==='demo' && method==='POST' && !path[1]){
  await throttle(req,'demo','',15); const group=crypto.randomUUID(),doctorId=crypto.randomUUID(),now=Date.now(),hash=await passwordHash(randomToken());
  const statements=[db().prepare('INSERT INTO users(id,email,password,role,name,specialty,clinic,bio,contact_email,schedule,demo_group,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(doctorId,`${doctorId}@demo.invalid`,hash,'doctor','Анна Сергеевна Морозова','Врач-психотерапевт','Клиника «Гармония»','Помогаю лучше понимать своё состояние и проходить путь лечения с поддержкой. На приёме мы вместе определим цели и удобный план наблюдения.','anna@example.com','Пн–Пт, 09:00–18:00',group,now)];
  const people=[['Александра Волкова','1994-05-14','stable','Обсудили самочувствие и повседневную активность. Пациентка отмечает улучшение режима сна.','Вести дневник самочувствия. На следующей встрече обсудить записи и вопросы.','Уточнить, что помогает сохранять регулярный режим.'],['Михаил Соколов','1987-09-22','attention','Есть вопросы к текущему плану наблюдения. Нужен дополнительный контакт с врачом.','Записать вопросы к ближайшей консультации.','Связаться с пациентом и уточнить изменения самочувствия.'],['Елена Новикова','1990-02-08','stable','Продолжаем наблюдение. На встрече обсудили текущие цели.','Отмечать изменения самочувствия между встречами.','Проверить выполнение согласованных целей.'],['Дмитрий Козлов','1982-11-03','followup','Запланирована повторная консультация.','Подготовить вопросы к повторной встрече.','Уточнить удобное время следующего приёма.'],['Мария Лебедева','1998-07-19','stable','На последней встрече обсудили режим дня и доступную поддержку.','Продолжать согласованный с врачом план.','Обсудить изменения на следующей встрече.'],['Артём Орлов','1992-01-27','followup','Первичная встреча состоялась. Формируем цели наблюдения.','Записать основные ожидания от консультаций.','Вернуться к обсуждению целей.']];
  for(let i=0;i<people.length;i++){const p=people[i],id=crypto.randomUUID();statements.push(db().prepare('INSERT INTO users(id,email,password,role,name,birth_date,demo_group,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,`${id}@demo.invalid`,hash,'patient',p[0],p[1],group,now));statements.push(db().prepare('INSERT INTO patient_records(patient_id,doctor_id,status,summary,recommendations,private_notes,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,doctorId,p[2],p[3],p[4],p[5],now-i*DAY));}
  await db().batch(statements);return signIn(req,await row('SELECT * FROM users WHERE id=?',doctorId));
 }
 if(path[0]==='invites' && path[1] && method==='GET'){
  const inv=await row('SELECT * FROM invitations WHERE token=? AND expires>? AND used_by IS NULL',await digest(path[1]),Date.now());if(!inv)fail(404,'Приглашение уже использовано или срок его действия истёк');const d=await row('SELECT * FROM users WHERE id=?',inv.doctor_id);if(path.length===3&&path[2]==='avatar')return avatarImage(d,env.BUCKET);if(path.length!==2)fail(404,'Страница не найдена');const profile=doctorProfile(d);if(profile.avatarUrl)profile.avatarUrl='/api/invites/'+path[1]+'/avatar?v='+encodeURIComponent(d.avatar_key.split('/').at(-1));return respond({doctor:profile,expires:inv.expires});
 }
 const u=await current(req);
 const avatarResponse=await avatarApi(req,path,u,db(),env.BUCKET);if(avatarResponse)return avatarResponse;
 const voiceResponse=await voiceApi(req,path,u,db(),env.BUCKET);if(voiceResponse)return voiceResponse;
 const careResponse=await careToolsApi(req,path,u,db());if(careResponse)return careResponse;
 const syncResponse=await shortcutManagement(req,path,u,db());if(syncResponse)return syncResponse;
 const healthResponse=await healthApi(req,path,u,db());if(healthResponse)return healthResponse;
 const diaryResponse=await dailyDiaryApi(req,path,u,db());if(diaryResponse)return diaryResponse;
 const assessmentResponse=await assessmentApi(req,path,u,db());if(assessmentResponse)return assessmentResponse;
 if(path[0]==='journal' || path[0]==='chat'){
  if(u.role!=='patient')fail(403,'Чат и личный дневник доступны только пациенту');
  if(path[0]==='journal'){
   if(method==='GET'&&!path[1]){
    const connection=await row('SELECT u.name FROM patient_records r JOIN users u ON u.id=r.doctor_id WHERE r.patient_id=?',u.id);
    const offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100000)fail(400,'Некорректная страница');
    const entries=await all('SELECT * FROM mood_entries WHERE patient_id=? ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?',u.id,offset);
    const stats=await row('SELECT COUNT(*) AS total FROM mood_entries WHERE patient_id=?',u.id);
    return respond({entries:entries.slice(0,20).map(entryView),hasMore:entries.length>20,total:stats.total,doctorName:connection?.name||null});
   }
   if(method==='POST'&&!path[1]){
    const b=await body(req),id=requestId(b.id),mood=b.mood;
    const existing=await row('SELECT * FROM mood_entries WHERE id=? AND patient_id=?',id,u.id);if(existing)return respond({entry:entryView(existing)});
    if(!Number.isInteger(mood)||mood<1||mood>5)fail(400,'Выберите настроение от 1 до 5');
    if(!Array.isArray(b.emotions)||b.emotions.length>3||b.emotions.some((x:any)=>!EMOTIONS.includes(x))||new Set(b.emotions).size!==b.emotions.length)fail(400,'Выберите до трёх чувств из списка');
    if(typeof b.note!=='string'||b.note.length>3000)fail(400,'Запись должна быть не длиннее 3000 символов');
    let reflections;try{reflections=validateReflections(b.reflections);}catch(e){fail(400,(e as Error).message);}
    if(typeof b.shareWithDoctor!=='boolean')fail(400,'Укажите видимость записи');
    let doctorId=null;if(b.shareWithDoctor){const connection=await row('SELECT doctor_id FROM patient_records WHERE patient_id=?',u.id);if(!connection)fail(409,'Для публикации записи сначала подключитесь к врачу');doctorId=connection.doctor_id;}
    await throttle(req,'journal',u.id,60);
    await run('INSERT INTO mood_entries(id,patient_id,mood,emotions,note,reflections_json,shared_doctor_id,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',id,u.id,mood,JSON.stringify(b.emotions),b.note.trim(),JSON.stringify(reflections),doctorId,Date.now());
    const saved=await row('SELECT * FROM mood_entries WHERE id=? AND patient_id=?',id,u.id);if(!saved)fail(409,'Не удалось сохранить запись. Обновите страницу и повторите.');
    return respond({entry:entryView(saved)});
   }
   if(method==='DELETE'&&path[1]){const result=await run('DELETE FROM mood_entries WHERE id=? AND patient_id=?',path[1],u.id);if(!result.meta.changes)fail(404,'Запись не найдена');return respond({ok:true});}
  }
  if(path[0]==='chat'){
   if(method==='GET'&&!path[1]){
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<=0)fail(400,'Некорректная страница');
    const turns=await all('SELECT id,request_id AS requestId,message,reply,kind,voice_id AS voiceId,created_at AS createdAt FROM chat_turns WHERE patient_id=? AND id<? ORDER BY id DESC LIMIT 21',u.id,before);
    return respond({engine:'webllm-qwen3-1.7b',turns:turns.slice(0,20).reverse(),hasMore:turns.length>20});
   }
   if(method==='POST'&&!path[1]){
    const b=await body(req),id=requestId(b.requestId);
    const select='SELECT id,request_id AS requestId,message,reply,kind,voice_id AS voiceId,created_at AS createdAt FROM chat_turns WHERE request_id=? AND patient_id=?';
    const existing=await row(select,id,u.id);if(existing)return respond({engine:'webllm-qwen3-1.7b',turn:existing});
    if(typeof b.message!=='string'||!b.message.trim()||b.message.length>3000)fail(400,'Введите сообщение от 1 до 3000 символов');
    let voiceId=null;if(b.voiceId!=null){voiceId=requestId(b.voiceId);if(!await row('SELECT id FROM voice_notes WHERE id=? AND patient_id=?',voiceId,u.id))fail(404,'Голосовая запись не найдена');}
    await throttle(req,'chat',u.id,60);
    // The client runs the model locally. Stored text is private, untrusted user-owned content.
    const notice=safetyNotice(b.message);
    if(!notice&&(typeof b.reply!=='string'||!b.reply.trim()||b.reply.length>6000))fail(400,'Ожидается ответ локальной модели от 1 до 6000 символов');
    const reply={text:notice||b.reply.trim(),kind:notice?'safety':'llm'};
    await run('INSERT INTO chat_turns(request_id,patient_id,message,reply,kind,voice_id,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING',id,u.id,b.message.trim(),reply.text,reply.kind,voiceId,Date.now());
    const saved=await row(select,id,u.id);if(!saved)fail(409,'Не удалось сохранить сообщение. Попробуйте ещё раз.');
    return respond({engine:'webllm-qwen3-1.7b',turn:saved});
   }
  }
  fail(404,'Страница не найдена');
 }

 if(path[0]==='me' && method==='GET')return respond({user:publicUser(u)});
 if(path[0]==='me' && method==='PATCH'){
  const b=await body(req),name=clean(b.name,100);if(!name)fail(400,'Укажите имя');const birthDate=clean(b.birthDate,10);if(birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(Date.parse(birthDate))||birthDate>new Date().toISOString().slice(0,10)))fail(400,'Проверьте дату рождения');
  await run('UPDATE users SET name=?,birth_date=?,phone=?,specialty=?,clinic=?,bio=?,contact_email=?,schedule=? WHERE id=?',name,birthDate,clean(b.phone,40),u.role==='doctor'?clean(b.specialty,100):u.specialty,u.role==='doctor'?clean(b.clinic,150):u.clinic,u.role==='doctor'?clean(b.bio,2000):u.bio,u.role==='doctor'?clean(b.contactEmail,254):u.contact_email,u.role==='doctor'?clean(b.schedule,200):u.schedule,u.id);
  return respond({user:publicUser(await row('SELECT * FROM users WHERE id=?',u.id))});
 }
 if(path[0]==='demo' && path[1]==='switch' && method==='POST'){
  if(!u.demo_group)fail(403,'Доступно только в демо');const target=await row('SELECT * FROM users WHERE demo_group=? AND role=? ORDER BY name LIMIT 1',u.demo_group,u.role==='doctor'?'patient':'doctor');if(!target)fail(404,'Демоаккаунт не найден');const token=sessionToken(req);if(token)await run('DELETE FROM sessions WHERE token=?',await digest(token));return signIn(req,target);
 }
 if(path[0]==='invites' && !path[1] && method==='POST'){
  if(u.role!=='doctor')fail(403,'Это действие доступно в аккаунте врача. Войдите как врач и повторите попытку.');await throttle(req,'invite',u.id,40);const token=randomToken(),expires=Date.now()+7*DAY;await run('INSERT INTO invitations(token,doctor_id,expires,created_at) VALUES(?,?,?,?)',await digest(token),u.id,expires,Date.now());return respond({token,expires});
 }
 if(path[0]==='invites' && path[1] && method==='POST'){
  if(u.role!=='patient')fail(403,'Присоединиться к врачу можно из аккаунта пациента');if(await row('SELECT patient_id FROM patient_records WHERE patient_id=?',u.id))fail(409,'Вы уже прикреплены к врачу');const token=await digest(path[1]);const inv=await row('SELECT * FROM invitations WHERE token=? AND expires>? AND used_by IS NULL',token,Date.now());if(!inv)fail(404,'Приглашение уже использовано или срок его действия истёк');
  // Conditional insert plus claim execute atomically. A second redemption cannot rebind a record.
  try{const results=await db().batch([db().prepare('INSERT INTO patient_records(patient_id,doctor_id,updated_at) SELECT ?,doctor_id,? FROM invitations WHERE token=? AND used_by IS NULL AND expires>?').bind(u.id,Date.now(),token,Date.now()),db().prepare('UPDATE invitations SET used_by=? WHERE token=? AND used_by IS NULL AND EXISTS(SELECT 1 FROM patient_records WHERE patient_id=? AND doctor_id=invitations.doctor_id)').bind(u.id,token,u.id)]);if(!results[0].meta.changes)fail(409,'Приглашение уже использовано');}catch(e){if(e instanceof ApiError)throw e;fail(409,'Не удалось присоединиться: связь уже существует или приглашение использовано');}
  return respond({ok:true});
 }
 if(path[0]==='patients'){
  if(u.role!=='doctor')fail(403,'Это действие доступно в аккаунте врача. Войдите как врач и повторите попытку.');
  if(!path[1] && method==='GET')return respond({patients:await all('SELECT u.id,u.name,u.email,u.birth_date AS birthDate,u.phone,r.status,r.summary,r.updated_at AS updatedAt FROM patient_records r JOIN users u ON u.id=r.patient_id WHERE r.doctor_id=? ORDER BY r.updated_at DESC',u.id)});
  const p=await row('SELECT u.id,u.name,u.email,u.birth_date AS birthDate,u.phone,r.status,r.summary,r.recommendations,r.private_notes AS privateNotes,r.updated_at AS updatedAt FROM patient_records r JOIN users u ON u.id=r.patient_id WHERE r.patient_id=? AND r.doctor_id=?',path[1]||'',u.id);if(!p)fail(404,'Пациент не найден');
  if(path[2]==='journal'&&method==='GET'){const entries=await all('SELECT * FROM mood_entries WHERE patient_id=? AND shared_doctor_id=? ORDER BY created_at DESC,id DESC LIMIT 100',p.id,u.id);return respond({entries:entries.map(entryView)});}
  if(method==='GET')return respond({patient:p});
  if(method==='PATCH'){const b=await body(req);const status=b.status??p.status;if(!['stable','attention','followup'].includes(status))fail(400,'Некорректный статус');await run('UPDATE patient_records SET status=?,summary=?,recommendations=?,private_notes=?,updated_at=? WHERE patient_id=? AND doctor_id=?',status,b.summary===undefined?p.summary:clean(b.summary,10000),b.recommendations===undefined?p.recommendations:clean(b.recommendations,10000),b.privateNotes===undefined?p.privateNotes:clean(b.privateNotes,10000),Date.now(),p.id,u.id);return respond({ok:true});}
  if(method==='DELETE'){await db().batch([db().prepare('DELETE FROM health_sharing WHERE patient_id=? AND doctor_id=?').bind(p.id,u.id),db().prepare("UPDATE test_assignments SET status='paused',updated_at=? WHERE patient_id=? AND doctor_id=?").bind(Date.now(),p.id,u.id),db().prepare('DELETE FROM diary_plans WHERE patient_id=? AND doctor_id=?').bind(p.id,u.id),db().prepare('UPDATE daily_diary_entries SET shared_doctor_id=NULL WHERE patient_id=? AND shared_doctor_id=?').bind(p.id,u.id),db().prepare('DELETE FROM patient_records WHERE patient_id=? AND doctor_id=?').bind(p.id,u.id)]);return respond({ok:true});}
 }
 if(path[0]==='my-care' && method==='GET'){
  if(u.role!=='patient')fail(403,'Только для пациента');
  // Explicit projection: private_notes must never enter a patient response.
  const r=await row('SELECT doctor_id,summary,recommendations,updated_at AS updatedAt FROM patient_records WHERE patient_id=?',u.id);if(!r)return respond({record:null,doctor:null});const d=await row('SELECT id,name,specialty,clinic,bio,phone,contact_email,schedule,avatar_key FROM users WHERE id=?',r.doctor_id);return respond({record:{summary:r.summary,recommendations:r.recommendations,updatedAt:r.updatedAt},doctor:doctorProfile(d)});
 }
 fail(404,'Страница не найдена');
}
async function route(req:Request){try{return await handle(req);}catch(e){
 // Consume rejected voice uploads as a stream, including auth/CSRF failures,
 // so the Worker can finish this request without breaking the next connection.
 if(/^\/api\/(voice|model-assets|me\/avatar|avatars)(\/|$)/.test(new URL(req.url).pathname)&&req.body&&!req.bodyUsed){try{const reader=req.body.getReader();while(!(await reader.read()).done){}reader.releaseLock();}catch{}}
if(e instanceof HealthError)return respond({error:e.message},e.status);if(e instanceof AssessmentError)return respond({error:e.message},e.status);if(e instanceof ApiError)return respond({error:e.message,...(e.code?{code:e.code}:{})},e.status);console.error('API request failed',e instanceof Error?e.name:'unknown');return respond({error:'Не удалось выполнить действие. Попробуйте ещё раз.'},500);}}
export {route as GET,route as POST,route as PUT,route as PATCH,route as DELETE};
