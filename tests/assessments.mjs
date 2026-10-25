import assert from 'node:assert/strict';
import { DASS42, DASS_KEYS, WEEK, scoreDass42, validAnswers } from '../lib/assessments.ts';
const base=process.argv[2]||'http://127.0.0.1:8787';
const stamp=crypto.randomUUID(),password='Test-'+crypto.randomUUID();let checks=0;
async function req(path,{method='GET',body,cookie,expectedUserId,expect=200}={}){
 const response=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(expectedUserId?{'X-Compass-User':expectedUserId}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const json=await response.json();assert.equal(response.status,expect,`${method} ${path}: ${JSON.stringify(json)}`);assert.equal(response.headers.get('cache-control'),'no-store');checks++;
 return {...json,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const register=(role,suffix)=>req('auth/register',{method:'POST',body:{name:'Tests '+suffix,email:`${stamp}-${suffix}@example.test`,password,role}});
assert.equal(DASS42.questions.length,42);assert.deepEqual(Object.values(DASS_KEYS).flat().sort((a,b)=>a-b),Array.from({length:42},(_,i)=>i+1));
for(const [key,items] of Object.entries(DASS_KEYS)){assert.equal(items.length,14);for(const n of items){const answers=Array(42).fill(0);answers[n-1]=3;assert.deepEqual(scoreDass42(answers),{depression:key==='depression'?3:0,anxiety:key==='anxiety'?3:0,stress:key==='stress'?3:0});checks++;}}
assert.deepEqual(scoreDass42(Array(42).fill(3)),{depression:42,anxiety:42,stress:42});assert.deepEqual(scoreDass42(Array(42).fill(0)),{depression:0,anxiety:0,stress:0});
for(const invalid of [null,[],Array(41).fill(0),Array(43).fill(0),Array(42).fill(4),Array(42).fill(-1),Array(42).fill(1.5),Array(42).fill('1'),Array(42).fill(null)]){assert.equal(validAnswers(invalid),false);checks++;}
const d=await register('doctor','d'),other=await register('doctor','other'),p=await register('patient','p'),stranger=await register('patient','stranger');
const link=async(doctor,patient)=>{const i=await req('invites',{method:'POST',body:{},cookie:doctor.cookie});await req('invites/'+i.token,{method:'POST',body:{},cookie:patient.cookie});};
await link(d,p);
const root='patients/'+p.user.id+'/tests';
await req('tests',{expect:401});await req('tests',{cookie:d.cookie,expect:403});await req(root,{cookie:p.cookie,expect:403});await req(root,{cookie:other.cookie,expect:404});
const initial=await req(root,{cookie:d.cookie});assert.equal(initial.catalogue[0].key,'dass42');assert.equal(initial.assignments.length,0);
await req(root,{method:'POST',body:{testKey:'unknown'},cookie:d.cookie,expect:400});await req(root,{method:'POST',body:null,cookie:d.cookie,expect:400});
const a=(await req(root,{method:'POST',body:{testKey:'dass42'},cookie:d.cookie})).assignment;
const again=(await req(root,{method:'POST',body:{testKey:'dass42'},cookie:d.cookie})).assignment;assert.equal(again.id,a.id);assert.equal(again.nextDueAt,a.nextDueAt);
const form=await req('tests/'+a.id,{cookie:p.cookie});assert.equal(form.definition.questions.length,42);assert.equal(form.definition.version,DASS42.version);
await req('tests/'+a.id,{cookie:stranger.cookie,expect:404});
const send={id:crypto.randomUUID(),version:DASS42.version,dueAt:a.nextDueAt,answers:Array(42).fill(1)};
await req('tests/'+a.id+'/results',{method:'POST',body:send,cookie:stranger.cookie,expect:404});
await req('tests/'+a.id+'/results',{method:'POST',body:send,cookie:p.cookie,expectedUserId:d.user.id,expect:409});
for(const answers of [Array(41).fill(1),Array(42).fill(4),Array(42).fill(null)])await req('tests/'+a.id+'/results',{method:'POST',body:{...send,answers},cookie:p.cookie,expect:400});
await req('tests/'+a.id+'/results',{method:'POST',body:{...send,version:'old'},cookie:p.cookie,expect:409});
await req(root+'/'+a.id,{method:'PATCH',body:{status:'paused'},cookie:d.cookie});
await req('tests/'+a.id+'/results',{method:'POST',body:send,cookie:p.cookie,expect:409});
await req(root+'/'+a.id,{method:'PATCH',body:{status:'active'},cookie:other.cookie,expect:404});
await req(root+'/'+a.id,{method:'PATCH',body:{status:'active'},cookie:d.cookie});
const [r1,r2]=await Promise.all([req('tests/'+a.id+'/results',{method:'POST',body:{...send,scores:{depression:0}},cookie:p.cookie}),req('tests/'+a.id+'/results',{method:'POST',body:send,cookie:p.cookie})]);
assert.equal(r1.result.id,r2.result.id);assert.equal(r1.result.nextDueAt-r1.result.submittedAt,WEEK);assert.ok(!JSON.stringify(r1).includes('scores'));
await req('tests/'+a.id+'/results',{method:'POST',body:{...send,answers:Array(42).fill(3)},cookie:p.cookie,expect:409});
await req('tests/'+a.id+'/results',{method:'POST',body:{...send,id:crypto.randomUUID()},cookie:p.cookie,expect:409});
const records=await req(root,{cookie:d.cookie});assert.equal(records.results.length,1);assert.deepEqual(records.results[0].scores,{depression:14,anxiety:14,stress:14});
const mine=await req('tests',{cookie:p.cookie});assert.equal(mine.results.length,1);assert.equal(mine.assignments[0].nextDueAt,r1.result.nextDueAt);assert.ok(!JSON.stringify(mine).match(/scores|depression|anxiety|stress|answers/));
await req(root,{method:'POST',body:{testKey:'dass42'},cookie:d.cookie});assert.equal((await req('tests',{cookie:p.cookie})).assignments[0].nextDueAt,r1.result.nextDueAt);
// An unknown nested delete must never accidentally unlink the patient.
await req(root+'/missing',{method:'DELETE',cookie:d.cookie,expect:404});await req('patients/'+p.user.id,{cookie:d.cookie});
await req('patients/'+p.user.id,{method:'DELETE',cookie:d.cookie});
assert.equal((await req('tests',{cookie:p.cookie})).assignments.length,0);await req('tests/'+a.id,{cookie:p.cookie,expect:404});await req(root,{cookie:d.cookie,expect:404});
await link(other,p);const newRoot='patients/'+p.user.id+'/tests';assert.equal((await req(newRoot,{cookie:other.cookie})).results.length,0);
const newA=(await req(newRoot,{method:'POST',body:{testKey:'dass42'},cookie:other.cookie})).assignment;assert.notEqual(newA.id,a.id);
const requests=await Promise.all([1,2].map(()=>fetch(base+'/api/tests/'+newA.id+'/results',{method:'POST',headers:{Cookie:p.cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...send,id:crypto.randomUUID(),dueAt:newA.nextDueAt})})));
assert.deepEqual(requests.map(r=>r.status).sort(),[200,409]);checks++;
assert.equal((await req(newRoot,{cookie:other.cookie})).results.length,1);
// Reconnecting to the original doctor preserves history and leaves the old assignment paused.
await req('patients/'+p.user.id,{method:'DELETE',cookie:other.cookie});await link(d,p);
const restored=await req(root,{cookie:d.cookie});assert.equal(restored.assignments[0].status,'paused');assert.equal(restored.results.length,1);assert.equal(restored.assignments[0].nextDueAt,r1.result.nextDueAt);
// Optional local-only clock fixture: exercise a second weekly cycle without changing production time.
if(process.argv.includes('--advance-local-week')){
 assert.equal(new URL(base).hostname,'127.0.0.1');
 const {DatabaseSync}=await import('node:sqlite');const {readdirSync}=await import('node:fs');
 const folder='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
 const file=readdirSync(folder).find(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');assert.ok(file);
 const local=new DatabaseSync(folder+'/'+file);
 const dueAt=Date.now()-1;
 const changed=local.prepare("UPDATE test_assignments SET status='active',next_due_at=? WHERE id=? AND patient_id=? AND doctor_id=?").run(dueAt,a.id,p.user.id,d.user.id);assert.equal(changed.changes,1);local.close();
 const next=await req('tests/'+a.id,{cookie:p.cookie});assert.equal(next.assignment.nextDueAt,dueAt);
 const second=await req('tests/'+a.id+'/results',{method:'POST',body:{...send,id:crypto.randomUUID(),dueAt,answers:Array(42).fill(0)},cookie:p.cookie});
 assert.equal(second.result.nextDueAt-second.result.submittedAt,WEEK);
 const history=await req(root,{cookie:d.cookie});assert.equal(history.results.length,2);assert.deepEqual(history.results[0].scores,{depression:0,anxiety:0,stress:0});
 await req('tests/'+a.id+'/results',{method:'POST',body:{...send,id:crypto.randomUUID(),dueAt},cookie:p.cookie,expect:409});
 console.log('PASS: second weekly cycle opens when due, preserves prior results and schedules the following week.');
}
console.log(`PASS: ${checks} assessment checks. Official item mapping, score bounds, assignment, pauses, ownership, idempotency, concurrent sends, seven-day schedule and reconnection verified.`);
