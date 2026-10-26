'use client';
import {useRef,useState} from 'react';
import {Trash2} from 'lucide-react';
import {useSession} from '../../lib/session';
import type {RecoveryEntry} from '../../lib/recovery-map';
const fields=[['situation','Что произошло'],['thought','Какая мысль появилась'],['emotion','Что я чувствую'],['alternative','Как ещё можно посмотреть на ситуацию']] as const;
const empty={situation:'',thought:'',emotion:'',alternative:''};
export function ThoughtDiary(){
 const {api}=useSession(),[draft,setDraft]=useState(empty),[entries,setEntries]=useState<RecoveryEntry[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const request=useRef<string|null>(null),running=useRef(false);
 async function refresh(){const r=await api('recovery-map');setEntries(r.entries.filter((e:RecoveryEntry)=>e.category==='thought'));setLoaded(true)}
 async function load(){setError('');try{await refresh()}catch(e){setError((e as Error).message)}}
 async function save(){if(running.current)return;running.current=true;setBusy(true);setError('');setMessage('');try{request.current??=crypto.randomUUID();await api('recovery-map/entries','POST',{id:request.current,category:'thought',text:`Ситуация: ${draft.situation}\nМысль: ${draft.thought}\nЭмоция: ${draft.emotion}\nДругое объяснение: ${draft.alternative}`});request.current=null;setDraft(empty);setMessage('Запись сохранена только для вас.');await refresh()}catch(e){setError((e as Error).message)}finally{running.current=false;setBusy(false)}}
 async function remove(id:string){if(busy||!confirm('Удалить эту личную запись?'))return;setBusy(true);setError('');try{await api('recovery-map/entries/'+id,'DELETE');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <details className="panel thought-journal" onToggle={e=>{if(e.currentTarget.open&&!loaded)void load()}}><summary>Дневник мыслей</summary>{error&&<p className="form-error" role="alert">{error}<button className="text-button" onClick={()=>void load()}>Повторить</button></p>}{message&&<p className="recovery-saved" role="status">{message}</p>}<form onSubmit={e=>{e.preventDefault();void save()}}>{fields.map(([key,label])=><label className="field" key={key}>{label}<input maxLength={650} value={draft[key]} disabled={busy} onChange={e=>{setDraft({...draft,[key]:e.target.value});request.current=null}}/></label>)}<button className="primary" disabled={busy||!draft.situation.trim()||!draft.thought.trim()}>{busy?'Сохраняем…':'Сохранить для себя'}</button></form><div className="anchor-entries">{entries.map(e=><article className="anchor-entry" key={e.id}><p>{e.text}</p><footer><small>{new Date(e.createdAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</small><button className="icon-button" aria-label="Удалить запись дневника мыслей" disabled={busy} onClick={()=>void remove(e.id)}><Trash2 size={16}/></button></footer></article>)}</div></details>
}
