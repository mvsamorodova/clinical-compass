'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,LoaderCircle,Trash2} from 'lucide-react';
import {useSession,type User} from '../../lib/session';

export function Avatar({name,src,large=false,color=0}:{name:string;src?:string|null;large?:boolean;color?:number}){
 const [failed,setFailed]=useState<string|null>(null);
 return <div className={`avatar color-${color%5} ${large?'large':''}`}>
  {src&&failed!==src?<img src={src} alt={`Фото: ${name}`} referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('')}
 </div>;
}
async function preparePhoto(file:File){
 if(file.size>10*1024*1024)throw Error('Выберите фото размером до 10 МБ');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Поддерживаются JPG, PNG и WebP');
 const url=URL.createObjectURL(file),image=new Image();image.src=url;
 try{
  try{await image.decode();}catch{throw Error('Не удалось открыть фото. Выберите другой файл');}
  if(image.naturalWidth<32||image.naturalHeight<32)throw Error('Выберите фото размером не меньше 32 × 32 пикселей');
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Браузер не смог подготовить фото');
  const side=Math.min(image.naturalWidth,image.naturalHeight);ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
  ctx.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,512,512);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Не удалось подготовить фото')),'image/jpeg',.88));
 }finally{URL.revokeObjectURL(url);}
}
export function DoctorAvatarEditor({user,disabled,onChange,onBusy}:{user:User;disabled:boolean;onChange:(url:string|null)=>void;onBusy:(busy:boolean)=>void}){
 const {api}=useSession(),input=useRef<HTMLInputElement>(null),alive=useRef(true);
 const [busy,setBusy]=useState(false),[preview,setPreview]=useState<string|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 async function change(file?:File){
  setBusy(true);onBusy(true);setError('');setStatus(file?'Подготавливаем фото…':'Удаляем фото…');
  try{
   const photo=file?await preparePhoto(file):undefined;if(!alive.current)return;
   if(photo){setPreview(URL.createObjectURL(photo));setStatus('Сохраняем фото…');}
   const r=await api('me/avatar',file?'PUT':'DELETE',photo);
   if(alive.current){onChange(r.avatarUrl);setStatus(file?'Фото сохранено':'Фото удалено');}
  }catch(e){if(alive.current){setError((e as Error).message);setStatus('');}}
  finally{if(alive.current){setPreview(null);setBusy(false);onBusy(false);if(input.current)input.current.value='';}}
 }
 return <div className="profile-photo-editor">
  <Avatar name={user.name} src={preview||user.avatarUrl} large/>
  <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Фото профиля врача" disabled={busy||disabled} onChange={e=>{const file=e.target.files?.[0];if(file)void change(file);}}/>
  <button type="button" className="secondary" disabled={busy||disabled} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={17} className="spin"/>:<Camera size={17}/>} {user.avatarUrl?'Заменить фото':'Загрузить фото'}</button>
  {user.avatarUrl&&<button type="button" className="text-button" disabled={busy||disabled} onClick={()=>void change()}><Trash2 size={15}/>Удалить фото</button>}
  <p className="field-hint">JPG, PNG или WebP до 10 МБ. Фото обрезается по центру и сохраняется сразу.</p>
  {status&&<p className="photo-status" role="status">{status}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
 </div>;
}
