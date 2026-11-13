'use client';
import {meetingTypes} from '../../../shared/meeting-types';
import Popup from './popup';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,loadAccountContext,AvailabilityReminder,useData,usePaginatedData,PageButtons,Form,Heading,LoadFeedback,Loading,slotLabel,ProfileText,type Config,type Meeting,type MeetingSummary,type Comment,type Availability} from './client';
import {dateRange,formatTimestamp} from './calendar';
import {DateSlotFields} from './date-slot-fields';
import {CommonTimes} from './common-times';
export default function MeetingPage({id,managed=false}:{id:string,managed?:boolean}) {
  const listPath=managed?'/meetings/manage':'/meetings';
  const path=`meetings/${encodeURIComponent(id)}`;
  const load=useCallback(async(signal:AbortSignal)=>{
    const [meeting,context]=await Promise.all([api<Meeting>(path,{signal}),loadAccountContext(signal)]);
    // 참여 전에는 모임 학기의 내 가능 시간 등록 여부로 참여 패널 안내를 정한다. 조회 실패는 안내만 생략한다.
    const times=meeting.data.isMember?null:await api<Availability>(`me/availability/${meeting.data.termId}`,{signal}).then(r=>r.data,()=>null);
    return {...context,m:meeting.data,etag:meeting.etag,times};
  },[path]);const state=useData(load),d=state.data;
  useEffect(()=>{
    if(d&&d.m.isMember!==managed) window.location.replace(d.m.isMember?`/meetings/manage/${encodeURIComponent(id)}`:`/meetings/${encodeURIComponent(id)}`);
  },[d,managed,id]);
  // 위임·철회처럼 팝업 안의 조작이 끝나면 결과를 알리고, 팝업이 닫힌 뒤 안내로 포커스를 옮긴다.
  // 안내는 그때의 모임 버전에서만 보여, 이후 확정·참여 변경 등으로 상황이 바뀌면 숨긴다.
  const [notice,setNotice]=useState<{text:string;key:number;version?:number}|null>(null),noticeRef=useRef<HTMLParagraphElement>(null),focusNotice=useRef(false);
  function announce(text:string){focusNotice.current=true;setNotice({text,key:Date.now()});}
  useEffect(()=>{
    if(!focusNotice.current||!noticeRef.current||!d||document.querySelector('dialog[open]'))return;
    focusNotice.current=false;noticeRef.current.focus();
    const version=d.m.version;setNotice(current=>current&&{...current,version});
  });
  const shownNotice=notice&&(notice.version===undefined||notice.version===d?.m.version)?notice:null;
  if(d&&d.m.isMember!==managed) return <Loading/>;
  // 참여 패널의 가능 시간 등록 안내는 지금 참여할 수 있을 때만 띄운다. 정원·조율·확정 시간 때문에 막힌 경우는 JoinGuidance가 다음 행동을 안내한다.
  return <><LoadFeedback state={state} recovery={{href:listPath,label:"모임 목록으로 돌아가기"}}/>{d&&<><Heading title={d.m.topic} description={`${d.m.place.name} · ${d.m.memberCount}/${d.m.capacity}명`}><span className="badge">{meetingTypes[d.m.type]}</span><button className="text-button" onClick={state.reload} disabled={state.loading}>모임 새로고침</button></Heading>{d.m.isMember&&d.m.type==='reflection'&&<Comments timezone={d.c.school?.timezone??'UTC'} path={path} reflection/>}<section className={`time-banner ${d.m.state==='confirmed'?'confirmed':''}`}><span>{d.m.state==='confirmed'?'✓ 확정된 시간':d.m.state==='proposing'?'시간 제안 조율 중':'시간 미정'}</span><h2>{d.m.confirmation?`${d.m.confirmation.date} · ${slotLabel(d.m.confirmation.slot)}`:d.m.memberCount<2?'함께할 참여자를 기다려요':'함께 시간을 맞춰요'}</h2><p>보관 만료: {formatTimestamp(d.m.expiresAt,d.c.school?.timezone??'UTC')}. 만료 시 모임·코멘트가 삭제됩니다.</p></section>{shownNotice&&<p key={shownNotice.key} ref={noticeRef} tabIndex={-1} className="feedback success-message meeting-notice" role="status">{shownNotice.text}</p>}<div className="detail-grid"><div><section className="detail-section vertical-card"><h2>참여자</h2><ul className="members">{d.m.members.map(member=><li key={member.userId}><Participant member={member} me={d.me.id} host={d.me.id===d.m.hostId} path={path} listPath={listPath} etag={d.etag} reload={state.reload} onNotice={announce}/></li>)}</ul></section>{d.m.isMember&&<><CommonTimes termSlots={d.m.term?.slots} slots={d.m.intersectionSlots} confirmed={d.m.state==='confirmed'}/><Coordination m={d.m} c={d.c} etag={d.etag} path={path} host={d.me.id===d.m.hostId} reload={state.reload} onNotice={announce}/>{d.m.type!=='reflection'&&<Comments timezone={d.c.school?.timezone??'UTC'} path={path}/>}</>}</div><aside className={`action-panel vertical-card${d.m.isMember?' member-actions':''}`}><h2>{d.m.isMember?'참여 중인 모임':'이 모임에 함께하기'}</h2>{d.m.canJoin&&d.times&&!d.times.registered&&<AvailabilityReminder>참여 전에 등록해야 참여자와 함께 가능한 시간을 계산할 수 있어요.</AvailabilityReminder>}{d.m.isMember?<><p>시간 조율과 참여자 코멘트에서 모임을 이어가세요.</p>{d.me.id===d.m.hostId&&<HostActions path={path} canDelegate={d.m.memberCount>1}/>}{d.me.id!==d.m.hostId&&<Popup title="모임 나가기"><Form danger label="모임 나가기" submit={async()=>{await api(`${path}/members/me`,{method:'DELETE'});return listPath;}}><label className="check-line"><input type="checkbox" required/>나가면 조율 중인 제안이 취소될 수 있음을 확인했습니다.</label></Form></Popup>}</>:d.m.canJoin?<Form label="바로 참여하기" submit={async()=>{await api(`${path}/members/me`,{method:'PUT'});return `/meetings/manage/${id}`;}}><JoinGuidance meeting={d.m}/></Form>:<JoinGuidance meeting={d.m}/>}<p className="help">개별 가능 시간과 이메일은 공개하지 않습니다. 코멘트는 참여자만 볼 수 있습니다.</p><Popup title="모임 신고"><Report type="meeting" id={id}/></Popup></aside></div></>}</>;
}
// 개설자는 나가기 대신 참여자 목록에서 위임하거나 모임을 닫는다(삭제, 종료 상태 없음).
function HostActions({path,canDelegate}:{path:string;canDelegate:boolean}) {
  return <><p className="help">{canDelegate?'개설자는 바로 나갈 수 없어요. 참여자를 눌러 개설자를 위임하면 나갈 수 있어요.':'다른 참여자가 들어오면 개설자를 위임할 수 있어요.'}</p>
    <Popup title="모임 닫기"><Form danger label="모임 닫기" submit={async()=>{await api(path,{method:'DELETE'});return '/meetings/manage';}}><p>모임을 닫으면 모든 참여자에게서 모임이 사라집니다.</p><label className="check-line"><input type="checkbox" required/>모임과 참여자·시간 제안·코멘트를 모두 삭제합니다. 되돌릴 수 없습니다.</label></Form></Popup></>;
}
export function JoinGuidance({meeting:m}:{meeting:MeetingSummary}) {
  if(m.canJoin)return <p>{m.state==='confirmed'?'위 확정 일정을 확인하고 참여해주세요.':'승인 없이 바로 참여해요. 참여 후 함께 시간을 맞출 수 있어요.'}</p>;
  if(m.memberCount>=m.capacity)return <><p>정원이 모두 찼어요.</p><a className="text-link" href="/meetings">다른 모임 찾기</a></>;
  if(m.state==='proposing')return <><p>참여자들이 제안된 시간을 조율하고 있어 지금은 참여할 수 없어요.</p><a className="text-link" href="/meetings">다른 모임 찾기</a></>;
  if(m.state==='confirmed'&&!m.overlapsMyAvailability)return <><p>확정된 시간이 내 가능 시간에 포함되어야 참여할 수 있어요.</p><a className="text-link" href="/profile#availability">가능 시간 확인·수정</a></>;
  return <><p>지금은 참여할 수 없는 모임이에요.</p><a className="text-link" href="/meetings">다른 모임 찾기</a></>;
}
function Coordination({m,c,etag,path,host,reload,onNotice}:{m:Meeting,c:Config,etag:string|null,path:string,host:boolean,reload:()=>void,onNotice:(text:string)=>void}){
  const slots=m.term?m.term.slots.filter(s=>!m.intersectionSlots?.length||m.intersectionSlots.includes(s.slot)):[];
  const range=c.school&&m.term?dateRange(c.school.timezone,m.term.startsOn,m.term.endsOn):null;
  if(m.proposal)return <section className="detail-section vertical-card"><h2>제안된 시간</h2><p>{m.proposal.date} · {slotLabel(m.proposal.slot)}</p><p className="help">현재 참여자 전원 수락 시 확정됩니다. 수락 중에는 새 참여를 받지 않습니다.</p><p>수락: {m.proposal.acceptedMemberNos.map(no=>`참여자 ${no}`).join(', ')||'아직 없음'}</p><Form label={m.proposal.myAccepted?'이미 수락했습니다':'이 시간 수락'} disabled={m.proposal.myAccepted} onConflict={reload} submit={async()=>{await api(`${path}/proposals/${m.proposal!.id}/acceptances/me`,{method:'PUT',etag:etag??undefined});reload();}}><p className="help">수락은 학기 가능 시간을 바꾸지 않습니다.</p></Form>{host&&<Popup title="제안 철회"><Form danger label="제안 철회" onConflict={reload} submit={async()=>{await api(`${path}/proposals/${m.proposal!.id}`,{method:'DELETE',etag:etag??undefined});onNotice('제안을 철회했어요. 시간 미정으로 돌아갔으니 다시 시간을 맞춰주세요.');reload();}}><label className="check-line"><input type="checkbox" required/>이 제안과 지금까지의 수락을 취소하고 시간 미정으로 돌아갑니다.</label></Form></Popup>}</section>;
  if(!host||m.state!=='undecided'||m.memberCount<2)return null;
  const proposal=!m.intersectionSlots?.length;
  return <section className="detail-section vertical-card"><h2>{proposal?'대안 시간 제안':'교집합 시간 확정'}</h2>{!m.term||!slots.length||!range||range.min>range.max?<p>이 모임 학기의 운영 교시·날짜를 사용할 수 없어 조율할 수 없습니다.</p>:<Form dirtyGuard onConflict={reload} label={proposal?'시간 제안하기':'시간 확정하기'} submit={async f=>{await api(`${path}/${proposal?'proposals':'confirmation'}`,{method:proposal?'POST':'PUT',body:{date:String(f.get('date')),slot:Number(f.get('slot'))},etag:etag??undefined});reload();}}><DateSlotFields prefix="meeting" range={range} slots={slots} allowUndated/><p className="help">{proposal?'교집합이 없어 대안을 제안합니다. 개설자도 직접 수락해야 합니다.':'참여자 모두 가능한 교시에서 확정합니다.'}</p></Form>}</section>;
}
export function Comments({path,reflection=false,timezone='UTC'}:{timezone?:string;path:string;reflection?:boolean}){
  const [body,setBody]=useState('');
  const state=usePaginatedData<Comment>(`${path}/comments`);
  const form=<Form dirtyGuard label={reflection?'회고 글 게시':'코멘트 남기기'} submit={async()=>{await api(`${path}/comments`,{method:'POST',body:{body}});setBody('');state.reset();state.reload();}}><label htmlFor="comment-body">{reflection?'나의 회고':'코멘트'}</label><textarea id="comment-body" value={body} onChange={e=>setBody(e.target.value)} placeholder={reflection?'어떤 경험을 했나요? 배운 점과 다음에 시도할 일을 나눠주세요.':undefined} rows={reflection?6:undefined} maxLength={1000} required/><span className="help">{body.length}/1000자 · 참여자에게만 공개됩니다.</span></Form>;
  return <section className="detail-section vertical-card"><div className="section-heading"><h2>{reflection?'회고 게시판':'참여자 코멘트'}</h2><button className="text-button" onClick={state.reload} disabled={state.loading}>새로고침</button></div><p className="help">{reflection?'경험과 배움, 다음 시도를 글로 나누는 참여자 전용 공간입니다. 모임 전후로 회고를 공유하고 서로의 이야기를 읽어보세요.':'자기소개·장소 변경·지각·취소를 알려주세요. 새로고침하면 새 코멘트를 확인할 수 있습니다.'}</p>
    {reflection&&form}<LoadFeedback state={state}/>
    {state.data?.data.length===0&&<p className="muted">{reflection?'아직 회고 글이 없습니다. 첫 회고를 공유해보세요.':'아직 코멘트가 없습니다. 첫 인사를 남겨보세요.'}</p>}
    {state.data?.data.map(comment=><article className="comment" key={comment.id}><p className="help">참여자 {comment.memberNo}{comment.isMine?' · 나':''} · {formatTimestamp(comment.createdAt,timezone)}</p><p>{comment.body}</p></article>)}
    <div className="form-actions"><PageButtons {...state} nextCursor={state.data?.nextCursor} labels={reflection?['이전 회고 글','다음 회고 글']:['이전 코멘트','다음 코멘트']}/></div>{!reflection&&form}
  </section>;
}
function Report({type,id}:{type:'user'|'meeting',id:string}){return <Form label="신고 접수" submit={async f=>{await api('reports',{method:'POST',body:{targetType:type,targetId:id,reason:String(f.get('reason'))}});}}><label>신고 사유<textarea name="reason" maxLength={1000} required/></label><p className="help">신고 사유만 수집하며 첨부나 코멘트 사본은 수집하지 않습니다.</p></Form>;}

export function Participant({member,me,host,path,listPath,etag=null,reload,onNotice}:{member:Meeting['members'][number];me:string;host:boolean;path:string;listPath:string;etag?:string|null;reload:()=>void;onNotice?:(text:string)=>void}) {
  const info=<><span className="avatar" aria-hidden="true">{member.memberNo}</span><span className="participant-info"><span>참여자 {member.memberNo}{member.isHost?' · 개설자':''}{member.userId===me?' · 나':''}</span><ProfileText profile={member.profile}/></span></>;
  if(member.userId===me)return <div className="participant-row">{info}</div>;
  return <Popup key={host?'host':'member'} className="participant" title={`참여자 ${member.memberNo} 안전 메뉴`} trigger={info} triggerClassName="participant-row participant-button">
    <Report type="user" id={member.userId}/>
    <Form danger label="사용자 차단" submit={async f=>{if(f.get('block')!=='on')return;await api(`me/blocks/${member.userId}`,{method:'PUT'});if(host)reload();else return listPath;}}><label className="check-line"><input type="checkbox" name="block" required/><span>차단하면 상대 모임이 숨겨집니다. 공동 모임에서는 내가 개설자면 상대를 내보내고, 아니면 내가 나갑니다.</span></label></Form>
    {host&&<Form label="개설자 위임" onConflict={reload} submit={async()=>{await api(`${path}/host`,{method:'PUT',body:{userId:member.userId},etag:etag??undefined});onNotice?.(`참여자 ${member.memberNo}에게 개설자를 넘겼어요. 이제 모임을 나갈 수 있어요.`);reload();}}><label className="check-line"><input type="checkbox" required/>참여자 {member.memberNo}에게 개설자를 넘깁니다. 넘긴 뒤에는 시간 조율·내보내기·모임 닫기를 할 수 없고, 모임을 나갈 수 있습니다.</label></Form>}
    {host&&<Form danger label="참여자 내보내기" submit={async()=>{await api(`${path}/members/${member.userId}`,{method:'DELETE'});reload();}}><label className="check-line"><input type="checkbox" required/>이 참여자를 내보내겠습니다.</label></Form>}
  </Popup>;
}
