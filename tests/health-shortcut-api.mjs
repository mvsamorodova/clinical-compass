import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:8787';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const stamp=crypto.randomUUID();let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function req(path,{method='GET',body,cookie,expect=200,origin=base}={}){const r=await fetch(base+'/api/'+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();eq(r.status,expect);eq(r.headers.get('cache-control'),'no-store');return {...j,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const reg=async(role,s)=>req('auth/register',{method:'POST',body:{name:'Shortcut '+s,email:`${stamp}-${s}@example.test`,password:'Test-'+stamp,role}});
const p=await reg('patient','one'),q=await reg('patient','other'),d=await reg('doctor','doctor');
await req('health/shortcut',{expect:401});await req('health/shortcut',{cookie:d.cookie,expect:403});
eq((await req('health/shortcut',{cookie:p.cookie})).state,'idle');
await req('health/shortcut',{method:'POST',cookie:p.cookie,origin:'https://evil.example',expect:403});
const t=await req('health/shortcut',{method:'POST',cookie:p.cookie});eq(t.token.length,64);
await req('health/shortcut',{method:'POST',cookie:p.cookie,expect:429});
eq((await req('health/shortcut',{cookie:p.cookie})).state,'waiting');
eq((await req('health/shortcut',{cookie:q.cookie})).state,'idle');
await req('health-shortcut/verify',{method:'POST',body:{token:'x'},expect:401});
await req('health-shortcut/verify',{method:'POST',body:{token:'a'.repeat(64)},expect:410});
eq((await req('health-shortcut/verify',{method:'POST',body:{token:t.token}})).state,'ready');
const now=new Date(),iso=d=>d.toISOString().replace(/\.\d{3}Z$/,'Z'),record={value:'1234',source:'Synthetic Watch',start:iso(new Date(now-3600000)),end:iso(now)};
const payload={token:t.token,capturedAt:iso(now),steps:JSON.stringify(record,null,2),sleep:'',activity:''};
await req('health-shortcut/upload',{method:'POST',body:{...payload,steps:'oops'},expect:400});
// Invalid payload does not consume the ticket. Exactly one concurrent valid request succeeds.
const statuses=await Promise.all([1,2].map(()=>fetch(base+'/api/health-shortcut/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>r.status)));
eq(statuses.sort(),[200,410]);
await req('health-shortcut/verify',{method:'POST',body:{token:t.token},expect:410});
const preview=await req('health/shortcut',{cookie:p.cookie});eq(preview.state,'received');eq(preview.preview.series[0].source,'Synthetic Watch');
eq('token' in preview,false); // No raw samples are stored in the API preview.
eq('start' in preview.preview.series[0],false);
eq((await req('health',{cookie:p.cookie})).entries,[]);eq((await req('health',{cookie:p.cookie})).shared,false);
await req('health/shortcut/'+t.id,{method:'DELETE',cookie:q.cookie});eq((await req('health/shortcut',{cookie:p.cookie})).state,'received');
await req('health/shortcut/'+t.id,{method:'DELETE',cookie:p.cookie});eq((await req('health/shortcut',{cookie:p.cookie})).state,'idle');
await req('health-shortcut/upload',{method:'POST',body:payload,expect:410});
console.log(`PASS: ${checks} shortcut API checks: auth, patient isolation, CSRF, one-use race, rate limit, preview-only writes, privacy and revocation.`);
