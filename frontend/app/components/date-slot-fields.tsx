'use client';
import {useState} from 'react';
import type {Slot} from './client';
import {SlotOptions} from './slot-options';

export function DateSlotFields({prefix,range,slots,initialDate='',initialSlot='',allowUndated=false,dateLabel='날짜 (오늘부터 28일 이내)',slotLabel='날짜와 같은 요일의 교시'}:{prefix:string;range:{min:string;max:string};slots:Slot[];initialDate?:string;initialSlot?:number|string;allowUndated?:boolean;dateLabel?:string;slotLabel?:string}) {
  const [date,setDate]=useState(initialDate);
  return <>
    <label htmlFor={`${prefix}-date`}>{dateLabel}</label><input id={`${prefix}-date`} name="date" type="date" value={date} min={range.min} max={range.max} required onChange={e=>setDate(e.target.value)}/>
    <label htmlFor={`${prefix}-slot`}>{slotLabel}</label><select key={allowUndated?undefined:date} id={`${prefix}-slot`} name="slot" defaultValue={initialSlot} required><option value="" disabled={!allowUndated}>교시 선택</option><SlotOptions slots={slots} date={date} allowUndated={allowUndated}/></select>
  </>;
}
