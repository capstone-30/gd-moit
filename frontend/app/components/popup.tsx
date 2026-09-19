'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';

export function PopupDialog({title,open,onClose,children}:{title:string;open:boolean;onClose:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(()=>{
    const node=dialog.current;
    if(open&&!node?.open)node?.showModal();
    if(!open&&node?.open)node.close();
    if(!open)return;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{node?.close();document.body.style.overflow=overflow;};
  },[open]);
  return <dialog ref={dialog} className="popup-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}}>
    <header className="popup-heading"><h2 id={titleId}>{title}</h2><button type="button" className="button" onClick={onClose}>닫기</button></header>
    <div className="popup-content">{children}</div>
  </dialog>;
}

export default function Popup({title,children,className='',trigger,triggerClassName='button'}:{title:string;children:ReactNode;className?:string;trigger?:ReactNode;triggerClassName?:string}) {
  const [open,setOpen]=useState(false);
  return <div className={`popup ${className}`}><button type="button" className={triggerClassName} aria-haspopup="dialog" onClick={()=>setOpen(true)}>{trigger??title}</button><PopupDialog title={title} open={open} onClose={()=>setOpen(false)}>{children}</PopupDialog></div>;
}
