export type DiaryQuestion={id:number;text:string;kind:'scale'|'choice'|'hours';options?:string[];low?:string;high?:string};
export type DiaryBlock={key:string;name:string;description:string;questions:DiaryQuestion[]};
const scale=(id:number,text:string,low='Совсем нет',high='Максимально')=>({id,text,kind:'scale' as const,low,high});
const choice=(id:number,text:string,options:string[])=>({id,text,kind:'choice' as const,options});
export const DIARY_VERSION='daily-user-22-v1';
export const DIARY_BLOCKS:DiaryBlock[]=[
 {key:'emotional',name:'Общее эмоциональное состояние',description:'Настроение, тревога, эмоциональная нагрузка и спокойствие.',questions:[
  scale(1,'Как бы вы оценили своё настроение сегодня?','Очень плохое','Очень хорошее'),scale(2,'Насколько сильную тревогу вы испытывали сегодня?'),scale(3,'Насколько тяжёлым был для вас сегодняшний день эмоционально?','Совсем не тяжёлым','Крайне тяжёлым'),choice(4,'Как часто сегодня вы чувствовали спокойствие?',['Никогда','Иногда','Часто','Почти весь день'])]},
 {key:'depressive',name:'Депрессивная симптоматика',description:'Удовольствие, энергия и начало повседневных дел.',questions:[
  scale(5,'Насколько трудно вам было получать удовольствие от привычных занятий?','Совсем не трудно','Крайне трудно'),scale(6,'Насколько сильную усталость или недостаток энергии вы ощущали сегодня?'),scale(7,'Насколько трудно вам было приступить к повседневным делам?','Совсем не трудно','Крайне трудно'),choice(8,'Удалось ли вам сегодня испытать интерес или удовольствие хотя бы от одного занятия?',['Да','Нет','Не было возможности'])]},
 {key:'anxiety',name:'Тревожная симптоматика',description:'Беспокойство, тревожные мысли, напряжение и паника.',questions:[
  scale(9,'Насколько сильное беспокойство вы испытывали сегодня?'),scale(10,'Насколько трудно вам было остановить тревожные мысли?','Совсем не трудно','Крайне трудно'),choice(11,'Какую часть дня вы провели в беспокойстве о разных событиях?',['Не беспокоился','Небольшую','Значительную','Почти весь день']),scale(12,'Насколько трудно вам было расслабиться?','Совсем не трудно','Крайне трудно'),choice(13,'Испытывали ли вы сегодня физические проявления тревоги (сердцебиение, дрожь, потливость)?',['Нет','Слабые','Умеренные','Сильные']),choice(14,'Были ли сегодня внезапные приступы сильного страха или паники?',['Нет','Да, один','Да, несколько'])]},
 {key:'physical',name:'Сон и физическое самочувствие',description:'Продолжительность и качество сна, засыпание и аппетит.',questions:[
  {id:15,text:'Сколько часов вы спали прошлой ночью?',kind:'hours'},scale(16,'Насколько хорошо вы выспались?','Совсем не выспался','Полностью выспался'),choice(17,'Возникали ли трудности с засыпанием?',['Нет','Незначительные','Значительные']),choice(18,'Как изменился ваш аппетит по сравнению с обычным?',['Снизился','Не изменился','Повысился'])]},
 {key:'activity',name:'Повседневная активность',description:'Обязанности, общение, значимые занятия и приём препаратов.',questions:[
  scale(19,'Насколько сложно вам сегодня было выполнять повседневные обязанности?','Совсем не сложно','Крайне сложно'),choice(20,'Было ли сегодня общение с другими людьми?',['Да','Нет']),choice(21,'Удалось ли вам сегодня заняться чем-то приятным или значимым для себя?',['Да','Нет','Не было возможности']),choice(22,'Приняли ли вы сегодня назначенные препараты согласно схеме лечения?',['Да','Частично','Нет','Сегодня приём не назначен'])]},
];
export function validDiaryBlocks(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=5&&new Set(value).size===value.length&&value.every(k=>DIARY_BLOCKS.some(b=>b.key===k));}
export function diaryQuestions(blocks:string[]){return DIARY_BLOCKS.filter(b=>blocks.includes(b.key)).flatMap(b=>b.questions);}
export function validateDiaryAnswers(value:unknown,blocks:string[]):Record<string,number>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ответьте на вопросы дневника');const answers=value as Record<string,unknown>,questions=diaryQuestions(blocks);
 if(Object.keys(answers).length!==questions.length)throw Error('Ответьте на все вопросы выбранных блоков');const clean:Record<string,number>={};
 for(const q of questions){const n=answers[q.id];if(typeof n!=='number'||!Number.isFinite(n)||n<0||(q.kind==='hours'?n>24||Math.abs(n*4-Math.round(n*4))>1e-8:!Number.isInteger(n)||n>(q.kind==='scale'?10:q.options!.length-1)))throw Error(q.kind==='hours'?'Укажите сон от 0 до 24 часов с шагом 15 минут':'Выберите ответ на вопрос '+q.id);clean[q.id]=n;}return clean;
}
export function diaryDay(timeZone:string,now=Date.now()){if(typeof timeZone!=='string'||timeZone.length>100)throw Error('Проверьте часовой пояс');try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(t=>parts.find(p=>p.type===t)!.value).join('-');}catch{throw Error('Проверьте часовой пояс');}}
export function diaryAnswer(q:DiaryQuestion,value:number){return q.kind==='choice'?q.options![value]:q.kind==='hours'?value.toLocaleString('ru-RU')+' ч':value+' / 10';}
