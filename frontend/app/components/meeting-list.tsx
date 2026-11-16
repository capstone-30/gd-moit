'use client';
import {meetingTypes} from '../../../shared/meeting-types';
import {useState} from 'react';
import {MeetingCard} from './meeting-card';
import {usePaginatedData,useData,loadAvailabilityContext,AvailabilityReminder,PageButtons,Heading,Loading,Retry,type MeetingSummary} from './client';

export default function MeetingList(){
  const [type,setType]=useState('');
  const q=new URLSearchParams({membership:'unjoined'});
  if(type)q.set('type',type);
  const state=usePaginatedData<MeetingSummary>(`meetings?${q}`),context=useData(loadAvailabilityContext).data;
  const filtered=Boolean(type);
  function applyType(next:string){state.reset();setType(next);}
  return <>
    <Heading title="모임 찾기" description="열린 모임을 둘러보세요. 내 시간과 겹치는 모임부터 보여드려요."/>
    {context?.c.term&&!context.times?.registered&&<AvailabilityReminder>등록하면 내 시간과 겹치는 모임을 먼저 보여드려요.</AvailabilityReminder>}
      <section className="discovery" aria-label="모임 탐색">
        <fieldset className="type-filters discovery-type-filters"><legend className="sr-only">모임 유형</legend>{[['','전체'],...Object.entries(meetingTypes)].map(([value,label])=><label key={value}><input type="radio" name="type" aria-label={label} value={value} checked={type===value} onChange={()=>applyType(value)}/><span>{label}</span></label>)}</fieldset>
        <div className="discovery-results">
        <div className="section-heading results-heading"><h2>열린 모임</h2><p className="help" role="status">{state.loading?'모임을 찾고 있어요':state.error?'목록을 불러오지 못했어요':state.data?`현재 페이지 ${state.data.data.length}개${state.data.nextCursor?' · 다음 페이지 있음':''}`:''}</p></div>
        <div className="results" aria-busy={state.loading}>
          <Retry error={state.error} reload={state.reload}/>
          {state.loading&&<Loading/>}
          {!state.loading&&!state.error&&state.data&&<>
            {state.data.data.length===0?<div className="empty-state"><span className="empty-mark" aria-hidden="true">{filtered?'⌕':'＋'}</span><h3>{filtered?'조건에 맞는 모임이 없어요':'아직 열린 모임이 없어요'}</h3><p>{filtered?'다른 유형을 선택하거나 전체 모임을 확인해보세요.':'관심 있는 주제로 첫 모임을 열어보세요.'}</p>{filtered?<button className="button" onClick={()=>applyType('')}>전체 모임 보기</button>:<a className="button primary" href="/meetings/new">모임 열기</a>}</div>:
            <ul className="meetings">{state.data.data.map(m=><MeetingCard key={m.id} meeting={m}/>)}</ul>}
            <nav className="form-actions pagination" aria-label="모임 목록 페이지"><PageButtons {...state} nextCursor={state.data.nextCursor} labels={['이전','다음']}/></nav>
          </>}
        </div>
        </div>
      </section>
  </>;
}
