'use client';
import {ChevronDown,ClipboardList,UserRound} from 'lucide-react';
import {DoctorPatientPath,DoctorSafetyPlan} from './DoctorPatientContext';
import {DoctorJournal} from './PatientChat';
import {DoctorHealth} from './HealthData';
import {DoctorVoice} from './DoctorVoice';
import {DoctorTests,DoctorTestHistory} from './Assessments';
import {DoctorMedications} from './Medications';

export function PatientInformation({patientId}:{patientId:string}){
 return <details className="patient-profile-group patient-information-fold"><summary className="patient-profile-group-heading"><UserRound size={23}/><h2 id="patient-information-heading">Информация про пациента</h2><ChevronDown className="patient-information-chevron" size={21} aria-hidden="true"/></summary><div className="patient-information-content" role="region" aria-labelledby="patient-information-heading"><DoctorSafetyPlan patientId={patientId}/><DoctorPatientPath patientId={patientId}/><DoctorJournal patientId={patientId}/><DoctorHealth patientId={patientId}/><DoctorVoice patientId={patientId}/><DoctorTestHistory patientId={patientId}/></div></details>;
}
export function PatientTreatment({patientId}:{patientId:string}){
 return <section className="patient-profile-group" aria-labelledby="patient-treatment-heading"><div className="patient-profile-group-heading"><ClipboardList size={23}/><h2 id="patient-treatment-heading">Назначенное лечение</h2></div><DoctorTests patientId={patientId}/><DoctorMedications patientId={patientId}/></section>;
}
