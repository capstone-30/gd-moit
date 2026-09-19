'use client';
import {usePathname} from 'next/navigation';

export function SiteHeader({pathname}:{pathname:string}) {
  const back=[
    {prefix:'/meetings/manage/',href:'/meetings/manage',label:'모임 관리로 돌아가기'},
    {prefix:'/meetings/institution/',href:'/meetings/manage',label:'모임 관리로 돌아가기'},
    {prefix:'/institutions/meetings/',href:'/institutions/meetings',label:'주관 모임 목록으로 돌아가기'},
  ].find(({prefix})=>pathname.startsWith(prefix))??(pathname==='/meetings/new'||/^\/meetings\/[^/]+$/.test(pathname)&&!['/meetings/manage','/meetings/institution'].includes(pathname)
    ? {href:'/meetings',label:'모임 찾기로 돌아가기'}:undefined);
  return <header className="site-header"><div className="header-inner"><div className="header-leading">{back&&<a className="header-back" href={back.href} aria-label={back.label}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></a>}</div><a className="wordmark" href="/"><img src="/icon.svg" width="24" height="24" alt=""/>모잇</a><div aria-hidden="true"/></div></header>;
}

export default function Header() {
  return <SiteHeader pathname={usePathname()}/>;
}
