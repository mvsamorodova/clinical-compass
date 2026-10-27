// Product review rules, not a diagnostic or prescribing algorithm.
export const THERAPY_RULE_VERSION = 'gad-review-2026-10-v1';
export const DAY = 86400000;
export const CHECKS = [
 {key:'adult',label:'Возраст 18 лет и старше подтверждён',safe:'yes',group:'clinical'},
 {key:'gtr',label:'Диагноз ГТР подтверждён клинически',safe:'yes',group:'clinical'},
 {key:'priorLines',label:'Подтверждён недостаточный эффект терапии первых двух линий',safe:'yes',group:'clinical'},
 {key:'differential',label:'Другие причины тревоги, включая манию / гипоманию, оценены; препятствий для рассмотрения нет',safe:'yes',group:'clinical'},
 {key:'allergy',label:'Гиперчувствительность к компонентам',safe:'no',group:'contra'},
 {key:'neurological',label:'Эпилепсия или органическое заболевание головного мозга',safe:'no',group:'contra'},
 {key:'renal',label:'Почечная недостаточность со СКФ <60 мл/мин',safe:'no',group:'contra'},
 {key:'hepatic',label:'Печёночная недостаточность (класс A, B или C по Чайлд-Пью)',safe:'no',group:'contra'},
 {key:'pregnancy',label:'Беременность или грудное вскармливание',safe:'no',group:'contra'},
 {key:'maoi',label:'Приём ингибиторов МАО сейчас или в предыдущие 14 дней',safe:'no',group:'contra'},
 {key:'lactose',label:'Непереносимость галактозы, дефицит лактазы или глюкозо-галактозная мальабсорбция',safe:'no',group:'contra'},
 {key:'interactions',label:'Все текущие препараты, взаимодействия и меры предосторожности проверены',safe:'yes',group:'safety'},
 {key:'safety',label:'Текущая безопасность оценена; неотложная помощь не требуется',safe:'yes',group:'safety'},
] as const;
export type CheckKey = typeof CHECKS[number]['key'];
export type Answer = 'unknown'|'yes'|'no';
export type TherapyChecks = Record<CheckKey,Answer>;
export const emptyChecks = ():TherapyChecks => Object.fromEntries(CHECKS.map(c=>[c.key,'unknown'])) as TherapyChecks;
export type ReviewEvidence = {id:string;score:number;submittedAt:number};
export type TherapyReview = {
 active:boolean;context:string;revision:number;stale:boolean;age:number|null;
 evidence:ReviewEvidence|null;checks:TherapyChecks;history:string;reviewedAt:number|null;
 status:'needs_review'|'blocked'|'consider';reasons:string[];
 suggestion?:{title:string;text:string};
};
export const REVIEW_SOURCES = [
 {label:'GAD-7: исследование шкалы',url:'https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/410326'},
 {label:'КР Минздрава РФ: ГТР, 2024',url:'https://apicr.minzdrav.gov.ru/api.ashx?op=GetClinrec2&id=457_3'},
 {label:'Официальная характеристика препарата, 21.05.2025',url:'https://sotex.ru/upload/iblock/aa7/rs9bqj20982r3uaisztx5mefa9t3qdhw/OKHLP_maritupirdin-21.05.25.pdf'},
] as const;

export function gadEvidence(r:{id:string;test_version:string;answers:string;submitted_at:number}|null,now:number):ReviewEvidence|null{
 if(!r||r.test_version!=='ru-zolotareva-2023'||r.submitted_at>now||now-r.submitted_at>30*DAY)return null;
 try{
  const answers:unknown=JSON.parse(r.answers);
  if(!Array.isArray(answers)||answers.length!==7||answers.some(n=>!Number.isInteger(n)||n<0||n>3))return null;
  const score=answers.reduce((a:number,b:number)=>a+b,0);
  return score>=10?{id:r.id,score,submittedAt:r.submitted_at}:null;
 }catch{return null;}
}
export function ageAt(birthDate:string,now:number):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return null;
 const d=new Date(birthDate+'T00:00:00Z'),today=new Date(now);
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==birthDate||d.getTime()>now)return null;
 return today.getUTCFullYear()-d.getUTCFullYear()-(today.toISOString().slice(5,10)<birthDate.slice(5)?1:0);
}
export function assessReview(checks:TherapyChecks,history:string,age:number|null,unreviewedSafety:boolean):{status:TherapyReview['status'];reasons:string[]}{
 if(unreviewedSafety)return {status:'blocked',reasons:['Сначала просмотрите сигнал безопасности и оцените текущее состояние пациента.']};
 if(age!==null&&age<18)return {status:'blocked',reasons:['Возраст по профилю меньше 18 лет.']};
 const obstacles=CHECKS.filter(c=>checks[c.key]!=='unknown'&&checks[c.key]!==c.safe);
 if(obstacles.length)return {status:'blocked',reasons:obstacles.map(c=>(c.safe==='no'?'Отмечено: ':'Не подтверждено: ')+c.label)};
 const missing:string[]=CHECKS.filter(c=>checks[c.key]==='unknown').map(c=>c.label);
 if(!history.trim())missing.push('История предшествующей терапии');
 return missing.length?{status:'needs_review',reasons:missing}:{status:'consider',reasons:[]};
}
