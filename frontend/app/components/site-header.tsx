'use client';
import {usePathname} from 'next/navigation';
import {useEffect,useSyncExternalStore} from 'react';

type BackLink={href:string;label:string};
// 경로만으로 알 수 없는 복귀 위치(기관 모임 상세의 소속 프로젝트 등)는 화면이 데이터를 불러온 뒤 지정한다.
let override:BackLink|null=null;
const listeners=new Set<()=>void>();
function setOverride(link:BackLink|null){override=link;listeners.forEach(listener=>listener());}
export function useBackLink(link:BackLink|null) {
  const href=link?.href,label=link?.label;
  useEffect(()=>{
    if(!href||!label)return;
    setOverride({href,label});
    return()=>setOverride(null);
  },[href,label]);
}
function useBackOverride() {
  return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>override,()=>null);
}

export function SiteHeader({pathname,override:custom=null}:{pathname:string;override?:BackLink|null}) {
  const back=custom??[
    {prefix:'/meetings/manage/',href:'/meetings/manage',label:'모임 관리로 돌아가기'},
    {prefix:'/meetings/institution/',href:'/meetings/manage',label:'모임 관리로 돌아가기'},
    {prefix:'/institutions/meetings/',href:'/institutions/meetings',label:'프로젝트 관리로 돌아가기'},
  ].find(({prefix})=>pathname.startsWith(prefix))??(pathname==='/meetings/new'||/^\/meetings\/[^/]+$/.test(pathname)&&!['/meetings/manage','/meetings/institution'].includes(pathname)
    ? {href:'/meetings',label:'모임 찾기로 돌아가기'}:undefined);
  return <header className="site-header"><div className="header-inner"><div className="header-leading">{back&&<a className="header-back" href={back.href} aria-label={back.label}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></a>}</div><a className="wordmark" href="/"><img src="/icon.svg" width="24" height="24" alt=""/>모잇</a><div aria-hidden="true"/></div></header>;
}

export default function Header() {
  return <SiteHeader pathname={usePathname()} override={useBackOverride()}/>;
}
