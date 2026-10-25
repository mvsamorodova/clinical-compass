import assert from 'node:assert/strict';
import { CATALOGUE as ALL_TESTS, DASS42, PHQ9, GAD7, MFQ20, POMS38, WEEK, scoreAssessment, validAnswers } from '../lib/assessments.ts';
const CATALOGUE=[DASS42,PHQ9,GAD7,MFQ20,POMS38];

const base=process.argv[2]||'http://127.0.0.1:8787';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test database');
const stamp=crypto.randomUUID(),password='Test-'+crypto.randomUUID();let checks=0;
function eq(actual,expected,message){assert.deepEqual(actual,expected,message);checks++;}
const positiveWords=new Set(['Гордый','Оживленный','Активный','Энергичный','Азартный','Уверенный в себе','Удовлетворенный','Воодушевленный','Бодрый']);
const expected={dass42:{depression:42,anxiety:42,stress:42},phq9:{total:27},gad7:{total:21},mfq20_ru:{total:40},poms38_ru:{negative:116,positive:36,disturbance:80}};
eq(CATALOGUE.map(t=>t.questions.length),[42,9,7,20,38]);
eq(MFQ20.questions.includes('Я чувствую себя вялым'),false);
eq(POMS38.questions.includes('Озадаченный'),false);eq(POMS38.questions.includes('Яростный'),false);
eq(POMS38.questions.filter(w=>positiveWords.has(w)).length,9);
for(const t of CATALOGUE){
 eq(scoreAssessment(t,Array(t.questions.length).fill(t.options.length-1)),expected[t.key],t.key+' upper bounds');
 for(const bad of [null,[],Array(t.questions.length-1).fill(0),Array(t.questions.length).fill(t.options.length),Array(t.questions.length).fill(-1),Array(t.questions.length).fill(.5),Array(t.questions.length).fill('1')])eq(validAnswers(bad,t),false,t.key+' rejects invalid answers');
 eq(validAnswers(Array(t.questions.length).fill(0),t),true);
}
eq(scoreAssessment(POMS38,POMS38.questions.map(w=>positiveWords.has(w)?4:0)),{negative:0,positive:36,disturbance:-36});
eq(scoreAssessment(POMS38,POMS38.questions.map(w=>positiveWords.has(w)?0:4)),{negative:116,positive:0,disturbance:116});
for(let i=0;i<POMS38.questions.length;i++){
 const answers=Array(38).fill(0);answers[i]=1;const positive=positiveWords.has(POMS38.questions[i]);
 eq(scoreAssessment(POMS38,answers),{negative:positive?0:1,positive:positive?1:0,disturbance:positive?-1:1},'POMS '+POMS38.questions[i]);
}

async function req(path,{method='GET',body,cookie,expect=200}={}){
 const response=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const json=await response.json();eq(response.status,expect,`${method} ${path}: ${JSON.stringify(json)}`);eq(response.headers.get('cache-control'),'no-store');
 return {...json,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const register=(role,suffix)=>req('auth/register',{method:'POST',body:{name:'Catalogue '+suffix,email:`${stamp}-${suffix}@example.test`,password,role}});
const d=await register('doctor','doctor'),p=await register('patient','patient'),stranger=await register('patient','stranger');
const invitation=await req('invites',{method:'POST',body:{},cookie:d.cookie});
await req('invites/'+invitation.token,{method:'POST',body:{},cookie:p.cookie});
const root='patients/'+p.user.id+'/tests';
const initial=await req(root,{cookie:d.cookie});eq(initial.catalogue.length,ALL_TESTS.length);
eq((await req('tests',{cookie:p.cookie})).assignments.length,0);
const patientSafe=data=>{for(const field of ['scores','scoreDefinitions','scoringNote','doctorDescription','answers'])eq(JSON.stringify(data).includes('"'+field+'"'),false,'Patient does not receive '+field);};
const submissions=[];
for(const t of CATALOGUE){
 const card=initial.catalogue.find(c=>c.key===t.key);assert.ok(card.doctorDescription.length>60);assert.ok(card.recallLabel.length>5);assert.ok(card.sources.length);eq(card.questionCount,t.questions.length);eq(card.scoreDefinitions,t.scoreDefinitions);
 const a=(await req(root,{method:'POST',body:{testKey:t.key},cookie:d.cookie})).assignment;
 eq((await req(root,{method:'POST',body:{testKey:t.key},cookie:d.cookie})).assignment.id,a.id,'No duplicate assignment');
 const form=await req('tests/'+a.id,{cookie:p.cookie});patientSafe(form);eq(form.definition.questions,t.questions);eq(form.definition.options,t.options);eq(form.definition.recallLabel,t.recallLabel);
 await req('tests/'+a.id,{cookie:stranger.cookie,expect:404});
 const answers=t.key===POMS38.key?t.questions.map(w=>positiveWords.has(w)?4:0):Array(t.questions.length).fill(t.options.length-1);
 const send={id:crypto.randomUUID(),version:t.version,dueAt:a.nextDueAt,answers};
 await req('tests/'+a.id+'/results',{method:'POST',body:{...send,answers:Array(t.questions.length).fill(t.options.length)},cookie:p.cookie,expect:400});
 await req('tests/'+a.id+'/results',{method:'POST',body:{...send,version:'wrong'},cookie:p.cookie,expect:409});
 const saved=await req('tests/'+a.id+'/results',{method:'POST',body:{...send,scores:{total:999,negative:999}},cookie:p.cookie});patientSafe(saved);
 eq(saved.result.nextDueAt-saved.result.submittedAt,WEEK);
 const duplicate=await req('tests/'+a.id+'/results',{method:'POST',body:send,cookie:p.cookie});eq(duplicate.result.id,saved.result.id);
 await req('tests/'+a.id+'/results',{method:'POST',body:{...send,id:crypto.randomUUID()},cookie:p.cookie,expect:409});
 submissions.push({test:t,result:saved.result});
}
const history=await req(root,{cookie:d.cookie});eq(history.results.length,5);
for(const {test,result} of submissions){eq(history.results.find(r=>r.id===result.id).scores,test.key===POMS38.key?{negative:0,positive:36,disturbance:-36}:expected[test.key]);eq(history.assignments.find(a=>a.id===result.assignmentId).nextDueAt,result.nextDueAt);}
const patient=await req('tests',{cookie:p.cookie});eq(patient.assignments.length,5);eq(patient.results.length,5);patientSafe(patient);
eq((await req('tests',{cookie:stranger.cookie})).assignments.length,0);
// A pre-upgrade DASS row has no JSON scores. Verify the additive migration's fallback
// with only the uniquely identified fixture from this test, never existing records.
if(process.argv.includes('--legacy-local-result')){
 const {DatabaseSync}=await import('node:sqlite');const {readdirSync}=await import('node:fs');
 const folder='.wrangler/state/v3/d1/miniflare-D1DatabaseObject',files=readdirSync(folder).filter(f=>f.endsWith('.sqlite')&&!f.includes('metadata'));
 eq(files.length,1);const db=new DatabaseSync(folder+'/'+files[0]);const legacy=submissions.find(s=>s.test.key===DASS42.key).result;
 eq(db.prepare('UPDATE test_results SET scores_json=NULL WHERE id=? AND assignment_id=?').run(legacy.id,legacy.assignmentId).changes,1);db.close();
 const restored=await req(root,{cookie:d.cookie});eq(restored.results.find(r=>r.id===legacy.id).scores,{depression:42,anxiety:42,stress:42});
}
console.log(`PASS: ${checks} catalogue checks. Five questionnaire definitions, POMS item polarity and negative totals, per-test validation, all submission flows, weekly schedules, access isolation, patient receipts and legacy DASS fallback.`);
