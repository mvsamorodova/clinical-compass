import { parseHealthExportFile } from './health-import';
self.onmessage=async(event:MessageEvent<{file:File}>)=>{
 try{self.postMessage({preview:await parseHealthExportFile(event.data.file)});}
 catch(e){self.postMessage({error:e instanceof RangeError?'Для этой выгрузки не хватает памяти на устройстве. Попробуйте импорт на компьютере.':e instanceof Error?e.message:'Не удалось прочитать файл'});}
};
