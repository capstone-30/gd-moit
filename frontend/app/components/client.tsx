'use client';
import {useCallback,useEffect,useState,type ReactNode,type FormEvent} from 'react';

export type Config={school:null|{id:string,name:string,timezone:string,departments:string[],entryYears:number[]},term:null|{id:string,startsOn:string,endsOn:string,slots:Slot[]},places:{id:string,name:string}[],registrationAvailable:boolean,privacyVersion:string|null,privacyNotice:Record<string,unknown>|null};
export type Slot={slot:number,startsAt:string,endsAt:string};
export type Profile={department:string|null,entryYear:number|null,interests:string[]};
export type Me=Profile&{id:string,email:string,displayName:string|null,optionalProfileConsent:boolean,creationRestricted:boolean};
export type Meeting={id:string,topic:string,type:string,place:{id:string,name:string},capacity:number,memberCount:number,state:string,confirmation:null|{date:string,slot:number,source:string},overlapsMyAvailability:boolean,canJoin:boolean,expiresAt:string,version:number,termId:string,hostId:string,isMember:boolean,members:{userId:string,memberNo:number,isHost:boolean,profile:Profile}[],intersectionSlots?:number[],proposal?:null|{id:string,date:string,slot:number,acceptedMemberNos:number[],myAccepted:boolean}};
export type Comment={id:string,memberNo:number,body:string,createdAt:string,isMine:boolean};
import {api,RequestError} from './api';
export {api,RequestError} from './api';
export function useData<T>(load:(signal:AbortSignal)=>Promise<T>) {
  const [data,setData]=useState<T>();const [error,setError]=useState<Error>();const [loading,setLoading]=useState(true);const [version,setVersion]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError(undefined);load(controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted){setError(e instanceof RequestError?e:new Error('연결에 실패했습니다. 다시 시도해주세요.'));if(e instanceof RequestError&&[403,404].includes(e.status))setData(undefined);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[load,version]);
  const reload=useCallback(()=>setVersion(v=>v+1),[]);return {data,error,loading,reload};
}
export function Feedback({error}:{error?:Error}) {return error?<div role="alert" className="feedback error-message">{error.message}{error instanceof RequestError && error.status===401 && <> <a href="/login">로그인하기</a></>}</div>:null;}
export function Loading(){return <div className="loading-state" role="status"><p>잠시만 기다려주세요</p><div className="skeleton skeleton-title" aria-hidden="true"/><div className="skeleton" aria-hidden="true"/></div>;}
export function Retry({error,reload}:{error?:Error,reload:()=>void}){return <><Feedback error={error}/>{error&&<button className="button" onClick={reload}>다시 불러오기</button>}</>;}
export function Form({children,submit,label='저장',danger=false,dirtyGuard=false,disabled=false,onConflict}:{children:ReactNode,submit:(form:FormData)=>Promise<unknown>,label?:string,danger?:boolean,dirtyGuard?:boolean,disabled?:boolean,onConflict?:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState<Error>(),[done,setDone]=useState(false),[dirty,setDirty]=useState(false),[destination,setDestination]=useState<string>();
  useEffect(()=>{if(destination&&!dirty)window.location.assign(destination);},[destination,dirty]);
  useEffect(()=>{if(!dirtyGuard||!dirty)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirtyGuard,dirty]);
  async function send(e:FormEvent<HTMLFormElement>) {e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget);setBusy(true);setError(undefined);setDone(false);try{const result=await submit(form);setDirty(false);setDone(true);if(typeof result==='string')setDestination(result);}catch(e){setError(e instanceof RequestError?e:new Error('연결에 실패했습니다. 입력을 유지하고 다시 시도해주세요.'));if(e instanceof RequestError && ['VERSION_CONFLICT','PROPOSAL_STALE'].includes(e.code))onConflict?.();}finally{setBusy(false);}}
  return <form className="stack" aria-busy={busy} onSubmit={send} onChange={()=>{setDirty(true);setDone(false);}}><fieldset disabled={busy||disabled} className="stack">{children}<button className={`button ${danger?'danger':'primary'}`} type="submit">{busy?'처리 중…':label}</button></fieldset><Feedback error={error}/><p className="feedback success-message" role="status">{done?'완료했습니다.':busy?'처리 중입니다.':''}</p></form>;
}
export const kinds:Record<string,string>={study:'모각공',coffee:'커피챗',lunch:'런치챗'};
export const weekdays=['','월','화','수','목','금','토','일'];
export function slotLabel(slot:number){return `${weekdays[Math.floor(slot/100)]}요일 ${slot%100}교시`;}
export function Slots({slots,selected=[]}:{slots:Slot[],selected?:number[]}) {
  const days=[...new Set(slots.map(s=>Math.floor(s.slot/100)))];
  return <fieldset className="timetable-fieldset"><legend>제안받을 수 있는 시간</legend><p className="help">선택은 참여 승낙이 아닙니다. 비워 두고 저장할 수도 있습니다.</p>{!slots.length?<p>운영 교시가 아직 설정되지 않았습니다.</p>:<div className="timetable" style={{'--days':days.length} as React.CSSProperties}>{days.map(day=><fieldset className="day-column" key={day}><legend>{weekdays[day]}요일</legend><div className="day-slots">{slots.filter(s=>Math.floor(s.slot/100)===day).map(s=><label className="slot" key={s.slot}><input type="checkbox" name="slots" value={s.slot} defaultChecked={selected.includes(s.slot)} aria-label={`${slotLabel(s.slot)} ${s.startsAt.slice(0,5)}~${s.endsAt.slice(0,5)}`}/><span><span className="slot-check" aria-hidden="true">✓</span>{s.slot%100}교시 <small>{s.startsAt.slice(0,5)}</small></span></label>)}</div></fieldset>)}</div>}</fieldset>;
}
export function selectedSlots(form:FormData){return form.getAll('slots').map(Number);}
export function ProfileText({profile}:{profile:Profile}){return <span className="muted">{[profile.department,profile.entryYear?`${profile.entryYear}학번`:null,...profile.interests].filter(Boolean).join(' · ')||'선택 프로필 없음'}</span>;}
export function Heading({title,description,children}:{title:string,description?:string,children?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1>{description&&<p className="lede">{description}</p>}</div>{children}</div>;}
