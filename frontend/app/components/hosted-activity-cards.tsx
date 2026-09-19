'use client';
import {useContext,useId,useRef} from 'react';
import {FormChange} from './client';
import {hostedActivities,type HostedActivityType} from '../../../shared/hosted-activities';

export function HostedActivityCover({type}:{type:HostedActivityType}) {
  const activity=hostedActivities[type];
  return <div className="project-card-cover">{activity.poster?
    <img loading="lazy" src={activity.poster} alt={`${activity.label} 활동 안내 포스터`} width={600} height={850}/>:
    <span aria-hidden="true">＋</span>}</div>;
}

export function HostedActivityPoster({type}:{type:HostedActivityType}) {
  const activity=hostedActivities[type];
  return activity.poster?<a className="activity-poster" href={activity.poster} target="_blank" rel="noreferrer" aria-label={`${activity.label} 포스터 원본 보기 (새 탭)`}>
    <HostedActivityCover type={type}/>
  </a>:null;
}

export function HostedActivityCards({selected,onSelect}:{selected:HostedActivityType|null;onSelect:(type:HostedActivityType)=>void}) {
  const changed=useContext(FormChange);
  const cards=useRef<HTMLDivElement>(null),id=useId();
  function turn(direction:number) {
    const rail=cards.current;
    if(!rail)return;
    rail.scrollBy({left:direction*((rail.firstElementChild?.getBoundingClientRect().width??0)+parseFloat(getComputedStyle(rail).columnGap))});
  }
  return <fieldset className="hosted-activities"><legend>활동 템플릿 선택</legend>
    <div className="activity-card-controls"><p className="help">좌우로 넘겨 템플릿을 골라보세요.</p><div>
      <button type="button" className="button" aria-label="이전 템플릿" aria-controls={id} onClick={()=>turn(-1)}>←</button>
      <button type="button" className="button" aria-label="다음 템플릿" aria-controls={id} onClick={()=>turn(1)}>→</button>
    </div></div>
    <div className="activity-cards" id={id} ref={cards} role="region" aria-label="활동 템플릿 카드" tabIndex={0}>{Object.entries(hostedActivities).map(([key,a])=>{
      const type=key as HostedActivityType;
      return <button type="button" className="project-card activity-card" key={type} aria-pressed={selected===type} onClick={()=>{onSelect(type);changed();}}>
        <HostedActivityCover type={type}/><div className="project-card-copy">
          <span className="badge">{a.label}</span>
          <strong>{type==='general'?'빈 템플릿으로 시작':`${a.label} 템플릿으로 시작`}</strong>
          <p>{a.description}</p><p className="help">기본 제출: {a.requirements.activity?'활동 보고서':'없음'}{a.requirements.expenses?' · 활동비 사용 내역서':''}</p>
        </div>
      </button>;
    })}</div>
  </fieldset>;
}
