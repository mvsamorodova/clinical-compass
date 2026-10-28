'use client';
import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {createModelCacheState} from './model-cache-state';
const stores=new WeakMap<()=>Promise<boolean>,ReturnType<typeof createModelCacheState>>();
const serverSnapshot=()=>null;
export function useModelCache(check:()=>Promise<boolean>){
 const store=useMemo(()=>{let value=stores.get(check);if(!value){value=createModelCacheState(check);stores.set(check,value);}return value;},[check]);
 const cached=useSyncExternalStore(store.subscribe,store.getSnapshot,serverSnapshot);
 useEffect(()=>{void store.refresh();const focus=()=>void store.refresh(),changed=()=>void store.invalidate();window.addEventListener('focus',focus);window.addEventListener('compass-model-cached',changed);return()=>{window.removeEventListener('focus',focus);window.removeEventListener('compass-model-cached',changed);};},[store]);
 return {cached,refresh:store.refresh};
}
