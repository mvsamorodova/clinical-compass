import type {AssessmentDefinition} from '../../lib/assessments';
import {RISK_RULES} from '../../lib/assessment-risk';

export type GuidanceTest = Pick<AssessmentDefinition,'key'|'version'|'shortName'|'scoreDefinitions'>;

export function AssessmentGuidance({test,version=test.version}:{test:GuidanceTest;version?:string}){
 const rule=RISK_RULES[test.key];
 const matched=rule?.version===version&&test.version===version;
 return <div className="test-risk-info" aria-label={'Границы и интерпретация '+test.shortName}>
  <strong>Границы и интерпретация · {test.shortName}</strong>
  {matched&&!!test.scoreDefinitions.length&&<ul className="test-score-ranges">{test.scoreDefinitions.map(score=><li key={score.key}>{score.label}: {score.min}–{score.max} баллов</li>)}</ul>}
  <p>{matched?rule.description:'Для этой версии теста границы не подтверждены. Результат требует отдельной интерпретации врача.'}</p>
  {matched&&rule.source?<a href={rule.source} target="_blank" rel="noreferrer">Источник границ и интерпретации</a>:<p className="test-muted">Подтверждённого источника порога для этой версии нет.</p>}
 </div>;
}
