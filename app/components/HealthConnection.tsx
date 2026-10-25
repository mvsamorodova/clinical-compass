'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, Download, RefreshCw, ArrowUpRight } from 'lucide-react';
import { useSession } from '../../lib/session';
import type { HealthPreview } from '../../lib/health-import';
const NAME='Компас — здоровье';
export function HealthConnection({onPreview}:{onPreview:(preview:HealthPreview,id:string)=>void}){
 const {api,user}=useSession(),[state,setState]=useState('idle'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[launch,setLaunch]=useState<{url:string;expiresAt:number}|null>(null),[iphone,setIphone]=useState(false);
 const delivered=useRef('');
 useEffect(()=>{setIphone(/iPhone|iPad|iPod/.test(navigator.userAgent));},[]);
 const refresh=useCallback(async()=>{try{const r=await api('health/shortcut');setState(r.state);if(r.state==='received'&&r.id!==delivered.current){delivered.current=r.id;onPreview(r.preview,r.id);setLaunch(null);}}catch(e){setError((e as Error).message);}},[api,onPreview]);
 useEffect(()=>{void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 useEffect(()=>{if(state!=='waiting')return;const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[state,refresh]);
 async function prepare(){setBusy(true);setError('');try{const r=await api('health/shortcut','POST');setLaunch({url:'shortcuts://run-shortcut?name='+encodeURIComponent(NAME)+'&input=text&text='+encodeURIComponent(r.token),expiresAt:r.expiresAt});setState('waiting');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel health-panel shortcut-panel" aria-labelledby="shortcut-title">
  <div className="tests-heading"><div><span className="eyebrow">IPHONE · БЕЗ АРХИВОВ</span><h2 id="shortcut-title">Обновление через «Команды»</h2><p>Сон, шаги и минуты упражнений за последние 7 дней.</p></div><Smartphone size={30}/></div>
  <p>Один раз добавьте команду Apple. Затем запускайте обновление здесь — данные поступят в кабинет <strong>{user?.name}</strong> для проверки и сохранения.</p>
  <details className="shortcut-setup" open={state==='idle'}><summary>Первое подключение iPhone</summary><ol><li>Откройте эту страницу в Safari на iPhone и войдите в свой аккаунт пациента.</li><li>Скачайте команду ниже. Откройте загруженный файл в «Файлах» → «Команды» и нажмите «Добавить быструю команду». Если файл не открывается, используйте «Поделиться» → «Команды». Оставьте имя «{NAME}».</li><li>Вернитесь сюда, нажмите «Получить данные с iPhone», затем «Открыть команду». Разрешите чтение нужных показателей и отправку на этот сайт.</li></ol><a className="secondary" href={'/shortcuts/'+encodeURIComponent(NAME)+'.shortcut'} download={NAME+'.shortcut'}><Download size={17}/>Скачать команду для iPhone</a><p className="health-note">Используются встроенные «Команды» Apple. Команда не изменяет «Здоровье». Первый запуск нужно проверить на вашем iPhone.</p></details>
  {error&&<p className="error-banner" role="alert">{error}</p>}
  {!iphone&&<p className="health-note">Для запуска откройте эту страницу на iPhone. Для Android ниже доступен прежний импорт Health Connect.</p>}
  <div className="health-import-actions"><button className="primary" disabled={busy} onClick={prepare}><RefreshCw size={17}/>{busy?'Подготавливаем…':'Получить данные с iPhone'}</button>{launch&&Date.now()<launch.expiresAt&&state==='waiting'&&<a className="secondary" href={launch.url}><ArrowUpRight size={17}/>Открыть команду</a>}</div>
  <div aria-live="polite">{state==='waiting'&&<p className="health-note">Откройте команду на iPhone. После выполнения вернитесь сюда — появится предпросмотр. Код действует 15 минут. Если запуск отменён, нажмите «Получить данные с iPhone» снова.</p>}{state==='expired'&&<p className="health-warning">Время ожидания истекло. Запустите обновление ещё раз.</p>}{state==='received'&&<p className="test-success">Данные получены. Проверьте показатели ниже перед сохранением.</p>}</div>
  <p className="health-note">Передаются только записи сна, шагов и упражнений за последние 8 суток для расчёта 7 календарных дней; на сервере остаются суточные итоги по источникам. Предпросмотр доступен около часа. Доступ врачу включается отдельно. Фонового обновления нет.</p>
 </section>;
}
