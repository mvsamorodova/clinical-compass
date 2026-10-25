import type {AssessmentDefinition} from '../../lib/assessments';
import {RISK_RULES} from '../../lib/assessment-risk';
import {AssessmentSources} from './AssessmentSources';

export type GuidanceTest = Pick<AssessmentDefinition,'key'|'version'|'shortName'|'scoreDefinitions'|'sources'>;

export function AssessmentGuidance({test,version=test.version,signalSources=[]}:{test:GuidanceTest;version?:string;signalSources?:{label:string;url:string}[]}){
 const rule=RISK_RULES[test.key];
 const matched=rule?.version===version&&test.version===version;
 return <div className="test-risk-info" aria-label={'Границы и интерпретация '+test.shortName}>
  <strong>Границы и интерпретация · {test.shortName}</strong>
  {matched&&!!test.scoreDefinitions.length&&<ul className="test-score-ranges">{test.scoreDefinitions.map(score=><li key={score.key}>{score.label}: {score.min}–{score.max} баллов</li>)}</ul>}
  <p>{matched?rule.description:'Для этой версии теста границы не подтверждены. Результат требует отдельной интерпретации врача.'}</p>
  <AssessmentSources test={test} version={version} extraSources={signalSources}/>{matched&&!rule.source&&<p className="test-muted">Подтверждённого источника порога для этой версии нет.</p>}
 </div>;
}
