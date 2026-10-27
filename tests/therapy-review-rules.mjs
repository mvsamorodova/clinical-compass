import assert from 'node:assert/strict';
import {CHECKS,DAY,emptyChecks,ageAt,gadEvidence,assessReview} from '../lib/therapy-review.ts';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const now=Date.UTC(2026,9,27),good=Object.fromEntries(CHECKS.map(c=>[c.key,c.safe]));
const result=(answers,overrides={})=>({id:'synthetic',test_version:'ru-zolotareva-2023',answers:JSON.stringify(answers),submitted_at:now,...overrides});
eq(gadEvidence(null,now),null);eq(gadEvidence(result([1,1,1,1,1,2,2]),now),null);
eq(gadEvidence(result([2,2,2,1,1,1,1]),now)?.score,10);
eq(gadEvidence(result(Array(7).fill(3)),now)?.score,21);
for(const r of [result([4,1,1,1,1,1,1]),result(Array(6).fill(3)),result(['3',3,3,3,3,3,3]),result({},{}),result(Array(7).fill(3),{test_version:'unverified'}),result(Array(7).fill(3),{submitted_at:now-30*DAY-1}),result(Array(7).fill(3),{submitted_at:now+1}),result([], {answers:'bad json'})])eq(gadEvidence(r,now),null);
eq(gadEvidence(result(Array(7).fill(3),{submitted_at:now-30*DAY}),now)?.score,21);
eq(ageAt('2008-10-27',now),18);eq(ageAt('2008-10-28',now),17);eq(ageAt('2008-02-31',now),null);eq(ageAt('',now),null);eq(ageAt('2030-01-01',now),null);
eq(assessReview(emptyChecks(),'',32,false).status,'needs_review');
eq(assessReview(good,'Reviewed treatment history',32,false).status,'consider');
eq(assessReview(good,'',32,false).status,'needs_review');
eq(assessReview(good,'Reviewed history',17,false).status,'blocked');
eq(assessReview(good,'Reviewed history',32,true).status,'blocked');
for(const c of CHECKS){
 eq(assessReview({...good,[c.key]:'unknown'},'history',32,false).status,'needs_review');
 eq(assessReview({...good,[c.key]:c.safe==='yes'?'no':'yes'},'history',32,false).status,'blocked');
}
console.log(`Therapy review rules: ${checks} checks passed`);
