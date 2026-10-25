#!/usr/bin/env python3
"""Generate a public template; Apple `shortcuts sign` signs it separately.

No credentials, health samples, personal library access, or remote code are used.
Health serialization is based on exported iOS examples in HEALTHKIT.md at
github.com/viticci/shortcuts-playground-plugin and local Apple action metadata.
Runtime Health actions still need a real iPhone acceptance test.
"""
from pathlib import Path
import plistlib
import uuid

ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://clinical-compass-v2.navyelk1024.chatgpt.site'
NAME='Компас — здоровье'
actions=[]
def token(value): return {'Value':value,'WFSerializationType':'WFTextTokenAttachment'}
def text(value):
    return {'Value':{'string':'\ufffc','attachmentsByRange':{'{0, 1}':value['Value']}},'WFSerializationType':'WFTextTokenString'} if isinstance(value,dict) else {'Value':{'string':value},'WFSerializationType':'WFTextTokenString'}
def dictionary(items):
    return {'Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':text(k),'WFValue':text(v)} for k,v in items.items()]},'WFSerializationType':'WFDictionaryFieldValue'}
def action(name,output='Result',**params):
    ident=str(uuid.uuid5(uuid.NAMESPACE_URL,NAME+str(len(actions))))
    actions.append({'WFWorkflowActionIdentifier':'is.workflow.actions.'+name,'WFWorkflowActionParameters':{'UUID':ident,**params}})
    return token({'Type':'ActionOutput','OutputUUID':ident,'OutputName':output})
def get(source,key): return action('getvalueforkey','Dictionary Value',WFInput=source,WFDictionaryKey=key,WFGetDictionaryValueType='Value')
def check(source,state):
    value=get(source,'state');group=str(uuid.uuid4())
    action('conditional',GroupingIdentifier=group,WFControlFlowMode=0,WFCondition=5,WFConditionalActionString=state,WFInput={'Type':'Variable','Variable':value})
    error=get(source,'error')
    action('showresult',Text=text(error))
    action('exit')
    action('conditional',GroupingIdentifier=group,WFControlFlowMode=2)
def date(value): return action('format.date','Formatted Date',WFDate=value,WFDateFormatStyle='Custom',WFDateFormat="yyyy-MM-dd'T'HH:mm:ssXXXXX",WFLocale='en_US_POSIX')
def post(path,items): return action('downloadurl','Contents of URL',WFURL=ORIGIN+'/api/health-shortcut/'+path,WFHTTPMethod='POST',WFHTTPBodyType='JSON',WFJSONValues=dictionary(items))

action('comment',WFCommentActionText='Клинический компас. Запускайте из своего кабинета пациента. Читает только сон, шаги и упражнения за последние 8 суток для предпросмотра 7 календарных дней. Отправляет их только на '+ORIGIN+'. Не изменяет Здоровье. Не хранит ключ. После отправки подтвердите сохранение на сайте.')
ticket=token({'Type':'ExtensionInput'})
verified=post('verify',{'token':ticket})
check(verified,'ready')
confirmation=get(verified,'message')
action('alert',WFAlertActionTitle='Проверьте получателя',WFAlertActionMessage=text(confirmation),WFAlertActionCancelButtonShown=True)
captured=date(token({'Type':'CurrentDate'}))
result={}
for key,label,unit in [('steps','Steps','count'),('sleep','Sleep',None),('activity','Exercise Minutes','min')]:
    predicates=[{'Bounded':True,'Operator':4,'Property':'Type','Removable':False,'Values':{'Enumeration':{'Value':label,'WFSerializationType':'WFStringSubstitutableState'}}}, {'Operator':1001,'Property':'Start Date','Removable':True,'Values':{'Number':8,'Unit':16}}]
    extra={'WFHKSampleFilteringUnit':unit} if unit else {}
    samples=action('filter.health.quantity','Health Samples',WFContentItemFilter={'Value':{'WFActionParameterFilterPrefix':1,'WFContentPredicateBoundedDate':False,'WFActionParameterFilterTemplates':predicates},'WFSerializationType':'WFContentPredicateTableTemplate'},WFContentItemLimitEnabled=True,WFContentItemLimitNumber=5001,WFHKSampleFilteringGroupBy='None',WFHKSampleFilteringFillMissing=False,**extra)
    group=str(uuid.uuid5(uuid.NAMESPACE_URL,NAME+key))
    action('repeat.each',GroupingIdentifier=group,WFControlFlowMode=0,WFInput=samples)
    item=token({'Type':'Variable','VariableName':'Repeat Item'})
    fields={}
    for field,prop in [('start','Start Date'),('end','End Date'),('source','Source'),('value','Value')]:
        detail=action('properties.health.quantity',prop,WFContentItemPropertyName=prop,WFInput=item)
        fields[field]=date(detail) if field in ('start','end') else detail
    record=action('dictionary','Dictionary',WFItems=dictionary(fields))
    action('gettext','Text',WFTextActionText=text(record))
    records=action('repeat.each','Repeat Results',GroupingIdentifier=group,WFControlFlowMode=2)
    result[key]=action('text.combine','Combined Text',text=records,WFTextSeparator='Custom',WFTextCustomSeparator='\x1e',ShowWhenRun=False)
received=post('upload',{'token':ticket,'capturedAt':captured,**result})
check(received,'received')
message=get(received,'message')
action('showresult',Text=text(message))
# No patient values or capability in the return URL or shortcut output.
action('openurl',WFInput=ORIGIN+'/?view=health')
action('nothing')

workflow={'WFWorkflowName':NAME,'WFWorkflowClientVersion':'4018.0.4','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowIcon':{'WFWorkflowIconStartColor':431817727,'WFWorkflowIconGlyphNumber':61440},'WFWorkflowActions':actions,'WFWorkflowHasOutputFallback':False,'WFWorkflowOutputContentItemClasses':[],'WFWorkflowInputContentItemClasses':['WFStringContentItem'],'WFWorkflowImportQuestions':[],'WFWorkflowTypes':[],'WFQuickActionSurfaces':[],'WFWorkflowHasShortcutInputVariables':True}
out=ROOT/'outputs'/'health-shortcut-unsigned.shortcut'
out.parent.mkdir(exist_ok=True)
out.write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY))
(ROOT/'public'/'shortcuts').mkdir(exist_ok=True,parents=True)
print(f'Generated {len(actions)} actions. No credentials. Unsigned template: {out}')
