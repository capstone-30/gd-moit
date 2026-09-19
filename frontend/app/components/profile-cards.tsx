'use client';
import {useEffect,useRef,useState,type ReactNode,type KeyboardEvent} from 'react';

export default function ProfileCards({cards}:{cards:{id:string;label:string;content:ReactNode}[]}) {
  const [active,setActive]=useState(0);
  const tabs=useRef<(HTMLButtonElement|null)[]>([]);

  function move(index:number) {
    if(index<0||index>=cards.length)return;
    setActive(index);
    window.history.replaceState(window.history.state,'',`#${cards[index].id}`);
  }
  useEffect(()=>{
    function fromHash() {
      const index=cards.findIndex(card=>`#${card.id}`===window.location.hash);
      if(index>=0)setActive(index);
    }
    fromHash();
    window.addEventListener('hashchange',fromHash);
    return()=>{window.removeEventListener('hashchange',fromHash);};
  },[cards]);

  function keydown(event:KeyboardEvent<HTMLButtonElement>,index:number) {
    const next=event.key==='ArrowRight'?Math.min(index+1,cards.length-1):event.key==='ArrowLeft'?Math.max(index-1,0):event.key==='Home'?0:event.key==='End'?cards.length-1:null;
    if(next===null)return;
    event.preventDefault();move(next);tabs.current[next]?.focus({preventScroll:true});
  }
  return <div className="profile-tabs">
    <div className="profile-tabs-menu" role="tablist" aria-label="프로필 기능">{cards.map((card,index)=><button key={card.id} ref={node=>{tabs.current[index]=node;}} id={`${card.id}-tab`} role="tab" type="button" aria-selected={active===index} aria-controls={card.id} tabIndex={active===index?0:-1} onClick={()=>move(index)} onKeyDown={event=>keydown(event,index)}>{card.label}</button>)}</div>
    {cards.map((card,index)=><div key={card.id} id={card.id} role="tabpanel" aria-labelledby={`${card.id}-tab`} hidden={active!==index} tabIndex={0} className="profile-panel">{card.content}</div>)}
  </div>;
}
