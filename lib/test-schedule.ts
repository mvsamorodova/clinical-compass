export const SCHEDULE_OPTIONS=[{days:1,label:'Каждый день'},{days:3,label:'Раз в 3 дня'},{days:7,label:'Раз в неделю'},{days:14,label:'Раз в 2 недели'},{days:30,label:'Раз в 30 дней'}];
export function scheduleLabel(days:number){return SCHEDULE_OPTIONS.find(x=>x.days===days)?.label??`Каждые ${days} дн.`;}
