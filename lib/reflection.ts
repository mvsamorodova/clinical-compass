// Optional reflection prompts, not diagnostic questions or scored assessments.
export type ReflectionPrompt = {id:string; text:string; kind:'text'|'choice'; options?:string[]};
export type ReflectionAnswer = {id:string; value:string};
export const REFLECTION_PROMPTS:ReflectionPrompt[] = [
 {id:'moment',kind:'text',text:'Какой момент сегодняшнего дня хочется запомнить?'},
 {id:'pace',kind:'choice',text:'Как ощущался темп вашего дня?',options:['Спокойно','В самый раз','Слишком быстро','По-разному','Трудно сказать']},
 {id:'support',kind:'text',text:'Что сегодня хоть немного поддержало вас?'},
 {id:'need',kind:'choice',text:'Чего вам сейчас больше хочется?',options:['Отдохнуть','Побыть с кем-то','Побыть в тишине','Немного подвигаться','Пока не знаю']},
 {id:'effort',kind:'text',text:'Что сегодня потребовало усилий, даже если со стороны это кажется мелочью?'},
 {id:'energy',kind:'choice',text:'Сколько сил осталось к этому моменту?',options:['Почти нет','Немного','Достаточно','Много','Менялось в течение дня']},
 {id:'kindness',kind:'text',text:'Какие добрые слова вы могли бы сейчас сказать себе?'},
 {id:'contact',kind:'choice',text:'Как вам сегодня было с общением?',options:['Было приятно','Хотелось больше контакта','Хотелось больше тишины','Было непросто','Общения почти не было']},
 {id:'ordinary',kind:'text',text:'Что из обычных вещей сегодня было для вас важным?'},
 {id:'body',kind:'choice',text:'Что вы сейчас замечаете в теле?',options:['Расслабленность','Напряжение','Усталость','Лёгкость','Пока трудно заметить']},
 {id:'tomorrow',kind:'text',text:'Что могло бы сделать завтрашний день немного легче?'},
 {id:'pause',kind:'choice',text:'Получилось ли сегодня сделать паузу для себя?',options:['Да, несколько раз','Да, ненадолго','Пока нет','Сегодня это не было нужно']},
 {id:'thought',kind:'text',text:'К какой мысли вы сегодня возвращались? Можно описать её своими словами.'},
 {id:'care',kind:'choice',text:'Какой маленький шаг сейчас вам ближе?',options:['Выпить воды','Сделать паузу','Написать близкому','Заняться привычным делом','Пока ничего не планировать']},
 {id:'pleasant',kind:'text',text:'Было ли что-то приятное или просто спокойное, пусть совсем небольшое?'},
 {id:'day',kind:'choice',text:'Как вы назвали бы сегодняшний день?',options:['Тихий','Насыщенный','Непростой','Необычный','Самый обычный','Смешанный']},
];
export function reflectionPrompts(sequence:number){const offset=(Math.max(0,Math.floor(sequence))*4)%REFLECTION_PROMPTS.length;return Array.from({length:4},(_,i)=>REFLECTION_PROMPTS[(offset+i)%REFLECTION_PROMPTS.length]);}
export function validateReflections(value:unknown):ReflectionAnswer[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>4)throw Error('Можно сохранить до четырёх ответов');
 const ids=new Set<string>();
 return value.map(a=>{const q=REFLECTION_PROMPTS.find(q=>q.id===a?.id);if(!q||ids.has(a.id)||typeof a.value!=='string'||!a.value.trim()||a.value.length>600||(q.kind==='choice'&&!q.options!.includes(a.value)))throw Error('Проверьте ответы на вопросы дневника');ids.add(a.id);return {id:a.id,value:a.value.trim()};});
}
