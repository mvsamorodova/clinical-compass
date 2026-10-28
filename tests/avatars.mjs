import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:5173';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const jpeg=await readFile('tests/fixtures/avatar.jpg'),replacement=await readFile('tests/fixtures/avatar-replacement.jpg');
const stamp=crypto.randomUUID(),password='Test-'+crypto.randomUUID();let checks=0;
async function req(path,u,method='GET',data,expected=200,extra={}){
 const binary=data instanceof Blob;
 const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(u?{Cookie:u.cookie,'X-Compass-User':u.user.id}:{}),...(data===undefined?{}:{'Content-Type':binary?data.type:'application/json'}),...extra},body:data===undefined?undefined:binary?new Uint8Array(await data.arrayBuffer()):JSON.stringify(data)});
 const raw=await r.text();assert.equal(r.status,expected,`${method} ${path}: ${raw.slice(0,180)}`);checks++;let result;try{result=JSON.parse(raw);}catch{result={error:raw};}return {...result,cookie:r.headers.getSetCookie().find(c=>c.startsWith('compass_session='))?.split(';')[0]};
}
const register=(role,name)=>req('auth/register',null,'POST',{role,name:'Synthetic '+name,email:stamp+name+'@example.test',password});
const d=await register('doctor','doctor'),other=await register('doctor','other'),p=await register('patient','patient'),stranger=await register('patient','stranger');
const blob=(b=jpeg,type='image/jpeg')=>new Blob([b],{type});
await req('me/avatar',null,'PUT',blob(),401);const patientPhoto=await req('me/avatar',p,'PUT',blob());
await req('me/avatar',d,'PUT',blob(jpeg,'image/png'),415);
await req('me/avatar',d,'PUT',blob(Buffer.from('<svg/>')),400);
const wide=Buffer.from(jpeg),sof=wide.indexOf(Buffer.from([255,192]));assert.ok(sof>0);wide.writeUInt16BE(2049,sof+7);await req('me/avatar',d,'PUT',blob(wide),400);
await req('me/avatar',d,'PUT',blob(new Uint8Array(1_000_001)),413);
await req('me/avatar',d,'PUT',blob(),403,{Origin:'https://foreign.invalid'});
await req('me/avatar',d,'PUT',blob(),409,{'X-Compass-User':other.user.id});
const first=await req('me/avatar',d,'PUT',blob());assert.match(first.avatarUrl,new RegExp('^/api/avatars/'+d.user.id+'\\?v='));
const me=await req('me',d);assert.equal(me.user.avatarUrl,first.avatarUrl);assert.ok(!JSON.stringify(me).includes('avatar_key'));
async function image(url,u,expected=200,bytes=jpeg){const r=await fetch(base+url,{headers:u?{Cookie:u.cookie,'X-Compass-User':u.user.id}:{}});assert.equal(r.status,expected);checks++;if(expected===200){assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);}else await r.text();}
await image(first.avatarUrl,null,401);await image(first.avatarUrl,other,404);await image(first.avatarUrl,p,404);await image(first.avatarUrl,d);await image(patientPhoto.avatarUrl,p);await image(patientPhoto.avatarUrl,d,404);await image(patientPhoto.avatarUrl,other,404);await image(patientPhoto.avatarUrl,stranger,404);
const invite=await req('invites',d,'POST',{}),publicProfile=await req('invites/'+invite.token);assert.ok(!JSON.stringify(publicProfile).includes('avatar_key'));await image(publicProfile.doctor.avatarUrl,null);
await req('invites/'+invite.token,p,'POST',{});await image(publicProfile.doctor.avatarUrl,null,404);await image(first.avatarUrl,p);await image(first.avatarUrl,stranger,404);
assert.equal((await req('my-care',p)).doctor.avatarUrl,first.avatarUrl);
await image(patientPhoto.avatarUrl,d);assert.equal((await req('patients/'+p.user.id,d)).patient.avatarUrl,patientPhoto.avatarUrl);const listing=await req('patients',d);assert.equal(listing.patients[0].avatarUrl,patientPhoto.avatarUrl);assert.ok(!JSON.stringify(listing).includes('avatar_key'));
const patientNext=await req('me/avatar',p,'PUT',blob(replacement));await image(patientNext.avatarUrl,d,200,replacement);await req('me/avatar',other,'DELETE');await image(patientNext.avatarUrl,p,200,replacement);
await req('me',d,'PATCH',{name:d.user.name,avatarUrl:'https://foreign.invalid/fake.jpg'});assert.equal((await req('me',d)).user.avatarUrl,first.avatarUrl);
assert.deepEqual((await req('alerts?patientId='+p.user.id,d)).alerts,[]);await req('alerts?patientId='+stranger.user.id,d,'GET',undefined,404);await req('alerts?patientId='+p.user.id,other,'GET',undefined,404);
const next=await req('me/avatar',d,'PUT',blob(replacement));assert.notEqual(next.avatarUrl,first.avatarUrl);await image(next.avatarUrl,p,200,replacement);
await req('me/avatar',other,'DELETE');await image(next.avatarUrl,p,200,replacement);
await req('patients/'+p.user.id,d,'DELETE');await image(next.avatarUrl,p,404);await image(patientNext.avatarUrl,d,404);await image(patientNext.avatarUrl,p,200,replacement);await req('me/avatar',p,'DELETE');await image(patientNext.avatarUrl,p,404);
await req('me/avatar',d,'DELETE');assert.equal((await req('me',d)).user.avatarUrl,null);await image(next.avatarUrl,d,404);await req('me/avatar',d,'DELETE');
console.log(`PASS ${checks} checks: doctor and patient avatar upload/replacement/removal, image validation, owner/linked-patient/invitation access, CSRF/session isolation, private projection and scoped alerts.`);
