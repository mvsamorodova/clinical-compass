// Product review rules, not a diagnostic or prescribing algorithm.
export const THERAPY_RULE_VERSION = 'anxiety-review-2026-10-v3';
export const DAY = 86400000;
export const CHECKS = [
 {key:'adult',label:'Возраст — 18 лет и старше',safe:'yes',description:'Возраст рассчитывается по дате рождения. Если её нет, подтвердите возраст по анамнезу.'},
 {key:'indication',label:'Клинические основания подтверждены',safe:'yes',description:'Подтверждён ГТР, тревога продолжает мешать повседневной жизни. Другие причины, включая манию и гипоманию, оценены; препятствий для рассмотрения нет.'},
 {key:'priorLines',label:'Первые две линии терапии дали недостаточный эффект',safe:'yes',description:'Оцените схемы, длительность, эффект, переносимость и приверженность. Наличие назначений само по себе не подтверждает недостаточный эффект.'},
 {key:'contraindications',label:'Противопоказания и ограничения проверены — препятствий нет',safe:'yes',description:'Гиперчувствительность; эпилепсия и органические заболевания мозга; СКФ <60 мл/мин; печёночная недостаточность A–C; беременность и лактация; ингибиторы МАО сейчас или за 14 дней; непереносимость галактозы, дефицит лактазы и глюкозо-галактозная мальабсорбция.'},
 {key:'safety',label:'Безопасность и лекарственные взаимодействия проверены',safe:'yes',description:'Неотложная помощь не требуется. Проверены текущие препараты, серотонинергические и седативные средства, ингибиторы CYP2D6 и остальные меры предосторожности по инструкции.'},
] as const;
export type CheckKey = typeof CHECKS[number]['key'];
export type Answer = 'unknown'|'yes'|'no';
export type TherapyChecks = Record<CheckKey,Answer>;
export const emptyChecks = ():TherapyChecks => Object.fromEntries(CHECKS.map(c=>[c.key,'unknown'])) as TherapyChecks;
export type AssessmentRow = {id:string;test_key:string;test_version:string;answers:string;submitted_at:number;entry_mode?:string};
export type EvidencePoint = {id:string;score:number;submittedAt:number};
export type ReviewMeasure = EvidencePoint & {testKey:string;label:string;max:number;usable:boolean};
export type ReviewEvidence = ReviewMeasure & {trigger:'single'|'persistent';points:EvidencePoint[];spanDays:number};
export type TherapyPatientFacts = {
 birthDate:string;summary:string;unreviewedSafety:boolean;
 medications:{id:string;name:string;dose:string;frequency:string;status:string;createdAt:number}[];
};
export type TherapyReview = {
 active:boolean;context:string;revision:number;stale:boolean;age:number|null;
 patientFacts:TherapyPatientFacts;
 evidence:ReviewEvidence|null;measures:ReviewMeasure[];checks:TherapyChecks;history:string;reviewedAt:number|null;
 status:'needs_review'|'blocked'|'consider';reasons:string[];
 suggestion?:{title:string;text:string};
};
export const REVIEW_SOURCES = [
 {label:'GAD-7: исследование шкалы',url:'https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/410326'},
 {label:'DASS: шкалы и ограничения интерпретации',url:'https://dass.psy.unsw.edu.au/DASSFAQ.htm'},
 {label:'КР Минздрава РФ: ГТР, 2024',url:'https://apicr.minzdrav.gov.ru/api.ashx?op=GetClinrec2&id=457_3'},
 {label:'Официальная характеристика препарата, 21.05.2025',url:'https://sotex.ru/upload/iblock/aa7/rs9bqj20982r3uaisztx5mefa9t3qdhw/OKHLP_maritupirdin-21.05.25.pdf'},
] as const;

export function gadEvidence(r:{id:string;test_version:string;answers:string;submitted_at:number}|null,now:number):EvidencePoint|null{
 if(!r||r.test_version!=='ru-zolotareva-2023'||r.submitted_at>now||now-r.submitted_at>30*DAY)return null;
 try{
  const answers:unknown=JSON.parse(r.answers);
  if(!Array.isArray(answers)||answers.length!==7||answers.some(n=>!Number.isInteger(n)||n<0||n>3))return null;
  const score=answers.reduce((a:number,b:number)=>a+b,0);
  return score>=10?{id:r.id,score,submittedAt:r.submitted_at}:null;
 }catch{return null;}
}

// Severity bands come from the cited instrument/version. The 3 observations,
// 14-day spacing and 56-day window are an explicit product review policy,
// not validated diagnostic criteria, proof of refractoriness or a drug rule.
const ANXIETY_SCALES = [
 {key:'gad7',label:'GAD-7',version:'ru-zolotareva-2023',count:7,itemMax:3,max:21,mild:5,moderate:10},
 {key:'hars',label:'HARS',version:'ru-kr-2024-v1',count:14,itemMax:4,max:56,mild:8,moderate:18},
 {key:'bai',label:'BAI',version:'ru-kr-2024-v1',count:0,itemMax:0,max:63,mild:10,moderate:22},
 {key:'dass42',label:'DASS-42 · тревога',version:'ru-fattakhov-2025',count:42,itemMax:3,max:42,mild:8,moderate:10},
] as const;
const DASS_ANXIETY_ITEMS=[2,4,7,9,15,19,20,23,25,28,30,36,40,41];
function measure(r:AssessmentRow,now:number):ReviewMeasure|null{
 const scale=ANXIETY_SCALES.find(s=>s.key===r.test_key);
 if(!scale&&r.test_key!=='phq9')return null;
 if(!Number.isSafeInteger(r.submitted_at)||r.submitted_at>now||now-r.submitted_at>56*DAY)return null;
 if(r.test_version!==(scale?.version??'ru-zolotareva-2023'))return null;
 try{
  const parsed=JSON.parse(r.answers);
  if(r.test_key==='bai'){
   if(r.entry_mode!=='external'||!parsed||!Array.isArray(parsed.answers)||parsed.answers.length!==0)return null;
   const extra=parsed.extra,score=extra?.total,source=extra?.source_version,date=extra?.assessment_date;
   if(!Number.isInteger(score)||score<0||score>63||typeof source!=='string'||!source.trim()||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
   const at=Date.parse(date+'T00:00:00Z');
   if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==date||at>r.submitted_at||at>now||now-at>56*DAY)return null;
   // Never apply this Russian edition's bands to an unidentified external form.
   const edition=source.toLowerCase().replace(/[\s.,_—-]/g,'');
   const usable=source==='ru-kr-2024-v1'||(edition.includes('кр')&&edition.includes('2024')&&edition.includes('г6'));
   return {id:r.id,testKey:r.test_key,label:'BAI',max:63,score,submittedAt:at,usable};
  }
  if(r.test_key==='hars'&&r.entry_mode!=='clinician')return null;
  const count=scale?.count??9,itemMax=scale?.itemMax??3;
  // HARS includes clinical comment fields, so its API stores {answers, extra}.
  const answers=r.test_key==='hars'&&!Array.isArray(parsed)?parsed?.answers:parsed;
  if(!Array.isArray(answers)||answers.length!==count||answers.some(n=>!Number.isInteger(n)||n<0||n>itemMax))return null;
  const score=r.test_key==='dass42'?DASS_ANXIETY_ITEMS.reduce((s,i)=>s+answers[i-1],0):answers.reduce((s:number,n:number)=>s+n,0);
  return {id:r.id,testKey:r.test_key,label:scale?.label??'PHQ-9',max:scale?.max??27,score,submittedAt:r.submitted_at,usable:r.test_key!=='phq9'};
 }catch{return null;}
}
export function longitudinalEvidence(rows:AssessmentRow[],now:number):{evidence:ReviewEvidence|null;measures:ReviewMeasure[]}{
 // Caller supplies DESC submitted_at, rowid; stable sorting keeps tie order.
 const ordered=[...rows].sort((a,b)=>b.submitted_at-a.submitted_at);
 const candidates:ReviewEvidence[]=[],measures:ReviewMeasure[]=[];
 for(const key of [...ANXIETY_SCALES.map(s=>s.key),'phq9']){
  const series=ordered.filter(r=>r.test_key===key);
  // Invalid, unknown-version or stale latest records must not resurrect older highs.
  const latest=series[0]&&measure(series[0],now);
  if(!latest)continue;
  measures.push(latest);
  const scale=ANXIETY_SCALES.find(s=>s.key===key);
  if(!scale||!latest.usable)continue;
  const age=now-latest.submittedAt;
  const points:EvidencePoint[]=[{id:latest.id,score:latest.score,submittedAt:latest.submittedAt}];
  if(age<=14*DAY&&latest.score>=scale.mild){
   for(const row of series.slice(1)){
    const point=measure(row,now);
    if(!point||!point.usable||point.score<scale.mild)break;
    if(points[points.length-1].submittedAt-point.submittedAt>=14*DAY)points.push({id:point.id,score:point.score,submittedAt:point.submittedAt});
   }
  }
  const spanDays=Math.floor((points[0].submittedAt-points[points.length-1].submittedAt)/DAY);
  if(points.length>=3&&spanDays>=28&&latest.score>=points[points.length-1].score)candidates.push({...latest,trigger:'persistent',points:[...points].reverse(),spanDays});
  else if(age<=30*DAY&&latest.score>=scale.moderate)candidates.push({...latest,trigger:'single',points:[points[0]],spanDays:0});
 }
 candidates.sort((a,b)=>(a.trigger==='persistent'?0:1)-(b.trigger==='persistent'?0:1)||b.submittedAt-a.submittedAt);
 return {evidence:candidates[0]??null,measures};
}
export function ageAt(birthDate:string,now:number):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return null;
 const d=new Date(birthDate+'T00:00:00Z'),today=new Date(now);
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==birthDate||d.getTime()>now)return null;
 return today.getUTCFullYear()-d.getUTCFullYear()-(today.toISOString().slice(5,10)<birthDate.slice(5)?1:0);
}
// Only authoritative facts can prefill a clinical answer. Missing records never
// establish a diagnosis, adequate prior treatment, safety or no contraindications.
export function withPatientFacts(checks:TherapyChecks,age:number|null,birthDate:string,unreviewedSafety:boolean):TherapyChecks{
 return {...checks,adult:birthDate?(age===null?'unknown':age>=18?'yes':'no'):checks.adult,safety:unreviewedSafety?'no':checks.safety};
}
export function assessReview(checks:TherapyChecks,history:string,age:number|null,unreviewedSafety:boolean):{status:TherapyReview['status'];reasons:string[]}{
 if(unreviewedSafety)return {status:'blocked',reasons:['Сначала просмотрите сигнал безопасности и оцените текущее состояние пациента.']};
 if(age!==null&&age<18)return {status:'blocked',reasons:['Возраст по профилю меньше 18 лет.']};
 const obstacles=CHECKS.filter(c=>checks[c.key]!=='unknown'&&checks[c.key]!==c.safe);
 if(obstacles.length)return {status:'blocked',reasons:obstacles.map(c=>'Не подтверждено: '+c.label)};
 const missing:string[]=CHECKS.filter(c=>checks[c.key]==='unknown').map(c=>c.label);
 if(!history.trim())missing.push('История предшествующей терапии');
 return missing.length?{status:'needs_review',reasons:missing}:{status:'consider',reasons:[]};
}
