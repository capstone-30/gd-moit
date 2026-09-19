'use client';
import {usePathname} from 'next/navigation';

export function navigationLinks(pathname:string,institution:boolean) {
  const links=institution
    ? [{href:'/institutions',label:'대시보드',icon:'dashboard'},{href:'/institutions/meetings',label:'주관 모임',icon:'campus'},{href:'/institutions/settings',label:'프로필',icon:'profile'}] as const
    : [{href:'/meetings',label:'모임 찾기',icon:'search'},{href:'/meetings/new',label:'모임 열기',icon:'plus'},{href:'/meetings/manage',label:'모임 관리',icon:'dashboard'},{href:'/meetings/institution',label:'대학 모임',icon:'campus'},{href:'/profile',label:'프로필',icon:'profile'}] as const;
  const active=links.filter(({href})=>pathname===href||pathname.startsWith(`${href}/`)).sort((a,b)=>b.href.length-a.href.length)[0]?.href;
  return links.map(link=>({...link,active:link.href===active}));
}
const icons={
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
