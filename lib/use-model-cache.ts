'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export function useModelCache(check:()=>Promise<boolean>){
 const [cached,setCached]=useState<boolean|null>(null),sequence=useRef(0);
 const refresh=useCallback(async()=>{const current=++sequence.current;const present=await check().catch(()=>false);if(sequence.current===current)setCached(present);return present;},[check]);
 useEffect(()=>{void refresh();const changed=()=>void refresh();window.addEventListener('focus',changed);window.addEventListener('compass-model-cached',changed);return()=>{sequence.current++;window.removeEventListener('focus',changed);window.removeEventListener('compass-model-cached',changed);};},[refresh]);
 return {cached,refresh};
}
