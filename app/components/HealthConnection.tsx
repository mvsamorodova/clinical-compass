'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, Download, RefreshCw, ArrowUpRight, Check, FileUp } from 'lucide-react';
import { useSession } from '../../lib/session';
import type { HealthPreview } from '../../lib/health-import';

const NAME = 'Компас v3 — здоровье';
const DESTINATION = 'clinical-compass-v3.feyzebra.chatgpt.site';
// Enable only after publishing a signed v3 shortcut and verifying native access.
const SHORTCUT_AVAILABLE = false;

export function HealthConnection({onPreview}: {onPreview: (preview: HealthPreview, id: string) => void}) {
 const {api, user} = useSession();
 const [state, setState] = useState('idle');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [launch, setLaunch] = useState<{url: string; expiresAt: number} | null>(null);
 const [iphone, setIphone] = useState(false);
 const delivered = useRef('');

 useEffect(() => { setIphone(/iPhone|iPad|iPod/.test(navigator.userAgent)); }, []);
 const refresh = useCallback(async () => {
  try {
   const r = await api('health/shortcut');
   setState(r.state);
   if (r.state === 'received' && r.id !== delivered.current) {
    delivered.current = r.id;
    onPreview(r.preview, r.id);
    setLaunch(null);
   }
  } catch (e) { setError((e as Error).message); }
 }, [api, onPreview]);
 useEffect(() => {
  void refresh();
  const focus = () => void refresh();
  window.addEventListener('focus', focus);
  return () => window.removeEventListener('focus', focus);
 }, [refresh]);
 useEffect(() => {
  if (state !== 'waiting') return;
  const timer = setInterval(() => void refresh(), 5000);
  return () => clearInterval(timer);
 }, [state, refresh]);
 async function prepare() {
  if (!SHORTCUT_AVAILABLE) return;
  setBusy(true);
  setError('');
  try {
   const r = await api('health/shortcut', 'POST');
   setLaunch({url: 'shortcuts://run-shortcut?name=' + encodeURIComponent(NAME) + '&input=text&text=' + encodeURIComponent(r.token), expiresAt: r.expiresAt});
   setState('waiting');
  } catch (e) { setError((e as Error).message); }
  finally { setBusy(false); }
 }
 const canLaunch = launch && Date.now() < launch.expiresAt && state === 'waiting';

 return <section className="panel health-panel shortcut-panel" aria-labelledby="shortcut-title">
  <div className="tests-heading">
   <div><span className="eyebrow">APPLE «ЗДОРОВЬЕ» · IPHONE</span><h2 id="shortcut-title">Подключим сон и активность</h2><p>Сон, шаги и активность из приложения «Здоровье».</p></div>
   <Smartphone size={30} aria-hidden="true"/>
  </div>
  {!SHORTCUT_AVAILABLE && <div className="shortcut-before"><strong>В v3 пока доступен импорт архива</strong><p>Команда для iPhone ещё готовится. Данные можно перенести из экспорта приложения «Здоровье» — с проверкой перед сохранением.</p><a className="secondary" href="#health-file-import"><FileUp size={17} aria-hidden="true"/>Загрузить архив «Здоровья»</a></div>}
  <details open={SHORTCUT_AVAILABLE}><summary>{SHORTCUT_AVAILABLE ? 'Подключение через «Команды»' : 'Как подключение через «Команды» будет работать'}</summary>
  <p>Часы сначала передают показатели в приложение «Здоровье» на iPhone. Команда Apple переносит сон, шаги и минуты упражнений сюда. Вы проверяете их перед сохранением.</p>
  <div className="shortcut-before"><strong>Перед началом</strong><p>Откройте «Здоровье» и убедитесь, что там есть нужные записи. Если данных о сне нет, команда не сможет их добавить. Для подключения откройте этот сайт в Safari на iPhone и войдите в свой кабинет.</p></div>
  <a className="shortcut-skip" href="#shortcut-launch">Команда уже установлена? Перейти к запуску →</a>
  <ol className="shortcut-steps" aria-label="Подключение Apple Здоровье за четыре шага">
   <li>
    <div className="shortcut-step-title"><span aria-hidden="true">1</span><div><small>ТОЛЬКО ПРИ ПЕРВОМ ПОДКЛЮЧЕНИИ</small><h3>Добавьте готовую команду</h3></div></div>
    <p>Скачайте файл на iPhone. В Safari откройте загрузки, затем файл «{NAME}.shortcut». Нажмите «Добавить быструю команду» в приложении «Команды».</p>
    {SHORTCUT_AVAILABLE ? <a className="secondary" href={'/shortcuts/' + encodeURIComponent(NAME) + '.shortcut'} download={NAME + '.shortcut'}><Download size={17} aria-hidden="true"/>Скачать команду для iPhone</a> : <p className="health-note">Файл команды v3 пока недоступен для установки.</p>}
    <p className="health-note">Если файл сохранился в «Файлы», откройте его там. Если доступно действие «Поделиться» → «Команды», можно использовать его. Для v3 нужна именно команда «{NAME}»: команда от предыдущей версии отправляет данные на другой сайт. Оставьте это имя. Если команда уже добавлена, переходите к шагу 2.</p>
   </li>
   <li id="shortcut-launch" tabIndex={-1}>
    <div className="shortcut-step-title"><span aria-hidden="true">2</span><div><small>ПРИ КАЖДОМ ОБНОВЛЕНИИ</small><h3>Запустите из своего кабинета</h3></div></div>
    <p>Нажмите «Получить данные с iPhone», затем появившуюся кнопку «Открыть команду». Если Safari спросит об открытии приложения «Команды», выберите «Открыть».</p>
    <p className="health-note">Запускайте команду именно отсюда: сайт передаст ей одноразовый код для кабинета <strong>{user?.name}</strong>. Вводить или копировать код вручную не нужно.</p>
    {!iphone && <p className="shortcut-device-note">Сейчас сайт открыт не на iPhone. Выполните эти действия на телефоне. Для Android и для загрузки файла доступен <a href="#health-file-import">импорт архива ниже</a>.</p>}
    <div className="health-import-actions">
     <button className="primary" disabled={busy || !SHORTCUT_AVAILABLE} onClick={prepare}><RefreshCw size={17} aria-hidden="true"/>{busy ? 'Подготавливаем…' : 'Получить данные с iPhone'}</button>
     {canLaunch && <a className="secondary" href={launch.url}><ArrowUpRight size={17} aria-hidden="true"/>Открыть команду</a>}
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div aria-live="polite">
     {state === 'waiting' && <p className="health-note">{canLaunch ? 'Теперь нажмите «Открыть команду» и выполните шаг 3. После завершения вернитесь в Safari.' : 'Ожидаем данные. Если команда уже выполняется на iPhone, дождитесь её завершения. Если запуск не начался или страница была закрыта, нажмите «Получить данные с iPhone» заново.'} Одноразовый код действует 15 минут.</p>}
     {state === 'expired' && <p className="health-warning">Время ожидания истекло. Нажмите «Получить данные с iPhone» и откройте команду заново.</p>}
     {state === 'received' && <p className="test-success"><Check size={17} aria-hidden="true"/>Данные получены. Остался шаг 4 — проверить и сохранить.</p>}
    </div>
   </li>
   <li>
    <div className="shortcut-step-title"><span aria-hidden="true">3</span><div><small>В ПРИЛОЖЕНИИ «КОМАНДЫ»</small><h3>Что выбрать в разрешениях</h3></div></div>
    <ul className="shortcut-permissions">
     <li><strong>«Проверьте получателя».</strong> Сверьте имя: <strong>{user?.name}</strong>. Продолжайте только для своего кабинета.</li>
     <li><strong>Доступ к «Здоровью».</strong> Если появится запрос, разрешите чтение шагов, сна и минут упражнений. Команда не записывает и не изменяет данные в «Здоровье».</li>
     <li><strong>Отправка данных на сайт.</strong> Проверьте адрес <span className="shortcut-domain">{DESTINATION}</span> и разрешите отправку, если согласны передать эти показатели.</li>
    </ul>
    <p className="health-note">Названия и порядок окон могут отличаться в разных версиях iOS; ранее выданные разрешения могут не спрашиваться повторно. Не нужно создавать действия или выбирать тип данных внутри редактора команды.</p>
   </li>
   <li>
    <div className="shortcut-step-title"><span aria-hidden="true">4</span><div><small>СНОВА НА САЙТЕ</small><h3>Проверьте и сохраните</h3></div></div>
    <p>После сообщения «Данные получены» вернитесь в Safari. Ниже появится предпросмотр за последние 7 календарных дней.</p>
    <p>Выберите по одному источнику для сна, шагов и активности. Например, если сон записывают часы, выберите источник с названием часов или их приложения. Затем проверьте даты и нажмите «Сохранить выбранные данные».</p>
    <p className="health-note">Если источник один, он уже выбран. Для ненужного показателя выберите «Не импортировать». Доступ врачу включается отдельно в блоке «Доступ лечащего врача».</p>
   </li>
  </ol>
  <details className="shortcut-help">
   <summary>Если что-то не получилось</summary>
   <dl>
    <dt>Файл не открывается или нет пункта «Команды»</dt><dd>Откройте файл через загрузки Safari или приложение «Файлы» на iPhone. Если установить команду не получается, воспользуйтесь импортом архива ниже.</dd>
    <dt>Вместо запуска открылся редактор с действиями</dt><dd>На первом экране установки нажмите «Добавить быструю команду». Если команда уже в вашей коллекции, вернитесь на сайт и запустите её через шаг 2. Если во время запуска требуется выбрать неизвестный параметр, отмените запуск: не меняйте настройки наугад, используйте импорт архива.</dd>
    <dt>Команда не найдена или просит одноразовый код</dt><dd>Проверьте, что она добавлена под именем «{NAME}». Вернитесь в кабинет пациента и снова нажмите «Получить данные с iPhone», затем «Открыть команду».</dd>
    <dt>Есть шаги, но нет сна или активности</dt><dd>Проверьте записи за нужные дни в «Здоровье» и разрешение команды на чтение этих показателей. Не все устройства записывают все три показателя. «Нет данных» не означает ноль.</dd>
    <dt>Команда показывает вход в ChatGPT вместо данных</dt><dd>Доступ к сайту ограничен владельцем. В таком режиме используйте импорт архива ниже: вход в Safari не передаётся приложению «Команды».</dd>
    <dt>На сайте всё ещё «Ожидаем данные»</dt><dd>Дождитесь окончания команды и вернитесь в Safari с интернетом. Если вы отменили запуск или получили ошибку, запустите обновление заново. Новый запуск заменяет предыдущий код.</dd>
   </dl>
  </details>
  <p className="health-note">Обновление запускается вручную. Передаются только записи сна, шагов и упражнений за последние 8 суток для расчёта 7 календарных дней. На сервере остаются суточные итоги по источникам. Предпросмотр доступен около часа. Доступ врачу включается отдельно.</p>
  </details>
  <a className="shortcut-fallback" href="#health-file-import"><FileUp size={18} aria-hidden="true"/><span>Не получается через «Команды»? Загрузить архив «Здоровья»</span></a>
 </section>;
}
