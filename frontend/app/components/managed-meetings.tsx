'use client';
import {usePaginatedData,PageButtons,Heading,LoadFeedback,type MeetingSummary} from './client';
import {MeetingCard} from './meeting-card';
import {HostedMeetingCard,type HostedMeetingSummary} from './hosted-meetings';

export default function ManagedMeetings() {
  const meetings=usePaginatedData<MeetingSummary>('meetings?membership=joined');
  const hosted=usePaginatedData<HostedMeetingSummary>('hosted-meetings');
  const empty=meetings.data?.data.length===0&&hosted.data?.data.length===0;
  return <>
    <Heading title="모임 관리" description="내가 열거나 참여 중인 모임과 배정된 대학 주관 모임을 함께 관리해요."/>
    <section className="discovery managed-discovery" aria-label="참여 중인 모임 관리">
      <div className="discovery-results">
        <div className="section-heading results-heading"><h2>내 모임</h2></div>
        <div aria-label="자율 모임 불러오기"><LoadFeedback state={meetings}/></div>
        <div aria-label="대학 주관 모임 불러오기"><LoadFeedback state={hosted}/></div>
        <ul className="meetings" aria-busy={meetings.loading||hosted.loading}>
          {meetings.data?.data.map(m=><MeetingCard key={`meeting-${m.id}`} meeting={m} managed/>)}
          {hosted.data?.data.map(m=><HostedMeetingCard key={`hosted-${m.id}`} meeting={m}/>)}
        </ul>
        {empty&&!meetings.loading&&!hosted.loading&&!meetings.error&&!hosted.error&&<div className="empty-state"><h3>참여 중인 모임이 없어요</h3><p>모임 찾기에서 함께할 모임을 찾아보세요. 대학 주관 모임은 담당자가 배정하면 표시됩니다.</p><a className="button primary" href="/meetings">모임 찾기</a></div>}
        {(meetings.pages.length>1||meetings.data?.nextCursor)&&<nav className="pagination" aria-label="일반·회고 모임 페이지"><PageButtons {...meetings} nextCursor={meetings.data?.nextCursor} labels={['일반·회고 이전','일반·회고 다음']}/></nav>}
        {(hosted.pages.length>1||hosted.data?.nextCursor)&&<nav className="pagination" aria-label="대학 주관 모임 페이지"><PageButtons {...hosted} nextCursor={hosted.data?.nextCursor} labels={['대학 주관 이전','대학 주관 다음']}/></nav>}
      </div>
    </section>
  </>;
}
