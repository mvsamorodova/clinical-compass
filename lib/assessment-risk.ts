export type RiskReason={kind:'safety'|'severity'|'review';text:string;source:string};
type Rule={version:string;label:string;description:string;source:string;thresholds?:Record<string,number>;research?:boolean};
const depression='https://apicr.minzdrav.gov.ru/api.ashx?op=GetClinrec2&id=301_3';
const anxiety='https://apicr.minzdrav.gov.ru/api.ashx?op=GetClinrec2&id=457_3';
const research='https://psystudy.ru/index.php/num/article/download/1439/990';
export const RISK_RULES:Record<string,Rule>={
 dass42:{version:'ru-fattakhov-2025',label:'DASS-42',description:'Крайне высокая выраженность: депрессия ≥28, тревога ≥20, стресс ≥34. Полная форма, без умножения на 2. DASS не измеряет суицидальный риск.',source:'https://www.health.gov.au/sites/default/files/2022-12/main-report-evaluation-of-the-better-access-initiative.pdf#page=110',thresholds:{depression:28,anxiety:20,stress:34}},
 phq9:{version:'ru-zolotareva-2023',label:'PHQ-9',description:'Тяжёлая выраженность ≥20 из 27. Любой положительный ответ на пункт 9 проверяется отдельно, независимо от суммы.',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC1495268/',thresholds:{total:20}},
 gad7:{version:'ru-zolotareva-2023',label:'GAD-7',description:'Тяжёлая выраженность ≥15 из 21.',source:'https://doi.org/10.1001/archinte.166.10.1092',thresholds:{total:15}},
 hdrs17:{version:'ru-kr-2024-v1',label:'HDRS-17',description:'КР РФ: крайне тяжёлая депрессия «более 23» (≥24). Для ровно 23 баллов в таблице источника пробел — нужна оценка врача. Пункт 3 проверяется отдельно.',source:depression,thresholds:{total:24}},
 madrs:{version:'ru-kr-2024-v1',label:'MADRS',description:'КР РФ: тяжёлая степень «более 34» (≥35 из 60). Переносится результат внешней оценки врача.',source:depression,thresholds:{total:35}},
 hars:{version:'ru-kr-2024-v1',label:'HARS',description:'КР РФ: тяжёлая тревога 25–56. Используется общая сумма, не отдельные подшкалы.',source:anxiety,thresholds:{total:25}},
 bai:{version:'ru-kr-2024-v1',label:'BAI',description:'КР РФ: очень высокий уровень 36–63. Это ключ используемой русской версии, не порог 26 из других руководств.',source:anxiety,thresholds:{total:36}},
 hcl33:{version:'ru-kr-2024-v1',label:'HCL-33',description:'≥16 — положительный скрининг для клинического уточнения. Это не граница кризиса и не диагноз биполярного расстройства.',source:'https://www.sciencedirect.com/science/article/pii/S2666915321000135'},
 cssrs_lifetime:{version:'ru-kr-2024-v1',label:'C-SSRS',description:'Общей суммы нет. Форма собирает анамнез за всю жизнь, поэтому положительные ответы требуют уточнения давности и текущего состояния. Не применять к ним автоматически пороги «последний месяц / 3 месяца».',source:'https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/cssrs-for-communities-and-healthcare/'},
 mfq20_ru:{version:'ru-shilko-2026-20',label:'MFQ · 20 пунктов',description:'Для этой взрослой русской адаптации 0–40 подтверждённый порог критического состояния не установлен. Пороги MFQ-33 и SMFQ-13 не применяются.',source:'https://doi.org/10.51217/npsyresearch_2026_06_01_02'},
 poms38_ru:{version:'ru-shilko-2026-38',label:'POMS · 38 пунктов',description:'Для этой версии нет подтверждённой кризисной отсечки. Наблюдается динамика отдельных шкал; отрицательный общий показатель допустим.',source:'https://doi.org/10.51217/npsyresearch_2026_06_01_02'},
 scl90r:{version:'ru-kr-2024-v1',label:'SCL-90-R',description:'КР содержат групповые нормы, а не единый кризисный порог для сырых индексов. Нормированные T-баллы в этой форме не сохраняются.',source:anxiety},
 itt:{version:'ru-kr-2024-v1',label:'ИТТ',description:'Нужны нормативная группа и перевод в станайны. Два сырых результата 0–45 сами по себе не дают единого критического порога.',source:anxiety},
 psychache13:{version:'ru-kolachev-2023',label:'Душевная боль · 13 пунктов',description:'56–65 — высокий уровень по исследовательской выборке русской адаптации. Ограниченная выборка, не подтверждённый прогноз суицидального поведения.',source:research,thresholds:{total:56},research:true},
 bhs11:{version:'ru-kolachev-2023',label:'BHS-11',description:'40–44 — высокий уровень по исследовательской выборке этой адаптации. Не применять пороги оригинальной BHS-20 и не интерпретировать как прогноз суицидального поведения.',source:research,thresholds:{total:40},research:true},
 beck_supplied21:{version:'user-text-2026-10-v1',label:'Бек · предоставленный текст',description:'Версия и общий ключ не подтверждены: суммарного порога нет. Прямой положительный ответ о самоповреждении рассматривается отдельно как повод для оценки безопасности.',source:''},
};
export function assessmentRisk(key:string,version:string,scores:Record<string,number>,answers:number[],extra:Record<string,string|number>={}):RiskReason[]{
 const rule=RISK_RULES[key];if(!rule||rule.version!==version)return [];
 const reasons:RiskReason[]=[];const add=(kind:RiskReason['kind'],text:string,source=rule.source)=>reasons.push({kind,text,source});
 for(const [score,cutoff] of Object.entries(rule.thresholds??{}))if(Number.isFinite(scores[score])&&scores[score]>=cutoff)add(rule.research?'review':'severity',`${rule.label}: ${score==='total'?'сумма':({depression:'депрессия',anxiety:'тревога',stress:'стресс'} as Record<string,string>)[score]??score} ${scores[score]} — порог ${cutoff}. ${rule.research?'Исследовательская градация; требуется клиническая оценка.':'Высокая выраженность симптомов; решение принимает врач.'}`);
 if(key==='phq9'&&answers[8]>0)add('safety','PHQ-9, пункт 9: положительный ответ о смерти или самоповреждении. Нужна отдельная оценка безопасности, даже при низкой сумме.','https://aims.uw.edu/rmhii/sites/default/files/PHQ-9%20Follow-up%20Questions_Positive%20Question%209_2013.pdf');
 if(key==='hdrs17'&&answers[2]>0)add('safety','HDRS-17, пункт 3: положительный ответ требует отдельной оценки безопасности.');
 if(key==='hdrs17'&&scores.total===23)add('review','HDRS-17: 23 балла. В градациях КР этот результат пропущен; необходима интерпретация врача.');
 if(key==='beck_supplied21'&&answers[8]>0)add('safety','Положительный ответ на пункт о самоповреждении в предоставленном тексте. Версия шкалы не подтверждена, общий риск автоматически не определяется.');
 if(key==='dass42'&&answers[20]>0)add('review','DASS-42, пункт 21: обсудите ответ о ценности жизни. Этот пункт не является самостоятельной оценкой суицидального риска.','https://dass.psy.unsw.edu.au/over.htm');
 if(key==='mfq20_ru'&&answers[10]>0)add('review','MFQ, пункт 11: отмечены мысли о смерти. Нужно уточнить их содержание; это не равнозначно намерению причинить себе вред.');
 if(key==='hcl33'&&scores.total>=16)add('review','HCL-33 ≥16: положительный скрининг требует уточнения у специалиста; это не кризисная отсечка.');
 if(key==='cssrs_lifetime'){
  if(['ideation1','ideation2','ideation3','ideation4','ideation5','actual','interrupted','aborted','preparatory'].some(k=>extra[k]===1))add('review','C-SSRS: положительный анамнестический ответ. Уточните давность, текущие намерения и безопасность; форма за всю жизнь не определяет текущий высокий риск.');
  if(extra.observed_behavior===1)add('safety','C-SSRS: отмечено наблюдаемое поведение. Врач должен оценить указанный период наблюдения и актуальное состояние.');
  if(extra.nssi===1)add('review','C-SSRS: отмечено несуицидальное самоповреждение. Это отдельный сигнал для обсуждения, не обозначение суицидальной попытки.');
 }
 return reasons;
}
