export type HealthProvider='apple_health'|'health_connect';
export type HealthMetric='steps'|'sleepMinutes'|'activeMinutes';
export type HealthDay={day:string;steps:number|null;sleepMinutes:number|null;activeMinutes:number|null;stepsSource:string;sleepSource:string;activitySource:string};
export const PROVIDERS={apple_health:'Apple «Здоровье»',health_connect:'Health Connect'};
export const METRICS:{key:HealthMetric;label:string;unit:string}[]=[{key:'steps',label:'Шаги',unit:'шагов'},{key:'sleepMinutes',label:'Сон',unit:'мин'},{key:'activeMinutes',label:'Активность',unit:'мин'}];
export const sourceKey={steps:'stepsSource',sleepMinutes:'sleepSource',activeMinutes:'activitySource'} as const;
export function validDay(day:unknown):day is string{return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day&&day>='1970-01-01'&&day<='2100-12-31';}
export function validateHealthDays(value:unknown):HealthDay[]{
 if(!Array.isArray(value)||!value.length||value.length>30)throw Error('За одну отправку можно сохранить от 1 до 30 дней');
 const seen=new Set<string>();
 return value.map(row=>{
  if(!row||!validDay(row.day)||seen.has(row.day))throw Error('Проверьте даты: каждая дата должна встречаться один раз');seen.add(row.day);
  const clean:HealthDay={day:row.day,steps:null,sleepMinutes:null,activeMinutes:null,stepsSource:'',sleepSource:'',activitySource:''};
  for(const {key} of METRICS){const n=row[key];if(n===null||n===undefined)continue;if(!Number.isInteger(n)||n<0||n>(key==='steps'?200000:1440))throw Error('Некорректное значение сна или активности');const src=row[sourceKey[key]];if(typeof src!=='string'||!src.trim()||src.length>150)throw Error('Не указан источник показателя');clean[key]=n;clean[sourceKey[key]]=src.trim();}
  if(METRICS.every(m=>clean[m.key]===null))throw Error('В записи нет показателей');return clean;
 });
}
