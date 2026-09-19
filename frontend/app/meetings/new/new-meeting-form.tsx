'use client';
import {useState} from 'react';
import {api,CapacityDots,Form,kinds,type Config,type Meeting} from '../../components/client';

export default function NewMeetingForm({config:c}:{config:Config}) {
  const [capacity,setCapacity]=useState(3);
  const [type,setType]=useState('study');
  return <Form dirtyGuard label="모임 열기" submit={async f=>{
    const {data}=await api<Meeting>('meetings',{method:'POST',body:{termId:c.term!.id,topic:String(f.get('topic')),type:String(f.get('type')),placeId:String(f.get('place')),capacity,twoPersonAcknowledged:capacity===2}});
    return `/meetings/manage/${data.id}`;
  }}>
    <section className="meeting-card new-meeting-card" aria-label="새 모임">
      <div className="meeting-card-top">
        <div className="compact-selection new-kind">
          <span className="badge" aria-hidden="true">{kinds[type]} <span>⌄</span></span>
          <select name="type" aria-label={`모임 유형 선택: ${kinds[type]}`} value={type} onChange={e=>setType(e.target.value)} required>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </div>
        <div className="compact-selection new-capacity">
          <CapacityDots capacity={capacity} memberCount={1}/><span className="help" aria-hidden="true">{capacity}명</span><span aria-hidden="true">⌄</span>
          <select id="capacity" aria-label={`인원 선택: 정원 ${capacity}명 (개설자 포함)`} value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>{[3,4,2].map(n=><option key={n} value={n}>{n}명{n===3?' · 기본':n===2?' · 2인 모임 명시 선택':''}</option>)}</select>
        </div>
      </div>
      <div className="new-topic">
        <label className="sr-only" htmlFor="new-topic">모임 제목</label>
        <input id="new-topic" name="topic" maxLength={100} required placeholder="모임 제목을 입력해주세요"/>
      </div>
      <div className="new-place">
        <label className="muted" htmlFor="place">장소</label>
        <select id="place" name="place" required defaultValue="" aria-describedby="new-place-help"><option value="" disabled>장소를 선택해주세요</option>{c.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <p id="new-place-help" className="sr-only">학교에서 지정한 캠퍼스 내·주변 공개 장소만 사용할 수 있습니다.</p>
      </div>
      <div className="new-schedule"><span className="muted">일정</span><button type="button" popoverTarget="new-schedule-help">일정 미정 <span aria-hidden="true">ⓘ</span></button></div>
      <div id="new-schedule-help" className="new-schedule-help" popover="auto" aria-labelledby="new-schedule-title">
        <h2 id="new-schedule-title">일정은 참여 후 확정해요</h2>
        <p>시간 미정으로 모임을 열어요. 참여자가 모이면 모임 관리에서 함께 가능한 시간을 확인하고 개설자가 일정을 확정합니다.</p>
        <button type="button" className="button" popoverTarget="new-schedule-help" popoverTargetAction="hide">닫기</button>
      </div>
    </section>
    <p className="help">카드의 유형·인원·제목·장소를 눌러 수정하세요.</p>
  </Form>;
}
