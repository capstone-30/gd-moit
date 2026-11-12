'use client';
import {createContext,useEffect,useState,type ReactNode} from 'react';
import {ConfirmDialog,PopupDialog} from './popup';

// 저장 후 닫을 때 메시지를 넘기면 닫힌 팝업 대신 설정 메뉴 위에 표시한다.
export const CloseProfileCard=createContext((_message?:string)=>{});

export type ProfileCard={id:string;label:string;content:ReactNode;dirty?:boolean;busy?:boolean;onDiscard?:()=>void};

export default function ProfileCards({cards}:{cards:ProfileCard[]}) {
  const [active,setActive]=useState<string|null>(null),[confirming,setConfirming]=useState(false),[notice,setNotice]=useState('');
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
    setNotice('');setActive(id);
  }
  function close(message='') {
    window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
    setNotice(message);setActive(null);
  }
  function requestClose(card:ProfileCard) {
    if(card.busy)return;
    if(card.dirty)setConfirming(true);
    else close();
  }
  function discard(card:ProfileCard) {
    if(card.busy)return;
    setConfirming(false);
    card.onDiscard?.();
    close();
  }
  const current=cards.find(card=>card.id===active);
  return <>
    <p className="feedback success-message" role="status">{notice}</p>
    <ul className="profile-settings-menu" aria-label="프로필 설정">{cards.map(card=><li key={card.id}><button type="button" aria-haspopup="dialog" onClick={()=>open(card.id)}><span>{card.label}</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></li>)}</ul>
    {cards.map(card=><PopupDialog key={card.id} title={card.label} open={active===card.id} onClose={()=>requestClose(card)}><div className="profile-panel"><CloseProfileCard value={close}>{card.content}</CloseProfileCard></div></PopupDialog>)}
    <ConfirmDialog open={confirming&&!!current} title="변경한 내용을 삭제하겠습니까?" message="지금 돌아가면 변경한 내용이 모두 삭제됩니다." confirmLabel="삭제" cancelLabel="계속 변경" onConfirm={()=>current&&discard(current)} onCancel={()=>setConfirming(false)}/>
  </>;
}
