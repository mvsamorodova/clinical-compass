'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Compass,ShieldCheck} from 'lucide-react';
import {useSession} from '../../lib/session';
import type {SafetyPlan} from '../../lib/safety-plan';
import {PlanView} from './SafetyPlan';
import {PatientSection} from './PatientSection';
type SafetyData={plan:{data:SafetyPlan;createdAt:number}|null};
type PathData={branch:'body'|'thoughts'|null;nodes:{key:string;title:string;status:'locked'|'available'|'in_progress'|'completed'}[]};
function usePatientContext<T>(patientId:string,resource:string){
 const {api}=useSession(),[data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),sequence=useRef(0);
 const refresh=useCallback(async()=>{const current=++sequence.current;setLoading(true);try{const result=await api('patients/'+patientId+'/'+resource);if(current===sequence.current){setData(result);setError('');}}catch(e){if(current===sequence.current)setError((e as Error).message);}finally{if(current===sequence.current)setLoading(false);}},[api,patientId,resource]);
 useEffect(()=>{void refresh();return()=>{sequence.current++;};},[refresh]);
 return {data,error,loading,refresh};
}
export function DoctorSafetyPlan({patientId}:{patientId:string}){
 const {data,error,loading,refresh}=usePatientContext<SafetyData>(patientId,'safety-plan');
 return <PatientSection className="care-context" title="План безопасности" icon={<ShieldCheck size={20}/>} actions={<button className="text-button" aria-label="Обновить план безопасности" disabled={loading} onClick={refresh}>Обновить</button>}>
  {error&&<p role="alert" className="form-error">{error}</p>}{!data&&loading?<p className="health-note">Загружаем план…</p>:data?.plan?<><p className="health-note">Сохранён {new Date(data.plan.createdAt).toLocaleDateString('ru-RU')}</p><PlanView plan={data.plan.data}/></>:data&&<p className="health-note">План пока не заполнен. Пациент может перенести готовый план или заполнить его вместе с вами. Сохранённый план неизменяем.</p>}
 </PatientSection>;
}
export function DoctorPatientPath({patientId}:{patientId:string}){
 const {data,error,loading,refresh}=usePatientContext<PathData>(patientId,'recovery-map');
 return <PatientSection className="care-context" title="Путь пациента" icon={<Compass size={20}/>} actions={<button className="text-button" aria-label="Обновить путь пациента" disabled={loading} onClick={refresh}>Обновить</button>}>
  {error&&<p role="alert" className="form-error">{error}</p>}{!data&&loading&&<p className="health-note">Загружаем путь пациента…</p>}{data&&<><p className="health-note">Все острова доступны с первого дня. Вы видите, какие разделы пациент открывал. Личные опоры и рефлексии доступны только пациенту.</p><ul className="doctor-map-list">{data.nodes.map(node=><li key={node.key}><span>{node.title}</span><small>{{locked:'Доступен',available:'Ещё не открывал',in_progress:'Открывал',completed:'Открывал'}[node.status]}</small></li>)}</ul></>}
 </PatientSection>;
}
