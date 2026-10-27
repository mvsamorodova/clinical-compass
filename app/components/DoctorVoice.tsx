'use client';
import {PatientSection} from './PatientSection';
import {useEffect,useRef,useState} from 'react';
import {AudioLines,Download,LoaderCircle,Check,LockKeyhole} from 'lucide-react';
import workerUrl from '../../lib/emotion.worker.ts?worker&url';
import {emotionCached,keepModelStorage} from '../../lib/model-cache';
import {useModelCache} from '../../lib/use-model-cache';
import {decodeVoiceWav} from '../../lib/voice-audio';
import {EMOTION_LABELS,EMOTION_NAMES,EMOTION_MODEL_VERSION,type EmotionScores} from '../../lib/voice-model';
import {useSession} from '../../lib/session';
type Analysis={scores:EmotionScores;segments:number;modelVersion:string;createdAt:number};
type Note={id:string;durationMs:number;createdAt:number;sha256:string;analysis:Analysis|null};
export function DoctorVoice({patientId}:{patientId:string}){
 const {api,user}=useSession();const modelCache=useModelCache(emotionCached);const [notes,setNotes]=useState<Note[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[phase,setPhase]=useState<'idle'|'loading'|'ready'|'analyzing'>('idle'),[progress,setProgress]=useState(0),[status,setStatus]=useState(''),[active,setActive]=useState<string|null>(null);
 const worker=useRef<Worker|null>(null),alive=useRef(true),pending=useRef<Note|null>(null),deadline=useRef<ReturnType<typeof setTimeout>|null>(null),read=useRef(0);
 function clearDeadline(){if(deadline.current)clearTimeout(deadline.current);deadline.current=null;}
 function stop(){worker.current?.terminate();worker.current=null;pending.current=null;clearDeadline();setPhase('idle');setActive(null);setStatus('');}
 function timeout(ms:number){clearDeadline();deadline.current=setTimeout(()=>{stop();setError('Обработка заняла слишком много времени. Попробуйте снова или используйте более мощное устройство.');},ms);}
 async function load(){const current=++read.current;setLoading(true);try{const r=await api(`patients/${patientId}/voice`);if(alive.current&&read.current===current)setNotes(r.notes);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current&&read.current===current)setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;read.current++;worker.current?.terminate();clearDeadline();};},[patientId]);
 async function saveResult(m:any,note:Note){
  try{await api(`voice/${note.id}/emotion`,'POST',{scores:m.scores,segments:m.segments,modelVersion:EMOTION_MODEL_VERSION,sha256:note.sha256});if(alive.current){setStatus('Анализ сохранён. Результат доступен только вам как лечащему врачу.');await load();}}
  catch(e){if(alive.current)setError((e as Error).message);}
  finally{if(alive.current){pending.current=null;setActive(null);setPhase(worker.current?'ready':'idle');}}
 }
 function start(){
  if(user?.role!=='doctor'||phase==='loading'||phase==='analyzing')return;void keepModelStorage();stop();setError('');setProgress(0);setPhase('loading');setStatus(modelCache.cached?'Открываем сохранённую GigaAM-Emo…':'Скачиваем GigaAM-Emo…');
  try{const w=new Worker(workerUrl,{type:'module'});worker.current=w;w.onmessage=e=>{if(!alive.current||worker.current!==w)return;const m=e.data;
   if(m.type==='progress'){setProgress(m.progress);setStatus(m.label);}
   if(m.type==='ready'){void modelCache.refresh();window.dispatchEvent(new Event('compass-model-cached'));clearDeadline();setPhase('ready');setStatus(m.cached?'GigaAM-Emo готова · сохранена на устройстве':'GigaAM-Emo готова, но браузер не сохранил файлы. Проверьте свободное место.');}
   if(m.type==='analyzing')setStatus(`Анализируем фрагмент ${m.completed} из ${m.total}…`);
   if(m.type==='result'){clearDeadline();const note=pending.current;if(note){setStatus('Сохраняем результат…');void saveResult(m,note);}}
   if(m.type==='error'){stop();setError(m.message);}
  };w.onerror=()=>{stop();setError('Браузер не смог запустить модель. Попробуйте актуальный Chrome или Edge на компьютере.');};timeout(600000);w.postMessage({type:'load'});}catch{stop();setError('Не удалось запустить анализ в этом браузере.');}
 }
 async function analyze(note:Note){
  if(phase!=='ready'||!worker.current||user?.role!=='doctor')return;setError('');setPhase('analyzing');setActive(note.id);pending.current=note;setStatus('Получаем аудио…');
  try{const r=await fetch(`/api/voice/${note.id}/audio`,{credentials:'same-origin',cache:'no-store',headers:{'X-Compass-User':user.id},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Аудио недоступно: пациент мог закрыть доступ. Обновите список.');const buffer=await r.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==note.sha256)throw Error('Проверка записи не пройдена');const audio=decodeVoiceWav(buffer);if(!alive.current||!worker.current)return;setStatus('Анализируем звучание голоса…');timeout(300000);worker.current.postMessage({type:'analyze',audio},[audio.buffer]);}
  catch(e){if(alive.current){setError((e as Error).message);pending.current=null;setActive(null);setPhase(worker.current?'ready':'idle');}}
 }
 if(user?.role!=='doctor')return null;
 return <PatientSection className="doctor-voice" title="Эмоциональное звучание голоса" icon={<AudioLines size={20}/>} description={<><LockKeyhole size={14}/> Только для лечащего врача · аудио, которыми пациент поделился</>} actions={<button className="text-button" disabled={loading||phase==='analyzing'} onClick={load}>Обновить</button>}><p className="health-note">GigaAM-Emo команды GigaChat оценивает четыре типа звучания. Это экспериментальная подсказка для разговора: она не определяет диагноз, истинное настроение или риск и не влияет на сигналы безопасности. Сначала прослушайте запись и сопоставьте её с контекстом.</p>
  <div className="doctor-voice-model">{phase==='idle'?<><strong>Модель работает на устройстве врача</strong><p>{modelCache.cached===null?'Проверяем файлы в этом браузере…':modelCache.cached?'Модель сохранена в этом браузере. Повторная загрузка не нужна.':'Один раз скачайте около 408 МБ. Модель общая для всех карточек пациентов в этом браузере.'}</p><button className="secondary" disabled={modelCache.cached===null} onClick={start}><Download size={17}/>{modelCache.cached===null?'Проверяем модель…':modelCache.cached?'Запустить сохранённую GigaAM-Emo':'Скачать GigaAM-Emo для анализа'}</button></>:<><p className="voice-status" role="status">{phase==='ready'?<Check size={18}/>:<LoaderCircle className="spin" size={18}/>} {status}</p>{phase==='loading'&&<progress value={progress} max={100} aria-label="Загрузка GigaAM-Emo"/>}{(phase==='loading'||phase==='analyzing')&&<button className="text-button" onClick={stop}>Отменить</button>}</>}
   <details><summary>О модели и ограничениях</summary><p className="health-note">Официальная модель GigaAM-Emo (MIT), проверенная конвертация официальных весов в ONNX; часть слоёв сжата до INT8. Речь обрабатывается фрагментами до 10 секунд; оценки усредняются с учётом их длительности. Проценты — распределение оценок модели, а не вероятность состояния человека. Шум, актёрская речь, короткие записи и особенности голоса могут искажать результат.</p><a href="https://github.com/salute-developers/GigaAM" target="_blank" rel="noreferrer">Официальная модель</a>{' · '}<a href="/models/gigaam-emo-8fad2a2c/provenance.json" target="_blank" rel="noreferrer">Происхождение и версия модели</a></details>
  </div>{error&&<p className="form-error" role="alert">{error}</p>}{loading?<p>Загружаем записи…</p>:!notes.length?<p className="health-note">Здесь появятся ранее предоставленные пациентом голосовые записи.</p>:<div className="doctor-voice-list">{notes.map(note=><article className="doctor-voice-note" key={note.id}><strong>Голосовое · {new Date(note.createdAt).toLocaleString('ru-RU')}</strong><p className="health-note">{Math.round(note.durationMs/1000)} сек.{note.durationMs<3000?' · Короткая запись: особенно мало информации для анализа.':''}</p><audio controls preload="none" src={`/api/voice/${note.id}/audio`}/>{note.analysis&&<><div className="emotion-bars" aria-label="Оценки эмоционального звучания">{EMOTION_LABELS.map(k=><div key={k}><span>{EMOTION_NAMES[k]}</span><meter min={0} max={1} value={note.analysis!.scores[k]} aria-label={EMOTION_NAMES[k]}/><span>{(note.analysis!.scores[k]*100).toFixed(1)}%</span></div>)}</div><p className="health-note">Анализ {new Date(note.analysis.createdAt).toLocaleString('ru-RU')} · {note.analysis.segments} фрагм. · пациенту не показывается</p></>}<button className="secondary" disabled={phase!=='ready'} onClick={()=>analyze(note)}>{active===note.id?<LoaderCircle size={16} className="spin"/>:<AudioLines size={16}/>} {note.analysis?'Повторить анализ':'Проанализировать голос'}</button></article>)}</div>}
 </PatientSection>;
}
