import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {CHECKS,emptyChecks} from '../lib/therapy-review.ts';
const base=process.argv[2]||'http://127.0.0.1:8788';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Synthetic accounts on localhost only');
let checks=0;const stamp=crypto.randomUUID(),password='Test-'+crypto.randomUUID();
const sql=command=>execFileSync(process.execPath,['--import','./scripts/runtime.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.jsonc','--persist-to','.wrangler/state','--command',command],{stdio:'pipe'});
async function raw(path,u,method='GET',body,headers={}){
 const res=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(u?{Cookie:u.cookie,'X-Compass-User':u.user.id}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,...await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],cache:res.headers.get('cache-control')};
}
async function req(path,u,method='GET',body,status=200){const r=await raw(path,u,method,body);assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(r)}`);checks++;return r;}
const register=(role,name)=>req('auth/register',null,'POST',{name:'Synthetic '+name,email:stamp+name+'@example.test',password,role});
const d=await register('doctor','doctor'),other=await register('doctor','other'),p=await register('patient','patient'),stranger=await register('patient','stranger');
await req('me',p,'PATCH',{name:p.user.name,birthDate:'1990-01-01'});
async function connect(doc){const i=await req('invites',doc,'POST',{});await req('invites/'+i.token,p,'POST',{});}
await connect(d);const id=p.user.id,path='patients/'+id+'/therapy-review';
let view=await req(path,d);assert.equal(view.review.active,false);assert.equal(view.cache,'no-store');checks+=2;
for(const user of [p,stranger]){await req(path,user,'GET',undefined,403);await req(path,user,'PUT',{},403);}
await req(path,other,'GET',undefined,404);await req(path,null,'GET',undefined,401);
assert.equal((await raw(path,d,'PUT',{}, {Origin:'https://other.example'})).status,403);checks++;
const good=Object.fromEntries(CHECKS.map(c=>[c.key,c.safe]));
const history='Synthetic private history: prior first- and second-line regimens, duration, response and adherence reviewed.';
async function complete(key,answers){
 await req('patients/'+id+'/tests',d,'POST',{testKey:key,intervalDays:7});
 const a=(await req('tests',p)).assignments.find(a=>a.test.key===key),f=await req('tests/'+a.id,p);
 const r=await req('tests/'+a.id+'/results',p,'POST',{id:crypto.randomUUID(),version:f.definition.version,dueAt:a.nextDueAt,answers,extra:{}});
 return {assignment:a.id,result:r.result.id};
}
const gad=await complete('gad7',[2,2,2,1,1,1,1]);
view=await req(path,d);assert.equal(view.review.evidence.score,10);assert.equal(view.review.status,'needs_review');assert.match(view.review.suggestion.title,/Авиандр/);assert.equal(view.review.checks.adult,'yes');assert.equal(view.review.patientFacts.birthDate,'1990-01-01');checks+=5;
async function save(answers=good,text=history){const r=(await req(path,d)).review;return (await req(path,d,'PUT',{context:r.context,revision:r.revision,checks:answers,history:text})).review;}
let saved=await save(emptyChecks(),'');assert.equal(saved.status,'needs_review');assert.notEqual(saved.status,'consider');checks+=2;
saved=await save();assert.equal(saved.status,'consider');assert.match(saved.suggestion.title,/Авиандр/);checks+=2;
for(const c of CHECKS.filter(c=>c.key!=='adult')){
 const blocked=await save({...good,[c.key]:c.safe==='yes'?'no':'yes'});
 assert.equal(blocked.status,'blocked',c.key);assert.match(blocked.suggestion.title,/Авиандр/);checks+=2;
}
saved=await save({...good,contraindications:'unknown'});assert.equal(saved.status,'needs_review');assert.notEqual(saved.status,'consider');checks+=2;
saved=await save(good,'');assert.equal(saved.status,'needs_review');assert.notEqual(saved.status,'consider');checks+=2;
saved=await save({...good,adult:'no'});assert.equal(saved.checks.adult,'yes');assert.equal(saved.status,'consider');checks+=2;
sql(`UPDATE therapy_reviews SET reviewed_at=${Date.now()-14*86400000-1} WHERE patient_id='${id}' AND doctor_id='${d.user.id}'`);
view=await req(path,d);assert.equal(view.review.stale,true);assert.notEqual(view.review.status,'consider','Expired review must not confirm readiness');checks+=2;
saved=await save();const originalSubmittedAt=saved.evidence.submittedAt;
sql(`UPDATE test_results SET submitted_at=${Date.now()-31*86400000} WHERE id='${gad.result}'`);
view=await req(path,d);assert.equal(view.review.active,false);assert.ok(!view.review.suggestion,'Expired GAD result must not authorize a medicine');checks+=2;
sql(`UPDATE test_results SET submitted_at=${originalSubmittedAt} WHERE id='${gad.result}'`);saved=await save();
const old={context:saved.context,revision:saved.revision-1,checks:good,history};await req(path,d,'PUT',old,409);
await req(path,d,'PUT',{...old,revision:saved.revision,eligible:true},400);
await req(path,d,'PUT',{...old,revision:saved.revision,checks:{...good,force:true}},400);
await req(path,d,'PUT',null,400);await req(path,d,'DELETE',undefined,405);
for(const patientPath of ['my-care','my-treatment','tests','recovery-map','journal']){
 const r=await req(patientPath,p);assert.ok(!JSON.stringify(r).includes('Авиандр'));assert.ok(!JSON.stringify(r).includes(history));checks+=2;
}
const meds=(await req('patients/'+id+'/medications',d)).medications;assert.equal(meds.length,0,'Review must not create an order');checks++;
await req('me',p,'PATCH',{name:p.user.name,birthDate:'2015-01-01'});
saved=await save();assert.equal(saved.status,'blocked');assert.notEqual(saved.status,'consider','A checkbox cannot override age in the profile');checks+=2;
await req('me',p,'PATCH',{name:p.user.name,birthDate:'1990-01-01'});saved=await save();
await req('me',p,'PATCH',{name:p.user.name,birthDate:'1990-02-31'});saved=await save();assert.equal(saved.status,'blocked');assert.notEqual(saved.status,'consider','An invalid profile date requires correction');checks+=2;
await req('me',p,'PATCH',{name:p.user.name,birthDate:'1990-01-01'});saved=await save();
const staleContext=saved.context,staleRevision=saved.revision;
await req('patients/'+id+'/medications',d,'POST',{id:crypto.randomUUID(),name:'Synthetic existing treatment',dose:'Synthetic',frequency:'Synthetic',notes:''});
await req(path,d,'PUT',{context:staleContext,revision:staleRevision,checks:good,history},409);
view=await req(path,d);assert.equal(view.review.stale,true);assert.equal(view.review.status,'needs_review');assert.notEqual(view.review.status,'consider');assert.equal(view.review.patientFacts.medications[0].name,'Synthetic existing treatment');assert.equal(view.review.checks.priorLines,'unknown');checks+=5;
saved=await save();
await complete('phq9',Array(9).fill(3));
saved=await save();assert.equal(saved.status,'blocked');assert.match(saved.reasons[0],/безопасности/);assert.notEqual(saved.status,'consider');checks+=3;
for(const a of (await req('alerts?patientId='+id,d)).alerts.filter(a=>a.reasons.some(r=>r.kind==='safety')))await req('alerts/'+a.id,d,'PATCH',{});
view=await req(path,d);assert.equal(view.review.status,'needs_review');assert.notEqual(view.review.status,'consider','Acknowledgement alone must not confirm readiness');checks+=2;
saved=await save({...good,safety:'no'});assert.equal(saved.status,'blocked');checks++;
saved=await save();assert.equal(saved.status,'consider');checks++;
// Only synthetic records owned by this run are adjusted to open a second test cycle.
sql(`UPDATE test_assignments SET next_due_at=1 WHERE id='${gad.assignment}' AND patient_id='${id}'`);
const a=(await req('tests',p)).assignments.find(a=>a.id===gad.assignment),f=await req('tests/'+a.id,p);
await req('tests/'+a.id+'/results',p,'POST',{id:crypto.randomUUID(),version:f.definition.version,dueAt:a.nextDueAt,answers:Array(7).fill(0),extra:{}});
view=await req(path,d);assert.equal(view.review.active,false);assert.ok(!view.review.suggestion,'Latest low GAD must suppress the older high result');checks+=2;
await req('patients/'+id,d,'DELETE');await req(path,d,'GET',undefined,404);await connect(other);
view=await req(path,other);assert.equal(view.review.active,false);assert.equal(view.review.history,'');assert.equal(view.review.revision,0);checks+=3;
await req(path,d,'GET',undefined,404);await req(path,d,'PUT',{context:saved.context,revision:saved.revision,checks:good,history},404);
console.log(`Physician therapy review: ${checks} checks passed`);
