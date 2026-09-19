'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {PopupDialog} from './popup';

export default function ProfileCards({cards}:{cards:{id:string;label:string;content:ReactNode}[]}) {
  const [active,setActive]=useState<string|null>(null);
  useEffect(()=>{
    function fromHash() {
      setActive(cards.find(card=>`#${card.id}`===window.location.hash)?.id??null);
    }
    fromHash();
    window.addEventListener('hashchange',fromHash);
    return()=>{window.removeEventListener('hashchange',fromHash);};
  },[cards]);

  function open(id:string) {
    window.history.replaceState(window.history.state,'',`#${id}`);
    setActive(id);
  }
  function close() {
    window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
    setActive(null);
  }
  return <>
    <ul className="profile-settings-menu" aria-label="프로필 설정">{cards.map(card=><li key={card.id}><button type="button" aria-haspopup="dialog" onClick={()=>open(card.id)}><span>{card.label}</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></li>)}</ul>
    {cards.map(card=><PopupDialog key={card.id} title={card.label} open={active===card.id} onClose={close}><div className="profile-panel">{card.content}</div></PopupDialog>)}
  </>;
}
