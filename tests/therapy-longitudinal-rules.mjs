import assert from 'node:assert/strict';
import {DAY,longitudinalEvidence} from '../lib/therapy-review.ts';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const now=Date.UTC(2026,9,27,12),versions={gad7:'ru-zolotareva-2023',phq9:'ru-zolotareva-2023',hars:'ru-kr-2024-v1',bai:'ru-kr-2024-v1',dass42:'ru-fattakhov-2025'};
const dassItems=[2,4,7,9,15,19,20,23,25,28,30,36,40,41];
function row(key,score,days=0,extra={}){
 const count={gad7:7,phq9:9,hars:14,bai:0,dass42:42}[key],max=key==='hars'?4:3,answers=Array(count).fill(0);
 const indices=key==='dass42'?dassItems.map(i=>i-1):answers.map((_,i)=>i);
 let remainder=score;for(const i of indices){answers[i]=Math.min(max,remainder);remainder-=answers[i];}
 const at=now-days*DAY;
 const value=key==='bai'?{answers:[],extra:{total:score,source_version:'КР РФ 2024, приложение Г6',assessment_date:new Date(at).toISOString().slice(0,10)}}:key==='hars'?{answers,extra:{}}:answers;
 return {id:crypto.randomUUID(),test_key:key,test_version:versions[key],answers:JSON.stringify(value),submitted_at:at,entry_mode:key==='hars'?'clinician':key==='bai'?'external':'patient',...extra};
}
for(const [key,mild,moderate] of [['gad7',5,10],['hars',8,18],['bai',10,22],['dass42',8,10]]){
 const evidence=rows=>longitudinalEvidence(rows,now).evidence;
 eq(evidence([row(key,mild)]),null);
 eq(evidence([row(key,moderate)])?.trigger,'single');
 eq(evidence([row(key,mild,0),row(key,mild,14),row(key,mild,28)])?.trigger,'persistent');
 eq(evidence([row(key,mild,0),row(key,mild,14),row(key,mild,28)])?.points.length,3);
 eq(evidence([row(key,mild,0),row(key,mild,14),row(key,mild,28)])?.spanDays,28);
 eq(evidence([row(key,mild,0),row(key,mild,13),row(key,mild,27)]),null);
 eq(evidence([row(key,mild,0),row(key,mild,14)]),null);
 eq(evidence([row(key,mild,15),row(key,mild,29),row(key,mild,43)]),null);
 eq(evidence([row(key,mild,0),row(key,mild,14),row(key,mild,57)]),null);
 eq(evidence([row(key,mild,0),row(key,0,7),row(key,mild,14),row(key,mild,28)]),null);
 eq(evidence([row(key,0),row(key,moderate,14),row(key,moderate,28)]),null);
 eq(evidence([row(key,moderate,31)]),null);
 eq(evidence([row(key,mild,0,{test_version:'other'}),row(key,moderate,14)]),null);
 eq(evidence([row(key,mild,0,{answers:'broken'}),row(key,moderate,14)]),null);
 eq(evidence([row(key,moderate,-1)]),null);
}
// Different tests never become three observations of one scale.
eq(longitudinalEvidence([row('gad7',5,0),row('hars',8,14),row('bai',10,28)],now).evidence,null);
const context=longitudinalEvidence([row('phq9',27),row('gad7',5)],now);
eq(context.evidence,null);eq(context.measures.length,2);eq(context.measures.find(m=>m.testKey==='phq9').usable,false);
eq(longitudinalEvidence([row('hars',20,0,{entry_mode:'patient'})],now).evidence,null);
eq(longitudinalEvidence([row('gad7',20,0,{answers:'["3",3,3,3,3,3,3]'})],now).evidence,null);
const otherBai=row('bai',40);const other=JSON.parse(otherBai.answers);other.extra.source_version='unidentified form';otherBai.answers=JSON.stringify(other);
eq(longitudinalEvidence([otherBai],now).evidence,null);eq(longitudinalEvidence([otherBai],now).measures[0].usable,false);
for(const date of ['2026-02-31','2026-10-28','2025-01-01']){
 const r=row('bai',40),v=JSON.parse(r.answers);v.extra.assessment_date=date;r.answers=JSON.stringify(v);eq(longitudinalEvidence([r],now).evidence,null);
}
// A late-entered old BAI cannot look fresh because it was entered today.
const oldBai=row('bai',40,40,{submitted_at:now});eq(longitudinalEvidence([oldBai],now).evidence,null);
const ordered=longitudinalEvidence([row('gad7',7,0),row('gad7',6,14),row('gad7',5,28)],now).evidence;
eq(ordered.points.map(p=>p.score),[5,6,7]);
eq(longitudinalEvidence([row('gad7',5,0),row('gad7',6,14),row('gad7',7,28)],now).evidence,null);
// DASS stress/depression scores do not leak into its anxiety score.
const stress=row('dass42',0),ans=Array(42).fill(3);for(const i of dassItems)ans[i-1]=0;stress.answers=JSON.stringify(ans);
eq(longitudinalEvidence([stress],now).evidence,null);
console.log(`Longitudinal therapy review: ${checks} checks passed`);
