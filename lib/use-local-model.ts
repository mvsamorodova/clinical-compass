'use client';
import { useEffect, useRef, useState } from 'react';
import {keepModelStorage} from './model-cache';
import modelWorkerUrl from './llm.worker.ts?worker&url';
import {useModelCache} from './use-model-cache';

function localModelCached():Promise<boolean>{
 return new Promise(resolve=>{
  let probe:Worker|null=null;
  const done=(present:boolean)=>{clearTimeout(timer);probe?.terminate();resolve(present);};
  const timer=setTimeout(()=>done(false),15000);
  try{probe=new Worker(modelWorkerUrl,{type:'module'});probe.onmessage=e=>{if(e.data.type==='result')done(e.data.data==='cached');if(e.data.type==='error')done(false);};probe.onerror=()=>done(false);probe.postMessage({id:'cache-probe',type:'check'});}catch{done(false);}
 });
}

type State = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';
type Job = { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; onDelta?: (text: string) => void };
export function useLocalModel() {
  const [state, setState] = useState<State>('idle');
  const {cached}=useModelCache(localModelCached);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const jobs = useRef(new Map<string, Job>());
  const active = useRef(true);
  const loadAttempt = useRef(0);

  function dispose(message = 'Операция остановлена. Можно попробовать снова.') {
    worker.current?.terminate(); worker.current = null;
    for (const job of jobs.current.values()) { clearTimeout(job.timer); job.reject(new Error(message)); }
    jobs.current.clear();
  }
  useEffect(() => {
    active.current = true;
    if (!('gpu' in navigator)) setState('unsupported');
    return () => { active.current = false; dispose(); };
  }, []);

  function call(type: string, payload: unknown, timeout: number, onDelta?: (text: string) => void) {
    return new Promise<string>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        dispose('Модель не ответила вовремя. Попробуйте ещё раз или откройте приложение на компьютере.');
        if (active.current) setState('error');
      }, timeout);
      jobs.current.set(id, { resolve, reject, timer, onDelta });
      worker.current!.postMessage({ id, type, payload });
    });
  }
  async function start() {
    if (state === 'loading' || state === 'ready') return;
    const attempt = ++loadAttempt.current;
    dispose(); void keepModelStorage(); setState('loading'); setProgress(0); setError('');
    try {
      const w = new Worker(modelWorkerUrl, { type: 'module' });
      worker.current = w;
      w.onmessage = event => {
        const { id, type, data } = event.data;
        if(type==='cache-status'){window.dispatchEvent(new Event('compass-model-cached'));return;}
        const job = jobs.current.get(id); if (!job) return;
        if (type === 'progress') { if (active.current) setProgress(data); return; }
        if (type === 'delta') { job.onDelta?.(data); return; }
        clearTimeout(job.timer); jobs.current.delete(id);
        if (type === 'error') job.reject(new Error(data)); else job.resolve(data);
      };
      w.onerror = () => { dispose('MODEL_WORKER_ERROR'); if (active.current) { setState('error'); setError('Не удалось запустить модель. Попробуйте обновить браузер или открыть приложение на компьютере.'); } };
      await call('load', {}, 300000);
      if (active.current) { setState('ready'); setProgress(100); }
    } catch (e) {
      if (!active.current || attempt !== loadAttempt.current) return;
      const unsupported = (e as Error).message.includes('GPU_UNAVAILABLE');
      dispose(); setState(unsupported ? 'unsupported' : 'error');
      setError('Не удалось загрузить модель. Проверьте интернет, доступ к Hugging Face и свободную память устройства; затем повторите попытку.');
    }
  }
  async function generate(message: string, turns: { message: string; reply: string }[], onDelta: (text: string) => void) {
    if (state !== 'ready' || !worker.current) throw new Error('Сначала загрузите модель.');
    try { return await call('generate', { message, turns: turns.slice(-6) }, 90000, onDelta); }
    catch {
      if (active.current) { dispose(); setState('error'); setError('Генерация прервана. Запустите модель ещё раз; уже сохранённая переписка останется.'); }
      throw new Error('Ответ не получен и не сохранён. Текст сообщения оставлен в поле ввода.');
    }
  }
  function stop() { loadAttempt.current++; dispose(); setState('idle'); setError(''); }
  return { state, cached, progress, error, start, stop, generate };
}
