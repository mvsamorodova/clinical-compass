'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Lightbulb,LockKeyhole,RefreshCw} from 'lucide-react';
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
 const ready=!dirty&&!checking&&!busy&&data.status==='consider';
 const evidence=data.evidence!,facts=data.patientFacts;
 return <section className="therapy-review" aria-labelledby={'therapy-title-'+patientId}>
  <div className="therapy-header"><Lightbulb size={20}/><div><h3 id={'therapy-title-'+patientId}>Стоит пересмотреть терапию</h3><p>{evidence.label}: {evidence.score}/{evidence.max} · {evidence.trigger==='persistent'?`повторные симптомы за ${evidence.spanDays} дн.`:date(evidence.submittedAt)}</p></div><span className="therapy-private"><LockKeyhole size={13}/>Только врачу</span><button type="button" className="text-button" disabled={busy||checking} onClick={()=>void load()} aria-label="Обновить данные для проверки терапии"><RefreshCw size={16}/></button></div>
  <div className="therapy-content">
   {data.stale&&<p className="soft-notice">Изменились клинические данные или срок оценки. Подтвердите условия заново.</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="therapy-decision-grid">
    <article className="therapy-suggestion" aria-label="Вариант терапии для врача">
     <span className="eyebrow">Вариант лечения</span><h4>{data.suggestion?.title??'Рассмотреть назначение Авиандра'}</h4><p>{data.suggestion?.text}</p>
     <p className="therapy-status" role="status" ref={statusRef} tabIndex={-1}>{checking?'Проверяем актуальность…':status}</p>
     {data.status==='blocked'&&<div className="therapy-hold"><strong>Есть препятствия для назначения.</strong><ul>{data.reasons.map(r=><li key={r}>{r}</li>)}</ul></div>}
     {ready?<p className="therapy-ready">Пять условий проверены и сохранены. Окончательное решение о назначении принимает врач.</p>:<p className="health-note">Условия назначения ещё не подтверждены. Проверьте чек-лист и сохраните оценку.</p>}
     {data.reviewedAt&&<small>Оценка сохранена {date(data.reviewedAt)}.</small>}
     <small>Доза и схема указываются врачом в разделе «Лекарства». Назначение автоматически не создаётся.</small>
     <p className="health-note">{evidence.trigger==='persistent'?'Тревога в повторных обследованиях не снизилась относительно первого результата.':'Выраженность тревоги — повод оценить состояние и эффект терапии.'} Баллы тестов не устанавливают диагноз.</p>
    </article>
    <form className="therapy-checklist" onSubmit={e=>{e.preventDefault();void save()}} aria-label="Пять условий перед назначением">
     <h4>Проверка перед назначением · 5 пунктов</h4>
     <ol className="therapy-check-items">{CHECKS.map(c=>{
      const automaticAge=c.key==='adult'&&!!facts.birthDate;
      const automaticSafety=c.key==='safety'&&facts.unreviewedSafety;
      return <li className="therapy-check" key={c.key}>
       <label className="therapy-check-label" htmlFor={'therapy-'+patientId+'-'+c.key}>{c.label}</label>
       {c.key==='adult'&&<p className="therapy-fact">{facts.birthDate?<>Из профиля: {facts.birthDate}{data.age!==null?<> · полных лет: <strong>{data.age}</strong></>:' · дата требует исправления'}</>:'Дата рождения не указана — подтвердите возраст по анамнезу.'}</p>}
       {c.key==='indication'&&<p className="therapy-fact therapy-record">{facts.summary?<>Из карточки: {facts.summary}</>:'В карточке нет клинического описания. Подтвердите основания по анамнезу.'}</p>}
       {c.key==='priorLines'&&<div className="therapy-fact therapy-medications"><strong>Назначения из карточки</strong>{facts.medications.length?facts.medications.map(m=><p key={m.id}>{m.name} · {m.dose} · {m.frequency}<small>{m.status==='active'?'Действует':'Завершено'} · назначено {date(m.createdAt)}</small></p>):<p>Назначения не внесены. Укажите лечение из анамнеза ниже.</p>}</div>}
       {c.key==='safety'&&<p className="therapy-fact">{facts.unreviewedSafety?'Есть непросмотренный сигнал безопасности. Сначала просмотрите его и оцените состояние пациента.':'Непросмотренных сигналов безопасности нет. Подтвердите клиническую оценку и взаимодействия.'}</p>}
       <p className="therapy-check-description" id={'therapy-help-'+patientId+'-'+c.key}>{c.description}</p>
       {automaticAge?<output id={'therapy-'+patientId+'-'+c.key} className="therapy-automatic">{data.age===null?'Дата рождения требует исправления':data.age>=18?'✓ Выполнено автоматически':'Возраст меньше 18 лет — условие не выполнено'}</output>:<select id={'therapy-'+patientId+'-'+c.key} aria-describedby={'therapy-help-'+patientId+'-'+c.key} value={checks[c.key]} disabled={busy||automaticSafety} onChange={e=>{setChecks(v=>({...v,[c.key]:e.target.value as TherapyChecks[typeof c.key]}));setMessage('')}}><option value="unknown">Не уточнено</option><option value="yes">Подтверждено</option><option value="no">Не выполнено / есть препятствия</option></select>}
       {c.key==='priorLines'&&<label className="field">История и эффект предшествующей терапии<textarea rows={3} value={history} maxLength={2000} disabled={busy} onChange={e=>{setHistory(e.target.value);setMessage('')}} placeholder="Схемы первых двух линий, сроки, эффект, переносимость и приверженность"/></label>}
      </li>;
     })}</ol>
     {message&&<p className="health-note" role="status">{message}</p>}
     <div className="therapy-save"><button className="primary" disabled={busy||checking||!dirty}>{busy?'Сохраняем…':'Сохранить оценку'}</button></div>
    </form>
   </div>
  {evidence.trigger==='persistent'&&<ol className="therapy-timeline" aria-label={'Динамика: '+evidence.label}>{evidence.points.map(p=><li key={p.id}><strong>{p.score}<small>/{evidence.max}</small></strong><span>{date(p.submittedAt)}</span></li>)}</ol>}
  <details className="therapy-evidence"><summary>Динамика и другие тесты</summary><div className="therapy-table-scroll"><table><caption>Последние результаты за 8 недель · каждая шкала оценивается отдельно</caption><thead><tr><th scope="col">Тест</th><th scope="col">Результат</th><th scope="col">Дата</th></tr></thead><tbody>{data.measures.map(m=><tr key={m.id}><th scope="row">{m.label}{m.testKey==='phq9'&&<small>Контекст депрессивных симптомов</small>}{m.testKey==='bai'&&!m.usable&&<small>Редакция не подтверждена для порогов КР</small>}</th><td>{m.score}/{m.max}</td><td>{date(m.submittedAt)}</td></tr>)}</tbody></table></div><p className="health-note">Различия между шкалами требуют клинической оценки. Для BAI используется дата обследования, а не дата переноса результата.</p></details>
  <details className="therapy-sources"><summary>Основания и ограничения</summary><p>Подсказка относится к пересмотру терапии тревожных симптомов. GAD-7, HARS, BAI и тревожная подшкала DASS-42 не устанавливают ГТР. PHQ-9 показан только как контекст. Настроение и анализ голоса не участвуют в выборе препарата. Непросмотренный сигнал безопасности блокирует подтверждение готовности к назначению до клинической оценки.</p><p>Повод для пересмотра: последний результат за 30 дней — GAD-7 ≥10, HARS ≥18, BAI ≥22 или DASS-42 «Тревога» ≥10. Другой повод — не менее 3 результатов одной шкалы с интервалами от 14 дней, за 28–56 дней: GAD-7 ≥5, HARS ≥8, BAI ≥10 или DASS-42 «Тревога» ≥8; последний результат — не старше 14 дней. Последний балл должен быть не ниже первого. Снижение лёгких симптомов не запускает эту подсказку. Низкий или непроверенный результат прерывает серию. Баллы разных шкал не складываются.</p><p>Для BAI пороги применяются только к явно указанной редакции «КР РФ 2024, приложение Г6». Для DASS-42 берётся полная тревожная подшкала без умножения на 2. Интервалы и число наблюдений — правила напоминания в интерфейсе, а не валидированный алгоритм назначения. Оценка врача действует до 14 дней; новые клинические данные требуют повторной проверки.</p><ul>{REVIEW_SOURCES.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}</ul><p>Проверка условий не является полной автоматической проверкой взаимодействий и противопоказаний. Подсказка не передаётся пациенту и не копируется в общие рекомендации.</p></details>
  </div>
 </section>;
}
