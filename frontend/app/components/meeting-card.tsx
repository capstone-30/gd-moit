import type {ReactNode} from 'react';
import {CapacityDots,slotLabel,type MeetingSummary} from './client';
import {meetingTypes} from '../../../shared/meeting-types';

type Props={title:string;href:string;linkLabel?:string;badge:string;capacity:number;memberCount:number;inactive?:boolean;place:ReactNode;schedule:ReactNode;selection?:ReactNode;children?:ReactNode;footer?:ReactNode};
export function MeetingCardFrame({title,href,linkLabel,badge,capacity,memberCount,inactive,place,schedule,selection,children,footer}:Props) {
  return <li className="meeting-card" data-inactive={inactive||undefined}>
    <div className="meeting-card-top"><span className="badge">{badge}</span><CapacityDots capacity={capacity} memberCount={memberCount}/>{selection}</div>
    <h3><a className="meeting-card-link" href={href} aria-label={linkLabel}>{title}</a></h3>
    {children}
    <dl className="meeting-facts"><div><dt>장소</dt><dd>{place}</dd></div><div><dt>일정</dt><dd>{schedule}</dd></div></dl>
    {footer}
  </li>;
}

export function MeetingCard({meeting:m,managed=false}:{meeting:MeetingSummary;managed?:boolean}) {
  const href=managed?`/meetings/manage/${m.id}`:`/meetings/${m.id}`;
  const inactive=!managed&&(!m.canJoin||!m.overlapsMyAvailability);
  return <MeetingCardFrame title={m.topic} href={href} linkLabel={`${m.topic} ${managed?'모임 관리':'상세 보기'}${inactive?' · 참여 불가':''}`} badge={meetingTypes[m.type]} capacity={m.capacity} memberCount={m.memberCount} inactive={inactive} place={m.place.name} schedule={m.confirmation?`${m.confirmation.date} ${slotLabel(m.confirmation.slot)}`:m.state==='proposing'?'시간 조율 중':'일정 미정'}/>;
}
