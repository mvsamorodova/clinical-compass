'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,LoaderCircle,Pencil,Pill,Plus,RefreshCw} from 'lucide-react';
import {useSession} from '../../lib/session';
import {PatientSection} from './PatientSection';

type Medication={id:string;name:string;dose:string;frequency:string;notes:string;status:'active'|'stopped';revision:number;createdAt:number;updatedAt:number};
type Draft=Pick<Medication,'name'|'dose'|'frequency'|'notes'>;
const empty:Draft={name:'',dose:'',frequency:'',notes:''};
function useMedications(path:string){
 const {api}=useSession(),[rows,setRows]=useState<Medication[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),sequence=useRef(0);
 const refresh=useCallback(async()=>{const current=++sequence.current;setLoading(true);try{const r=await api(path);if(sequence.current===current){setRows(r.medications);setError('');}}catch(e){if(sequence.current===current)setError((e as Error).message);}finally{if(sequence.current===current)setLoading(false);}},[api,path]);
 useEffect(()=>{void refresh();const changed=()=>void refresh();window.addEventListener('focus',changed);window.addEventListener('compass-data-changed',changed);return()=>{sequence.current++;window.removeEventListener('focus',changed);window.removeEventListener('compass-data-changed',changed);};},[refresh]);
 return {api,rows,error,setError,loading,refresh};
}
function MedicationCard({medication:m,actions}:{medication:Medication;actions?:React.ReactNode}){
 return <article className={'medication-card '+(m.status==='stopped'?'stopped':'')}><div className="medication-card-heading"><h4>{m.name}</h4>{m.status==='stopped'&&<span>Завершено</span>}</div><dl className="medication-details"><div><dt>Доза за один приём</dt><dd>{m.dose}</dd></div><div><dt>Частота и время приёма</dt><dd>{m.frequency}</dd></div></dl>{m.notes&&<p className="preserve medication-notes">{m.notes}</p>}{actions&&<div className="medication-actions">{actions}</div>}</article>;
}
export function DoctorMedications({patientId}:{patientId:string}){
 const path='patients/'+patientId+'/medications',{api,rows,error,setError,loading,refresh}=useMedications(path);
 const [form,setForm]=useState(false),[editing,setEditing]=useState<Medication|null>(null),[draft,setDraft]=useState<Draft>(empty),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const requestId=useRef(crypto.randomUUID()),name=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(form)name.current?.focus();},[form,editing?.id]);
 const active=rows.filter(m=>m.status==='active'),stopped=rows.filter(m=>m.status==='stopped');
 function open(m?:Medication){setEditing(m??null);setDraft(m?{name:m.name,dose:m.dose,frequency:m.frequency,notes:m.notes}:{...empty});requestId.current=crypto.randomUUID();setForm(true);setError('');setMessage('');}
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{await api(editing?path+'/'+editing.id:path,editing?'PATCH':'POST',editing?{...draft,revision:editing.revision}:{...draft,id:requestId.current});setForm(false);setEditing(null);setDraft({...empty});requestId.current=crypto.randomUUID();setMessage(editing?'Назначение обновлено.':'Лекарство назначено.');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function stop(m:Medication){setBusy(true);setError('');setMessage('');try{await api(path+'/'+m.id,'PATCH',{revision:m.revision,status:'stopped'});setMessage('Назначение завершено.');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <PatientSection title="Лекарства" icon={<Pill size={20}/>} className="medications-panel" actions={<button className="primary" disabled={busy||form} onClick={()=>open()}><Plus size={16}/>Назначить лекарство</button>}>
  {error&&<p className="error-banner" role="alert">{error}</p>}{message&&<p className="test-success" role="status"><Check size={16}/>{message}</p>}
  {form&&<form className="medication-form" onSubmit={save}><h4>{editing?'Редактировать назначение':'Новое назначение'}</h4><label className="field">Название лекарства<input ref={name} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} maxLength={120} required disabled={busy} placeholder="Название, указанное врачом"/></label><div className="medication-form-grid"><label className="field">Доза за один приём<input value={draft.dose} onChange={e=>setDraft({...draft,dose:e.target.value})} maxLength={120} required disabled={busy} placeholder="Доза и единица измерения"/></label><label className="field">Частота и время приёма<input value={draft.frequency} onChange={e=>setDraft({...draft,frequency:e.target.value})} maxLength={180} required disabled={busy} placeholder="Схема приёма по назначению врача"/></label></div><label className="field">Дополнительные указания<textarea rows={3} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} maxLength={1000} disabled={busy}/></label><div className="medication-actions"><button className="primary" disabled={busy||!draft.name.trim()||!draft.dose.trim()||!draft.frequency.trim()}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}Сохранить назначение</button><button type="button" className="secondary" disabled={busy} onClick={()=>setForm(false)}>Отмена</button></div></form>}
  {loading&&!rows.length?<p className="test-muted">Загружаем назначения…</p>:!active.length?<p className="test-muted">Пока нет назначенных лекарств.</p>:<div className="medication-list">{active.map(m=><MedicationCard key={m.id} medication={m} actions={<><button className="text-button" disabled={busy||form} onClick={()=>open(m)}><Pencil size={15}/>Изменить</button><button className="text-button" disabled={busy||form} onClick={()=>stop(m)}>Завершить назначение</button></>}/>)}</div>}
  {!!stopped.length&&<details className="medication-history"><summary>Завершённые назначения · {stopped.length}</summary><div className="medication-list">{stopped.map(m=><MedicationCard key={m.id} medication={m}/>)}</div></details>}
  <button className="text-button medication-refresh" disabled={busy||loading} onClick={refresh}><RefreshCw size={15}/>Обновить</button>
 </PatientSection>;
}
export function PatientMedications(){
 const {rows,error,loading,refresh}=useMedications('my-treatment');
 return <section className="panel patient-medications" aria-labelledby="patient-medications-heading"><div className="tests-heading"><h2 id="patient-medications-heading"><Pill size={21}/>Назначенные лекарства</h2><button className="text-button" disabled={loading} onClick={refresh}><RefreshCw size={15}/>Обновить</button></div>{error?<p className="error-banner" role="alert">{error}</p>:loading&&!rows.length?<p className="test-muted">Загружаем назначения…</p>:!rows.length?<p className="test-muted">Назначений лекарств пока нет.</p>:<div className="medication-list">{rows.map(m=><MedicationCard key={m.id} medication={m}/>)}</div>}</section>;
}
