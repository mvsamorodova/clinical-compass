import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import init from 'sql.js/dist/sql-wasm-inline.js';
import {parseAppleXml,parseHealthFile} from '../lib/health-import.ts';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const xml=`<?xml version="1.0" encoding="UTF-8"?><HealthData locale="ru_RU">
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Демо iPhone" unit="count" startDate="2026-10-21 08:00:00 +0800" endDate="2026-10-21 09:00:00 +0800" value="6000"/>
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Демо iPhone" unit="count" startDate="2026-10-21 08:00:00 +0800" endDate="2026-10-21 09:00:00 +0800" value="6000"/>
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Демо Watch" unit="count" startDate="2026-10-21 08:00:00 +0800" endDate="2026-10-21 09:00:00 +0800" value="6100"/>
<Record type="HKQuantityTypeIdentifierAppleExerciseTime" sourceName="Демо Watch" unit="min" startDate="2026-10-21 10:00:00 +0800" endDate="2026-10-21 11:00:00 +0800" value="45"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Демо Watch" startDate="2026-10-20 23:00:00 +0800" endDate="2026-10-21 07:00:00 +0800" value="HKCategoryValueSleepAnalysisAsleepUnspecified"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Демо Watch" startDate="2026-10-21 00:00:00 +0800" endDate="2026-10-21 03:00:00 +0800" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Демо Watch" startDate="2026-10-20 22:00:00 +0800" endDate="2026-10-21 08:00:00 +0800" value="HKCategoryValueSleepAnalysisInBed"/>
<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Private" value="70"/>
</HealthData>`;
const apple=parseAppleXml(xml);eq(apple.provider,'apple_health');eq(apple.series.length,4);
eq(apple.series.find(s=>s.source==='Демо iPhone').days,{'2026-10-21':6000});
eq(apple.series.find(s=>s.metric==='sleepMinutes').days,{'2026-10-20':60,'2026-10-21':420});
eq(apple.series.find(s=>s.metric==='activeMinutes').days,{'2026-10-21':45});
eq(JSON.stringify(apple).includes('HeartRate'),false);eq(JSON.stringify(apple).includes('Private'),false);
assert.throws(()=>parseAppleXml('<HealthData>'));checks++;
const SQL=await init(),db=new SQL.Database();
db.run(`CREATE TABLE application_info_table(row_id INTEGER,package_name TEXT,app_name TEXT);
INSERT INTO application_info_table VALUES(1,'test.watch','Демо Watch'),(2,'test.phone','Демо Phone');
CREATE TABLE steps_record_table(row_id INTEGER,app_info_id INTEGER,start_time INTEGER,end_time INTEGER,start_zone_offset INTEGER,count INTEGER);
CREATE TABLE sleep_session_record_table(row_id INTEGER,app_info_id INTEGER,start_time INTEGER,end_time INTEGER,start_zone_offset INTEGER);
CREATE TABLE sleep_stages_table(parent_key INTEGER,stage_start_time INTEGER,stage_end_time INTEGER,stage_type INTEGER);
CREATE TABLE exercise_session_record_table(row_id INTEGER,app_info_id INTEGER,start_time INTEGER,end_time INTEGER,start_zone_offset INTEGER);
CREATE TABLE exercise_segments_table(parent_key INTEGER,segment_start_time INTEGER,segment_end_time INTEGER,segment_type INTEGER);`);
const ms=s=>Date.parse('2026-10-'+s+':00+08:00');
db.run('INSERT INTO steps_record_table VALUES(1,1,?,?,28800,6000),(2,2,?,?,28800,6000)',[ms('21T08:00'),ms('21T09:00'),ms('21T08:00'),ms('21T09:00')]);
db.run('INSERT INTO sleep_session_record_table VALUES(1,1,?,?,28800)',[ms('20T23:00'),ms('21T07:00')]);
db.run('INSERT INTO sleep_stages_table VALUES(1,?,?,1)',[ms('21T00:00'),ms('21T00:15')]);
db.run('INSERT INTO exercise_session_record_table VALUES(1,1,?,?,28800)',[ms('21T10:00'),ms('21T11:00')]);
db.run('INSERT INTO exercise_segments_table VALUES(1,?,?,66),(1,?,?,67)',[ms('21T10:10'),ms('21T10:20'),ms('21T10:30'),ms('21T10:35')]);
const bytes=db.export();db.close();
const android=await parseHealthFile(bytes,'health_connect_export.db');eq(android.provider,'health_connect');
eq(android.series.filter(s=>s.metric==='steps').length,2);eq(android.series.find(s=>s.metric==='sleepMinutes').days,{'2026-10-20':60,'2026-10-21':405});
eq(android.series.find(s=>s.metric==='activeMinutes').days,{'2026-10-21':45});
const azip=zipSync({'apple_health_export/export.xml':strToU8(xml),'private-medical-record.txt':strToU8('IGNORE')}),hzip=zipSync({'health_connect_export.db':bytes});
eq(await parseHealthFile(azip,'export.zip'),apple);eq(await parseHealthFile(hzip,'Health Connect.zip'),android);
await assert.rejects(()=>parseHealthFile(zipSync({'anything.txt':strToU8('no')}),'unknown.zip'));checks++;
await assert.rejects(()=>parseHealthFile(strToU8('broken'),'export.zip'));checks++;
const bad=new SQL.Database();bad.run('CREATE TABLE unrelated(x)');await assert.rejects(()=>parseHealthFile(bad.export(),'other.db'));bad.close();checks++;
const old=new SQL.Database(bytes);old.run('ALTER TABLE steps_record_table RENAME COLUMN count TO unknown_count');await assert.rejects(()=>parseHealthFile(old.export(),'old.db'),/отличаются поля/);old.close();checks++;
mkdirSync('outputs/health-fixtures',{recursive:true});writeFileSync('outputs/health-fixtures/apple-demo.zip',azip);writeFileSync('outputs/health-fixtures/android-demo.zip',hzip);
console.log(`PASS: ${checks} health parser checks. Synthetic Apple and native Android ZIP fixtures, source isolation, overlap deduplication, midnight splits, excluded awake/rest time and unsupported schema rejection.`);
