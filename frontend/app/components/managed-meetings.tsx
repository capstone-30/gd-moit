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
        <section aria-labelledby="managed-ordinary-title" aria-busy={meetings.loading}>
          <div className="section-heading results-heading"><h2 id="managed-ordinary-title">자율 모임</h2></div>
          <LoadFeedback state={meetings}/>
          <ul className="meetings">{meetings.data?.data.map(m=><MeetingCard key={m.id} meeting={m} managed/>)}</ul>
          {!meetings.loading&&!meetings.error&&meetings.data?.data.length===0&&!empty&&<p className="muted">참여 중인 자율 모임이 없어요. <a className="text-link" href="/meetings">모임 찾기</a></p>}
          <nav className="pagination" aria-label="자율 모임 페이지"><PageButtons {...meetings} nextCursor={meetings.data?.nextCursor}/></nav>
        </section>
        <section aria-labelledby="managed-hosted-title" aria-busy={hosted.loading}>
          <div className="section-heading results-heading"><h2 id="managed-hosted-title">대학 주관 모임</h2></div>
          <LoadFeedback state={hosted}/>
          <ul className="meetings">{hosted.data?.data.map(m=><HostedMeetingCard key={m.id} meeting={m}/>)}</ul>
          {!hosted.loading&&!hosted.error&&hosted.data?.data.length===0&&!empty&&<p className="muted">배정된 모임이 없어요. 대학 담당자가 배정하면 여기에 표시돼요.</p>}
          <nav className="pagination" aria-label="대학 주관 모임 페이지"><PageButtons {...hosted} nextCursor={hosted.data?.nextCursor}/></nav>
        </section>
        {empty&&!meetings.loading&&!hosted.loading&&!meetings.error&&!hosted.error&&<div className="empty-state"><h3>참여 중인 모임이 없어요</h3><p>모임 찾기에서 함께할 모임을 찾아보세요. 대학 주관 모임은 담당자가 배정하면 표시됩니다.</p><a className="button primary" href="/meetings">모임 찾기</a></div>}
      </div>
    </section>
  </>;
}
