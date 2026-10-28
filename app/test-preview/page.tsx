'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,Eye,LoaderCircle} from 'lucide-react';
import {SessionProvider,useSession} from '../../lib/session';
import type {AssessmentDefinition} from '../../lib/assessments';
import {AssessmentFields} from '../components/AssessmentFields';
import {AssessmentSources} from '../components/AssessmentSources';

export default function TestPreviewPage(){return <SessionProvider><Preview/></SessionProvider>;}

function Preview(){
 const {user,loading,api}=useSession(),[test,setTest]=useState<AssessmentDefinition|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  setTest(null);setError('');if(user?.role!=='doctor')return;
  const key=new URLSearchParams(window.location.search).get('test');
  if(!key){setError('Не выбран тест для предпросмотра.');return;}
  let active=true;
  void api('assessment-preview/'+encodeURIComponent(key)).then(r=>{if(active)setTest(r.definition);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[user?.id,user?.role,api,retry]);
 return <main className="test-preview-page">
  <div className="test-preview-toolbar"><a className="back-link" href="/"><ArrowLeft size={17}/>К кабинету</a><span><Eye size={17}/>Предпросмотр теста</span></div>
  {loading?<p className="test-preview-loading"><LoaderCircle className="spin" size={20}/>Открываем предпросмотр…</p>:user?.role!=='doctor'?<section className="panel test-preview-message"><h1>Предпросмотр доступен врачу</h1><p>Откройте свой кабинет врача, чтобы посмотреть тест.</p><a className="secondary" href="/">Открыть кабинет</a></section>:error?<section className="panel test-preview-message" role="alert"><h1>Не удалось открыть тест</h1><p>{error}</p><button className="secondary" onClick={()=>setRetry(n=>n+1)}>Повторить</button></section>:test?<PreviewForm key={test.key+test.version} test={test}/>:<p className="test-preview-loading"><LoaderCircle className="spin" size={20}/>Загружаем тест…</p>}
 </main>;
}

function PreviewForm({test:t}:{test:AssessmentDefinition}){
 const [answers,setAnswers]=useState<(number|null)[]>(()=>t.questions.map(()=>null)),[extra,setExtra]=useState<Record<string,string|number>>({});
 return <article className="questionnaire test-preview-form">
  <header className="questionnaire-header"><span className="eyebrow">{t.shortName} · {t.variantLabel}</span><h1>{t.name}</h1><p>{t.doctorDescription}</p></header>
  <div className="test-preview-note" role="note">Можно посмотреть все вопросы и попробовать варианты ответа. Ответы не сохраняются и не меняют назначения пациента.</div>
  <p className="test-preview-instruction">{t.instruction}</p>
  <AssessmentSources test={t}/>
  {t.questions.map((question,i)=><fieldset className="panel test-question" key={i}><legend><span>{i+1}</span>{question}</legend><div className="test-options">{(t.itemOptions?.[i]??t.options).map((option,value)=><label className={answers[i]===value?'selected':''} key={value}><input type="radio" name={'preview-question-'+i} value={value} checked={answers[i]===value} onChange={()=>setAnswers(previous=>previous.map((v,j)=>j===i?value:v))}/><span>{option}</span></label>)}</div></fieldset>)}
  {!!t.fields?.length&&<AssessmentFields test={t} values={extra} onChange={setExtra} disabled={false}/>}
  <p className="test-preview-end">Конец предпросмотра · ответы не сохраняются</p>
 </article>;
}
