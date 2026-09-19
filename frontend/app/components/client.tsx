'use client';
import {createContext,useCallback,useEffect,useRef,useState,type ReactNode,type FormEvent,type Dispatch,type SetStateAction} from 'react';
import type {MeetingType} from '../../../shared/meeting-types';
import type {AccountRole} from '../../../shared/account';

export type Config={demoAccounts?:{email:string,role:AccountRole,label:string}[],school:null|{id:string,name:string,timezone:string,departments:string[],entryYears:number[]},term:null|{id:string,startsOn:string,endsOn:string,slots:Slot[]},places:{id:string,name:string}[],registrationAvailable:boolean,privacyVersion:string|null,privacyNotice:Record<string,unknown>|null};
export type Slot={slot:number,startsAt:string,endsAt:string};
export type Profile={department:string|null,entryYear:number|null,interests:string[]};
export type Me=Profile&{role:AccountRole,id:string,email:string,displayName:string|null,optionalProfileConsent:boolean,creationRestricted:boolean};
export type MeetingSummary={id:string,topic:string,type:MeetingType,place:{id:string,name:string},capacity:number,memberCount:number,state:string,confirmation:null|{date:string,slot:number,source:string},overlapsMyAvailability:boolean,canJoin:boolean,expiresAt:string,version:number,isMember:boolean};
export type Meeting=MeetingSummary&{termId:string,term:Config['term'],hostId:string,members:{userId:string,memberNo:number,isHost:boolean,profile:Profile}[],intersectionSlots?:number[],proposal?:null|{id:string,date:string,slot:number,acceptedMemberNos:number[],myAccepted:boolean}};
export type Comment={id:string,memberNo:number,body:string,createdAt:string,isMine:boolean};
export type Availability={registered:boolean;slots:number[]};
import {api,RequestError,cursorQuery} from './api';
export {api,RequestError,cursorQuery} from './api';
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
export function CapacityDots({capacity,memberCount}:{capacity:number;memberCount:number}) {
  return <span className="capacity-dots" role="img" aria-label={`정원 ${capacity}명 중 ${memberCount}명 참여`}>{Array.from({length:capacity},(_,i)=><i key={i} aria-hidden="true" className={i<memberCount?'filled':undefined}/>)}</span>;
}
export function Feedback({error}:{error?:Error}) {
  const feedback=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(error)feedback.current?.focus();},[error]);
  return error?<div ref={feedback} tabIndex={-1} role="alert" className="feedback error-message">{error.message}{error instanceof RequestError && error.status===401 && <> <a href="/login">로그인하기</a></>}</div>:null;}
export function Loading(){return <div className="loading-state" role="status"><p>잠시만 기다려주세요</p><div className="skeleton skeleton-title" aria-hidden="true"/><div className="skeleton" aria-hidden="true"/></div>;}
export function Retry({error,reload}:{error?:Error,reload:()=>void}){return <><Feedback error={error}/>{error&&<button type="button" className="button" onClick={reload}>다시 불러오기</button>}</>;}
export function LoadFeedback({state,hasData=Boolean(state.data)}:{state:{data?:unknown;error?:Error;loading:boolean;reload:()=>void};hasData?:boolean}) {
  return <><Retry error={state.error} reload={state.reload}/>{state.loading&&!hasData&&<Loading/>}</>;
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
export function PageButtons({pages,setPages,nextCursor,labels=['이전','다음']}:{pages:(string|null)[];setPages:Dispatch<SetStateAction<(string|null)[]>>;nextCursor?:string|null;labels?:[string,string]}) {
  return <>
    {pages.length>1&&<button type="button" className="button" onClick={()=>setPages(p=>p.slice(0,-1))}>{labels[0]}</button>}
    {nextCursor&&<button type="button" className="button" onClick={()=>setPages(p=>[...p,nextCursor])}>{labels[1]}</button>}
  </>;
}
export const FormChange=createContext(()=>{});
export function Form({children,submit,label='저장',successMessage='완료했습니다.',danger=false,dirtyGuard=false,disabled=false,onConflict,onBusy,dirty:controlledDirty,onDirtyChange,submitContent}:{children:ReactNode,submit:(form:FormData)=>Promise<unknown>,submitContent?:ReactNode,label?:string,successMessage?:string,danger?:boolean,dirtyGuard?:boolean,disabled?:boolean,onConflict?:()=>void,onBusy?:(busy:boolean)=>void,dirty?:boolean,onDirtyChange?:(dirty:boolean)=>void}) {
  const [status,setStatus]=useState<'idle'|'submitting'|'success'|Error>('idle');
  const busy=status==='submitting',error=status instanceof Error?status:undefined;
  const [localDirty,setLocalDirty]=useState(false);
  const dirty=controlledDirty??localDirty,setDirty=onDirtyChange??setLocalDirty;
  const [destination,setDestination]=useState<string>();

  useEffect(()=>{
    if(destination&&!dirty) window.location.assign(destination);
  },[destination,dirty]);
  useEffect(()=>{
    if(!dirtyGuard||!dirty) return;
    const guard=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue='';
    };
    window.addEventListener('beforeunload',guard);
    return()=>window.removeEventListener('beforeunload',guard);
  },[dirtyGuard,dirty]);

  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    const form=new FormData(event.currentTarget);
    setStatus('submitting');
    onBusy?.(true);
    try {
      const result=await submit(form);
      setDirty(false);
      setStatus('success');
      if(typeof result==='string') setDestination(result);
    } catch(error) {
      setStatus(error instanceof RequestError?error:new Error('연결에 실패했습니다. 입력을 유지하고 다시 시도해주세요.'));
      if(error instanceof RequestError && ['VERSION_CONFLICT','PROPOSAL_STALE'].includes(error.code)) onConflict?.();
    } finally {
      onBusy?.(false);
    }
  }

  function changed(){setDirty(true);setStatus(value=>value==='success'?'idle':value);}
  const submitButton=<button className={`button ${danger?'danger':'primary'}`} type="submit">{busy?'처리 중…':label}</button>;
  return <form className="stack" aria-busy={busy} onSubmit={send} onChange={changed}>
    <fieldset disabled={busy||disabled} className="stack">
      <FormChange value={changed}>{children}</FormChange>
      {dirtyGuard&&dirty&&<p className="unsaved-hint" role="status">변경한 내용이 있습니다. 저장해 반영해주세요.</p>}
      {submitContent?<div className="form-submit-panel">{submitContent}{submitButton}</div>:submitButton}
    </fieldset>
    <Feedback error={error}/>
    <p className="feedback success-message" role="status">{status==='success'?successMessage:busy?'처리 중입니다.':''}</p>
  </form>;
}
export const weekdays=['','월','화','수','목','금','토','일'];
export function slotLabel(slot:number){return `${weekdays[Math.floor(slot/100)]}요일 ${slot%100}교시`;}
export function Slots({slots,selected:current,onSelectedChange:updateSelected,readOnly=false}:{slots:Slot[],selected:number[]} & ({readOnly:true;onSelectedChange?:never}|{readOnly?:false;onSelectedChange:(slots:number[])=>void})) {
  function change(slot:number,checked:boolean){
    const next=checked?[...current,slot]:current.filter(value=>value!==slot);
    updateSelected?.(next);
  }
  const days=[...new Set(slots.map(s=>Math.floor(s.slot/100)))].sort((a,b)=>a-b);
  const rows=[...new Map(slots.map(s=>[`${s.slot%100}-${s.startsAt}-${s.endsAt}`,{period:s.slot%100,startsAt:s.startsAt,endsAt:s.endsAt}])).values()]
    .sort((a,b)=>a.period-b.period||a.startsAt.localeCompare(b.startsAt));
  return <fieldset className="timetable-fieldset"><legend className={readOnly?'sr-only':undefined}>{readOnly?'함께 가능한 시간표':'제안받을 수 있는 시간'}</legend>{!readOnly&&<p className="help">가능한 칸을 선택하세요. 선택은 참여 승낙이 아닙니다.</p>}{!slots.length?<p>운영 교시가 아직 설정되지 않았습니다.</p>:<>
    {!readOnly&&<div className="timetable-toolbar"><p className="selection-summary" role="status">{current.length?`${current.length}개 교시 선택됨`:'가능한 교시를 선택해주세요'}</p></div>}
    <div className="timetable-scroll" role="region" aria-label={readOnly?'함께 가능한 시간표, 좁은 화면에서는 좌우로 스크롤':'요일별 가능 시간표, 좁은 화면에서는 좌우로 스크롤'} tabIndex={0}>
      <table className="timetable"><caption className="sr-only">{readOnly?'체크된 교시는 참여자 모두 가능한 시간입니다':'요일별 가능 시간 선택'}</caption><thead><tr><th scope="col">교시 / 시간</th>{days.map(day=>{
        const daySlots=slots.filter(s=>Math.floor(s.slot/100)===day).map(s=>s.slot);
        const daySelected=daySlots.filter(slot=>current.includes(slot)).length;
        return <th scope="col" key={day}>{readOnly?weekdays[day]:<label className="day-select"><span>{weekdays[day]}</span><input type="checkbox" aria-label={`${weekdays[day]}요일 전체 선택`} checked={daySelected===daySlots.length} ref={node=>{if(node)node.indeterminate=daySelected>0&&daySelected<daySlots.length;}} onChange={e=>{
          const next=current.filter(slot=>!daySlots.includes(slot));
          if(e.target.checked)next.push(...daySlots);
          updateSelected?.(next);
        }}/></label>}</th>;
      })}</tr></thead>
        <tbody>{rows.map(row=><tr key={`${row.period}-${row.startsAt}-${row.endsAt}`}><th scope="row"><span>{row.period}교시</span><small>{row.startsAt.slice(0,5)}–{row.endsAt.slice(0,5)}</small></th>{days.map(day=>{
          const s=slots.find(s=>s.slot===day*100+row.period&&s.startsAt===row.startsAt&&s.endsAt===row.endsAt);
          if(!s)return <td key={day}><span className="slot-unavailable" aria-label="운영하지 않는 교시">—</span></td>;
          const selected=current.includes(s.slot);
          const label=`${slotLabel(s.slot)} ${s.startsAt.slice(0,5)}~${s.endsAt.slice(0,5)}`;
          return <td key={day}>{readOnly
            ? <span role="img" className={`slot-readonly ${selected?'is-selected':''}`} aria-label={`${label} ${selected?'모두 가능':'공통 시간 아님'}`}><span aria-hidden="true">{selected?'✓':''}</span></span>
            : <label className="slot"><input type="checkbox" name="slots" value={s.slot} checked={selected} onChange={e=>change(s.slot,e.target.checked)} aria-label={label}/><span><span className="slot-check" aria-hidden="true">✓</span></span></label>}
          </td>;
        })}</tr>)}</tbody>
      </table>
    </div><p className="help timetable-help">{readOnly?'✓ 참여자 모두 가능한 시간':'요일로 전체 선택·해제 · 비워 두고 저장할 수 있어요.'}</p><p className="help timetable-scroll-hint">좁은 화면에서는 좌우로 밀어보세요.</p>
  </>}</fieldset>;
}
export function ProfileText({profile}:{profile:Profile}){return <span className="muted">{[profile.department,profile.entryYear?`${profile.entryYear}학번`:null,...profile.interests].filter(Boolean).join(' · ')||'선택 프로필 없음'}</span>;}
export function Heading({title,description,children}:{title:string,description?:string,children?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1>{description&&<p className="lede">{description}</p>}</div>{children}</div>;}
