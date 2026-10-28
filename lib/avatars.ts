export const MAX_AVATAR_BYTES=1_000_000;
export function avatarUrl(user:{id:string;avatar_key?:string|null}){
 return user.avatar_key?`/api/avatars/${user.id}?v=${encodeURIComponent(user.avatar_key.split('/').at(-1)!)}`:null;
}
export function jpegDimensions(bytes:Uint8Array){
 const bad=()=>{throw Error('Выберите корректное фото JPG');};
 if(bytes.length<20||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return bad();
 let at=2;
 while(at<bytes.length-2){
  if(bytes[at++]!==255)return bad();while(bytes[at]===255)at++;
  const marker=bytes[at++];if(marker===218||marker===217)break;
  if(marker===1||(marker>=208&&marker<=215))continue;
  if(at+2>bytes.length)return bad();const length=bytes[at]*256+bytes[at+1];
  if(length<2||at+length>bytes.length)return bad();
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
   if(length<8)return bad();const height=bytes[at+3]*256+bytes[at+4],width=bytes[at+5]*256+bytes[at+6];
   if(width<32||height<32||width>1024||height>1024)throw Error('Размер фото должен быть от 32 до 1024 пикселей');
   return {width,height};
  }
  at+=length;
 }
 return bad();
}
