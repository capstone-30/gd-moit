'use client';
import {createContext,useEffect,useState,type ReactNode} from 'react';
import {ConfirmDialog,PopupDialog} from './popup';

export const CloseProfileCard=createContext(()=>{});

export type ProfileCard={id:string;label:string;content:ReactNode;dirty?:boolean;onDiscard?:()=>void};

export default function ProfileCards({cards}:{cards:ProfileCard[]}) {
  const [active,setActive]=useState<string|null>(null),[confirming,setConfirming]=useState(false);
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
  function requestClose(card:ProfileCard) {
    if(card.dirty)setConfirming(true);
    else close();
  }
  function discard(card:ProfileCard) {
    setConfirming(false);
    card.onDiscard?.();
    close();
  }
  const current=cards.find(card=>card.id===active);
  return <>
    <ul className="profile-settings-menu" aria-label="프로필 설정">{cards.map(card=><li key={card.id}><button type="button" aria-haspopup="dialog" onClick={()=>open(card.id)}><span>{card.label}</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></li>)}</ul>
    {cards.map(card=><PopupDialog key={card.id} title={card.label} open={active===card.id} onClose={()=>requestClose(card)}><div className="profile-panel"><CloseProfileCard value={close}>{card.content}</CloseProfileCard></div></PopupDialog>)}
    <ConfirmDialog open={confirming&&!!current} title="변경한 내용을 삭제하겠습니까?" message="지금 돌아가면 변경한 내용이 모두 삭제됩니다." confirmLabel="삭제" cancelLabel="계속 변경" onConfirm={()=>current&&discard(current)} onCancel={()=>setConfirming(false)}/>
  </>;
}
