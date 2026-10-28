import { Unzip, UnzipInflate, UnzipPassThrough, type AsyncFlateStreamHandler } from 'fflate';
import type { HealthMetric, HealthProvider } from './health-data';
export type HealthSeries={id:string;metric:HealthMetric;source:string;days:Record<string,number>};
export type HealthPreview={provider:HealthProvider;series:HealthSeries[];warnings:string[]};
type Segment={start:number;end:number;offset:number;value?:number};
const DAY=86400000,MAX_RECORDS=500000;
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
function collectAppleRecord(c:Collector,attributes:string){
  const attrs:Record<string,string>={};for(const a of attributes.matchAll(/([A-Za-z]+)="([^"]*)"/g))attrs[a[1]]=decode(a[2]);
  const metric:HealthMetric|undefined=attrs.type==='HKQuantityTypeIdentifierStepCount'?'steps':attrs.type==='HKCategoryTypeIdentifierSleepAnalysis'?'sleepMinutes':attrs.type==='HKQuantityTypeIdentifierAppleExerciseTime'?'activeMinutes':undefined;if(!metric)return;
  const start=appleTime(attrs.startDate),end=appleTime(attrs.endDate),segment={start:start.time,end:end.time,offset:start.offset};
  if(metric==='sleepMinutes'){
   if(!['HKCategoryValueSleepAnalysisAsleep','HKCategoryValueSleepAnalysisAsleepUnspecified','HKCategoryValueSleepAnalysisAsleepCore','HKCategoryValueSleepAnalysisAsleepDeep','HKCategoryValueSleepAnalysisAsleepREM','1','3','4','5'].includes(attrs.value))return;
   c.add(metric,attrs.sourceName,segment);
  }else{
   if(attrs.unit!==(metric==='steps'?'count':'min')){c.warnings.add('Записи с неподдерживаемыми единицами измерения пропущены.');return;}
   c.add(metric,attrs.sourceName,{...segment,value:Number(attrs.value)});
  }
}
// Read tags incrementally. Never build a string containing the whole export,
// expand DTD/entities, execute XML, or fetch referenced URLs.
class AppleXmlReader{
 private pending='';private ignoredEnd='';private opened=false;private closed=false;private matches=0;private c=new Collector();
 push(text:string){
  this.pending+=text;
  while(this.pending){
   if(this.ignoredEnd){const end=this.pending.indexOf(this.ignoredEnd);if(end<0){this.pending=this.pending.slice(-2);return;}this.pending=this.pending.slice(end+this.ignoredEnd.length);this.ignoredEnd='';continue;}
   const start=this.pending.indexOf('<');
   if(this.closed&&this.pending.slice(0,start<0?undefined:start).trim())throw Error('После окончания HealthData обнаружены лишние данные.');
   if(start<0){this.pending='';return;}this.pending=this.pending.slice(start);
   if(this.closed)throw Error('После окончания HealthData обнаружены лишние данные.');
   if(this.pending.startsWith('<!--')||this.pending.startsWith('<![CDATA[')){const comment=this.pending.startsWith('<!--');this.ignoredEnd=comment?'-->':']]>';this.pending=this.pending.slice(comment?4:9);continue;}
   let quote='',end=-1;for(let i=1;i<this.pending.length;i++){const char=this.pending[i];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>'){end=i;break;}}
   if(end<0){if(this.pending.length>1024*1024)throw Error('Не удалось прочитать XML: слишком длинный или незавершённый тег.');return;}
   const tag=this.pending.slice(0,end+1);this.pending=this.pending.slice(end+1);
   if(/^<HealthData(?:\s|>)/.test(tag))this.opened=true;
   else if(/^<\/HealthData\s*>$/.test(tag))this.closed=true;
   else if(/^<Record\s/.test(tag)){if(++this.matches>3000000)throw Error('Слишком большой XML: более 3 миллионов записей.');collectAppleRecord(this.c,tag.slice(7,-1));}
  }
 }
 finish():HealthPreview{if(!this.opened||!this.closed||this.pending.trim()||this.ignoredEnd)throw Error('Ожидается полный export.xml из Apple «Здоровье».');return this.c.finish('apple_health');}
}
export function parseAppleXml(xml:string):HealthPreview{
 const reader=new AppleXmlReader();reader.push(xml);return reader.finish();
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
const CHUNK_BYTES=64*1024;
function consumer(name:string){
 if(/\.xml$/i.test(name)){
  const reader=new AppleXmlReader(),decoder=new TextDecoder();
  return {push:(bytes:Uint8Array,final:boolean)=>reader.push(decoder.decode(bytes,{stream:!final})),finish:async()=>reader.finish()};
 }
 if(/\.db$/i.test(name)){
  const chunks:Uint8Array[]=[];let length=0;
  return {push:(bytes:Uint8Array)=>{chunks.push(bytes.slice());length+=bytes.length;},finish:async()=>{const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}chunks.length=0;return parseHealthConnect(bytes);}};
 }
 throw Error('Поддерживаются ZIP/XML Apple «Здоровье» и ZIP/DB Health Connect.');
}
function completeZip(tail:Uint8Array){
 for(let i=tail.length-22;i>=0;i--)if(tail[i]===0x50&&tail[i+1]===0x4b&&tail[i+2]===5&&tail[i+3]===6&&i+22+tail[i+20]+256*tail[i+21]===tail.length)return true;
 return false;
}
// Names can be localized or changed when the export is saved. Inspect the XML
// root, skipping declarations, DTDs and comments; never expand entities.
function xmlRoot(header:string):string|null{
 let at=0;
 while(at<header.length){
  while(/\s|\uFEFF/.test(header[at]??'')&&at<header.length)at++;
  if(at===header.length)return null;
  if(header.startsWith('<?',at)||header.startsWith('<!--',at)){
   const marker=header.startsWith('<?',at)?'?>':'-->',end=header.indexOf(marker,at+2);if(end<0)return null;at=end+marker.length;continue;
  }
  if(header.startsWith('<!DOCTYPE',at)){
   let quote='',depth=0,end=-1;
   for(let i=at+9;i<header.length;i++){const char=header[i];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='[')depth++;else if(char===']')depth--;else if(char==='>'&&depth===0){end=i;break;}}
   if(end<0)return null;at=end+1;continue;
  }
  const root=/^<([A-Za-z_][\w:.-]*)(?:\s|\/?>)/.exec(header.slice(at));if(root)return root[1];
  return null;
 }
 return null;
}
function zipEntryKind(name:string){
 const path=name.replace(/\\/g,'/'),parts=path.split('/');
 if(parts.some(part=>part==='__MACOSX'||part.startsWith('._')))return null;
 if(/\.xml$/i.test(path))return 'xml';
 if(/(^|\/)health_connect_export\.db$/i.test(path))return 'db';
 return null;
}
const MULTIPLE_EXPORTS='В архиве несколько выгрузок здоровья. Выберите ZIP одного экспорта Apple «Здоровье» или Health Connect.';
export async function parseHealthChunks(chunks:AsyncIterable<Uint8Array>|Iterable<Uint8Array>,name:string):Promise<HealthPreview>{
 if(!/\.zip$/i.test(name)){const data=consumer(name);for await(const chunk of chunks)data.push(chunk,false);data.push(new Uint8Array(),true);return data.finish();}
 let selected:ReturnType<typeof consumer>|undefined,selectedDone=false,tail=new Uint8Array(0);
 const unzip=new Unzip(file=>{
  const kind=zipEntryKind(file.name);
  if(!kind){
   // Consume irrelevant compressed entries without inflating or retaining them.
   unzip.register(class{static compression=file.compression;ondata!:(error:Error|null,data:Uint8Array,final:boolean)=>void;push(_:Uint8Array,final:boolean){this.ondata(null,new Uint8Array(),final);}});
   file.ondata=error=>{if(error)throw error;};file.start();return;
  }
  if(![0,8].includes(file.compression))throw Error('Этот способ сжатия ZIP пока не поддерживается. Нужен исходный архив экспорта из приложения «Здоровье».');
  if(kind==='db'){
   if(selected)throw Error(MULTIPLE_EXPORTS);
   const data=consumer(file.name);selected=data;unzip.register(UnzipPassThrough);unzip.register(UnzipInflate);
   file.ondata=(error,bytes,final)=>{if(error)throw error;data.push(bytes,final);if(final)selectedDone=true;};file.start();return;
  }
  let active=true,data:ReturnType<typeof consumer>|undefined,header='',headerBytes=0,pending:Uint8Array[]=[];
  const decoder=new TextDecoder(),probeLimit=256*1024;
  // Once another XML format is identified (for example CDA), skip its remaining
  // compressed bytes rather than inflating the entire unrelated medical file.
  unzip.register(class{
   static compression=file.compression;ondata!:AsyncFlateStreamHandler;private inner=file.compression===8?new UnzipInflate():new UnzipPassThrough();
   constructor(){this.inner.ondata=(error,bytes,final)=>this.ondata(error,bytes,final);}
   push(bytes:Uint8Array,final:boolean){if(active)this.inner.push(bytes,final);}
  });
  file.ondata=(error,bytes,final)=>{
   if(error)throw error;if(!active)return;
   if(data){data.push(bytes,final);if(final)selectedDone=true;return;}
   const probe=bytes.subarray(0,Math.max(0,probeLimit-headerBytes));headerBytes+=probe.length;header+=decoder.decode(probe,{stream:!final});const root=xmlRoot(header);
   if(root==='HealthData'){
    if(selected)throw Error(MULTIPLE_EXPORTS);
    data=consumer(file.name);selected=data;for(const chunk of pending)data.push(chunk,false);pending=[];header='';data.push(bytes,final);if(final)selectedDone=true;
   }else if(root||final||headerBytes>=probeLimit){active=false;pending=[];header='';}
   else pending.push(bytes.slice());
  };file.start();
 });
 for await(const chunk of chunks){
  const end=new Uint8Array(Math.min(65557,tail.length+chunk.length)),old=Math.max(0,end.length-chunk.length);end.set(tail.subarray(tail.length-old));end.set(chunk.subarray(Math.max(0,chunk.length-end.length)),old);tail=end;
  unzip.push(chunk,false);
 }
 unzip.push(new Uint8Array(),true);
 if(!completeZip(tail))throw Error('Не удалось прочитать ZIP: архив повреждён или загружен не полностью.');
 if(!selected)throw Error('В ZIP не найдена выгрузка Apple «Здоровье» или Health Connect. На iPhone создайте архив через «Здоровье → профиль → Экспортировать все данные здоровья» и выберите полученный ZIP целиком.');
 if(!selectedDone)throw Error('Не удалось прочитать ZIP: архив повреждён или загружен не полностью.');
 return selected.finish();
}
export function parseHealthFile(bytes:Uint8Array,name:string):Promise<HealthPreview>{
 function* chunks(){for(let at=0;at<bytes.length;at+=CHUNK_BYTES)yield bytes.subarray(at,at+CHUNK_BYTES);}
 return parseHealthChunks(chunks(),name);
}
export function parseHealthExportFile(file:File):Promise<HealthPreview>{
 async function* chunks(){for(let at=0;at<file.size;at+=CHUNK_BYTES)yield new Uint8Array(await file.slice(at,at+CHUNK_BYTES).arrayBuffer());}
 return parseHealthChunks(chunks(),file.name);
}
