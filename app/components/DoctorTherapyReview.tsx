'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronDown,Lightbulb,LockKeyhole,RefreshCw} from 'lucide-react';
import {useSession} from '../../lib/session';
import {CHECKS,REVIEW_SOURCES,emptyChecks,type TherapyChecks,type TherapyReview} from '../../lib/therapy-review';

const date=(n:number)=>new Date(n).toLocaleDateString('ru-RU');
export function DoctorTherapyReview({patientId}:{patientId:string}){
 const {api}=useSession(),[data,setData]=useState<TherapyReview|null>(null),[checks,setChecks]=useState(emptyChecks),[history,setHistory]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
 const current=useRef<TherapyReview|null>(null),draft=useRef(false),sequence=useRef(0),saving=useRef(false),statusRef=useRef<HTMLParagraphElement>(null);
 const path='patients/'+patientId+'/therapy-review';
 const dirty=!!data&&(JSON.stringify(checks)!==JSON.stringify(data.checks)||history!==data.history);draft.current=dirty;
 const load=useCallback(async()=>{
  if(saving.current)return;
  const attempt=++sequence.current;setChecking(true);
  try{
   const next:TherapyReview=(await api(path)).review;if(attempt!==sequence.current)return;
   const changed=current.current&&(current.current.context!==next.context||current.current.revision!==next.revision||current.current.reviewedAt!==next.reviewedAt);
   if(!draft.current||changed){setChecks(next.checks);setHistory(next.history);if(changed&&draft.current)setMessage('Данные изменились. Проверьте условия заново.');}
   current.current=next;setData(next);setError('');
  }catch(e){if(attempt===sequence.current){setData(null);current.current=null;setError((e as Error).message);}}
  finally{if(attempt===sequence.current)setChecking(false);}
 },[api,path]);
 useEffect(()=>{void load();const refresh=()=>{if(!document.hidden)void load()};const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);window.addEventListener('compass-data-changed',refresh);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('compass-data-changed',refresh);}},[load]);
 useEffect(()=>{if(message==='Оценка сохранена.'){statusRef.current?.focus();statusRef.current?.scrollIntoView({block:'center'});}},[message]);
 async function save(){
  if(!data||busy)return;saving.current=true;setBusy(true);setError('');setMessage('');const attempt=++sequence.current;
  try{
   const next:TherapyReview=(await api(path,'PUT',{context:data.context,revision:data.revision,checks,history})).review;
   if(attempt!==sequence.current)return;
   current.current=next;setData(next);setChecks(next.checks);setHistory(next.history);setMessage('Оценка сохранена.');
  }catch(e){saving.current=false;await load();setError((e as Error).message);}
  finally{saving.current=false;setBusy(false);setChecking(false);}
 }
 if(!data?.active)return error?<div className="therapy-unavailable"><span>Подсказка врачу недоступна: {error}</span><button className="text-button" onClick={()=>void load()}>Обновить</button></div>:null;
 const status=dirty?'Есть несохранённая оценка':data.status==='consider'?'Условия проверены':data.status==='blocked'?'Нужно клиническое уточнение':'Нужно уточнить данные';
 const showSuggestion=!dirty&&!checking&&!busy&&!!data.suggestion;
 const group=(key:'clinical'|'contra'|'safety',title:string)=><fieldset className="therapy-check-group"><legend>{title}</legend><div>{CHECKS.filter(c=>c.group===key).map(c=><label key={c.key} className="therapy-check"><span>{c.label}</span><select value={checks[c.key]} disabled={busy} onChange={e=>{setChecks(v=>({...v,[c.key]:e.target.value as TherapyChecks[typeof c.key]}));setMessage('')}}><option value="unknown">Не уточнено</option><option value="yes">Да</option><option value="no">Нет</option></select></label>)}</div></fieldset>;
 return <details className="therapy-review"><summary><Lightbulb size={20}/><span><strong>Стоит пересмотреть терапию</strong><small>GAD-7: {data.evidence!.score}/21 · {date(data.evidence!.submittedAt)}</small></span><span className="therapy-private"><LockKeyhole size={13}/>Только врачу</span><ChevronDown size={19} className="therapy-chevron"/></summary><div className="therapy-content">
  <div className="therapy-heading"><p>GAD-7 ≥10 — повод оценить тревогу. Балл не определяет диагноз или препарат.</p><button type="button" className="text-button" disabled={busy||checking} onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button></div>
  {data.stale&&<p className="soft-notice">Изменились клинические данные или срок оценки. Подтвердите условия заново.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  <p className="therapy-status" role="status" ref={statusRef} tabIndex={-1}>{checking?'Проверяем актуальность…':status}</p>
  {message&&<p className="health-note" role="status">{message}</p>}
  {!dirty&&data.status==='blocked'&&<div className="therapy-hold"><strong>Предложение препарата не сформировано.</strong><ul>{data.reasons.map(r=><li key={r}>{r}</li>)}</ul></div>}
  {showSuggestion&&<article className="therapy-suggestion" aria-label="Вариант терапии для врача"><h3>{data.suggestion!.title}</h3><p>{data.suggestion!.text}</p><small>Оценка врача сохранена {date(data.reviewedAt!)}. Назначение автоматически не создаётся.</small></article>}
  <details className="therapy-checklist" open={dirty||undefined}><summary>Проверить клинические условия</summary><form onSubmit={e=>{e.preventDefault();void save()}}>
   <p className="health-note">Заполните по актуальному анамнезу и клинической оценке.{data.age!==null?` Возраст по профилю: ${data.age}.`:''}</p>
   {group('clinical','Клинические основания')}
   <label className="field">Предшествующая терапия<textarea rows={3} value={history} maxLength={2000} disabled={busy} onChange={e=>{setHistory(e.target.value);setMessage('')}} placeholder="Схемы первых двух линий, сроки, эффект, переносимость и приверженность"/></label>
   {group('contra','Противопоказания и ограничения')}
   {group('safety','Текущая ситуация')}
   <p className="health-note">Проверьте взаимодействия, в том числе с серотонинергическими и седативными средствами, ингибиторами CYP2D6, а также все меры предосторожности по инструкции. Отсутствие сведений не означает отсутствие риска.</p>
   <div className="therapy-save"><button className="primary" disabled={busy||checking||!dirty}>{busy?'Сохраняем…':'Сохранить оценку'}</button></div>
  </form></details>
  <details className="therapy-sources"><summary>Основания и ограничения</summary><p>Подсказка относится к ГТР. PHQ-9, низкое настроение, DASS и анализ голоса не служат основанием выбора этого препарата. Непросмотренный сигнал безопасности блокирует предложение до клинической оценки.</p><p>Правила интерфейса: последний GAD-7 за 30 дней, оценка врача — до 14 дней. Новый тест, изменение карточки, назначений или сигналов требуют повторной проверки. Это сроки актуальности подсказки, а не лечебный протокол.</p><ul>{REVIEW_SOURCES.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}</ul><p>Проверка условий не является полной автоматической проверкой взаимодействий и противопоказаний. Подсказка не передаётся пациенту и не копируется в общие рекомендации.</p></details>
 </div></details>;
}
