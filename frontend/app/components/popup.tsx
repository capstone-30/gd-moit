'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';

export function useFormDialog(onClose:()=>void,message='저장하지 않은 공지를 버리고 닫을까요?') {
  const [dirty,onDirtyChange]=useState(false),[busy,onBusy]=useState(false);
  function close() {
    if(busy||dirty&&!window.confirm(message))return;
    onDirtyChange(false);
    onClose();
  }
  return {dirty,onDirtyChange,busy,onBusy,close};
}

export function PopupDialog({title,open,onClose,children,actions}:{title:string;open:boolean;onClose:()=>void;children:ReactNode;actions?:ReactNode}) {
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
    <header className="popup-heading"><h2 id={titleId}>{title}</h2><div className="popup-heading-controls">{actions}<button type="button" className="button" onClick={onClose}>닫기</button></div></header>
    <div className="popup-content">{children}</div>
  </dialog>;
}

export default function Popup({title,children,className='',trigger,triggerClassName='button',actions}:{title:string;children:ReactNode;className?:string;trigger?:ReactNode;triggerClassName?:string;actions?:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <div className={`popup ${className}`}><button type="button" className={triggerClassName} title={triggerClassName.includes('management-button')?title:undefined} aria-haspopup="dialog" onClick={()=>setOpen(true)}>{trigger??title}</button><PopupDialog title={title} actions={actions} open={open} onClose={()=>setOpen(false)}>{children}</PopupDialog></div>;
}
