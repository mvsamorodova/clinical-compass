import {env,pipeline,type AutomaticSpeechRecognitionPipeline} from '@huggingface/transformers';
env.allowLocalModels=false;
env.backends.onnx.wasm!.numThreads=1;
env.backends.onnx.wasm!.proxy=false;
env.backends.onnx.wasm!.wasmPaths=new URL('/speech-runtime/',self.location.origin).href;
const createRecognizer=pipeline as unknown as (task:string,model:string,options:Record<string,unknown>)=>Promise<AutomaticSpeechRecognitionPipeline>;
let recognizer:AutomaticSpeechRecognitionPipeline|null=null;
let working=false;
self.onmessage=async(event:MessageEvent)=>{
 const {type,audio}=event.data;
 if(working)return;
 working=true;
 try{
  if(type==='load'){
   recognizer=await createRecognizer('automatic-speech-recognition','Xenova/whisper-tiny',{
    revision:'5332fcc35e32a33b86612b9a57a89be7906102b1',device:'wasm',dtype:'q8',
    progress_callback:(p:any)=>{if(p.status==='progress')self.postMessage({type:'progress',file:p.file,progress:Math.round(p.progress)});},
   });
   self.postMessage({type:'ready'});
  }else if(type==='transcribe'){
   if(!recognizer)throw Error('Сначала загрузите модель распознавания.');
   if(!(audio instanceof Float32Array)||audio.length<1600||audio.length>16000*65)throw Error('Запись должна быть короче одной минуты.');
   const result=await recognizer(audio,{language:'russian',task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:false});
   self.postMessage({type:'result',text:(Array.isArray(result)?result[0]:result).text.trim()});
  }
 }catch{self.postMessage({type:'error',message:'Не удалось обработать запись. Проверьте интернет при загрузке модели или попробуйте более короткую запись.'});}
 finally{working=false;}
};
