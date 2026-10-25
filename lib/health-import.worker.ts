import { parseHealthFile } from './health-import';
self.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;name:string}>)=>{
 try{self.postMessage({preview:await parseHealthFile(new Uint8Array(event.data.bytes),event.data.name)});}
 catch(e){self.postMessage({error:e instanceof Error?e.message:'Не удалось прочитать файл'});}
};
