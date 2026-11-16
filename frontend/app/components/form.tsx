'use client';
import {createContext,useEffect,useRef,useState,type ReactNode,type FormEvent} from 'react';
import {RequestError} from './api';
import {ConfirmDialog} from './popup';
import {Feedback} from './client';

export const FormChange=createContext(()=>{});
export function Form({children,submit,label='저장',successMessage='완료했습니다.',danger=false,dirtyGuard=false,disabled=false,onConflict,onBusy,dirty:controlledDirty,onDirtyChange,submitContent,confirmation}:{confirmation?:{title:string;message:string;confirmLabel:string}|null,children:ReactNode,submit:(form:FormData)=>Promise<unknown>,submitContent?:ReactNode,label?:string,successMessage?:string,danger?:boolean,dirtyGuard?:boolean,disabled?:boolean,onConflict?:()=>void,onBusy?:(busy:boolean)=>void,dirty?:boolean,onDirtyChange?:(dirty:boolean)=>void}) {
  const [status,setStatus]=useState<'idle'|'submitting'|'success'|Error>('idle');
  const busy=status==='submitting',error=status instanceof Error?status:undefined;
  const [localDirty,setLocalDirty]=useState(false);
  const dirty=controlledDirty??localDirty,setDirty=onDirtyChange??setLocalDirty;
  const [destination,setDestination]=useState<string>();

  useEffect(()=>{
    if(destination&&!dirty) window.location.assign(destination);
  },[destination,dirty]);
  useEffect(()=>{
    if(!dirtyGuard||!dirty) return;
    const guard=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue='';
    };
    window.addEventListener('beforeunload',guard);
    return()=>window.removeEventListener('beforeunload',guard);
  },[dirtyGuard,dirty]);

  const [pending,setPending]=useState<FormData>();
  // 제출 중에는 fieldset이 비활성이라 누른 버튼의 포커스가 사라진다. 처리가 끝나면 포커스를 잃은 경우에만 그 버튼으로 되돌린다.
  const restoreFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    const target=restoreFocus.current;
    if(busy||!target)return;
    restoreFocus.current=null;
    if(target.isConnected&&(!document.activeElement||document.activeElement===document.body))target.focus();
  },[busy]);
  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    const submitter=(event.nativeEvent as SubmitEvent).submitter;
    restoreFocus.current=submitter instanceof HTMLElement?submitter:document.activeElement instanceof HTMLElement?document.activeElement:null;
    const form=new FormData(event.currentTarget);
    if(confirmation){setPending(form);return;}
    await perform(form);
  }
  async function perform(form:FormData) {
    setPending(undefined);
    setStatus('submitting');
    onBusy?.(true);
    try {
      const result=await submit(form);
      setDirty(false);
      setStatus('success');
      if(typeof result==='string') setDestination(result);
    } catch(error) {
      setStatus(error instanceof RequestError?error:new Error('연결에 실패했습니다. 입력을 유지하고 다시 시도해주세요.'));
      if(error instanceof RequestError && ['VERSION_CONFLICT','PROPOSAL_STALE'].includes(error.code)) onConflict?.();
    } finally {
      onBusy?.(false);
    }
  }

  function changed(){setDirty(true);setStatus(value=>value==='success'?'idle':value);}
  const submitButton=<button className={`button ${danger?'danger':'primary'}`} type="submit">{busy?'처리 중…':label}</button>;
  return <><form className="stack" aria-busy={busy} onSubmit={send} onChange={changed}>
    <fieldset disabled={busy||disabled} className="stack">
      <FormChange value={changed}>{children}</FormChange>
      {dirtyGuard&&dirty&&<p className="unsaved-hint" role="status">변경한 내용이 있습니다. 저장해 반영해주세요.</p>}
      {submitContent?<div className="form-submit-panel">{submitContent}{submitButton}</div>:submitButton}
    </fieldset>
    <Feedback error={error}/>
    <p className="feedback success-message" role="status">{status==='success'?successMessage:busy?'처리 중입니다.':''}</p>
  </form>{confirmation&&<ConfirmDialog open={!!pending} {...confirmation} cancelLabel="계속 수정" onCancel={()=>setPending(undefined)} onConfirm={()=>{if(pending&&!busy)void perform(pending);}}/>}</>;
}
