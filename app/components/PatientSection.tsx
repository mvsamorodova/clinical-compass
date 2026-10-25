'use client';
import {useId,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export function PatientSection({title,icon,description,actions,notice,headingId,className='',children}:{title:string;icon?:ReactNode;description?:ReactNode;actions?:ReactNode;notice?:string;headingId?:string;className?:string;children:ReactNode}){
 const id=useId(),label=headingId??id;
 return <details className={'panel patient-section '+className+(notice?' has-notice':'')}>
  <summary><h2 id={label}>{icon}<span>{title}</span></h2>{notice&&<span className="patient-section-notice">{notice}</span>}<ChevronDown className="patient-section-chevron" size={20} aria-hidden="true"/></summary>
  <div className="patient-section-content" role="region" aria-labelledby={label}>
   {(description||actions)&&<div className="patient-section-toolbar">{description&&<p>{description}</p>}{actions}</div>}
   {children}
  </div>
 </details>;
}
