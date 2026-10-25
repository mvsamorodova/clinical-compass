import assert from 'node:assert/strict';
import {normalizeSocialLinks,readSocialLinks} from '../lib/social-links.ts';
assert.deepEqual(normalizeSocialLinks([{network:'telegram',url:' @compass_test '}]),[{network:'telegram',url:'https://t.me/compass_test'}]);
assert.deepEqual(normalizeSocialLinks([{network:'vk',url:'vk.com/compass_test'}]),[{network:'vk',url:'https://vk.com/compass_test'}]);
assert.deepEqual(normalizeSocialLinks([{network:'instagram',url:'@compass_test'}]),[{network:'instagram',url:'https://instagram.com/compass_test'}]);
assert.deepEqual(normalizeSocialLinks([{network:'telegram',url:''}]),[]);
for(const bad of [null,{},Array(6).fill({network:'other',url:'https://example.test'}),[{network:'missing',url:'https://example.test'}],[{network:'__proto__',url:'https://example.test'}],[{network:'other',url:5}],...['javascript:alert(1)','data:text/html,bad','http://example.test','https://user:secret@example.test','https://example.test/ bad','https://example.test/'+('x'.repeat(501))].map(url=>[{network:'other',url}]),[{network:'telegram',url:'https://t.me.evil.test/user'}],[{network:'vk',url:'https://evil.test/vk.com/user'}]])assert.throws(()=>normalizeSocialLinks(bad));
assert.deepEqual(readSocialLinks('bad json'),[]);assert.deepEqual(readSocialLinks('[{"network":"other","url":"javascript:alert(1)"}]'),[]);
const base=process.argv[2]||'http://127.0.0.1:5173';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const stamp=crypto.randomUUID(),password='Test-'+crypto.randomUUID();let checks=0;
async function req(path,u,method='GET',body,expected=200,extra={}){const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(u?{Cookie:u.cookie,'X-Compass-User':u.user.id}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw};}assert.equal(r.status,expected,`${method} ${path}: ${raw}`);checks++;return {...data,cookie:r.headers.getSetCookie().find(v=>v.startsWith('compass_session='))?.split(';')[0]};}
const register=(role,name)=>req('auth/register',null,'POST',{name:'Synthetic '+name,email:stamp+name+'@example.test',password,role});
const d=await register('doctor','doctor'),p=await register('patient','patient'),other=await register('doctor','other');
const doctorLinks=[{network:'telegram',url:'@compass_doctor_test'},{network:'vk',url:'https://vk.com/compass_doctor_test'},{network:'instagram',url:'@compass_doctor_test'},{network:'whatsapp',url:'https://wa.me/70000000000'},{network:'other',url:'https://example.test/doctor'}];
const patientLinks=[{network:'telegram',url:'https://t.me/compass_patient_test'}];
assert.deepEqual(d.user.socialLinks,[]);assert.deepEqual(p.user.socialLinks,[]);
await req('me',null,'PATCH',{name:'bad',socialLinks:doctorLinks},401);
for(const [user,links] of [[d,doctorLinks],[p,patientLinks]]){
 const saved=(await req('me',user,'PATCH',{...user.user,socialLinks:links})).user;assert.deepEqual(saved.socialLinks,normalizeSocialLinks(links));assert.equal(saved.role,user.user.role);
 assert.deepEqual((await req('me',user)).user.socialLinks,saved.socialLinks);
 await req('me',user,'PATCH',{name:user.user.name});assert.deepEqual((await req('me',user)).user.socialLinks,saved.socialLinks);
 await req('me',user,'PATCH',{name:'should not save',socialLinks:[{network:'other',url:'javascript:alert(1)'}]},400);assert.equal((await req('me',user)).user.name,user.user.name);
}
await req('me',d,'PATCH',{name:d.user.name,socialLinks:[]},403,{Origin:'https://foreign.invalid'});await req('me',d,'PATCH',{name:d.user.name,socialLinks:[]},409,{'X-Compass-User':p.user.id});
const invitation=await req('invites',d,'POST',{});assert.deepEqual((await req('invites/'+invitation.token,null)).doctor.socialLinks,normalizeSocialLinks(doctorLinks));
await req('invites/'+invitation.token,p,'POST',{});
assert.deepEqual((await req('my-care',p)).doctor.socialLinks,normalizeSocialLinks(doctorLinks));
const detail=(await req('patients/'+p.user.id,d)).patient;assert.deepEqual(detail.socialLinks,patientLinks);assert.ok(!Object.hasOwn(detail,'social_links'));
assert.ok(!(await req('patients',d)).patients.some(v=>v.socialLinks||v.social_links));
await req('patients/'+p.user.id,other,'GET',undefined,404);await req('patients/'+p.user.id,p,'GET',undefined,403);
await req('patients/'+p.user.id,d,'PATCH',{socialLinks:doctorLinks});assert.deepEqual((await req('me',p)).user.socialLinks,patientLinks);
await req('me',p,'PATCH',{...p.user,socialLinks:[]});assert.deepEqual((await req('patients/'+p.user.id,d)).patient.socialLinks,[]);
await req('patients/'+p.user.id,d,'DELETE');await req('patients/'+p.user.id,d,'GET',undefined,404);assert.equal((await req('my-care',p)).doctor,null);
console.log(`PASS: URL normalization and unsafe-link rejection + ${checks} API checks for doctor/patient persistence, profile views, clearing links, omitted-field preservation, session isolation and linked access.`);
