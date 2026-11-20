'use client';
import {usePaginatedData} from './data';
import {PageButtons,Heading,LoadFeedback} from './client';
import {type MeetingSummary} from '../../../shared/contracts';
import {MeetingCard} from './meeting-card';
import {HostedMeetingCard,type HostedMeetingSummary} from './hosted-meetings';

export default function ManagedMeetings() {
  const meetings=usePaginatedData<MeetingSummary>('meetings?membership=joined');
  const hosted=usePaginatedData<HostedMeetingSummary>('hosted-meetings');
  const showEmpty=meetings.data?.data.length===0&&hosted.data?.data.length===0&&!meetings.loading&&!hosted.loading&&!meetings.error&&!hosted.error;
  return <>
    <Heading title="모임 관리" description="내가 열거나 참여 중인 모임과 배정된 대학 주관 모임을 함께 관리해요."/>
    <section className="discovery managed-discovery" aria-label="참여 중인 모임 관리">
      <div className="discovery-results">
        {!showEmpty&&<>
          <section aria-labelledby="managed-ordinary-title" aria-busy={meetings.loading}>
            <div className="section-heading results-heading"><h2 id="managed-ordinary-title">자율 모임</h2>{meetings.data&&meetings.data.data.length>0&&<p className="help" role="status">현재 페이지 {meetings.data.data.length}개{meetings.data.nextCursor?' · 다음 페이지 있음':''}</p>}</div>
            <LoadFeedback state={meetings}/>
            {meetings.data&&meetings.data.data.length>0&&<ul className="meetings">{meetings.data.data.map(m=><MeetingCard key={m.id} meeting={m} managed/>)}</ul>}
            {!meetings.loading&&!meetings.error&&meetings.data?.data.length===0&&<p className="muted">참여 중인 자율 모임이 없어요. <a className="text-link" href="/meetings">모임 찾기</a></p>}
            {(meetings.pages.length>1||meetings.data?.nextCursor)&&<nav className="form-actions pagination" aria-label="자율 모임 페이지"><PageButtons {...meetings} nextCursor={meetings.data?.nextCursor}/></nav>}
          </section>
          <section aria-labelledby="managed-hosted-title" aria-busy={hosted.loading}>
            <div className="section-heading results-heading"><h2 id="managed-hosted-title">대학 주관 모임</h2>{hosted.data&&hosted.data.data.length>0&&<p className="help" role="status">현재 페이지 {hosted.data.data.length}개{hosted.data.nextCursor?' · 다음 페이지 있음':''}</p>}</div>
            <LoadFeedback state={hosted}/>
            {hosted.data&&hosted.data.data.length>0&&<ul className="meetings">{hosted.data.data.map(m=><HostedMeetingCard key={m.id} meeting={m}/>)}</ul>}
            {!hosted.loading&&!hosted.error&&hosted.data?.data.length===0&&<p className="muted">배정된 모임이 없어요. 대학 담당자가 배정하면 여기에 표시돼요.</p>}
            {(hosted.pages.length>1||hosted.data?.nextCursor)&&<nav className="form-actions pagination" aria-label="대학 주관 모임 페이지"><PageButtons {...hosted} nextCursor={hosted.data?.nextCursor}/></nav>}
          </section>
        </>}
        {showEmpty&&<div className="empty-state"><span className="empty-mark" aria-hidden="true">＋</span><h3>참여 중인 모임이 없어요</h3><p>열린 모임에 참여하거나 직접 모임을 열어보세요. 대학 주관 모임은 담당자가 배정하면 표시됩니다.</p><div className="form-actions"><a className="button primary" href="/meetings">모임 찾기</a><a className="button" href="/meetings/new">모임 열기</a></div></div>}
      </div>
    </section>
  </>;
}
