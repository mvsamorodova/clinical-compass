import {HealthError} from './health-api';
import {EMOTION_LABELS,EMOTION_MODEL_VERSION} from './voice-model';
const fail=(status:number,message:string):never=>{throw new HealthError(status,message);};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const MAX_BYTES=44+16000*65*2;
const uuid=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
async function limitedBytes(req:Request,max:number){
 const reader=req.body?.getReader();if(!reader)fail(400,'Нет аудио');
 let length=0;const parts:Uint8Array[]=[];
 // Drain rejected uploads without retaining oversized data. Returning while the
 // incoming body is still active aborts the connection in the Worker runtime.
 try{while(true){const {value,done}=await reader!.read();if(done)break;length+=value.length;if(length<=max)parts.push(value);}}
 finally{reader!.releaseLock();}
 if(length>max)fail(413,'Запись слишком большая');
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}

async function body(req:Request){try{const text=new TextDecoder().decode(await limitedBytes(req,5000));const b=JSON.parse(text);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch(e){if(e instanceof HealthError)throw e;return fail(400,'Некорректные данные');}}
function wavDuration(bytes:Uint8Array){
 if(bytes.length<44+16000*2*0.2||bytes.length>MAX_BYTES)fail(400,'Нужна запись длительностью от секунды до минуты');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=(at:number)=>String.fromCharCode(...bytes.subarray(at,at+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||tag(12)!=='fmt '||tag(36)!=='data'||d.getUint32(4,true)!==bytes.length-8||d.getUint32(16,true)!==16||d.getUint16(20,true)!==1||d.getUint16(22,true)!==1||d.getUint32(24,true)!==16000||d.getUint32(28,true)!==32000||d.getUint16(32,true)!==2||d.getUint16(34,true)!==16||d.getUint32(40,true)!==bytes.length-44||(bytes.length-44)%2)fail(400,'Ожидается WAV: моно, 16 кГц, PCM 16 бит');
 return Math.round((bytes.length-44)/32);
}
export async function voiceApi(req:Request,path:string[],u:any,db:D1Database,bucket:R2Bucket):Promise<Response|null>{
 const direct=path[0]==='voice',doctorList=path[0]==='patients'&&path[2]==='voice';if(!direct&&!doctorList)return null;
 const row=(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 const doctor=()=>{if(u.role!=='doctor')fail(403,'Анализ голоса доступен только лечащему врачу');};
 const patient=()=>{if(u.role!=='patient')fail(403,'Запись отправляет пациент');};
 const view=(n:any)=>({id:n.id,durationMs:n.duration_ms,createdAt:n.created_at,sharedAt:n.shared_at,sharedWithDoctor:!!n.shared_doctor_id});
 if(doctorList){doctor();if(req.method!=='GET'||path.length!==3)fail(405,'Действие не поддерживается');if(!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',path[1],u.id))fail(404,'Пациент не найден');
  const notes=await all('SELECT v.*,e.scores_json,e.segments,e.model_version,e.created_at AS analyzed_at FROM voice_notes v LEFT JOIN voice_emotions e ON e.voice_id=v.id AND e.doctor_id=? WHERE v.patient_id=? AND v.shared_doctor_id=? ORDER BY v.created_at DESC LIMIT 50',u.id,path[1],u.id);
  return json({notes:notes.map(n=>({...view(n),sha256:n.sha256,analysis:n.scores_json?{scores:JSON.parse(n.scores_json),segments:n.segments,modelVersion:n.model_version,createdAt:n.analyzed_at}:null}))});
 }
 if(path.length===1&&req.method==='GET'){patient();const connection=await row('SELECT u.id,u.name FROM patient_records p JOIN users u ON u.id=p.doctor_id WHERE p.patient_id=?',u.id);const notes=await all('SELECT id,duration_ms,created_at,shared_at,shared_doctor_id FROM voice_notes WHERE patient_id=? ORDER BY created_at DESC LIMIT 50',u.id);return json({doctor:connection||null,notes:notes.map(n=>({...view(n),sharedWithDoctor:!!connection&&n.shared_doctor_id===connection.id}))});}
 if(!uuid(path[1]||''))fail(404,'Запись не найдена');
 const id=path[1];
 if(path.length===2&&req.method==='PUT'){
  const bytes=await limitedBytes(req,MAX_BYTES);
  patient();if(!bucket)fail(503,'Хранилище аудио пока недоступно');
  if(req.headers.get('content-type')?.split(';')[0]!=='audio/wav')fail(415,'Загрузите WAV-аудио');
  const durationMs=wavDuration(bytes);
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const existing=await row('SELECT * FROM voice_notes WHERE id=?',id);if(existing){if(existing.patient_id!==u.id||existing.sha256!==sha)fail(409,'Идентификатор уже занят другой записью');return json({note:view(existing)});}
  const limit=await row('SELECT COUNT(*) AS count FROM voice_notes WHERE patient_id=? AND created_at>?',u.id,Date.now()-86400000);if(limit.count>=50)fail(429,'Можно сохранить до 50 голосовых за день');
  const key=`voice/${u.id}/${id}/${sha}.wav`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:'audio/wav'}});
  await db.prepare('INSERT INTO voice_notes(id,patient_id,object_key,sha256,duration_ms,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,u.id,key,sha,durationMs,Date.now()).run();
  const saved=await row('SELECT * FROM voice_notes WHERE id=?',id);if(!saved||saved.patient_id!==u.id||saved.sha256!==sha){await bucket.delete(key);fail(409,'Не удалось сохранить запись. Попробуйте снова');}return json({note:view(saved)});
 }
 const n=await row('SELECT * FROM voice_notes WHERE id=?',id);if(!n)fail(404,'Запись не найдена');
 const own=u.role==='patient'&&n.patient_id===u.id;
 const allowedDoctor=u.role==='doctor'&&n.shared_doctor_id===u.id&&!!await row('SELECT patient_id FROM patient_records WHERE patient_id=? AND doctor_id=?',n.patient_id,u.id);
 if(path[2]==='audio'&&path.length===3&&req.method==='GET'){
  if(!own&&!allowedDoctor)fail(404,'Запись не найдена');if(!bucket)fail(503,'Аудио временно недоступно');const audio=await bucket.get(n.object_key);if(!audio)return fail(404,'Аудио не найдено');return new Response(audio.body,{headers:{'Content-Type':'audio/wav','Content-Length':String(audio.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="voice.wav"','Cross-Origin-Resource-Policy':'same-origin'}});
 }
 if(path[2]==='share'&&path.length===3){patient();if(!own)fail(404,'Запись не найдена');
  if(req.method==='POST'){const b=await body(req);if(b.confirmed!==true||!uuid(b.doctorId||''))fail(400,'Подтвердите отправку записи врачу');
   const result=await db.prepare('UPDATE voice_notes SET shared_doctor_id=?,shared_at=COALESCE(shared_at,?) WHERE id=? AND patient_id=? AND EXISTS(SELECT 1 FROM patient_records WHERE patient_id=? AND doctor_id=?) AND (shared_doctor_id IS NULL OR shared_doctor_id=?)').bind(b.doctorId,Date.now(),id,u.id,u.id,b.doctorId,b.doctorId).run();if(!result.meta.changes)fail(409,'Врач изменился. Обновите страницу перед отправкой');return json({ok:true});}
  if(req.method==='DELETE'){await db.batch([db.prepare('UPDATE voice_notes SET shared_doctor_id=NULL,shared_at=NULL WHERE id=? AND patient_id=?').bind(id,u.id),db.prepare('DELETE FROM voice_emotions WHERE voice_id=?').bind(id)]);return json({ok:true});}
 }
 if(path[2]==='emotion'&&path.length===3){doctor();if(!allowedDoctor)fail(404,'Запись недоступна этому врачу');
  if(req.method==='GET'){const a=await row('SELECT * FROM voice_emotions WHERE voice_id=? AND doctor_id=?',id,u.id);return json({analysis:a?{scores:JSON.parse(a.scores_json),segments:a.segments,modelVersion:a.model_version,createdAt:a.created_at}:null});}
  if(req.method==='POST'){const b=await body(req),scores=b.scores;
   if(b.modelVersion!==EMOTION_MODEL_VERSION||b.sha256!==n.sha256||!scores||Object.keys(scores).sort().join()!==[...EMOTION_LABELS].sort().join()||EMOTION_LABELS.some(k=>typeof scores[k]!=='number'||!Number.isFinite(scores[k])||scores[k]<0||scores[k]>1)||Math.abs(EMOTION_LABELS.reduce((s,k)=>s+scores[k],0)-1)>0.001||!Number.isInteger(b.segments)||b.segments!==Math.ceil(n.duration_ms/10000))fail(400,'Некорректный результат модели');
   const result=await db.prepare(`INSERT INTO voice_emotions(voice_id,doctor_id,model_version,scores_json,segments,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM voice_notes v JOIN patient_records p ON p.patient_id=v.patient_id AND p.doctor_id=v.shared_doctor_id WHERE v.id=? AND v.shared_doctor_id=?) ON CONFLICT(voice_id) DO UPDATE SET doctor_id=excluded.doctor_id,model_version=excluded.model_version,scores_json=excluded.scores_json,segments=excluded.segments,created_at=excluded.created_at`).bind(id,u.id,b.modelVersion,JSON.stringify(scores),b.segments,Date.now(),id,u.id).run();if(!result.meta.changes)fail(409,'Доступ к записи изменился');return json({ok:true});}
 }
 return fail(405,'Действие не поддерживается');
}
