import { unzipSync } from 'fflate';
import type { HealthMetric, HealthProvider } from './health-data';
export type HealthSeries={id:string;metric:HealthMetric;source:string;days:Record<string,number>};
export type HealthPreview={provider:HealthProvider;series:HealthSeries[];warnings:string[]};
type Segment={start:number;end:number;offset:number;value?:number};
const LIMIT=100*1024*1024,DAY=86400000,MAX_RECORDS=500000;
function day(ms:number){return new Date(ms).toISOString().slice(0,10);}
function validSegment(s:Segment){return Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>=s.start&&s.end-s.start<=7*DAY&&Number.isFinite(s.offset)&&Math.abs(s.offset)<=14*3600;}
function parts(s:Segment,consume:(date:string,fraction:number)=>void){
 const start=s.start+s.offset*1000,end=s.end+s.offset*1000;if(start===end){consume(day(end),1);return;}
 for(let at=start;at<end;){const next=Math.min(end,(Math.floor(at/DAY)+1)*DAY);consume(day(at),(next-at)/(end-start));at=next;}
}
// Durations are unions within each source. Overlapping stages/sessions never double count.
export function unionIntervals(segments:Segment[]):Segment[]{
 const sorted=segments.slice().sort((a,b)=>a.start-b.start),out:Segment[]=[];
 for(const s of sorted){const last=out.at(-1);if(last&&s.start<=last.end&&s.offset===last.offset)last.end=Math.max(last.end,s.end);else out.push({...s});}return out;
}
function subtract(base:Segment,excluded:Segment[]):Segment[]{
 let result=[base];for(const x of unionIntervals(excluded)){result=result.flatMap(s=>x.end<=s.start||x.start>=s.end?[s]:[{...s,end:Math.max(s.start,x.start)},{...s,start:Math.min(s.end,x.end)}].filter(p=>p.end>p.start));}return result;
}
class Collector{
 groups=new Map<string,{metric:HealthMetric;source:string;segments:Segment[];seen:Set<string>}>();warnings=new Set<string>();count=0;
 add(metric:HealthMetric,source:string,s:Segment){
  if(++this.count>MAX_RECORDS)throw Error('В выгрузке слишком много записей. Лимит — 500 000 записей сна и активности.');
  if(!validSegment(s)||s.value!==undefined&&(!Number.isFinite(s.value)||s.value<0)){this.warnings.add('Некоторые записи с некорректными датами или значениями пропущены.');return;}
  const name=(source||'').trim().slice(0,150)||'Без названия',key=metric+'|'+name;
  if(!this.groups.has(key))this.groups.set(key,{metric,source:name,segments:[],seen:new Set()});const group=this.groups.get(key)!;
  const identity=[s.start,s.end,s.offset,s.value??''].join(':');if(group.seen.has(identity))return;group.seen.add(identity);group.segments.push(s);
 }
 finish(provider:HealthProvider):HealthPreview{
  const series:HealthSeries[]=[];for(const [id,g] of this.groups){const days:Record<string,number>={};
   const segments=g.metric==='sleepMinutes'?unionIntervals(g.segments):g.segments;
   for(const s of segments){const value=s.value??(s.end-s.start)/60000;parts(s,(d,f)=>{days[d]=(days[d]??0)+value*f;});}
   for(const d of Object.keys(days)){days[d]=Math.round(days[d]);if(days[d]>(g.metric==='steps'?200000:1440)){delete days[d];this.warnings.add('Дни с неправдоподобными суммами пропущены; проверьте источник.');}}
   if(Object.keys(days).length)series.push({id,metric:g.metric,source:g.source,days});
  }
  if(!series.length)throw Error('В файле не найдены поддерживаемые данные о шагах, сне или активности.');
  return {provider,series,warnings:[...this.warnings]};
 }
}
function decode(s:string){return s.replace(/&(?:amp|quot|apos|lt|gt);/g,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x]!));}
function appleTime(value:string){const m=/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(value||'');if(!m)return {time:NaN,offset:NaN};return {time:Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`),offset:(m[3]==='-'?-1:1)*(Number(m[4])*3600+Number(m[5])*60)};}
export function parseAppleXml(xml:string):HealthPreview{
 if(!/<HealthData(?:\s|>)/.test(xml)||!/<\/HealthData>\s*$/.test(xml))throw Error('Ожидается полный export.xml из Apple «Здоровье».');
 const c=new Collector();let matches=0;
 // Only Record attributes are read: DTD/entities are never executed, URLs never fetched.
 for(const match of xml.matchAll(/<Record\s+([^>]+)>/g)){
  if(++matches>3000000)throw Error('Слишком большой XML: более 3 миллионов записей.');
  const attrs:Record<string,string>={};for(const a of match[1].matchAll(/([A-Za-z]+)="([^"]*)"/g))attrs[a[1]]=decode(a[2]);
  const metric:HealthMetric|undefined=attrs.type==='HKQuantityTypeIdentifierStepCount'?'steps':attrs.type==='HKCategoryTypeIdentifierSleepAnalysis'?'sleepMinutes':attrs.type==='HKQuantityTypeIdentifierAppleExerciseTime'?'activeMinutes':undefined;if(!metric)continue;
  const start=appleTime(attrs.startDate),end=appleTime(attrs.endDate),segment={start:start.time,end:end.time,offset:start.offset};
  if(metric==='sleepMinutes'){
   if(!['HKCategoryValueSleepAnalysisAsleep','HKCategoryValueSleepAnalysisAsleepUnspecified','HKCategoryValueSleepAnalysisAsleepCore','HKCategoryValueSleepAnalysisAsleepDeep','HKCategoryValueSleepAnalysisAsleepREM','1','3','4','5'].includes(attrs.value))continue;
   c.add(metric,attrs.sourceName,segment);
  }else{
   if(attrs.unit!==(metric==='steps'?'count':'min')){c.warnings.add('Записи с неподдерживаемыми единицами измерения пропущены.');continue;}
   c.add(metric,attrs.sourceName,{...segment,value:Number(attrs.value)});
  }
 }
 return c.finish('apple_health');
}
type Db={exec:(sql:string)=>{columns:string[];values:unknown[][]}[];close:()=>void;};
export async function parseHealthConnect(bytes:Uint8Array):Promise<HealthPreview>{
 const init=(await import('sql.js/dist/sql-wasm-inline.js')).default;const SQL=await init();const db:Db=new SQL.Database(bytes);
 try{
  db.exec('PRAGMA query_only=ON');db.exec('PRAGMA trusted_schema=OFF');
  const tables=new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values??[]).map(r=>r[0]));
  if(!tables.has('application_info_table')||!['steps_record_table','sleep_session_record_table','exercise_session_record_table'].some(t=>tables.has(t)))throw Error('Неизвестный формат базы Health Connect. Нужен health_connect_export.db из штатного экспорта.');
  const rows=(table:string,columns:string[])=>{
   if(!tables.has(table))return [];
   const actual=new Set((db.exec(`PRAGMA table_info(${table})`)[0]?.values??[]).map(r=>r[1]));if(columns.some(c=>!actual.has(c)))throw Error('Эта версия выгрузки Health Connect пока не поддерживается: отличаются поля '+table+'.');
   const result=db.exec(`SELECT ${columns.join(',')} FROM ${table} LIMIT ${MAX_RECORDS+1}`)[0];if(!result)return [];if(result.values.length>MAX_RECORDS)throw Error('В таблице слишком много записей. Лимит — 500 000.');
   return result.values.map(values=>Object.fromEntries(result.columns.map((key,i)=>[key,values[i]])) as Record<string,any>);
  };
  const apps=new Map(rows('application_info_table',['row_id','package_name','app_name']).map(r=>[r.row_id,String(r.app_name?`${r.app_name} (${r.package_name||r.row_id})`:r.package_name||'Источник '+r.row_id)]));
  const c=new Collector(),common=['row_id','app_info_id','start_time','end_time','start_zone_offset'];
  const segment=(r:Record<string,any>):Segment=>({start:Number(r.start_time),end:Number(r.end_time),offset:r.start_zone_offset===null?0:Number(r.start_zone_offset)});
  const source=(r:Record<string,any>)=>apps.get(r.app_info_id)||'Источник '+r.app_info_id;
  for(const r of rows('steps_record_table',[...common,'count']))c.add('steps',source(r),{...segment(r),value:Number(r.count)});
  const stages=new Map<any,Record<string,any>[]>();for(const s of rows('sleep_stages_table',['parent_key','stage_start_time','stage_end_time','stage_type'])){if(!stages.has(s.parent_key))stages.set(s.parent_key,[]);stages.get(s.parent_key)!.push(s);}
  for(const r of rows('sleep_session_record_table',common)){
   const s=segment(r),parts=stages.get(r.row_id)??[];
   if(!parts.length)c.warnings.add('В части записей Android нет стадий сна: показана длительность сессии сна.');
   if(r.start_zone_offset===null)c.warnings.add('В части записей нет часового пояса: для них использован UTC.');
   if(!validSegment(s))continue;
   const awake=parts.filter(p=>[1,3,7].includes(Number(p.stage_type))).map(p=>({start:Number(p.stage_start_time),end:Number(p.stage_end_time),offset:s.offset})).filter(validSegment);
   for(const p of subtract(s,awake))c.add('sleepMinutes',source(r),p);
  }
  const pauses=new Map<any,Record<string,any>[]>();for(const p of rows('exercise_segments_table',['parent_key','segment_start_time','segment_end_time','segment_type'])){if(![66,67].includes(Number(p.segment_type)))continue;if(!pauses.has(p.parent_key))pauses.set(p.parent_key,[]);pauses.get(p.parent_key)!.push(p);}
  const exerciseGroups=new Map<string,Segment[]>();
  for(const r of rows('exercise_session_record_table',common)){
   const s=segment(r);if(!validSegment(s))continue;const key=source(r);if(!exerciseGroups.has(key))exerciseGroups.set(key,[]);
   const excluded=(pauses.get(r.row_id)??[]).map(p=>({start:Number(p.segment_start_time),end:Number(p.segment_end_time),offset:s.offset})).filter(validSegment);
   exerciseGroups.get(key)!.push(...subtract(s,excluded));
  }
  for(const [name,segments] of exerciseGroups)for(const s of unionIntervals(segments))c.add('activeMinutes',name,s);
  return c.finish('health_connect');
 }finally{db.close();}
}
export async function parseHealthFile(bytes:Uint8Array,name:string):Promise<HealthPreview>{
 if(bytes.byteLength>LIMIT)throw Error('Файл больше 100 МБ. Для этой версии импорта нужен файл меньшего размера.');
 if(/\.zip$/i.test(name)){
  let selectedSize=0;const files=unzipSync(bytes,{filter:f=>{const wanted=/(^|\/)export\.xml$|(^|\/)health_connect_export\.db$/i.test(f.name);if(wanted){selectedSize+=f.originalSize;if(selectedSize>LIMIT)throw Error('Данные внутри ZIP больше 100 МБ.');}return wanted;}});
  const candidates=Object.entries(files);if(candidates.length!==1)throw Error('В ZIP должен быть один export.xml Apple или health_connect_export.db Android.');
  return parseHealthFile(candidates[0][1],candidates[0][0]);
 }
 if(/\.xml$/i.test(name))return parseAppleXml(new TextDecoder().decode(bytes));
 if(/\.db$/i.test(name))return parseHealthConnect(bytes);
 throw Error('Поддерживаются ZIP/XML Apple «Здоровье» и ZIP/DB Health Connect.');
}
