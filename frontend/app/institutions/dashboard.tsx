'use client';
import {useState} from 'react';
import {meetingTypes,periods,summarizeDemo,type MeetingType} from './demo';

export default function Dashboard() {
  const [month,setMonth]=useState('2026-10');
  const [type,setType]=useState<MeetingType|''>('');
  const summary=summarizeDemo(month,type);
  const periodLabel=month?`${month.slice(0,4)}년 ${Number(month.slice(5))}월`:'전체 기간';
  function reset() {setMonth('');setType('');}
  return <div className="institution-page">
    <header className="page-heading"><div><span className="badge">B2B · 대학 담당자 시연</span><h1>캠퍼스 모임 현황</h1><p className="lede">어떤 주제로 모이고, 얼마나 함께하는지 살펴보세요.</p></div></header>
    <aside className="institution-notice" aria-label="시연 데이터 안내"><strong>모든 수치는 합성 데이터입니다.</strong><p>실제 학교·학생의 활동을 나타내지 않으며 실사용자 정보나 집계는 제공하지 않습니다.</p></aside>
    <section className="institution-filters" aria-label="현황 조회 조건">
      <div><label htmlFor="institution-month">개설 월</label><select id="institution-month" value={month} onChange={e=>setMonth(e.target.value)}><option value="">전체 기간</option>{periods.map(p=><option key={p} value={p}>{p.slice(0,4)}년 {Number(p.slice(5))}월</option>)}</select></div>
      <div><label htmlFor="institution-type">모임 유형</label><select id="institution-type" value={type} onChange={e=>setType(e.target.value as MeetingType|'')}><option value="">전체 유형</option>{Object.entries(meetingTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
      <button className="button" onClick={reset}>전체 보기</button>
    </section>
    <p className="help" role="status">{periodLabel} · {type?meetingTypes[type]:'전체 유형'} · 합성 모임 {summary.meetings}개</p>
    <dl className="institution-metrics" aria-label="합성 데이터 요약">
      {[['개설 모임',summary.meetings,'개'],['시간 확정 모임',summary.confirmed,'개'],['참여 건수',summary.members,'건'],['정원 충원율',summary.fillRate,'%']].map(([label,value,unit])=><div key={label}><dt>{label}</dt><dd>{value}<span>{unit}</span></dd></div>)}
    </dl>
    <section className="institution-topics" aria-labelledby="institution-topics-title">
      <div className="section-heading"><h2 id="institution-topics-title">주제별 현황</h2><span className="help">합성 데이터 · 참여 건수 순</span></div>
      {summary.topics.length===0?<div className="empty-state"><h3>조건에 맞는 시연 모임이 없어요</h3><p>다른 개설 월이나 유형을 선택해보세요.</p><button className="button primary" onClick={reset}>전체 현황 보기</button></div>:<ul className="institution-topic-list">{summary.topics.map(row=><li key={row.topic}><div><h3>{row.topic}</h3><p className="help">개설 {row.meetings}개 · 시간 확정 {row.confirmed}개</p></div><strong>{row.members}<span>건 참여</span></strong></li>)}</ul>}
    </section>
    <section className="institution-definitions" aria-labelledby="institution-definitions-title"><h2 id="institution-definitions-title">지표를 읽는 방법</h2><p>참여 건수는 모임별 신청 인원을 합한 값으로, 같은 사람이 여러 모임에 참여하면 중복됩니다. 고유 학생 수나 실제 참석 인원이 아닙니다.</p><p>정원 충원율은 참여 건수를 전체 정원으로 나눈 값입니다. 시간 확정 모임은 일정이 정해진 모임이며, 행사 완료를 뜻하지 않습니다.</p></section>
  </div>;
}
