'use client';
import {usePathname} from 'next/navigation';
import {accountHome} from '../../../shared/account';

export function navigationLinks(pathname:string,institution:boolean) {
  const links=institution
    ? [{href:'/institutions',label:'홈',icon:'home'},{href:'/institutions/projects/new',label:'프로젝트 생성',icon:'plus'},{href:'/institutions/meetings',label:'프로젝트 관리',icon:'dashboard'},{href:'/institutions/esg',label:'ESG 성과',icon:'campus'},{href:'/institutions/settings',label:'프로필',icon:'profile'}] as const
    : [{href:accountHome('student'),label:'홈',icon:'home'},{href:'/meetings',label:'모임 찾기',icon:'search'},{href:'/meetings/new',label:'모임 열기',icon:'plus'},{href:'/meetings/manage',label:'모임 관리',icon:'dashboard'},{href:'/profile',label:'프로필',icon:'profile'}] as const;
  if(!institution&&(pathname==='/meetings/institution'||pathname.startsWith('/meetings/institution/')))pathname='/meetings/manage';
  const active=links.filter(({href})=>pathname===href||pathname.startsWith(`${href}/`)).sort((a,b)=>b.href.length-a.href.length)[0]?.href;
  return links.map(link=>({...link,active:link.href===active}));
}
const icons={
  home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  plus:<><rect x="3" y="3" width="18" height="18" rx="6"/><path d="M12 8v8m-4-4h8"/></>,
  campus:<path d="m3 8 9-5 9 5-9 5-9-5Zm3 2v7c4 3 8 3 12 0v-7M21 8v8"/>,
  dashboard:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  profile:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
};
export default function Navigation({institution=false}:{institution?:boolean}) {
  const pathname=usePathname();
  return <nav className="bottom-navigation" aria-label="주 메뉴"><div className="bottom-navigation-inner">{navigationLinks(pathname,institution).map(({href,label,icon,active})=><a key={href} href={href} aria-current={active?'page':undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[icon]}</svg><span>{label}</span></a>)}</div></nav>;
}
