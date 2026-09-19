'use client';
import {meetingTypes} from '../../../shared/meeting-types';
import Popup from './popup';
import {useCallback,useEffect,useState} from 'react';
import {api,loadAccountContext,useData,usePaginatedData,PageButtons,Form,Heading,LoadFeedback,Loading,slotLabel,ProfileText,type Config,type Meeting,type Comment} from './client';
import {dateRange} from './calendar';
import {DateSlotFields} from './date-slot-fields';
import {CommonTimes} from './common-times';
export default function MeetingPage({id,managed=false}:{id:string,managed?:boolean}) {
  const listPath=managed?'/meetings/manage':'/meetings';
  const path=`meetings/${encodeURIComponent(id)}`;
  const load=useCallback(async(signal:AbortSignal)=>{const [meeting,context]=await Promise.all([api<Meeting>(path,{signal}),loadAccountContext(signal)]);return {...context,m:meeting.data,etag:meeting.etag};},[path]);const state=useData(load),d=state.data;
  useEffect(()=>{
    if(d&&d.m.isMember!==managed) window.location.replace(d.m.isMember?`/meetings/manage/${encodeURIComponent(id)}`:`/meetings/${encodeURIComponent(id)}`);
  },[d,managed,id]);
  if(d&&d.m.isMember!==managed) return <Loading/>;
  return <><LoadFeedback state={state}/>{d&&<><Heading title={d.m.topic} description={`${meetingTypes[d.m.type]} · ${d.m.place.name} · ${d.m.memberCount}/${d.m.capacity}명`}><span className="badge">{meetingTypes[d.m.type]}</span><button className="button" onClick={state.reload} disabled={state.loading}>모임 새로고침</button></Heading>{d.m.isMember&&d.m.type==='reflection'&&<Comments path={path} reflection/>}<section className={`time-banner ${d.m.state==='confirmed'?'confirmed':''}`}><span>{d.m.state==='confirmed'?'✓ 확정된 시간':d.m.state==='proposing'?'시간 제안 조율 중':'시간 미정'}</span><h2>{d.m.confirmation?`${d.m.confirmation.date} · ${slotLabel(d.m.confirmation.slot)}`:d.m.memberCount<2?'함께할 참여자를 기다려요':'함께 시간을 맞춰요'}</h2><p>보관 만료: {new Date(d.m.expiresAt).toLocaleDateString('ko-KR',{timeZone:d.c.school?.timezone??'UTC'})}. 만료 시 모임·코멘트가 삭제됩니다.</p></section><div className="detail-grid"><div><section className="detail-section vertical-card"><h2>참여자</h2><ul className="members">{d.m.members.map(member=><li key={member.userId}><Participant member={member} me={d.me.id} host={d.me.id===d.m.hostId} path={path} listPath={listPath} reload={state.reload}/></li>)}</ul></section>{d.m.isMember&&<><CommonTimes termSlots={d.m.term?.slots} slots={d.m.intersectionSlots} confirmed={d.m.state==='confirmed'}/><Coordination m={d.m} c={d.c} etag={d.etag} path={path} host={d.me.id===d.m.hostId} reload={state.reload}/>{d.m.type!=='reflection'&&<Comments path={path}/>}</>}</div><aside className="action-panel vertical-card"><h2>{d.m.isMember?'참여 중인 모임':'이 모임에 함께하기'}</h2>{d.m.isMember?<><p>참여 중입니다. 시간 조율·코멘트를 확인해주세요.</p>{d.me.id!==d.m.hostId&&<Form danger label="모임 나가기" submit={async()=>{await api(`${path}/members/me`,{method:'DELETE'});return listPath;}}><label className="check-line"><input type="checkbox" required/>나가면 조율 중인 제안이 취소될 수 있음을 확인했습니다.</label></Form>}</>:<Form label="바로 참여하기" disabled={!d.m.canJoin} submit={async()=>{await api(`${path}/members/me`,{method:'PUT'});return `/meetings/manage/${id}`;}}><p>{d.m.canJoin?'승인 없이 참여합니다.':'정원·확정 시간·조율 상태 또는 차단 관계로 지금 참여할 수 없습니다.'}</p></Form>}<p className="help">개별 가능 시간과 이메일은 공개하지 않습니다. 코멘트는 참여자만 볼 수 있습니다.</p><Popup title="모임 신고"><Report type="meeting" id={id}/></Popup></aside></div></>}</>;
}
function Coordination({m,c,etag,path,host,reload}:{m:Meeting,c:Config,etag:string|null,path:string,host:boolean,reload:()=>void}){
  const slots=m.term?m.term.slots.filter(s=>!m.intersectionSlots?.length||m.intersectionSlots.includes(s.slot)):[];
  const range=c.school&&m.term?dateRange(c.school.timezone,m.term.startsOn,m.term.endsOn):null;
  if(m.proposal)return <section className="detail-section vertical-card"><h2>제안된 시간</h2><p>{m.proposal.date} · {slotLabel(m.proposal.slot)}</p><p className="help">현재 참여자 전원 수락 시 확정됩니다. 수락 중에는 새 참여를 받지 않습니다.</p><p>수락한 참여자: {m.proposal.acceptedMemberNos.join(', ')||'아직 없음'}</p><Form label={m.proposal.myAccepted?'이미 수락했습니다':'이 시간 수락'} disabled={m.proposal.myAccepted} onConflict={reload} submit={async()=>{await api(`${path}/proposals/${m.proposal!.id}/acceptances/me`,{method:'PUT',etag:etag??undefined});reload();}}><p className="help">수락은 학기 가능 시간를 바꾸지 않습니다.</p></Form></section>;
  if(!host||m.state!=='undecided'||m.memberCount<2)return null;
  const proposal=!m.intersectionSlots?.length;
  return <section className="detail-section vertical-card"><h2>{proposal?'대안 시간 제안':'교집합 시간 확정'}</h2>{!m.term||!slots.length||!range||range.min>range.max?<p>이 모임 학기의 운영 교시·날짜를 사용할 수 없어 조율할 수 없습니다.</p>:<Form dirtyGuard onConflict={reload} label={proposal?'시간 제안하기':'시간 확정하기'} submit={async f=>{await api(`${path}/${proposal?'proposals':'confirmation'}`,{method:proposal?'POST':'PUT',body:{date:String(f.get('date')),slot:Number(f.get('slot'))},etag:etag??undefined});reload();}}><DateSlotFields prefix="meeting" range={range} slots={slots} allowUndated/><p className="help">{proposal?'교집합이 없어 대안을 제안합니다. 개설자도 직접 수락해야 합니다.':'참여자 모두 가능한 교시에서 확정합니다.'}</p></Form>}</section>;
}
export function Comments({path,reflection=false}:{path:string;reflection?:boolean}){
  const [body,setBody]=useState('');
  const state=usePaginatedData<Comment>(`${path}/comments`);
  const form=<Form dirtyGuard label={reflection?'회고 글 게시':'코멘트 남기기'} submit={async()=>{await api(`${path}/comments`,{method:'POST',body:{body}});setBody('');state.reset();state.reload();}}><label htmlFor="comment-body">{reflection?'나의 회고':'코멘트'}</label><textarea id="comment-body" value={body} onChange={e=>setBody(e.target.value)} placeholder={reflection?'어떤 경험을 했나요? 배운 점과 다음에 시도할 일을 나눠주세요.':undefined} rows={reflection?6:undefined} maxLength={1000} required/><span className="help">{body.length}/1000자 · 참여자에게만 공개됩니다.</span></Form>;
  return <section className="detail-section vertical-card"><div className="section-heading"><h2>{reflection?'회고 게시판':'참여자 코멘트'}</h2><button className="button" onClick={state.reload} disabled={state.loading}>새로고침</button></div><p className="help">{reflection?'경험과 배움, 다음 시도를 글로 나누는 참여자 전용 공간입니다. 모임 전후로 회고를 공유하고 서로의 이야기를 읽어보세요.':'자기소개·장소 변경·지각·취소를 알려주세요. 새로고침하면 새 코멘트를 확인할 수 있습니다.'}</p>
    {reflection&&form}<LoadFeedback state={state}/>
    {state.data?.data.length===0&&<p className="muted">{reflection?'아직 회고 글이 없습니다. 첫 회고를 공유해보세요.':'아직 코멘트가 없습니다. 첫 인사를 남겨보세요.'}</p>}
    {state.data?.data.map(comment=><article className="comment" key={comment.id}><p className="help">참여자 {comment.memberNo}{comment.isMine?' · 나':''} · {new Date(comment.createdAt).toLocaleString('ko-KR')}</p><p>{comment.body}</p></article>)}
    <div className="form-actions"><PageButtons {...state} nextCursor={state.data?.nextCursor} labels={reflection?['이전 회고 글','다음 회고 글']:['이전 코멘트','다음 코멘트']}/></div>{!reflection&&form}
  </section>;
}
function Report({type,id}:{type:'user'|'meeting',id:string}){return <Form label="신고 접수" submit={async f=>{await api('reports',{method:'POST',body:{targetType:type,targetId:id,reason:String(f.get('reason'))}});}}><label>신고 사유<textarea name="reason" maxLength={1000} required/></label><p className="help">신고 사유만 수집하며 첨부나 코멘트 사본은 수집하지 않습니다.</p></Form>;}

export function Participant({member,me,host,path,listPath,reload}:{member:Meeting['members'][number];me:string;host:boolean;path:string;listPath:string;reload:()=>void}) {
  const info=<><span className="avatar" aria-hidden="true">{member.memberNo}</span><span className="participant-info"><span>참여자 {member.memberNo}{member.isHost?' · 개설자':''}{member.userId===me?' · 나':''}</span><ProfileText profile={member.profile}/></span></>;
  if(member.userId===me)return <div className="participant-row">{info}</div>;
  return <Popup className="participant" title={`참여자 ${member.memberNo} 안전 메뉴`} trigger={info} triggerClassName="participant-row participant-button">
    <Report type="user" id={member.userId}/>
    <Form danger label="사용자 차단" submit={async f=>{if(f.get('block')!=='on')return;await api(`me/blocks/${member.userId}`,{method:'PUT'});if(host)reload();else return listPath;}}><label className="check-line"><input type="checkbox" name="block" required/><span>차단하면 상대 모임이 숨겨집니다. 공동 모임에서는 내가 개설자면 상대를 내보내고, 아니면 내가 나갑니다.</span></label></Form>
    {host&&<Form danger label="참여자 내보내기" submit={async()=>{await api(`${path}/members/${member.userId}`,{method:'DELETE'});reload();}}><label className="check-line"><input type="checkbox" required/>이 참여자를 내보내겠습니다.</label></Form>}
  </Popup>;
}
