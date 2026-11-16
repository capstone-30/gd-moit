'use client';
import {useState} from 'react';
import type {Slot} from './client';
import {SlotOptions} from './slot-options';
import {slotMatchesDate} from '../../../shared/date';

export function DateSlotFields({prefix,range,slots,initialDate='',initialSlot='',allowUndated=false,dateLabel='날짜 (오늘부터 28일 이내)',slotLabel='날짜와 같은 요일의 교시'}:{prefix:string;range:{min:string;max:string};slots:Slot[];initialDate?:string;initialSlot?:number|string;allowUndated?:boolean;dateLabel?:string;slotLabel?:string}) {
  const [date,setDate]=useState(initialDate);
  const empty=Boolean(date)&&!slots.some(s=>slotMatchesDate(date,s.slot));
  return <>
    <label htmlFor={`${prefix}-date`}>{dateLabel}</label><input id={`${prefix}-date`} name="date" type="date" value={date} min={range.min} max={range.max} required onChange={e=>setDate(e.target.value)}/>
    <label htmlFor={`${prefix}-slot`}>{slotLabel}</label><select key={date} id={`${prefix}-slot`} name="slot" defaultValue={initialSlot} required aria-describedby={empty?`${prefix}-slot-help`:undefined}><option value="" disabled={!allowUndated}>교시 선택</option><SlotOptions slots={slots} date={date} allowUndated={allowUndated}/></select>
    {empty&&<p id={`${prefix}-slot-help`} className="help" role="status">선택한 날짜에는 가능한 교시가 없습니다. 다른 날짜를 선택해주세요.</p>}
  </>;
}
