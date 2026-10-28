// Share file checks between fields. Only public model availability lives here;
// audio, transcripts, prompts and account data never enter this store.
export function createModelCacheState(check:()=>Promise<boolean>){
 let cached:boolean|null=null,flight:Promise<boolean>|null=null,invalidation:Promise<boolean>|null=null,generation=0;
 const listeners=new Set<()=>void>();
 const refresh=(force=false):Promise<boolean>=>{
  if(flight&&!force)return flight;
  const current=++generation;
  const task=Promise.resolve().then(check).catch(()=>false).then(present=>{
   if(current===generation&&cached!==present){cached=present;listeners.forEach(fn=>fn());}
   return present;
  }).finally(()=>{if(current===generation)flight=null;});
  flight=task;return task;
 };
 const invalidate=()=>invalidation??(invalidation=Promise.resolve().then(()=>refresh(true)).finally(()=>{invalidation=null;}));
 return {getSnapshot:()=>cached,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},refresh,invalidate};
}
