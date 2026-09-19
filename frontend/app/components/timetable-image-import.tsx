'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {Slot} from './client';
import {mockImageAvailability} from './availability';

export default function TimetableImageImport({slots,selected,onApply}:{slots:Slot[];selected:number[];onApply:(slots:number[])=>void}) {
  const id=useId(),input=useRef<HTMLInputElement>(null),attempt=useRef(0);
  const [preview,setPreview]=useState<{url:string;name:string;previous:number[]}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>()=>{attempt.current++;},[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
  async function choose(file:File|undefined) {
    if(!file)return;
    const current=++attempt.current;
    setError('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024) {
      setError('PNG·JPG·WebP 이미지를 10MB 이하로 선택해주세요.');return;
    }
    setBusy(true);
    const url=URL.createObjectURL(file);
    try {
      const image=new Image();image.src=url;await image.decode();
      if(current!==attempt.current){URL.revokeObjectURL(url);return;}
      setPreview({url,name:file.name,previous:[...selected]});
      onApply(mockImageAvailability(slots));
    } catch {
      URL.revokeObjectURL(url);
      if(current===attempt.current)setError('이미지를 열 수 없습니다. 다른 이미지로 다시 시도해주세요.');
    } finally {if(current===attempt.current)setBusy(false);}
  }
  return <div className="timetable-import" aria-busy={busy}>
    <div className="timetable-import-heading"><div><h3>이미지로 빠르게 채우기 <span className="badge">목업</span></h3><p className="help" id={`${id}-help`}>실제 인식 대신 예시 공강을 표시합니다. 이미지는 서버에 전송되지 않습니다.</p></div>
      <label className={`button image-upload${busy||!slots.length?' is-disabled':''}`}>
        <span>{busy?'이미지 확인 중…':'시간표 이미지 업로드'}</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||!slots.length} aria-describedby={`${id}-help${error?` ${id}-error`:''}`} aria-invalid={Boolean(error)} onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/>
      </label>
    </div>
    {error&&<p className="error-message" id={`${id}-error`} role="alert">{error}</p>}
    {preview&&<div className="timetable-import-result">
      <img src={preview.url} alt="선택한 시간표 이미지 미리보기"/>
      <div><p className="break-word">{preview.name}</p><p className="help" role="status">예시 공강을 표시했습니다. 아래 시간표를 직접 수정하고 저장해주세요.</p><button type="button" className="text-link" onClick={()=>{onApply(preview.previous);setPreview(null);setError('');input.current?.focus();}}>적용 취소</button></div>
    </div>}
  </div>;
}
