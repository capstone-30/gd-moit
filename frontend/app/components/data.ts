'use client';
import {useCallback,useEffect,useState} from 'react';
import {api,RequestError,cursorQuery} from './api';
import type {Config,Me,Availability} from '../../../shared/contracts';

export async function loadAccountContext(signal:AbortSignal) {
  const [config,account]=await Promise.all([api<Config>('configuration',{signal}),api<Me>('me',{signal})]);
  return {c:config.data,me:account.data};
}
export async function loadAvailabilityContext(signal:AbortSignal) {
  const context=await loadAccountContext(signal);
  const times=context.c.term?(await api<Availability>(`me/availability/${context.c.term.id}`,{signal})).data:null;
  return {...context,times};
}
export function useData<T>(load:(signal:AbortSignal)=>Promise<T>) {
  const [data,setData]=useState<T>();
  const [error,setError]=useState<Error>();
  const [loading,setLoading]=useState(true);
  const [version,setVersion]=useState(0);

  useEffect(()=>{
    const controller=new AbortController();
    const {signal}=controller;
    setLoading(true);
    setError(undefined);
    load(signal)
      .then(value=>{
        if(signal.aborted) return;
        setData(value);
      })
      .catch(error=>{
        if(signal.aborted) return;
        setError(error instanceof RequestError?error:new Error('연결에 실패했습니다. 다시 시도해주세요.'));
        if(error instanceof RequestError && [403,404].includes(error.status)) setData(undefined);
      })
      .finally(()=>{
        if(signal.aborted) return;
        setLoading(false);
      });
    return()=>controller.abort();
  },[load,version]);

  const reload=useCallback(()=>setVersion(v=>v+1),[]);
  return {data,error,loading,reload};
}
export function useApiData<T>(path:string,revision=0) {
  const load=useCallback((signal:AbortSignal)=>api<T>(path,{signal}),[path,revision]);
  return useData(load);
}
export function usePages() {
  const [pages,setPages]=useState<(string|null)[]>([null]);
  const reset=useCallback(()=>setPages([null]),[]);
  return {pages,setPages,cursor:pages.at(-1),reset};
}
export function usePaginatedData<T>(path:string,revision=0) {
  const pagination=usePages();
  const state=useApiData<T[]>(`${path}${path.includes('?')?'&':'?'}${cursorQuery(pagination.cursor)}`,revision);
  return {...state,...pagination};
}
