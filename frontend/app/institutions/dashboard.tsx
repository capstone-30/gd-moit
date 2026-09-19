'use client';
import {useState} from 'react';
import {esgAreas,meetingTypes,periods,summarizeDemo,type MeetingType} from './demo';

export default function Dashboard() {
  const [month,setMonth]=useState('2026-10');
  const [type,setType]=useState<MeetingType|''>('');
  const summary=summarizeDemo(month,type);
  const periodLabel=month?`${month.slice(0,4)}년 ${Number(month.slice(5))}월`:'전체 기간';
  function reset() {setMonth('');setType('');}
  return <div className="institution-page esg-dashboard">
    <header className="page-heading"><div><h1>ESG 성과</h1><p className="lede">환경을 위한 실천, 함께하는 배움, 투명한 공동체 운영.<br/>캠퍼스의 활동을 세 가지 관점으로 살펴보세요.</p></div><span className="badge">합성 데이터 시연</span></header>
    <section className="institution-filters" aria-label="현황 조회 조건">
      <div><label htmlFor="institution-month">개설 월</label><select id="institution-month" value={month} onChange={e=>setMonth(e.target.value)}><option value="">전체 기간</option>{periods.map(p=><option key={p} value={p}>{p.slice(0,4)}년 {Number(p.slice(5))}월</option>)}</select></div>
      <div><label htmlFor="institution-type">모임 유형</label><select id="institution-type" value={type} onChange={e=>setType(e.target.value as MeetingType|'')}><option value="">전체 유형</option>{Object.entries(meetingTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
      <button className="button" onClick={reset}>전체 보기</button>
    </section>
    <p className="help" role="status">{periodLabel} · {type?meetingTypes[type]:'전체 유형'} · 합성 모임 {summary.meetings}개</p>
    <section className="esg-overview" aria-labelledby="esg-overview-title">
      <div><h2 id="esg-overview-title">ESG 영역별 활동</h2><p className="help">활동 주제에 따른 시연용 분류입니다. ESG 평가 점수를 뜻하지 않습니다.</p></div>
      <div className="esg-areas">{summary.areas.map(row=>{
        const area=esgAreas[row.area];
        return <article className="esg-area" key={row.area}>
          <div className="esg-area-heading"><span className="esg-letter" aria-hidden="true">{row.area}</span><div><h3>{area.label}<span className="sr-only"> ({row.area})</span></h3><p className="help" lang="en">{area.english}</p></div></div>
          <p className="esg-area-description">{area.description}</p><p className="help">{area.examples}</p>
          <p className="esg-area-value"><strong>{row.members}</strong>건 참여</p>
          <progress value={row.members} max={summary.members||1} aria-label={`${area.label} 영역 참여 건수`} />
          <p className="help">모임 {row.meetings}개 · 시간 확정 {row.confirmed}개</p>
        </article>;
      })}</div>
      <p className="help">막대는 조회한 전체 참여 건수 중 각 영역의 비중입니다. 모임은 한 영역에만 포함됩니다.</p>
    </section>
    <section aria-labelledby="esg-summary-title"><h2 id="esg-summary-title">활동 운영 현황</h2>
      <dl className="institution-metrics" aria-label="합성 데이터 요약">
        {[['개설 모임',summary.meetings,'개'],['시간 확정 모임',summary.confirmed,'개'],['참여 건수',summary.members,'건'],['정원 충원율',summary.fillRate,'%']].map(([label,value,unit])=><div key={label}><dt>{label}</dt><dd>{value}<span>{unit}</span></dd></div>)}
      </dl>
    </section>
    <section className="institution-topics" aria-labelledby="institution-topics-title">
      <div className="section-heading"><h2 id="institution-topics-title">활동 주제별 참여</h2><span className="help">참여 건수 순</span></div>
      {summary.topics.length===0?<div className="empty-state"><h3>조건에 맞는 시연 모임이 없어요</h3><p>다른 개설 월이나 유형을 선택해보세요.</p><button className="button primary" onClick={reset}>전체 현황 보기</button></div>:<ul className="institution-topic-list">{summary.topics.map(row=><li key={row.topic}><div><h3>{row.topic}</h3><p className="help">개설 {row.meetings}개 · 시간 확정 {row.confirmed}개</p></div><strong>{row.members}<span>건 참여</span></strong></li>)}</ul>}
    </section>
    <aside className="institution-notice" aria-label="지표 안내"><strong>합성 데이터로 보는 활동 현황</strong><p>실제 학교·학생의 활동이나 ESG 평가 결과가 아닙니다. 참여 건수는 모임별 신청 인원의 합으로 중복을 포함하며 실제 참석 인원이 아닙니다. 충원율은 참여 건수 ÷ 전체 정원입니다. 시간 확정은 행사 완료를 뜻하지 않습니다.</p></aside>
  </div>;
}
