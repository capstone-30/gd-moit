'use client';
import {useState} from 'react';
import {cursorQuery,useApiData,CapacityDots,usePages,PageButtons,Heading,Loading,Retry,kinds,slotLabel,type MeetingSummary} from './client';

export default function MeetingList({managed=false}:{managed?:boolean}){
  const [type,setType]=useState('');
  const {pages,setPages,cursor,reset:resetPages}=usePages();

  const q=cursorQuery(cursor);
  q.set('membership',managed?'joined':'unjoined');
  if(type)q.set('type',type);
  const state=useApiData<MeetingSummary[]>(`meetings?${q}`);
  const filtered=Boolean(type);
  function applyType(next:string){resetPages();setType(next);}
  return <>
    <Heading title={managed?'모임 관리':'모임 찾기'} description={managed?'내가 열거나 참여 중인 모임의 일정과 참여를 관리해요.':'열린 모임을 둘러보세요. 내 시간과 겹치는 모임부터 보여드려요.'}/>
      <section className={`discovery${managed?' managed-discovery':''}`} aria-label={managed?'참여 중인 모임 관리':'모임 탐색'}>
        {!managed&&<fieldset className="type-filters discovery-type-filters"><legend className="sr-only">모임 유형</legend>{[['','전체'],...Object.entries(kinds)].map(([value,label])=><label key={value}><input type="radio" name="type" aria-label={label} value={value} checked={type===value} onChange={()=>applyType(value)}/><span>{label}</span></label>)}</fieldset>}
        <div className="discovery-results">
        <div className="section-heading results-heading"><h2>{managed?'내 모임':'열린 모임'}</h2><p className="help" role="status">{state.loading?'모임을 찾고 있어요':state.error?'목록을 불러오지 못했어요':state.data?`현재 페이지 ${state.data.data.length}개${state.data.nextCursor?' · 다음 페이지 있음':''}`:''}</p></div>
        <div className="results" aria-busy={state.loading}>
          <Retry error={state.error} reload={state.reload}/>
          {state.loading&&<Loading/>}
          {!state.loading&&!state.error&&state.data&&<>
            {state.data.data.length===0?<div className="empty-state"><span className="empty-mark" aria-hidden="true">{filtered?'⌕':'＋'}</span><h3>{filtered?'조건에 맞는 모임이 없어요':managed?'참여 중인 모임이 없어요':'아직 열린 모임이 없어요'}</h3><p>{filtered?'다른 유형을 선택하거나 전체 모임을 확인해보세요.':managed?'모임 찾기에서 함께할 모임을 찾아보세요.':'하단의 모임 열기에서 첫 모임을 만들어보세요.'}</p>{filtered?<button className="button" onClick={()=>applyType('')}>전체 모임 보기</button>:managed?<a className="button primary" href="/meetings">모임 찾기</a>:null}</div>:
            <ul className="meetings">{state.data.data.map(m=><MeetingCard key={m.id} meeting={m} managed={managed}/>)}</ul>}
            <nav className="form-actions pagination" aria-label="모임 목록 페이지"><PageButtons pages={pages} setPages={setPages} nextCursor={state.data.nextCursor} labels={['← 이전','다음 →']}/></nav>
          </>}
        </div>
        </div>
      </section>
  </>;
}

export function MeetingCard({meeting:m,managed=false}:{meeting:MeetingSummary;managed?:boolean}) {
  const href=managed?`/meetings/manage/${m.id}`:`/meetings/${m.id}`;
  const inactive=!managed&&(!m.canJoin||!m.overlapsMyAvailability);
  return <li className="meeting-row meeting-card" data-state={m.state} data-inactive={inactive||undefined}>
    <div className="meeting-card-top"><span className="badge">{kinds[m.type]}</span><CapacityDots capacity={m.capacity} memberCount={m.memberCount}/></div>
    <h3><a className="meeting-card-link" href={href} aria-label={`${m.topic} ${managed?'모임 관리':'상세 보기'}${inactive?' · 참여 불가':''}`}>{m.topic}</a></h3>
    <dl className="meeting-facts"><div><dt>장소</dt><dd>{m.place.name}</dd></div><div><dt>일정</dt><dd>{m.confirmation?`${m.confirmation.date} ${slotLabel(m.confirmation.slot)}`:m.state==='proposing'?'시간 조율 중':'일정 미정'}</dd></div></dl>
  </li>;
}
