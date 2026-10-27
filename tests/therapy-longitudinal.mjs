import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {CHECKS,DAY} from '../lib/therapy-review.ts';
const base=process.argv[2]||'http://127.0.0.1:8788';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local synthetic accounts only');
let count=0;const stamp=crypto.randomUUID(),password='Synthetic-'+crypto.randomUUID();
const sql=command=>execFileSync(process.execPath,['--import','./scripts/runtime.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.jsonc','--persist-to','.wrangler/state','--command',command],{stdio:'pipe'});
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const eq=(a,b)=>{assert.deepEqual(a,b);count++};
async function req(path,u,method='GET',body,status=200){
 const response=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(u?{Cookie:u.cookie,'X-Compass-User':u.user.id}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();eq(response.status,status);
 return {...data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const register=(role,name)=>req('auth/register',null,'POST',{name:'Synthetic '+name,email:stamp+name+'@example.test',password,role});
const doctor=await register('doctor','dynamics-doctor'),other=await register('doctor','other-doctor');
const good=Object.fromEntries(CHECKS.map(c=>[c.key,c.safe]));
const history='Synthetic prior first- and second-line treatments reviewed with duration, response, tolerability and adherence.';
for(const [key,mild] of [['gad7',5],['hars',8],['bai',10],['dass42',8]]){
 const patient=await register('patient',key),id=patient.user.id,path='patients/'+id+'/therapy-review';
 await req('me',patient,'PATCH',{name:patient.user.name,birthDate:'1990-01-01'});
 const invite=await req('invites',doctor,'POST',{});await req('invites/'+invite.token,patient,'POST',{});
 const {assignment:a}=await req('patients/'+id+'/tests',doctor,'POST',{testKey:key,intervalDays:14});
 const clinician=['hars','bai'].includes(key),formPath=clinician?'patients/'+id+'/tests/'+a.id:'tests/'+a.id;
 const f=await req(formPath,clinician?doctor:patient);
 const size=key==='bai'?0:f.definition.questions.length,answers=Array(size).fill(0),indices=key==='dass42'?[2,4,7,9,15,19,20,23,25,28,30,36,40,41].map(i=>i-1):answers.map((_,i)=>i);
 let remainder=mild;for(const i of indices){answers[i]=Math.min(key==='hars'?4:3,remainder);remainder-=answers[i];}
 const date=new Date().toISOString().slice(0,10);
 const extra=key==='bai'?{assessment_date:date,source_version:'КР РФ 2024, приложение Г6',total:mild}:{};
 const send={id:crypto.randomUUID(),version:f.definition.version,dueAt:a.nextDueAt,answers,extra};
 const saved=await req(formPath+'/results',clinician?doctor:patient,'POST',send);
 eq((await req(path,doctor)).review.active,false);
 // Historical observations are copies of this run's valid API result only.
 const now=saved.result.submittedAt;
 for(const days of [14,28]){
  const at=now-days*DAY,resultId=crypto.randomUUID();
  const encoded=key==='bai'?JSON.stringify({answers:[],extra:{...extra,assessment_date:new Date(at).toISOString().slice(0,10)}}):JSON.stringify(answers);
  sql(`INSERT INTO test_results(id,assignment_id,cycle_due_at,submitted_at,test_version,answers,depression,anxiety,stress,scores_json,interval_days,recorded_by,entry_mode) SELECT ${quote(resultId)},assignment_id,${at},${at},test_version,${quote(encoded)},depression,anxiety,stress,scores_json,interval_days,recorded_by,entry_mode FROM test_results WHERE id=${quote(saved.result.id)} AND assignment_id=${quote(a.id)}`);
 }
 let review=(await req(path,doctor)).review;
 eq(review.active,true);eq(review.evidence.testKey,key);eq(review.evidence.trigger,'persistent');eq(review.evidence.points.length,3);eq(review.status,'needs_review');eq(!!review.suggestion,false);
 review=(await req(path,doctor,'PUT',{context:review.context,revision:review.revision,checks:good,history})).review;
 eq(review.status,'consider');assert.match(review.suggestion.title,/Авиандр/);count++;
 eq((await req('patients/'+id+'/medications',doctor)).medications.length,0);
 await req(path,patient,'GET',undefined,403);await req(path,other,'GET',undefined,404);
 const patientView=await req('my-treatment',patient);eq(JSON.stringify(patientView).includes('Авиандр'),false);eq(JSON.stringify(patientView).includes(history),false);
 // A newer low result breaks the sequence. Client cannot revive an old review.
 sql(`UPDATE test_assignments SET next_due_at=1 WHERE id=${quote(a.id)} AND patient_id=${quote(id)}`);
 const next=await req(formPath,clinician?doctor:patient);
 await req(formPath+'/results',clinician?doctor:patient,'POST',{...send,id:crypto.randomUUID(),dueAt:next.assignment.nextDueAt,answers:answers.map(()=>0),extra:key==='bai'?{...extra,total:0}:extra});
 eq((await req(path,doctor)).review.active,false);
 await req(path,doctor,'PUT',{context:review.context,revision:review.revision,checks:good,history},409);
}
console.log(`Longitudinal therapy API: ${count} checks passed`);
