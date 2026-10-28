// Inspect actual files, never a localStorage "downloaded" flag. Workers still validate files when loading.
export async function cachedFiles(name:string,urls:string[]){
 try{if(!globalThis.caches||!await caches.has(name))return false;const cache=await caches.open(name);for(const url of urls){const response=await cache.match(url);if(!response?.ok)return false;}return true;}catch{return false;}
}
