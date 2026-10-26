export const STATIONS = [
 {key:'understanding',title:'Понимание',hint:'Что происходит со мной',landscape:'lagoon'},
 {key:'anchors',title:'Моя точка опоры',hint:'Люди, техники и слова',landscape:'mountains'},
 {key:'diary',title:'Дневник',hint:'Место для наблюдений',landscape:'snow'},
 {key:'doctor',title:'Связь с врачом',hint:'Разговор и назначения',landscape:'flowers'},
 {key:'stories',title:'Истории',hint:'Опыт людей рядом',landscape:'dawn'},
 {key:'journey',title:'Мой путь',hint:'Оглянуться и заметить',landscape:'space'},
] as const;
export type StationKey=typeof STATIONS[number]['key'];
export type StandaloneStationKey=Exclude<StationKey,'diary'|'doctor'>;
// Shared islands open the same views as the main navigation.
export const SHARED_STATION_PAGES:Partial<Record<StationKey,string>>={diary:'chat',doctor:'doctor'};
export const PATIENT_PAGE_PATHS:Record<string,string>={recovery:'/map',chat:'/diary',doctor:'/doctor'};
export const ANCHOR_CATEGORIES=[
 {key:'holds',title:'Что меня держит',hint:'Человек, место, занятие — или просто картинка.'},
 {key:'people',title:'Мои люди',hint:'К кому я могу обратиться. Имя и контакт, если хочется.'},
 {key:'techniques',title:'Мои техники',hint:'Что уже помогало: заземление, спокойное дыхание, маленький шаг.'},
 {key:'joys',title:'Маленькие радости',hint:'Что-то приятное на одну-две минуты.'},
 {key:'words',title:'Мои слова себе',hint:'Фраза, которую хочется услышать в трудный момент.'},
] as const;
export type RecoveryEntry={id:string;category:string;text:string;mediaType:string|null;mediaUrl:string|null;createdAt:number};
export type RecoveryMessage={id:string;text:string;sender:'patient'|'doctor';createdAt:number;readAt:number|null};
export type RecoveryData={stations:(typeof STATIONS[number]&{visited:boolean})[];entries:RecoveryEntry[];activity:{kind:string;key:string;createdAt:number}[];counts:{anchors:number;diaryWeek:number;diaryTotal:number;learned:number;watched:number;unread:number;assignments:number};days:number;legacy:{title:string;answer:string;updatedAt:number}[]};
