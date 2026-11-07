'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {Slot} from './client';
import {analyzeTimetable,type Pixels} from './timetable-image';

const maxSide=2400;
const failure='시간표를 인식하지 못했어요. 요일·시간 격자와 수업 블록이 보이는 시간표 앱 화면을 캡처해 다시 올리거나 아래에서 직접 선택해주세요.';
const scrolled='시간표 첫 줄의 시각을 알 수 없어요. 요일 머리글과 오전 9시(1교시) 줄이 보이도록 시간표 맨 위부터 캡처해 다시 올려주세요.';

function readPixels(image:HTMLImageElement):Pixels {
  const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
  const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('canvas');
  context.drawImage(image,0,0,width,height);
  return context.getImageData(0,0,width,height);
}

export default function TimetableImageImport({slots,selected,onApply}:{slots:Slot[];selected:number[];onApply:(slots:number[])=>void}) {
  const id=useId(),input=useRef<HTMLInputElement>(null),attempt=useRef(0);
  const [preview,setPreview]=useState<{url:string;name:string;previous:number[];busy:number}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>()=>{attempt.current++;},[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview?.url]);
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
      const data=readPixels(image),result=analyzeTimetable(data,slots);
      if(!result.ok){URL.revokeObjectURL(url);setError(result.reason==='start'?scrolled:failure);return;}
      const previous=preview?.previous??[...selected];
      setPreview({url,name:file.name,previous,busy:result.busy.length});
      onApply(result.available);
    } catch {
      URL.revokeObjectURL(url);
      if(current===attempt.current)setError('이미지를 열 수 없습니다. 다른 이미지로 다시 시도해주세요.');
    } finally {if(current===attempt.current)setBusy(false);}
  }
  function cancel() {
    if(!preview)return;
    onApply(preview.previous);setPreview(null);setError('');input.current?.focus();
  }
  return <div className="timetable-import" aria-busy={busy}>
    <div className="timetable-import-heading"><div><h3>이미지로 빠르게 채우기</h3><p className="help" id={`${id}-help`}>시간표 앱 캡처에서 수업을 찾아 비는 교시를 채웁니다. 이미지는 서버에 전송되지 않습니다.</p></div>
      <label className={`button image-upload${busy||!slots.length?' is-disabled':''}`}>
        <span>{busy?'이미지 분석 중…':'시간표 이미지 업로드'}</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||!slots.length} aria-describedby={`${id}-help${error?` ${id}-error`:''}`} aria-invalid={Boolean(error)} onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/>
      </label>
    </div>
    {error&&<p className="error-message" id={`${id}-error`} role="alert">{error}</p>}
    {preview&&<div className="timetable-import-result">
      <img src={preview.url} alt="선택한 시간표 이미지 미리보기"/>
      <div>
        <p className="break-word">{preview.name}</p>
        <p className="help" role="status">수업이 있는 {preview.busy}개 교시를 빼고 나머지를 채웠어요. 아래 시간표를 확인해 직접 수정하고 저장해주세요.</p>
        <button type="button" className="text-link" onClick={cancel}>적용 취소</button>
      </div>
    </div>}
  </div>;
}
