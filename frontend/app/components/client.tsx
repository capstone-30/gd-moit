'use client';
import {useEffect,useRef,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import {RequestError} from './api';
import type {Profile} from '../../../shared/contracts';

export function CapacityDots({capacity,memberCount}:{capacity:number;memberCount:number}) {
  return <span className="capacity-dots" role="img" aria-label={`정원 ${capacity}명 중 ${memberCount}명 참여`}>{Array.from({length:capacity},(_,i)=><i key={i} aria-hidden="true" className={i<memberCount?'filled':undefined}/>)}</span>;
}
export function Feedback({error}:{error?:Error}) {
  const feedback=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(error)feedback.current?.focus();},[error]);
  return error?<div ref={feedback} tabIndex={-1} role="alert" className="feedback error-message">{error.message}{error instanceof RequestError && error.status===401 && error.code==='UNAUTHENTICATED' && <> <a href="/login">로그인하기</a></>}</div>:null;}
export function Loading(){return <div className="loading-state" role="status"><p>잠시만 기다려주세요</p><div className="skeleton skeleton-title" aria-hidden="true"/><div className="skeleton" aria-hidden="true"/></div>;}
export function Retry({error,reload}:{error?:Error,reload:()=>void}){return <><Feedback error={error}/>{error&&<button type="button" className="button" onClick={reload}>다시 불러오기</button>}</>;}
export function LoadFeedback({state,hasData=Boolean(state.data),recovery}:{state:{data?:unknown;error?:Error;loading:boolean;reload:()=>void};hasData?:boolean;recovery?:{href:string;label:string}}) {
  return <><Retry error={state.error} reload={state.reload}/>{recovery&&state.error instanceof RequestError&&[403,404].includes(state.error.status)&&<a className="button" href={recovery.href}>{recovery.label}</a>}{state.loading&&!hasData&&<Loading/>}</>;
}
// 페이지를 넘기면 누른 버튼이 사라지거나 바뀌므로, 목록 바로 위 제목으로 포커스와 스크롤을 옮긴다.
// 목록 항목(카드·글) 안의 제목은 건너뛰고, 팝업 안에서는 그 팝업의 제목만 찾는다.
export function listHeading(button:HTMLElement) {
  const scope=button.closest('dialog')??document;
  return [...scope.querySelectorAll<HTMLElement>('h1,h2,h3')]
    .filter(heading=>!heading.closest('li,article')&&(scope!==document||!heading.closest('dialog'))&&Boolean(heading.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING))
    .at(-1);
}
function moveToList(button?:HTMLElement) {
  if(!button)return;
  const heading=listHeading(button);
  if(!heading)return;
  if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');
  heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});
}
export function PageButtons({pages,setPages,nextCursor,labels=['이전','다음']}:{pages:(string|null)[];setPages:Dispatch<SetStateAction<(string|null)[]>>;nextCursor?:string|null;labels?:[string,string]}) {
  return <>
    {pages.length>1&&<button type="button" className="button" onClick={event=>{moveToList(event?.currentTarget);setPages(p=>p.slice(0,-1));}}>{labels[0]}</button>}
    {nextCursor&&<button type="button" className="button" onClick={event=>{moveToList(event?.currentTarget);setPages(p=>[...p,nextCursor]);}}>{labels[1]}</button>}
  </>;
}
export function ProfileText({profile}:{profile:Profile}){return <span className="muted">{[profile.department,profile.entryYear?`${profile.entryYear}학번`:null,...profile.interests].filter(Boolean).join(' · ')||'선택 프로필 없음'}</span>;}
// 가능 시간을 등록하지 않으면 시간 겹침·교집합 계산에 내 시간이 빠지므로 모임 탐색·참여 전에 등록을 안내한다.
export function AvailabilityReminder({children}:{children:ReactNode}){return <aside className="institution-notice availability-reminder" aria-label="가능 시간 등록 안내"><strong>아직 가능 시간을 등록하지 않았어요</strong><p>{children} <a className="text-link" href="/profile#availability">가능 시간 등록</a></p></aside>;}
export function Heading({title,description,children}:{title:string,description?:string,children?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1>{description&&<p className="lede">{description}</p>}</div>{children}</div>;}
