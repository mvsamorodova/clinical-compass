import assert from 'node:assert/strict';
import {assessmentRisk, RISK_RULES} from '../lib/assessment-risk.ts';
import {CATALOGUE} from '../lib/assessments.ts';
import {emptySafetyPlan} from '../lib/safety-plan.ts';
import {reflectionPrompts, validateReflections} from '../lib/reflection.ts';

// Clinical boundaries are intentionally explicit, independent of implementation metadata.
const boundaries=[['dass42','depression',28],['dass42','anxiety',20],['dass42','stress',34],['phq9','total',20],['gad7','total',15],['hdrs17','total',24],['madrs','total',35],['hars','total',25],['bai','total',36],['psychache13','total',56],['bhs11','total',40]];
for(const [key,score,cutoff] of boundaries){
 const version=CATALOGUE.find(t=>t.key===key).version;
 assert.equal(RISK_RULES[key].version,version);
 const kind=['psychache13','bhs11'].includes(key)?'review':'severity';
 assert.equal(assessmentRisk(key,version,{[score]:cutoff-1},[]).filter(r=>r.kind===kind).length,0);
 assert.equal(assessmentRisk(key,version,{[score]:cutoff},[]).filter(r=>r.kind===kind).length,1);
 assert.deepEqual(assessmentRisk(key,'different-version',{[score]:cutoff},[]),[]);
}
assert.deepEqual(Object.keys(RISK_RULES).sort(),CATALOGUE.map(t=>t.key).sort());
const risk=(key,scores={},answers=[],extra={})=>assessmentRisk(key,RISK_RULES[key].version,scores,answers,extra);
assert.equal(risk('phq9',{total:1},[0,0,0,0,0,0,0,0,1])[0].kind,'safety');
assert.equal(risk('hdrs17',{total:1},[0,0,1])[0].kind,'safety');
assert.equal(risk('hdrs17',{total:23})[0].kind,'review');
assert.equal(risk('beck_supplied21',{},[0,0,0,0,0,0,0,0,1])[0].kind,'safety');
assert.equal(risk('hcl33',{total:15}).length,0); assert.equal(risk('hcl33',{total:16})[0].kind,'review');
assert.equal(risk('cssrs_lifetime',{},[],{ideation5:1})[0].kind,'review');
assert.equal(risk('cssrs_lifetime',{},[],{observed_behavior:1})[0].kind,'safety');
assert.equal(risk('cssrs_lifetime',{},[],{nssi:1})[0].kind,'review');
for(const key of ['mfq20_ru','poms38_ru','scl90r','itt','beck_supplied21'])assert.deepEqual(risk(key,{total:999}),[]);
assert.equal(new Set([0,1,2,3].flatMap(i=>reflectionPrompts(i).map(q=>q.id))).size,16);
for(let i=0;i<5;i++)assert.deepEqual(reflectionPrompts(i).map(q=>q.kind),['text','choice','text','choice']);
assert.throws(()=>validateReflections([{id:'pace',value:'unlisted choice'}]));

const base=process.argv[2]||'http://127.0.0.1:8787';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use synthetic accounts only on localhost');
const stamp=crypto.randomUUID(),password='Test-'+crypto.randomUUID();let checks=0;
async function req(path,u,method='GET',body,expect=200){
 const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(u?{Cookie:u.cookie,'X-Compass-User':u.user.id}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,expect,`${method} ${path}: ${JSON.stringify(data)}`);assert.equal(r.headers.get('cache-control'),'no-store');checks++;
 return {...data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const register=(role,name)=>req('auth/register',null,'POST',{name:'Synthetic '+name,email:stamp+name+'@example.test',password,role});
const d=await register('doctor','doctor'),other=await register('doctor','other'),p=await register('patient','patient'),stranger=await register('patient','stranger');
const link=async(doctor,patient)=>{const i=await req('invites',doctor,'POST',{});await req('invites/'+i.token,patient,'POST',{});};await link(d,p);
for(const route of ['safety-plan','recovery-map','alerts'])await req(route,null,'GET',undefined,401);
await req('safety-plan',d,'GET',undefined,403);await req('alerts',p,'GET',undefined,403);
const plan=emptySafetyPlan();Object.assign(plan,{warningSigns:['Синтетический сигнал','',''],coping:['Синтетическая стратегия','',''],places:['Безопасное место',''],helpers:[{name:'Тестовый близкий',phone:'+70000000000'},{name:'',phone:''},{name:'',phone:''}],professionals:[{name:'Тестовый врач',phone:'+70000000001'},{name:'',phone:''}],saferEnvironment:['Синтетическое действие',''],reason:'TEST_PRIVATE_PLAN_'+stamp});
const post={id:crypto.randomUUID(),plan,confirmed:true};
await req('safety-plan',p,'POST',{...post,confirmed:false},400);
await req('safety-plan',p,'POST',{...post,plan:{...plan,helpers:[]}},400);
const race=await Promise.all([1,2].map(()=>req('safety-plan',p,'POST',post)));assert.equal(race[0].plan.createdAt,race[1].plan.createdAt);
await req('safety-plan',p,'POST',{...post,id:crypto.randomUUID()},409);
await req('safety-plan',p,'POST',{...post,plan:{...plan,reason:'overwrite'}},409);
for(const method of ['PUT','PATCH','DELETE'])await req('safety-plan',p,method,post,405);
assert.equal((await req('safety-plan',p)).plan.data.reason,plan.reason);
assert.equal((await req('safety-plan',stranger)).plan,null);
assert.equal((await req('patients/'+p.user.id+'/safety-plan',d)).plan.data.reason,plan.reason);
await req('patients/'+p.user.id+'/safety-plan',other,'GET',undefined,404);
await req('patients/'+p.user.id+'/safety-plan',d,'POST',post,405);
const blocked=await fetch(base+'/api/safety-plan',{method:'POST',headers:{Origin:'https://invalid.test',Cookie:stranger.cookie,'Content-Type':'application/json'},body:JSON.stringify(post)});assert.equal(blocked.status,403);

let map=await req('recovery-map',p);assert.equal(map.nodes.length,7);assert.equal(map.nodes[0].status,'available');assert.ok(map.nodes.slice(1).every(n=>n.status==='locked'));
const progress=(key,status='completed',answer='TEST_PRIVATE_MAP_'+stamp)=>req('recovery-map/'+key,p,'PUT',{status,answer});
await req('recovery-map/horizon',p,'PUT',{status:'in_progress',answer:''},409);
await req('recovery-map/branch',p,'PUT',{branch:'body'},409);
await req('recovery-map/roots',p,'PUT',{status:'completed',answer:''},400);
await progress('roots','in_progress');assert.equal((await req('recovery-map',p)).nodes[0].status,'in_progress');
await progress('roots');
assert.equal((await req('recovery-map',p)).nodes.find(n=>n.key==='understand').status,'locked');
await req('recovery-map/understand',p,'PUT',{status:'completed',answer:'not ready'},409);
const reflections=[{id:'moment',value:'TEST_PRIVATE_REFLECTION_'+stamp},{id:'pace',value:'Спокойно'}];
const diary={id:crypto.randomUUID(),mood:4,emotions:[],note:'',shareWithDoctor:false,reflections};
await req('journal',p,'POST',{...diary,reflections:[...reflections,reflections[0]]},400);
await req('journal',p,'POST',diary);
assert.deepEqual((await req('journal',p)).entries[0].reflections,reflections);
assert.ok(!JSON.stringify(await req('patients/'+p.user.id+'/journal',d)).includes('TEST_PRIVATE_REFLECTION'));
const shared={...diary,id:crypto.randomUUID(),shareWithDoctor:true,reflections:[{id:'support',value:'Shared observation'}]};await req('journal',p,'POST',shared);
assert.deepEqual((await req('patients/'+p.user.id+'/journal',d)).entries[0].reflections,shared.reflections);
map=await req('recovery-map',p);assert.equal(map.nodes.find(n=>n.key==='understand').status,'available');await progress('understand');
assert.equal((await req('recovery-map',p)).nodes.find(n=>n.key==='body').status,'locked');
await req('recovery-map/branch',p,'PUT',{branch:'body'});map=await req('recovery-map',p);assert.equal(map.nodes.find(n=>n.key==='body').status,'available');assert.equal(map.nodes.find(n=>n.key==='thoughts').status,'locked');
await req('recovery-map/small-step',p,'PUT',{status:'completed',answer:'skip branch'},409);
await req('recovery-map/branch',p,'PUT',{branch:'thoughts'});await progress('thoughts');assert.equal((await req('recovery-map',p)).nodes.find(n=>n.key==='body').status,'available');await progress('small-step');await progress('support');await progress('horizon');
await progress('roots','in_progress');assert.equal((await req('recovery-map',p)).nodes[0].status,'completed');
const doctorMap=await req('patients/'+p.user.id+'/recovery-map',d);assert.equal(doctorMap.branch,'thoughts');assert.ok(!JSON.stringify(doctorMap).includes('TEST_PRIVATE_MAP'));assert.ok(doctorMap.nodes.every(n=>!('answer' in n)));
assert.equal((await req('recovery-map',stranger)).nodes.filter(n=>n.status==='completed').length,0);
await req('patients/'+p.user.id+'/recovery-map',other,'GET',undefined,404);
await req('patients/'+p.user.id+'/recovery-map',d,'PUT',{},405);

// A direct PHQ-9 safety answer alerts independently of the total and is atomic/idempotent.
const a=(await req('patients/'+p.user.id+'/tests',d,'POST',{testKey:'phq9'})).assignment;
const answers=[0,0,0,0,0,0,0,0,1];const result={id:crypto.randomUUID(),version:RISK_RULES.phq9.version,dueAt:a.nextDueAt,answers};
const saved=await Promise.all([1,2].map(()=>req('tests/'+a.id+'/results',p,'POST',result)));
assert.equal(saved[0].result.id,saved[1].result.id);assert.ok(!JSON.stringify(saved[0]).includes('scores'));
assert.equal((await req('alerts?patientId='+p.user.id,d)).alerts.length,1);await req('alerts?patientId='+p.user.id,other,'GET',undefined,404);
let alerts=(await req('alerts',d)).alerts;assert.equal(alerts.length,1);assert.equal(alerts[0].reasons[0].kind,'safety');
assert.equal((await req('alerts',other)).alerts.length,0);assert.equal((await req('safety-plan',p)).signalCount,1);
await req('alerts/'+alerts[0].id,other,'PATCH',{},404);await req('alerts/'+alerts[0].id,p,'PATCH',{},403);
await req('alerts/'+alerts[0].id,d,'PATCH',{});assert.equal((await req('safety-plan',p)).signalCount,0);
assert.ok((await req('alerts',d)).alerts[0].reviewedAt);
// Different answers using the same id must not create an alert for the losing payload.
await link(d,stranger);
const concurrent=(await req('patients/'+stranger.user.id+'/tests',d,'POST',{testKey:'phq9'})).assignment;
const sameId=crypto.randomUUID();
const contested=await Promise.all([Array(9).fill(0),answers].map(values=>fetch(base+'/api/tests/'+concurrent.id+'/results',{method:'POST',headers:{Origin:base,Cookie:stranger.cookie,'Content-Type':'application/json'},body:JSON.stringify({id:sameId,version:RISK_RULES.phq9.version,dueAt:concurrent.nextDueAt,answers:values})})));
assert.deepEqual(contested.map(r=>r.status).sort(),[200,409]);
const actual=(await req('patients/'+stranger.user.id+'/tests/results/'+sameId,d)).response;
assert.equal((await req('alerts',d)).alerts.filter(a=>a.patientId===stranger.user.id).length,actual[8]>0?1:0);assert.ok((await req('alerts?patientId='+p.user.id,d)).alerts.every(a=>a.patientId===p.user.id));assert.ok((await req('alerts?patientId='+stranger.user.id,d)).alerts.every(a=>a.patientId===stranger.user.id));
await req('patients/'+p.user.id,d,'DELETE');await req('patients/'+p.user.id+'/safety-plan',d,'GET',undefined,404);assert.equal((await req('alerts',d)).alerts.filter(a=>a.patientId===p.user.id).length,0);
await link(other,p);assert.equal((await req('alerts',other)).alerts.length,0);assert.equal((await req('safety-plan',p)).plan.data.reason,plan.reason);
console.log(`PASS: clinical boundary checks + ${checks} API checks: immutable plan, concurrent save, permissions, reflection privacy, readiness-based state machine and private answers, atomic alerts and acknowledgement.`);
