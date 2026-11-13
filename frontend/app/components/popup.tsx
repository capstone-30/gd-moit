'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';

export function useFormDialog(onClose:()=>void,message='저장하지 않은 공지를 버리고 닫을까요?') {
  const [dirty,onDirtyChange]=useState(false),[busy,onBusy]=useState(false),[confirming,setConfirming]=useState(false);
  function discard() {
    if(busy)return;
    setConfirming(false);onDirtyChange(false);onClose();
  }
  function close() {
    if(busy)return;
    if(dirty)setConfirming(true);
    else onClose();
  }
  const confirmation=<ConfirmDialog open={confirming} title="입력을 버리고 닫을까요?" message={message} confirmLabel="입력 버리고 닫기" cancelLabel="계속 작성" onConfirm={discard} onCancel={()=>setConfirming(false)}/>;
  return {dirty,onDirtyChange,busy,onBusy,close,confirmation};
}

// Esc를 keydown에서 직접 처리한다. cancel만 막으면 Esc를 연달아 누를 때 브라우저가 막지 못하게 강제로 닫아 화면 상태와 어긋난다.
// 안쪽 팝업의 Esc가 바깥 팝업까지 닫지 않도록 전파를 멈춘다.
function escape(event:KeyboardEvent,close:()=>void) {
  if(event.key!=='Escape'||event.nativeEvent.isComposing)return;
  event.preventDefault();event.stopPropagation();close();
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
  return <dialog ref={dialog} className="popup-dialog" aria-labelledby={titleId} onKeyDown={event=>escape(event,onClose)} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}}>
    <header className="popup-heading"><h2 id={titleId}>{title}</h2><div className="popup-heading-controls">{actions}<button type="button" className="button" onClick={onClose}>닫기</button></div></header>
    <div className="popup-content">{children}</div>
  </dialog>;
}

export function ConfirmDialog({open,title,message,confirmLabel,cancelLabel,onConfirm,onCancel}:{open:boolean;title:string;message:string;confirmLabel:string;cancelLabel:string;onConfirm:()=>void;onCancel:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),titleId=useId(),messageId=useId();
  // 확인 창은 항상 마운트돼 autoFocus가 처음 한 번만 동작한다. 열 때마다 취소 버튼에 포커스를 둬 Enter로 위험 동작이 실행되지 않게 한다.
  useEffect(()=>{
    const node=dialog.current;
    if(open&&!node?.open){node?.showModal();cancel.current?.focus();}
    if(!open&&node?.open)node.close();
  },[open]);
  return <dialog ref={dialog} className="confirm-dialog" role="alertdialog" aria-labelledby={titleId} aria-describedby={messageId} onKeyDown={event=>escape(event,onCancel)} onCancel={event=>{event.preventDefault();event.stopPropagation();onCancel();}}>
    <h2 id={titleId}>{title}</h2>
    <p id={messageId}>{message}</p>
    <div className="confirm-actions">
      <button type="button" className="button danger" onClick={onConfirm}>{confirmLabel}</button>
      <button ref={cancel} type="button" className="button" onClick={onCancel}>{cancelLabel}</button>
    </div>
  </dialog>;
}

export default function Popup({title,children,className='',trigger,triggerClassName='button',actions}:{title:string;children:ReactNode;className?:string;trigger?:ReactNode;triggerClassName?:string;actions?:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <div className={`popup ${className}`}><button type="button" className={triggerClassName} title={triggerClassName.includes('management-button')?title:undefined} aria-haspopup="dialog" onClick={()=>setOpen(true)}>{trigger??title}</button><PopupDialog title={title} actions={actions} open={open} onClose={()=>setOpen(false)}>{children}</PopupDialog></div>;
}
