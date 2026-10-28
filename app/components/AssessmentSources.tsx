import type {ReactNode} from 'react';
import type {AssessmentDefinition} from '../../lib/assessments';
import {RISK_RULES} from '../../lib/assessment-risk';

type Source={label:string;url:string};
type SourceTest=Pick<AssessmentDefinition,'key'|'version'|'sources'>;

export function AssessmentSources({test,version=test.version,extraSources=[],children,summary='Источники'}:{test:SourceTest;version?:string;extraSources?:Source[];children?:ReactNode;summary?:string}){
 const rule=RISK_RULES[test.key];
 const sameVersion=test.version===version;
 const sources=[...(sameVersion?test.sources:[]),...(sameVersion&&rule?.version===version&&rule.source?[{label:'Обоснование границ и интерпретации',url:rule.source}]:[]),...extraSources]
  .filter((source,i,all)=>source.url&&all.findIndex(s=>s.url===source.url)===i);
 if(!sources.length&&!children)return null;
 return <details className="test-method test-sources"><summary>{summary}</summary>{children}<ul>{sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul></details>;
}
