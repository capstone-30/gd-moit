'use client';
import {usePathname} from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  const links = [{href:'/',label:'모임 찾기'}, {href:'/profile',label:'내 시간·프로필'}, {href:'/login',label:'로그인'}];
  return <nav aria-label="주 메뉴">{links.map(({href,label})=><a key={href} href={href} aria-current={pathname===href?'page':undefined}>{label}</a>)}</nav>;
}
