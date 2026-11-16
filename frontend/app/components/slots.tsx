'use client';
import type {Slot} from '../../../shared/contracts';
import {weekdays,slotLabel} from '../../../shared/slots';

export function Slots({slots,selected:current,onSelectedChange:updateSelected,readOnly=false}:{slots:Slot[],selected:number[]} & ({readOnly:true;onSelectedChange?:never}|{readOnly?:false;onSelectedChange:(slots:number[])=>void})) {
  const days=[...new Set(slots.map(s=>Math.floor(s.slot/100)))].sort((a,b)=>a-b);
  const rows=[...new Map(slots.map(s=>[`${s.slot%100}-${s.startsAt}-${s.endsAt}`,{period:s.slot%100,startsAt:s.startsAt,endsAt:s.endsAt}])).values()]
    .sort((a,b)=>a.period-b.period||a.startsAt.localeCompare(b.startsAt));
  return <fieldset className="timetable-fieldset"><legend className={readOnly?'sr-only':undefined}>{readOnly?'함께 가능한 시간표':'제안받을 수 있는 시간'}</legend>{!readOnly&&<p className="help">가능한 칸을 선택하세요. 선택은 참여 승낙이 아닙니다.</p>}{!slots.length?<p>운영 교시가 아직 설정되지 않았습니다.</p>:<>
    {!readOnly&&<div className="timetable-toolbar"><p className="selection-summary" role="status">{current.length?`${current.length}개 교시 선택됨`:'가능한 교시를 선택해주세요'}</p></div>}
    <div className="timetable-scroll" role="region" aria-label={readOnly?'함께 가능한 시간표, 좁은 화면에서는 좌우로 스크롤':'요일별 가능 시간표, 좁은 화면에서는 좌우로 스크롤'} tabIndex={0}>
      <table className="timetable"><caption className="sr-only">{readOnly?'체크된 교시는 참여자 모두 가능한 시간입니다':'요일별 가능 시간 선택'}</caption><thead><tr><th scope="col">교시 / 시간</th>{days.map(day=>{
        const daySlots=slots.filter(s=>Math.floor(s.slot/100)===day).map(s=>s.slot);
        const daySelected=daySlots.filter(slot=>current.includes(slot)).length;
        return <th scope="col" key={day}>{readOnly?weekdays[day]:<label className="day-select"><span>{weekdays[day]}</span><input type="checkbox" aria-label={`${weekdays[day]}요일 전체 선택`} checked={daySelected===daySlots.length} ref={node=>{if(node)node.indeterminate=daySelected>0&&daySelected<daySlots.length;}} onChange={e=>{
          const next=current.filter(slot=>!daySlots.includes(slot));
          if(e.target.checked)next.push(...daySlots);
          updateSelected?.(next);
        }}/></label>}</th>;
      })}</tr></thead>
        <tbody>{rows.map(row=><tr key={`${row.period}-${row.startsAt}-${row.endsAt}`}><th scope="row"><span>{row.period}교시</span><small>{row.startsAt.slice(0,5)}–{row.endsAt.slice(0,5)}</small></th>{days.map(day=>{
          const s=slots.find(s=>s.slot===day*100+row.period&&s.startsAt===row.startsAt&&s.endsAt===row.endsAt);
          if(!s)return <td key={day}><span className="slot-unavailable" aria-label="운영하지 않는 교시">—</span></td>;
          const selected=current.includes(s.slot);
          const label=`${slotLabel(s.slot)} ${s.startsAt.slice(0,5)}~${s.endsAt.slice(0,5)}`;
          return <td key={day}>{readOnly
            ? <span role="img" className={`slot-readonly ${selected?'is-selected':''}`} aria-label={`${label} ${selected?'모두 가능':'공통 시간 아님'}`}><span aria-hidden="true">{selected?'✓':''}</span></span>
            : <label className="slot"><input type="checkbox" name="slots" value={s.slot} checked={selected} onChange={e=>updateSelected?.(e.target.checked?[...current,s.slot]:current.filter(value=>value!==s.slot))} aria-label={label}/><span><span className="slot-check" aria-hidden="true">✓</span></span></label>}
          </td>;
        })}</tr>)}</tbody>
      </table>
    </div><p className="help timetable-help">{readOnly?'✓ 참여자 모두 가능한 시간':'요일로 전체 선택·해제 · 비워 두고 저장할 수 있어요.'}</p><p className="help timetable-scroll-hint">좁은 화면에서는 좌우로 밀어보세요.</p>
  </>}</fieldset>;
}
