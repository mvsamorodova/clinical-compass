const enc = new TextEncoder();
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
export async function digest(value:string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))), b=>b.toString(16).padStart(2,'0')).join(''); }
export async function passwordHash(password:string, salt = randomToken()) {
 const key = await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return salt+':'+Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function passwordMatches(password:string, stored:string) {
 const actual=await passwordHash(password,stored.split(':')[0]); let mismatch=actual.length^stored.length;
 for(let i=0;i<Math.max(actual.length,stored.length);i++) mismatch|=(actual.charCodeAt(i)||0)^(stored.charCodeAt(i)||0);
 return mismatch===0;
}
