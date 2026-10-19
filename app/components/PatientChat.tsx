'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookHeart, Check, CheckCheck, ChevronLeft, Compass, Heart, LoaderCircle, LockKeyhole, MessageCircle, Plus, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { EMOTIONS, MOODS, safetyNotice } from '../../lib/patient-chat';
import { useLocalModel } from '../../lib/use-local-model';

type Entry = { id: string; mood: number; emotions: string[]; note: string; sharedWithDoctor: boolean; createdAt: number };
type Turn = { id: number; requestId: string; message: string; reply: string; kind: string; createdAt: number };
type Mode = 'diary' | 'talk';
type Step = 'mood' | 'emotions' | 'note';
async function api(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch('/api/' + path, { method, credentials: 'same-origin', signal: AbortSignal.timeout(20000), headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие. Попробуйте ещё раз.');
  return data;
}
const time = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const when = (ts: number) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function AssistantBubble({ children, talk = false, safety = false }: { children: React.ReactNode; talk?: boolean; safety?: boolean }) {
  return <div className={`chat-line assistant ${safety ? 'chat-safety' : ''}`}><span className="chat-avatar"><Compass size={19} /></span><div><span className="chat-sender">{safety ? 'Служебное сообщение · не ответ модели' : talk ? 'Qwen3 · ИИ-помощник' : 'Дневник настроения'}</span><div className="chat-bubble">{children}</div></div></div>;
}
function UserBubble({ children, date }: { children: React.ReactNode; date?: number }) {
  return <div className="chat-line patient"><div><span className="chat-sender">Вы{date ? ` · ${time(date)}` : ''}</span><div className="chat-bubble">{children}</div></div></div>;
}
export default function PatientChat({ name, initialMode = 'diary' }: { name: string; initialMode?: Mode }) {
  const model = useLocalModel();
  const [liveReply, setLiveReply] = useState('');
  const [sendingMessage, setSendingMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pendingReply, setPendingReply] = useState<{message:string;reply:string;kind:string}|null>(null);
  const sending = useRef(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>('mood');
  const [mood, setMood] = useState<number | null>(null);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [share, setShare] = useState(false);
  const [saved, setSaved] = useState<Entry | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [moreEntries, setMoreEntries] = useState(false);
  const [doctorName, setDoctorName] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [moreTurns, setMoreTurns] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const draftId = useRef('');
  const messageRequest = useRef<{ id: string; message: string; reply?: string; kind?: string } | null>(null);
  const stream = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  async function loadEntries() {
    const result = await api('journal');
    setEntries(result.entries); setTotal(result.total); setMoreEntries(result.hasMore); setDoctorName(result.doctorName);
  }
  async function load() {
    setLoading(true); setError('');
    try {
      const [, chat] = await Promise.all([loadEntries(), api('chat')]);
      setTurns(chat.turns); setMoreTurns(chat.hasMore); loaded.current = true;
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { draftId.current = crypto.randomUUID(); void load(); }, []);
  useEffect(() => { if (stream.current) stream.current.scrollTop = stream.current.scrollHeight; }, [step, saved, mode, turns.at(-1)?.id, loading, busy, liveReply]);

  function newEntry() {
    draftId.current = crypto.randomUUID(); setMood(null); setEmotions([]); setNote(''); setShare(false); setSaved(null); setStep('mood'); setStatus(''); setError('');
  }
  function toggleEmotion(value: string) { setEmotions(current => current.includes(value) ? current.filter(e => e !== value) : current.length < 3 ? [...current, value] : current); }
  async function saveDiary() {
    if (mood === null || busy) return;
    setBusy(true); setError('');
    try {
      const { entry } = await api('journal', 'POST', { id: draftId.current, mood, emotions, note, shareWithDoctor: share });
      setSaved(entry); setStatus('Запись сохранена в дневнике');
      try { await loadEntries(); } catch { setError('Запись сохранена, но список не обновился. Нажмите «Обновить».'); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function sendMessage(message = draft) {
    message = message.trim();
    if (!message || sending.current || busy || loading || !loaded.current) return;
    if (new TextEncoder().encode(message).length > 2100) { setError('Сообщение слишком длинное для локальной модели. Сократите его.'); return; }
    if (model.state !== 'ready' && !messageRequest.current?.reply && !safetyNotice(message)) { setError('Нажмите «Загрузить бесплатную модель», чтобы начать разговор.'); return; }
    sending.current = true; setBusy(true); setError(''); setSendingMessage(message);
    if (!messageRequest.current || messageRequest.current.message !== message) messageRequest.current = { id: crypto.randomUUID(), message };
    const request = messageRequest.current;
    try {
      if (!request.reply) {
        const notice = safetyNotice(message);
        request.kind = notice ? 'safety' : 'llm';
        if (notice) request.reply = notice;
        else {
          setGenerating(true); setLiveReply('');
          request.reply = await model.generate(message, turns, setLiveReply);
        }
      }
      setGenerating(false); setLiveReply(request.reply);
      const result = await api('chat', 'POST', { requestId: request.id, message, reply: request.reply });
      setTurns(current => current.some(t => t.id === result.turn.id) ? current : [...current, result.turn]);
      setDraft(''); messageRequest.current = null; setPendingReply(null);
    } catch (e) {
      setDraft(message);
      if (request.reply) { setPendingReply({ message, reply: request.reply, kind: request.kind || 'llm' }); setError('Ответ получен, но не удалось сохранить переписку. Нажмите «Повторить сохранение». Не закрывайте страницу.'); }
      else setError((e as Error).message);
    } finally { sending.current = false; setBusy(false); setGenerating(false); setSendingMessage(''); setLiveReply(''); }
  }
  async function olderMessages() {
    if (!turns.length) return;
    setBusy(true); setError('');
    try { const result = await api('chat?before=' + turns[0].id); setTurns(current => [...result.turns, ...current]); setMoreTurns(result.hasMore); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function olderEntries() {
    setBusy(true); setError('');
    try { const result = await api('journal?offset=' + entries.length); setEntries(current => [...current, ...result.entries.filter((e: Entry) => !current.some(v => v.id === e.id))]); setMoreEntries(result.hasMore); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteEntry(id: string) {
    setBusy(true); setError('');
    try { await api('journal/' + id, 'DELETE'); setRemoving(null); if (saved?.id === id) newEntry(); await loadEntries(); setStatus('Запись удалена'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const selectedMood = MOODS.find(m => m.value === mood);
  return <section className="chat-page">
    <div className="page-title"><div><span className="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</span><h1>Чат и дневник</h1><p>Отмечайте своё состояние или поговорите с ИИ-помощником.</p></div><span className="chat-private-tag"><LockKeyhole size={14} /> Личное пространство</span></div>
    <div className="chat-layout">
      <section className="panel chat-window" aria-label="Чат пациента">
        <header className="chat-window-header"><span className="chat-header-mark"><Compass size={25} /></span><div><h2>{mode === 'diary' ? 'Немного внимания себе' : 'Поговорить с помощником'}</h2><p>{mode === 'diary' ? 'Пара минут, чтобы заметить, как вы' : 'Qwen3 1.7B · бесплатная модель на вашем устройстве'}</p></div><span className="chat-mode-badge">{mode === 'diary' ? 'Дневник' : 'ИИ'}</span></header>
        <div className="chat-modes" role="tablist" aria-label="Режим чата"><button role="tab" aria-selected={mode === 'diary'} disabled={busy} className={mode === 'diary' ? 'active' : ''} onClick={() => { setMode('diary'); setError(''); }}><BookHeart size={17} /> Дневник настроения</button><button role="tab" aria-selected={mode === 'talk'} disabled={busy} className={mode === 'talk' ? 'active' : ''} onClick={() => { setMode('talk'); setError(''); }}><MessageCircle size={17} /> Поговорить</button></div>
        {mode === 'talk' && <div className={`model-panel model-${model.state}`} aria-live="polite">
          {model.state === 'ready' ? <><span className="model-ready-dot" /><span><strong>Qwen3 готова</strong> · ответы создаются на вашем устройстве</span></> : model.state === 'loading' ? <><LoaderCircle size={17} className="spin" /><div className="model-load-progress"><strong>Загружаем и подготавливаем модель · {model.progress}%</strong><progress value={model.progress} max="100" aria-label="Загрузка модели" /><small>Первый запуск может занять несколько минут.</small></div><button className="text-button" onClick={model.stop}>Отмена</button></> : model.state === 'unsupported' ? <div><strong>В этом браузере недоступен WebGPU</strong><p>Попробуйте актуальный Chrome или Edge на компьютере с аппаратным ускорением. Дневник и история переписки работают и здесь.</p></div> : <div><strong>Настоящая LLM, без оплаты запросов</strong><p>Первый запуск скачает около 1 ГБ с Hugging Face. Нужны WebGPU и примерно 2–3 ГБ доступной памяти GPU. После загрузки модель работает на устройстве.</p>{model.error && <p role="alert">{model.error}</p>}<button className="primary" disabled={busy} onClick={model.start}><Sparkles size={15} />{model.state === 'error' ? 'Повторить загрузку модели' : 'Загрузить бесплатную модель'}</button></div>}
        </div>}
        {error && <div className="chat-error" role="alert">{error}{!loaded.current && <button disabled={loading} onClick={load}>Повторить загрузку</button>}</div>}
        <div className="chat-messages" ref={stream} role="log" aria-label={mode === 'diary' ? 'Диалог дневника' : 'Переписка с ИИ-помощником'} aria-live="polite" aria-relevant="additions">
          {loading ? <div className="chat-loading"><LoaderCircle className="spin" size={22} /><span>Загружаем ваше пространство…</span></div> : mode === 'diary' ? <>
            <div className="chat-date-label">СЕГОДНЯ · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
            <AssistantBubble><p>{name.split(' ')[0]}, как вы сейчас себя чувствуете?</p><p className="bubble-secondary">Выберите вариант, который ближе всего. Здесь нет правильных или неправильных ответов.</p></AssistantBubble>
            {step === 'mood' && !saved && <div className="mood-picker" aria-label="Выберите настроение">{MOODS.map(item => <button key={item.value} aria-pressed={mood === item.value} onClick={() => { setMood(item.value); setStep('emotions'); }}><span className="mood-emoji">{item.emoji}</span><span>{item.label}</span><small>{item.value}/5</small></button>)}</div>}
            {selectedMood && step !== 'mood' && <><UserBubble><span className="mood-inline">{selectedMood.emoji} {selectedMood.label} <small>{mood}/5</small></span></UserBubble><AssistantBubble><p>Какие чувства вы замечаете?</p><p className="bubble-secondary">Можно выбрать до трёх или пропустить этот шаг.</p></AssistantBubble></>}
            {step === 'emotions' && !saved && <div className="diary-choice-area"><div className="emotion-chips">{EMOTIONS.map(emotion => <button key={emotion} aria-pressed={emotions.includes(emotion)} disabled={!emotions.includes(emotion) && emotions.length >= 3} className={emotions.includes(emotion) ? 'selected' : ''} onClick={() => toggleEmotion(emotion)}>{emotions.includes(emotion) && <Check size={12} />}{emotion}</button>)}</div><div className="diary-step-actions"><button className="text-button" onClick={() => setStep('mood')}><ChevronLeft size={14} /> Изменить настроение</button><button className="primary" onClick={() => setStep('note')}>{emotions.length ? 'Продолжить' : 'Пропустить'}<ArrowRight size={15} /></button></div></div>}
            {step === 'note' && <><UserBubble>{emotions.length ? emotions.join(', ') : 'Пока не могу назвать чувство'}</UserBubble><AssistantBubble><p>Что повлияло на ваше настроение?</p><p className="bubble-secondary">Можно рассказать о событии, мысли или том, что поддержало. Или сохранить только настроение.</p></AssistantBubble>{saved && <><UserBubble>{saved.note || 'Сохранить без заметки'}</UserBubble><div className="diary-saved"><span><CheckCheck size={20} /></span><div><h3>Запись сохранена</h3><p>{saved.sharedWithDoctor ? 'Вы поделились этой записью с лечащим врачом.' : 'Она видна только вам.'}</p><small>Самооценка настроения не является диагнозом или клинической шкалой.</small></div></div><button className="secondary another-entry" onClick={newEntry}><Plus size={16} /> Ещё одна запись</button></>}</>}
          </> : <>
            {!moreTurns && <AssistantBubble talk><p>Здесь можно рассказать о своём дне или сформулировать вопрос к следующей встрече с врачом.</p><p className="bubble-secondary">Небольшая модель может ошибаться. Она видит недавние сообщения этого чата, без дневника и медицинской карты. Переписка сохраняется на сервере приложения в вашем аккаунте; врачу и поставщику модели она не передаётся.</p></AssistantBubble>}
            {moreTurns && <button className="chat-older" disabled={busy} onClick={olderMessages}>Показать предыдущие сообщения</button>}
            {turns.map(turn => <div key={turn.id} className="chat-turn"><UserBubble date={turn.createdAt}>{turn.message}</UserBubble><AssistantBubble talk safety={turn.kind === 'safety'}>{turn.kind === 'safety' && <strong className="safety-heading">Обратите внимание</strong>}<p className="preserve">{turn.reply}</p></AssistantBubble></div>)}
            {!turns.length && !sendingMessage && !pendingReply && <div className="chat-starters"> <span>Можно начать так</span>{['Хочу рассказать, что меня тревожит', 'Сегодня я чувствую усталость', 'Хочу отметить хороший момент дня'].map(prompt => <button key={prompt} disabled={busy || !loaded.current} onClick={() => { setDraft(prompt); }}>{prompt}<ArrowRight size={14} /></button>)}</div>}
            {(sendingMessage || pendingReply) && <div className="chat-turn"><UserBubble>{sendingMessage || pendingReply?.message}</UserBubble>{(liveReply || pendingReply?.reply) && <AssistantBubble talk safety={pendingReply?.kind === 'safety' || (!!sendingMessage && !!safetyNotice(sendingMessage))}><p className="preserve">{liveReply || pendingReply?.reply}</p></AssistantBubble>}{pendingReply && !busy && <button className="secondary" onClick={() => sendMessage(pendingReply.message)}>Повторить сохранение</button>}</div>}
            {busy && <div className="chat-typing"><LoaderCircle size={15} className="spin" />{generating ? 'Qwen3 составляет ответ…' : 'Сохраняем…'}{generating && <button className="text-button" onClick={model.stop}>Остановить</button>}</div>}
          </>}
        </div>
        {mode === 'diary' ? <div className="diary-composer">
          {step === 'note' && !saved ? <form onSubmit={e => { e.preventDefault(); void saveDiary(); }}><label className="sr-only" htmlFor="diary-note">Заметка о настроении</label><textarea id="diary-note" placeholder="Сегодня я заметил(а)…" value={note} maxLength={3000} rows={3} disabled={busy} onChange={e => setNote(e.target.value)} /><div className="diary-compose-meta"><button type="button" className="text-button" disabled={busy} onClick={() => setStep('emotions')}><ChevronLeft size={14} /> Изменить чувства</button><span>{note.length}/3000</span></div>{doctorName ? <label className="diary-share"><input type="checkbox" checked={share} disabled={busy} onChange={e => setShare(e.target.checked)} /><span>Показать эту запись врачу<small>{doctorName}. Только эта запись, без переписки с помощником.</small></span></label> : <div className="diary-share-hint"><LockKeyhole size={14} /> Запись останется личной. Чтобы делиться записями, подключитесь к врачу.</div>}<button className="primary full" type="submit" disabled={busy || loading || !loaded.current}>{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}Сохранить в дневник</button></form> : <div className="diary-progress"><div className="step-dots"><i className="done" /><i className={step !== 'mood' ? 'done' : ''} /><i className={step === 'note' ? 'done' : ''} /></div><span>{saved ? 'Спасибо, что уделили себе время' : step === 'mood' ? 'Шаг 1 из 3 · Настроение' : 'Шаг 2 из 3 · Чувства'}</span></div>}
        </div> : <form className="talk-composer" onSubmit={e => { e.preventDefault(); void sendMessage(); }}><div className="talk-input-wrap"><label className="sr-only" htmlFor="chat-message">Сообщение помощнику</label><textarea id="chat-message" placeholder={model.state === 'ready' ? "О чём хочется поговорить?" : "Напишите сообщение, затем загрузите модель"} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1000} rows={2} disabled={busy || loading || !loaded.current || !!pendingReply} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendMessage(); } }} /><button className="chat-send" type="submit" disabled={!draft.trim() || busy || loading || !loaded.current || !!pendingReply || (model.state !== 'ready' && !safetyNotice(draft))} aria-label="Отправить сообщение">{busy ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</button></div><div className="chat-composer-caption"><span>Enter — отправить · Shift + Enter — новая строка</span><span>{draft.length}/1000</span></div><p className="chat-disclaimer">ИИ-помощник не заменяет врача и экстренную помощь. Сообщения не отправляются врачу.</p></form>}
      </section>
      <aside className="journal-sidebar"><section className="panel journal-panel"><div className="journal-heading"><span className="stat-icon green"><BookHeart size={21} /></span><div><h2>Мой дневник <span>{total}</span></h2><p>Моменты, которые вы заметили</p></div></div><div className="journal-toolbar"><button disabled={busy || loading} onClick={() => { setMode('diary'); newEntry(); }}><Plus size={14} /> Новая запись</button><button disabled={busy || loading} onClick={() => { void loadEntries().catch(e => setError(e.message)); }}>Обновить</button></div>{!loading && !entries.length && <div className="journal-empty"><Heart size={27} /><h3>Начните с сегодняшнего дня</h3><p>Сохранённые записи появятся здесь. Можно возвращаться к ним в своём темпе.</p></div>}<div className="journal-entries">{entries.map(entry => <article className="journal-entry" key={entry.id}><div className="journal-entry-title"><span className="journal-emoji">{MOODS[entry.mood - 1]?.emoji}</span><div><strong>{MOODS[entry.mood - 1]?.label}<small>{entry.mood}/5</small></strong><time>{when(entry.createdAt)}</time></div><button className="icon-button" disabled={busy} aria-label={`Удалить запись от ${when(entry.createdAt)}`} onClick={() => setRemoving(entry.id)}><Trash2 size={14} /></button></div>{entry.emotions.length > 0 && <div className="journal-tags">{entry.emotions.map(emotion => <span key={emotion}>{emotion}</span>)}</div>}{entry.note && <details><summary>Прочитать заметку</summary><p className="preserve">{entry.note}</p></details>}<span className="journal-visibility">{entry.sharedWithDoctor ? <><ShieldCheck size={12} /> Вы поделились с врачом</> : <><LockKeyhole size={12} /> Только вам</>}</span>{removing === entry.id && <div className="journal-delete-confirm"><p>Удалить запись без возможности восстановления?</p><div><button disabled={busy} onClick={() => setRemoving(null)}>Отмена</button><button disabled={busy} onClick={() => deleteEntry(entry.id)}>Удалить запись</button></div></div>}</article>)}</div>{moreEntries && <button className="chat-older" disabled={busy} onClick={olderEntries}>Показать ещё записи</button>}</section><div className="journal-privacy"><LockKeyhole size={19} /><p>Дневник принадлежит вам. Врач увидит только записи, которыми вы решили поделиться.</p></div><div className="journal-small-note"><Sparkles size={15} /><p>Здесь не нужно писать красиво. Пары слов о своём дне достаточно.</p></div></aside>
    </div><span className="sr-only" role="status">{status}</span>
  </section>;
}

export function DoctorJournal({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const request = useRef(0);
  async function load() { const id = ++request.current; setLoading(true); setError(''); try { const result = await api(`patients/${patientId}/journal`); if (id === request.current) setEntries(result.entries); } catch (e) { if (id === request.current) setError((e as Error).message); } finally { if (id === request.current) setLoading(false); } }
  useEffect(() => { void load(); return () => { request.current++; }; }, [patientId]);
  return <section className="panel shared-journal"><div className="panel-heading"><div><h2><BookHeart size={19} /> Дневник пациента</h2><p>Только записи, которыми пациент поделился с вами · последние 100</p></div><button className="text-button" disabled={loading} onClick={load}>Обновить</button></div>{error ? <p className="form-error">{error}</p> : loading ? <p className="shared-journal-empty">Загружаем записи…</p> : !entries.length ? <p className="shared-journal-empty">Пациент пока не делился записями дневника.</p> : <div className="shared-journal-entries">{entries.map(entry => <article key={entry.id}><div><span className="journal-emoji">{MOODS[entry.mood - 1]?.emoji}</span><strong>{MOODS[entry.mood - 1]?.label} · {entry.mood}/5</strong><time>{when(entry.createdAt)}</time></div>{entry.emotions.length > 0 && <p className="shared-emotions">{entry.emotions.join(' · ')}</p>}{entry.note && <p className="preserve">{entry.note}</p>}</article>)}</div>}<p className="shared-journal-footnote">Это субъективная самооценка, а не клиническая шкала. Переписка с помощником остаётся личной.</p></section>;
}
