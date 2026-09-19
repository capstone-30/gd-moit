import {Slots,slotLabel,type Slot} from './client';

export function CommonTimes({slots=[],termSlots=[],confirmed=false}:{slots?:number[];termSlots?:Slot[];confirmed?:boolean}) {
  const sorted=[...new Set(slots)].sort((a,b)=>a-b);
  return <section className="detail-section vertical-card common-times">
    <div className="section-heading"><h2>함께 가능한 시간</h2>{sorted.length>0&&<span className="help">{sorted.length}개 교시</span>}</div>
    {sorted.length>0?termSlots.length>0?<Slots slots={termSlots} selected={sorted} readOnly/>:<p>{sorted.map(slotLabel).join(' · ')}</p>:<p className="muted">{confirmed?'모두 겹치는 교시는 없어요. 전원이 수락한 확정 일정은 유지됩니다.':'모두 겹치는 교시가 없어요. 개설자가 다른 시간을 제안할 수 있습니다.'}</p>}
  </section>;
}
