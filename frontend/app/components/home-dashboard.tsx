'use client';
import type {ReactNode} from 'react';
import {loadAvailabilityContext,useData,useApiData,LoadFeedback,Heading,type Availability,type Config,type MeetingSummary} from './client';
import {MeetingCard} from './meeting-card';
import {HostedMeetingCard,type HostedMeetingSummary} from './hosted-meetings';

export function HomeMeetings({id,title,description,state,empty,children}:{id:string;title:string;description:string;state:ReturnType<typeof useApiData<unknown[]>>;empty:ReactNode;children:ReactNode}) {
  return <section className="home-meetings" aria-labelledby={id} aria-busy={state.loading}>
    <div className="home-section-heading"><div><h2 id={id}>{title}</h2><p className="help">{description}</p></div><a className="text-link" href="/meetings/manage">전체 보기 <span aria-hidden="true">→</span></a></div>
    <LoadFeedback state={state}/>
    {state.data&&(state.data.data.length?<ul className="meetings">{children}</ul>:<div className="home-card home-empty">{empty}</div>)}
  </section>;
}

export function AvailabilitySummary({term,times}:{term:Config['term'];times:Availability|null}) {
  return <>
    <div className="home-card-heading"><h2 id="home-times-title">내 가능 시간</h2><span className="badge">{term?'이번 학기':'학기 미설정'}</span></div>
    {term?<><p className="home-availability-value">{times?.registered?<><strong>{times.slots.length}</strong><span>개 교시</span></>:<strong className="home-unregistered">아직 등록 전이에요</strong>}</p><p className="muted">{times?.registered?'저장한 가능 시간으로 함께할 모임을 찾아요.':'함께할 수 있는 시간을 먼저 알려주세요.'}</p></>:<p className="muted">학기가 설정되면 가능 시간을 등록할 수 있어요.</p>}
    <a className="text-link home-card-bottom" href="/profile#availability">{times?.registered?'가능 시간 수정':'가능 시간 확인'} <span aria-hidden="true">↗</span></a>
  </>;
}

export default function HomeDashboard() {
  const context=useData(loadAvailabilityContext);
  const meetings=useApiData<MeetingSummary[]>('meetings?membership=joined&limit=2');
  const hosted=useApiData<HostedMeetingSummary[]>('hosted-meetings?limit=2');
  return <div className="home-dashboard">
    <Heading title="함께할 시간을 찾아요" description="작은 만남부터, 모잇과 함께 시작해요."/>
    <div className="home-overview">
      <section className="home-card home-start" aria-labelledby="home-start-title">
        <div className="home-start-symbol" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="17" cy="16" r="6"/><circle cx="33" cy="20" r="5"/><path d="M5 38v-3a12 12 0 0 1 24 0v3m4-10a10 10 0 0 1 10 10"/></svg></div>
        <div><h2 id="home-start-title">같은 관심사, 새로운 만남</h2><p>함께 공부하거나, 커피 한 잔 나누거나.<br/>우리 학교에서 함께할 사람을 만나보세요.</p></div>
        <div className="home-actions"><a className="button primary" href="/meetings">모임 찾기 <span aria-hidden="true">→</span></a><a className="button" href="/meetings/new">모임 열기 <span aria-hidden="true">+</span></a></div>
      </section>
      <section className="home-card home-availability" aria-labelledby="home-times-title" aria-busy={context.loading}>
        {!context.data&&<h2 id="home-times-title">내 가능 시간</h2>}
        <LoadFeedback state={context}/>
        {context.data&&<AvailabilitySummary term={context.data.c.term} times={context.data.times}/>}
      </section>
    </div>
    <HomeMeetings id="home-meetings-title" title="참여 중인 모임" description="최근 개설된 일반·회고 모임" state={meetings}
      empty={<><h3>첫 모임을 만나볼까요?</h3><p className="muted">관심 있는 모임에 참여하면 이곳에서 이어볼 수 있어요.</p><a className="text-link" href="/meetings">열린 모임 둘러보기 <span aria-hidden="true">→</span></a></>}>
      {meetings.data?.data.map(m=><MeetingCard key={m.id} meeting={m} managed/>)}
    </HomeMeetings>
    <HomeMeetings id="home-hosted-title" title="대학 주관 모임" description="배정된 모임의 일정과 서류 확인" state={hosted}
      empty={<><h3>배정된 모임이 없어요</h3><p className="muted">대학 담당자가 모임을 배정하면 여기에 표시돼요.</p></>}>
      {hosted.data?.data.map(m=><HostedMeetingCard key={m.id} meeting={m}/>)}
    </HomeMeetings>
  </div>;
}
