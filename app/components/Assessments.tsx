'use client';
import {DoctorAlerts} from './DoctorAlerts';
import {PatientSection} from './PatientSection';
import {DoctorDiaryPlan} from './DailyDiary';
import {AssessmentSources} from './AssessmentSources';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ClipboardList, Eye, LoaderCircle, Pause, Play, Plus, RefreshCw } from 'lucide-react';
import { useSession } from '../../lib/session';
import { SCHEDULE_OPTIONS, scheduleLabel } from '../../lib/test-schedule';
import {validateFields, type AssessmentDefinition} from '../../lib/assessments';
import {AssessmentFields,AssessmentResponse} from './AssessmentFields';

type Test = Pick<AssessmentDefinition,'key'|'version'|'name'|'shortName'|'description'|'doctorDescription'|'recallLabel'|'variantLabel'|'scoreDefinitions'|'scoringNote'|'sources'|'respondent'|'keyNotes'> & {questionCount:number};
type Assignment = {id:string;test:Test;status:'active'|'paused';nextDueAt:number;intervalDays:number};
type Result = {id:string;assignmentId:string;submittedAt:number;nextDueAt:number;scores?:Record<string,number>};
type Data = {catalogue?:Test[];assignments:Assignment[];results:Result[]};
const modeLabel=(t:Test)=>t.respondent==='external'?'Внешнее обследование':t.respondent==='clinician'?'Заполняет врач':'Заполняет пациент';
const date = (n:number) => new Date(n).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const stateLabel = (a:Assignment,now:number) => a.status==='paused'?'Приостановлен':a.nextDueAt<=now?'Можно пройти':'Следующее прохождение';

// Compact catalogue copy only; full descriptions, versions and sources stay available.
const catalogueSummary:Record<string,string>={
 dass42:'Депрессия, тревога и стресс — три отдельные шкалы. Не оценивает суицидальный риск.',
 phq9:'Скрининг депрессивных симптомов и наблюдение за их динамикой.',
 gad7:'Скрининг тревоги и беспокойства, наблюдение за динамикой.',
 mfq20_ru:'Настроение, удовольствие и самоотношение у взрослых.',
 poms38_ru:'Профиль положительных и отрицательных эмоций.',
 hdrs17:'Клиническая оценка депрессии по беседе и наблюдению.',
 madrs:'Выраженность депрессии. Перенос суммы из готового бланка.',
 hcl33:'Скрининг гипомании в анамнезе. Не устанавливает диагноз.',
 cssrs_lifetime:'Интервью о суицидальных мыслях и поведении. Отдельные ответы без общего балла.',
 hars:'Клиническая оценка психических и телесных проявлений тревоги.',
 scl90r:'Профиль симптомов по девяти областям. Перенос результатов внешнего обследования.',
 itt:'Тревога сейчас и привычная тревожность — два отдельных результата.',
 bai:'Самооценка тревоги. Перенос суммы из готового бланка.',
 psychache13:'Душевная боль и её переносимость за последние 7–14 дней.',
 bhs11:'Самооценка безнадёжности и восприятия будущего.',
 beck_supplied21:'Предоставленная редакция. Сохранение ответов без автоматического подсчёта.',
};

function SchedulePicker({value,onChange,label,disabled=false,hideLabel=false}:{value:number;onChange:(n:number)=>void;label:string;disabled?:boolean;hideLabel?:boolean}){
 const [custom,setCustom]=useState(!SCHEDULE_OPTIONS.some(o=>o.days===value));
 return <label className="schedule-picker"><span className={hideLabel?'sr-only':undefined}>{label}</span><select aria-label={label} value={custom?'custom':value} disabled={disabled} onChange={e=>{if(e.target.value==='custom'){setCustom(true);}else{setCustom(false);onChange(Number(e.target.value));}}}>{SCHEDULE_OPTIONS.map(o=><option key={o.days} value={o.days}>{o.label}</option>)}<option value="custom">Свой интервал</option></select>{custom&&<span className="custom-schedule">Каждые <input aria-label={label+' — дней'} type="number" min="1" max="365" step="1" value={Number.isNaN(value)?'':value} disabled={disabled} onChange={e=>onChange(e.target.valueAsNumber)}/> дней</span>}</label>;
}
const validInterval=(n:number)=>Number.isInteger(n)&&n>=1&&n<=365;
function AssignmentSchedule({assignment:a,busy,save}:{assignment:Assignment;busy:boolean;save:(days:number)=>void}){
 const [days,setDays]=useState(a.intervalDays);useEffect(()=>setDays(a.intervalDays),[a.intervalDays]);
 return <div className="assignment-schedule"><SchedulePicker hideLabel label={'Периодичность '+a.test.shortName} value={days} onChange={setDays} disabled={busy}/><button className="secondary" aria-label={'Сохранить периодичность '+a.test.shortName} disabled={busy||days===a.intervalDays||!validInterval(days)} onClick={()=>save(days)}>Сохранить</button>{days!==a.intervalDays&&<small>Следующая дата будет рассчитана от последнего прохождения. История сохранится.</small>}</div>;
}
function useTests(path:string){
 const {api}=useSession(),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{setData(await api(path));}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[api,path]);
 useEffect(()=>{void refresh();},[refresh]);
 return {api,data,error,setError,loading,refresh};
}

export function DoctorTests({patientId}:{patientId:string}){
 const path='patients/'+patientId+'/tests', {api,data,error,setError,loading,refresh}=useTests(path);
 const [opened,setOpened]=useState<{assignment:Assignment;definition:AssessmentDefinition}|null>(null),[search,setSearch]=useState(''),[mode,setMode]=useState('all');
 const [frequencies,setFrequencies]=useState<Record<string,number>>({}),[assignmentPanel,setAssignmentPanel]=useState<'tests'|'diary'>('tests');
 const [catalogue,setCatalogue]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[signalCount,setSignalCount]=useState(0);
 async function change(fn:()=>Promise<unknown>,text:string){setBusy(true);setMessage('');setError('');try{await fn();setMessage(text);setCatalogue(false);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function openForm(a:Assignment){setBusy(true);setError('');try{setOpened(await api(path+'/'+a.id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(opened)return <PatientSection className="tests-panel" title="Тесты и ежедневный дневник" icon={<ClipboardList size={20}/>} notice={signalCount?`Сигналы: ${signalCount}`:undefined}><Questionnaire {...opened} endpoint={path+'/'+opened.assignment.id+'/results'} onBack={()=>setOpened(null)} onComplete={()=>{setOpened(null);setMessage('Оценка сохранена.');void refresh();}}/></PatientSection>;
 return <PatientSection className="tests-panel" headingId="doctor-tests-heading" title="Тесты и ежедневный дневник" icon={<ClipboardList size={20}/>} notice={signalCount?`Сигналы: ${signalCount}`:undefined} actions={assignmentPanel==='tests'&&<button className="primary full" disabled={busy||!data} onClick={()=>setCatalogue(!catalogue)}><Plus size={17}/>{catalogue?'Скрыть каталог':'Назначить тест'}</button>}>
  {error&&<div className="error-banner" role="alert">{error}<button className="text-button" onClick={refresh}>Повторить</button></div>}
  {message&&<div className="test-success" role="status"><Check size={18}/>{message}</div>}
  <DoctorAlerts patientId={patientId} tests={data?.catalogue??[]} onPendingChange={setSignalCount}/>
  <div className="assignment-switch" role="group" aria-label="Тип назначения"><button type="button" aria-pressed={assignmentPanel==='tests'} onClick={()=>setAssignmentPanel('tests')}>Тесты</button><button type="button" aria-pressed={assignmentPanel==='diary'} onClick={()=>setAssignmentPanel('diary')}>Ежедневный дневник</button></div>
  <div hidden={assignmentPanel!=='tests'}>
  {catalogue&&<div className="test-catalogue">
   <div className="catalogue-intro"><h3>Каталог тестов</h3><p>Частота назначения не меняет период оценки в вопросах.</p></div>
   <div className="catalogue-controls"><input aria-label="Поиск методики" placeholder="Название или симптом" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Кто заполняет" value={mode} onChange={e=>setMode(e.target.value)}><option value="all">Все методики</option><option value="patient">Заполняет пациент</option><option value="clinician">Заполняет врач</option><option value="external">Внешнее обследование</option></select></div>
   <div className="test-catalogue-grid">{data?.catalogue?.filter(t=>(mode==='all'||(t.respondent??'patient')===mode)&&(t.name+' '+t.shortName+' '+t.doctorDescription).toLowerCase().includes(search.toLowerCase())).map(t=>{
    const active=data.assignments.find(a=>a.test.key===t.key&&a.status==='active'),days=frequencies[t.key]??7;
    return <article className="test-catalogue-item" key={t.key}>
     <div className="catalogue-card-title"><div><span className="test-code">{t.shortName}</span><h3>{t.name}</h3></div></div>
     <span className="assessment-mode">{modeLabel(t)}</span>
     <p className="catalogue-description">{catalogueSummary[t.key]??t.doctorDescription}</p>
     <div className="catalogue-facts"><span>{t.variantLabel.replace(' · Внешнее обследование','')}</span></div>
     <AssessmentSources test={t} summary="Описание и источники"><p>{t.doctorDescription}</p></AssessmentSources>
     <div className="catalogue-card-actions">
      <SchedulePicker label={`Частота назначения ${t.shortName}`} value={days} onChange={days=>setFrequencies(p=>({...p,[t.key]:days}))} disabled={busy||!!active}/>
      <div className="catalogue-buttons">
       <a className="secondary test-preview-link" href={'/test-preview?test='+encodeURIComponent(t.key)} target="_blank" rel="noopener" aria-label={'Предпросмотр '+t.shortName} title="Откроется в новой вкладке"><Eye size={16}/>Предпросмотр</a>
       <button className="primary" aria-label={`Назначить ${t.shortName}`} disabled={busy||!!active||!validInterval(days)} onClick={()=>change(()=>api(path,'POST',{testKey:t.key,intervalDays:days}),`${t.shortName} назначен: ${scheduleLabel(days).toLowerCase()}. ${!t.respondent||t.respondent==='patient'?'Опросник появился у пациента.':'Форма доступна в назначениях.'}`)}>{active?<><Check size={16}/>Уже назначен</>:<><Plus size={16}/>Назначить</>}</button>
      </div>
     </div>
    </article>;
   })}</div>
  </div>}

  {loading&&!data?<p className="test-muted"><LoaderCircle className="spin" size={18}/>Загружаем назначения…</p>:data&&!data.assignments.length?<div className="test-empty"><ClipboardList size={30}/><p>Тесты пока не назначены</p></div>:data?.assignments.map(a=><article className="test-assignment doctor-test-assignment" key={a.id} aria-labelledby={'assigned-test-'+a.id}><div className="assignment-heading"><div className="assignment-title"><span className="test-code">{a.test.shortName}</span><h3 id={'assigned-test-'+a.id}>{a.test.name}</h3></div><AssignmentSchedule assignment={a} busy={busy} save={days=>change(()=>api(path+'/'+a.id,'PATCH',{intervalDays:days}),'Периодичность обновлена.')}/></div><div className="assignment-status-row"><p>{a.status==='paused'?'Назначение приостановлено; результаты сохранены.':a.nextDueAt<=Date.now()?(!a.test.respondent||a.test.respondent==='patient'?'Ожидает прохождения пациентом':'Ожидает оценки врачом'):`Следующий тест: ${date(a.nextDueAt)}`}</p><div className="assignment-actions"><a className="secondary test-preview-link" href={'/test-preview?test='+encodeURIComponent(a.test.key)} target="_blank" rel="noopener" aria-label={'Предпросмотр '+a.test.shortName} title="Откроется в новой вкладке"><Eye size={16}/>Предпросмотр</a>{a.test.respondent&&a.test.respondent!=='patient'&&<button className="primary" disabled={busy||a.status!=='active'||a.nextDueAt>Date.now()} onClick={()=>openForm(a)}>{a.test.respondent==='external'?'Внести результат':'Заполнить оценку'}</button>}<button className="secondary" disabled={busy} onClick={()=>change(()=>api(path+'/'+a.id,'PATCH',{status:a.status==='active'?'paused':'active'}),a.status==='active'?'Назначение приостановлено.':'Назначение возобновлено.')}>{a.status==='active'?<Pause size={16}/>:<Play size={16}/>} {a.status==='active'?'Приостановить':'Возобновить'}</button></div></div></article>)}

  </div><div hidden={assignmentPanel!=='diary'}><DoctorDiaryPlan patientId={patientId}/></div>
 </PatientSection>;
}

function TestResultDialog({data,onClose}:{data:any;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{if(node?.open)node.close();};},[]);
 return <dialog ref={dialog} className="test-result-dialog" aria-label={data.definition.shortName+' — сохранённые ответы'} onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><div className="test-result-dialog-toolbar"><button className="secondary" onClick={()=>dialog.current?.close()}>Закрыть</button></div><AssessmentResponse data={data}/></dialog>;
}
export function DoctorTestHistory({patientId}:{patientId:string}){
 const path='patients/'+patientId+'/tests',{api,data,error,setError,loading,refresh}=useTests(path),[detail,setDetail]=useState<any>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{const changed=()=>void refresh();window.addEventListener('focus',changed);window.addEventListener('compass-data-changed',changed);return()=>{window.removeEventListener('focus',changed);window.removeEventListener('compass-data-changed',changed);};},[refresh]);
 async function showResult(id:string){setBusy(true);setError('');try{setDetail(await api(path+'/results/'+id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <PatientSection title="История прохождения тестов" icon={<ClipboardList size={20}/>} actions={<button className="text-button" disabled={loading||busy} onClick={refresh}><RefreshCw size={15}/>Обновить</button>}>
  {error&&<p className="error-banner" role="alert">{error}</p>}
  {loading&&!data?<p className="test-muted">Загружаем историю…</p>:!data?.results.length?<p className="test-muted">Пациент пока не проходил назначенные тесты.</p>:<div className="table-wrap"><table className="test-history-table"><caption className="sr-only">История прохождения тестов пациента</caption><thead><tr><th>Тест</th><th>Дата прохождения</th><th>Результаты</th></tr></thead><tbody>{data.results.map(r=>{const test=data.assignments.find(a=>a.id===r.assignmentId)?.test;return <tr key={r.id}><td><button className="history-test-name" disabled={busy} onClick={()=>showResult(r.id)} aria-label={'Открыть '+(test?.shortName??'тест')+' от '+date(r.submittedAt)}>{test?.shortName??'Тест'}<ArrowRight size={16}/></button><small className="result-variant">{test?.variantLabel}</small></td><td>{date(r.submittedAt)}</td><td><div className="result-scores">{test?.scoreDefinitions.map(score=><span key={score.key}><small>{score.label}</small><strong>{r.scores?.[score.key]??'—'}</strong></span>)}</div>{!test?.scoreDefinitions.length&&<span className="test-muted">Без общего балла</span>}</td></tr>;})}</tbody></table></div>}
  {detail&&<TestResultDialog data={detail} onClose={()=>setDetail(null)}/>}
 </PatientSection>;
}

export function PatientTests(){
 const {api,data,error,setError,loading,refresh}=useTests('tests'),[opened,setOpened]=useState<{assignment:Assignment;definition:AssessmentDefinition}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 async function start(a:Assignment){setBusy(true);setError('');setMessage('');try{setOpened(await api('tests/'+a.id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(opened)return <Questionnaire key={opened.assignment.id} {...opened} onBack={()=>{setOpened(null);void refresh();}} onComplete={r=>{setOpened(null);setMessage(`Ответы сохранены и доступны вашему врачу. Следующее прохождение — ${date(r.nextDueAt)}.`);void refresh();}}/>;
 return <><div className="page-title"><div><h1>Мои тесты</h1></div><button className="secondary" disabled={loading} onClick={refresh}><RefreshCw size={16}/>Обновить</button></div>
  {message&&<div className="test-success" role="status"><Check size={21}/><div><strong>Спасибо, вы завершили тест</strong><p>{message}</p></div></div>}
  {error&&<div className="error-banner" role="alert">{error}</div>}
  {loading&&!data?<div className="panel test-empty"><LoaderCircle className="spin"/><p>Загружаем ваши тесты…</p></div>:data&&!data.assignments.length?<div className="panel test-empty"><ClipboardList size={32}/><h2>Пока нет назначенных тестов</h2></div>:<div className="patient-tests-list">{data?.assignments.map(a=><section className="panel patient-test-card" key={a.id}><div className="test-card-top"><span className="test-symbol"><ClipboardList size={26}/></span><span className={'test-status '+(a.status==='active'&&a.nextDueAt<=now?'ready':'')}>{stateLabel(a,now)}</span></div><span className="test-code">{a.test.shortName}</span><h2>{a.test.name}</h2><p>{a.test.description}</p><p className="patient-test-period">Период оценки: {a.test.recallLabel.toLowerCase()}</p><div className="test-schedule"><CalendarDays size={18}/><span>{scheduleLabel(a.intervalDays)}{a.status==='active'&&a.nextDueAt>now&&<><br/><strong>{date(a.nextDueAt)}</strong></>}</span></div><button className="primary" disabled={busy||a.status!=='active'||a.nextDueAt>now} onClick={()=>start(a)}>{busy?<LoaderCircle className="spin" size={16}/>:<ClipboardList size={17}/>} {a.status==='paused'?'Приостановлен врачом':a.nextDueAt>now?'Пока недоступен':'Пройти тест'}</button></section>)}</div>}
  {!!data?.results.length&&<section className="panel tests-panel"><h2>Мои прохождения</h2><p className="test-muted">Ответы доступны вашему врачу. Результаты можно обсудить на консультации.</p>{data.results.map(r=><div className="test-receipt" key={r.id}><Check size={19}/><div><strong>{data.assignments.find(a=>a.id===r.assignmentId)?.test.shortName}</strong><p>{date(r.submittedAt)}</p></div><span>Отправлено врачу</span></div>)}</section>}
 </>;
}

function Questionnaire({assignment:a,definition:t,onBack,onComplete,endpoint}:{assignment:Assignment;definition:AssessmentDefinition;onBack:()=>void;onComplete:(r:Result)=>void;endpoint?:string}){
 const {api}=useSession(),[answers,setAnswers]=useState<(number|null)[]>(()=>Array(t.questions.length).fill(null)),[step,setStep]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[discard,setDiscard]=useState(false),[submitted,setSubmitted]=useState(false);
 const [extra,setExtra]=useState<Record<string,string|number>>({}),doctor=!!endpoint;
 const sendId=useRef(crypto.randomUUID()),heading=useRef<HTMLHeadingElement>(null),pageSize=6,pages=Math.max(1,Math.ceil(t.questions.length/pageSize)),count=answers.filter(x=>x!==null).length;
 useEffect(()=>{heading.current?.focus();},[step]);
 useEffect(()=>{if((!count&&!Object.keys(extra).length)||submitted)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[count,extra,submitted]);
 function next(){if(answers.slice(step*pageSize,(step+1)*pageSize).some(x=>x===null)){setError('Выберите ответ для каждого вопроса на этой странице.');return;}setError('');setStep(step+1);}
 async function submit(){if(count!==t.questions.length){setError('Ответьте на все вопросы перед отправкой.');return;}setBusy(true);setError('');try{const cleaned=validateFields(t,extra);const {result}=await api(endpoint??('tests/'+a.id+'/results'),'POST',{id:sendId.current,version:t.version,dueAt:a.nextDueAt,answers,extra:cleaned});setSubmitted(true);onComplete(result);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="questionnaire"><button className="back-link" disabled={busy} onClick={()=>count||Object.keys(extra).length?setDiscard(true):onBack()}><ArrowLeft size={16}/>{doctor?'К назначениям':'К моим тестам'}</button>
  {discard&&<div className="test-discard" role="alert"><p>Ответы ещё не отправлены. При выходе они будут потеряны.</p><button className="secondary" onClick={()=>setDiscard(false)}>Продолжить тест</button><button className="text-button" onClick={onBack}>Выйти без сохранения</button></div>}
  <div className="questionnaire-header"><span className="eyebrow">{t.shortName} · {t.recallLabel.toUpperCase()}</span><h1>{t.name}</h1><p>{t.instruction}</p>{doctor&&<details className="test-method"><summary>Источник, руководство и особенности ключа</summary><p>{t.scoringNote}</p>{t.keyNotes?.map(note=><p key={note}>{note}</p>)}</details>}{doctor&&<AssessmentSources test={t}/>}<div hidden={!t.questions.length} className="test-progress-label"><span>Отвечено {count} из {t.questions.length}</span><span>Шаг {step+1} из {pages}</span></div><progress hidden={!t.questions.length} max={t.questions.length||1} value={count} aria-label="Прогресс прохождения"/></div>
  <h2 hidden={!t.questions.length} ref={heading} tabIndex={-1} className="question-step">Вопросы {step*pageSize+1}–{Math.min((step+1)*pageSize,t.questions.length)}</h2>
  {t.questions.slice(step*pageSize,(step+1)*pageSize).map((question,i)=>{const n=step*pageSize+i;return <fieldset className="panel test-question" key={n}><legend><span>{n+1}</span>{question}</legend><div className="test-options">{(t.itemOptions?.[n]??t.options).map((option,value)=><label className={answers[n]===value?'selected':''} key={value}><input type="radio" name={'question-'+n} value={value} checked={answers[n]===value} disabled={busy} onChange={()=>{setAnswers(previous=>previous.map((v,j)=>j===n?value:v));setError('');sendId.current=crypto.randomUUID();}}/><span>{option}</span></label>)}</div></fieldset>;})}
  {step===pages-1&&!!t.fields?.length&&<AssessmentFields test={t} values={extra} disabled={busy} onChange={v=>{setExtra(v);sendId.current=crypto.randomUUID();}}/>}
  {!doctor&&t.safetyItems.some(n=>(answers[n-1]??0)>0)&&<p className="test-support">Если сейчас вы можете причинить себе вред, обратитесь за срочной помощью: позвоните в экстренную службу вашего региона и попросите близкого человека побыть рядом. Отправка теста не заменяет срочную связь с врачом.</p>}
  {error&&<div className="error-banner" role="alert">{error}</div>}
  <div className="questionnaire-actions"><button className="secondary" disabled={step===0||busy} onClick={()=>{setError('');setStep(step-1);}}><ArrowLeft size={16}/>Назад</button><span>{step===pages-1?'После отправки ответы будут доступны врачу.':'Ответы сохранятся после отправки всего теста.'}</span>{step<pages-1?<button className="primary" onClick={next}>Далее<ArrowRight size={17}/></button>:<button className="primary" disabled={busy||count!==t.questions.length} onClick={submit}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>}{doctor?'Сохранить оценку':'Отправить ответы врачу'}</button>}</div>
 </div>;
}
