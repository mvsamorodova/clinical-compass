import type { HealthPreview, HealthSeries } from './health-import';
import type { HealthMetric } from './health-data';
const DAY=86400000;
type Sample={start:number;end:number;offset:number;value:number};
function stamp(s:unknown){
 if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(s))throw Error('Команда передала дату без часового пояса. Обновите команду.');
 const ms=Date.parse(s),m=/([+-])(\d\d):(\d\d)$/.exec(s),offset=m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]))*60000:0;
 if(!Number.isFinite(ms)||Math.abs(offset)>14*3600000)throw Error('Некорректная дата');return {ms,offset};
}
function number(v:unknown){if(typeof v==='number')return v;if(typeof v!=='string')return NaN;const s=v.trim().replace(/[\u00a0\u202f ]/g,'').replace(',','.');return /^\d+(?:\.\d+)?$/.test(s)?Number(s):NaN;}
function sleepValue(value:unknown):boolean|null{
 const v=String(value).trim().toLowerCase().replace(/^hkcategoryvaluesleepanalysis/,'');
 if(['1','3','4','5','asleep','asleepunspecified','asleepcore','asleepdeep','asleeprem','asleep (unspecified)','asleep (core)','asleep (deep)','asleep (rem)','core','deep','rem','сон','во сне','базовый','глубокий','быстрый','базовый сон','глубокий сон','быстрый сон'].includes(v))return true;
 if(['0','2','inbed','in bed','awake','в постели','бодрствование','бодрствует'].includes(v))return false;return null;
}
export function normalizeShortcut(input:any,now=Date.now()):HealthPreview{
 const capture=stamp(input.capturedAt);if(Math.abs(now-capture.ms)>20*60000)throw Error('Дата на телефоне отличается от серверной. Проверьте часы и повторите обновление.');
 const today=new Date(capture.ms+capture.offset).toISOString().slice(0,10),from=new Date(Date.parse(today)-6*DAY).toISOString().slice(0,10);
 const groups=new Map<string,{metric:HealthMetric;source:string;samples:Sample[];seen:Set<string>}>(),warnings=new Set<string>();
 for(const [field,metric] of [['steps','steps'],['sleep','sleepMinutes'],['activity','activeMinutes']] as const){
  if(typeof input[field]!=='string'||input[field].length>1800000)throw Error('Некорректный формат данных команды');
  const lines=input[field].trim()?input[field].trim().split('\u001e'):[];if(lines.length>=5001)throw Error('Слишком много записей. Используйте импорт архива для этого объёма.');
  for(const line of lines){
   let r:any;try{r=JSON.parse(line);}catch{throw Error('Не удалось прочитать данные команды. Установите её последнюю версию.');}
   if(!r||typeof r.source!=='string'||!r.source.trim()||r.source.length>150)throw Error('Не указан источник данных');
   const start=stamp(r.start),end=stamp(r.end);
   if(end.ms<start.ms||end.ms-start.ms>2*DAY||start.ms<now-10*DAY||end.ms>now+5*60000)throw Error('Запись выходит за период обновления');
   let value=number(r.value);
   if(metric==='sleepMinutes'){const asleep=sleepValue(r.value);if(asleep===null)warnings.add('Некоторые стадии сна не распознаны и пропущены. Сверьте сон со «Здоровьем»; при расхождении используйте импорт архива.');if(!asleep)continue;value=0;}
   else if(!Number.isFinite(value)||value<0||value>(metric==='steps'?200000:1440))throw Error('Некорректное значение показателя');
   const source=r.source.trim(),id=metric+'|'+source;
   if(!groups.has(id))groups.set(id,{metric,source,samples:[],seen:new Set()});const group=groups.get(id)!,key=[start.ms,end.ms,start.offset,value].join(':');
   if(!group.seen.has(key)){group.seen.add(key);group.samples.push({start:start.ms,end:end.ms,offset:start.offset,value});}
  }
 }
 const series:HealthSeries[]=[];
 for(const [id,g] of groups){
  let samples=g.samples;
  if(g.metric==='sleepMinutes'){
   samples=[];for(const s of g.samples.sort((a,b)=>a.start-b.start)){const last=samples.at(-1);if(last&&s.start<=last.end&&s.offset===last.offset)last.end=Math.max(last.end,s.end);else samples.push({...s});}
  }
  const days:Record<string,number>={};
  for(const s of samples){const start=s.start+s.offset,end=s.end+s.offset,value=g.metric==='sleepMinutes'?(end-start)/60000:s.value;
   if(start===end){const day=new Date(start).toISOString().slice(0,10);if(day>=from&&day<=today)days[day]=(days[day]??0)+value;continue;}
   for(let at=start;at<end;){const next=Math.min(end,(Math.floor(at/DAY)+1)*DAY),day=new Date(at).toISOString().slice(0,10);if(day>=from&&day<=today)days[day]=(days[day]??0)+value*(next-at)/(end-start);at=next;}
  }
  for(const day of Object.keys(days)){days[day]=Math.round(days[day]);if(days[day]>(g.metric==='steps'?200000:1440))throw Error('Сумма за день слишком велика. Проверьте источник данных.');}
  if(Object.keys(days).length)series.push({id,metric:g.metric,source:g.source,days});
 }
 if(!series.length)warnings.add('Доступных записей нет. Проверьте разрешения «Команд» и наличие данных в «Здоровье». Отсутствие доступа не означает нулевую активность.');
 warnings.add('Сегодняшний день ещё не завершён. Данные за последние 7 дней показаны по часовому поясу телефона; итог одного источника может отличаться от сводки «Здоровья».');
 return {provider:'apple_health',series,warnings:[...warnings]};
}
