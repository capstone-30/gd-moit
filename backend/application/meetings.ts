import type {DB} from './ports';
import {requireThat} from '../domain/errors';
import {termFor,termSlots,validateDate,validatePlace} from './configuration';
import {publicProfile,etag,intersection,shouldReset,type Actor} from '../domain/meetings';
export {publicProfile,etag,intersection,shouldReset,type Actor} from '../domain/meetings';
export async function creationRestricted(db:DB,id:string) {
  return Number((await db.meetings.countActiveReporters([id])).rows[0].n)>=3;
}
export async function members(db:DB,meetingId:string) {
  return (await db.meetings.listMembers([meetingId])).rows;
}
export async function getMeeting(db:DB,actor:Actor,id:string) {
  const m=(await db.meetings.findVisibleMeeting([id,actor.school_id,actor.id])).rows[0];
  requireThat(m,404,'NOT_FOUND');return m;
}
async function mySlots(db:DB,actor:Actor,m:Record<string,any>) {
  const r=(await db.meetings.findMyAvailability([actor.id,m.term_id])).rows[0];
  return (r?.slots??[]) as number[];
}
export async function membershipConflict(db:DB,userId:string,meetingId:string) {
  return Boolean((await db.meetings.hasBlockedMember([userId,meetingId])).rowCount);
}
async function proposalView(db:DB,actor:Actor,p:Record<string,any>) {
  const accepted=(await db.meetings.listAcceptances([p.id,p.meeting_id])).rows;
  return {id:p.id,date:p.proposed_date,slot:p.proposed_slot,status:p.status,acceptedMemberNos:accepted.map(r=>r.member_no),myAccepted:accepted.some(r=>r.user_id===actor.id)};
}
export async function detail(db:DB,actor:Actor,id:string,summaryOnly=false) {
  const m=await getMeeting(db,actor,id),ms=await members(db,id),own=ms.find(r=>r.user_id===actor.id);
  const common=intersection(ms.map(r=>r.slots)),mine:number[]=own?.slots??await mySlots(db,actor,m);
  const overlap=m.state==='confirmed'?mine.includes(m.confirmed_slot):common.some(s=>mine.includes(s));
  const summary={id:m.id,topic:m.topic,type:m.type,place:{id:m.place_id,name:m.place_name},capacity:m.capacity,memberCount:ms.length,isMember:Boolean(own),state:m.state,
    confirmation:m.state==='confirmed'?{date:m.confirmed_date,slot:m.confirmed_slot,source:m.confirmation_source}:null,
    overlapsMyAvailability:overlap,canJoin:Boolean(own) || m.state!=='proposing' && ms.length<m.capacity && (m.state!=='confirmed'||overlap) && !await membershipConflict(db,actor.id,id),expiresAt:m.expires_at.toISOString(),version:Number(m.version)};
  if(summaryOnly) return summary;
  const term=own && m.term_available?{id:m.term_id,startsOn:m.starts_on,endsOn:m.ends_on,
    slots:await termSlots(db,m.term_id)}:null;
  const pending=own?(await db.meetings.findPendingProposal([id])).rows[0]:null;
  return {...summary,termId:m.term_id,term,hostId:m.host_id,members:ms.map(r=>({userId:r.user_id,memberNo:r.member_no,isHost:r.user_id===m.host_id,profile:publicProfile(r)})),
    ...(own?{intersectionSlots:common,proposal:pending?await proposalView(db,actor,pending):null}:{})};
}
export async function revalidate(db:DB,id:string,checkTime=true) {
  const m=(await db.meetings.findMeeting([id])).rows[0];if(!m) return;
  const ms=await members(db,id),common=intersection(ms.map(r=>r.slots));
  // Unanimous consent applies to this dated meeting, independently of recurring availability.
  if(shouldReset(m.state,ms.length,m.confirmed_slot,common,checkTime && m.confirmation_source!=='proposal')) {
    await db.meetings.cancelPendingProposal([id]);
    await db.meetings.resetCoordination([id]);
  } else await db.meetings.incrementVersion([id]);
}
export function checkVersion(m:{id:string,version:number},expected:string|null) {requireThat(expected,428,'PRECONDITION_REQUIRED');requireThat(expected===etag(m),412,'VERSION_CONFLICT');}
export function requireMember(ms:Record<string,any>[],actor:Actor) {const member=ms.find(r=>r.user_id===actor.id);requireThat(member,403,'FORBIDDEN');return member;}
export async function createMeeting(db:DB,actor:Actor,input:{termId:string,topic:string,type:string,placeId:string,capacity:number,twoPersonAcknowledged?:boolean}) {
  const term=await termFor(db,input.termId,actor.school_id);
  requireThat(term.today>=term.starts_on && term.today<=term.ends_on,422,'DATE_OUT_OF_RANGE');
  requireThat(!await creationRestricted(db,actor.id),403,'CREATION_RESTRICTED');
  requireThat(input.capacity!==2 || input.twoPersonAcknowledged,422,'TWO_PERSON_ACK_REQUIRED');
  await validatePlace(db,input.placeId,actor.school_id);
  const m=(await db.meetings.createMeeting([actor.id,input.termId,input.topic,input.type,input.placeId,input.capacity])).rows[0];
  await db.meetings.addHost([m.id,actor.id]);
  return detail(db,actor,m.id);
}
export async function join(db:DB,actor:Actor,id:string) {
  const m=await getMeeting(db,actor,id),ms=await members(db,id),existing=ms.find(r=>r.user_id===actor.id);
  if(existing) return {userId:actor.id,memberNo:existing.member_no};
  requireThat(m.state!=='proposing',409,'PROPOSAL_IN_PROGRESS');
  requireThat(ms.length<m.capacity,409,'MEETING_FULL');
  requireThat(!await membershipConflict(db,actor.id,id),409,'MEMBERSHIP_CONFLICT');
  requireThat(m.state!=='confirmed' || (await mySlots(db,actor,m)).includes(m.confirmed_slot),422,'SLOT_NOT_ALLOWED');
  await db.meetings.addMember([id,actor.id,m.next_member_no]);
  await db.meetings.advanceMemberNumber([id]);
  return {userId:actor.id,memberNo:m.next_member_no};
}
export async function leave(db:DB,actor:Actor,id:string,target=actor.id,kick=false) {
  const m=await getMeeting(db,actor,id);
  if(kick) requireThat(m.host_id===actor.id && target!==actor.id,403,'FORBIDDEN');
  else requireThat(m.host_id!==actor.id,409,'HOST_CANNOT_LEAVE');
  const removed=await db.meetings.removeMember([id,target]);
  if(removed.rowCount) await revalidate(db,id,false);
}
async function confirm(db:DB,m:Record<string,any>,date:string,slot:number,source:string) {
  return (await db.meetings.confirmSchedule([m.id,date,slot,source,m.timezone])).rows[0];
}
export async function coordinate(db:DB,actor:Actor,id:string,date:string,slot:number,expected:string|null,proposal=false) {
  const m=await getMeeting(db,actor,id);requireThat(m.host_id===actor.id,403,'FORBIDDEN');checkVersion(m,expected);
  requireThat(m.state==='undecided',409,'STATE_CONFLICT');
  const ms=await members(db,id);requireThat(ms.length>=2,422,'TOO_FEW_MEMBERS');
  const common=intersection(ms.map(r=>r.slots));
  requireThat(proposal?!common.length:common.includes(slot),422,proposal?'INTERSECTION_EXISTS':'NO_INTERSECTION');
  await validateDate(db,m.term_id,actor.school_id,date,slot);
  if(proposal) {
    const p=(await db.meetings.createProposal([id,date,slot])).rows[0];
    const updated=(await db.meetings.beginProposal([id])).rows[0];
    return {data:await proposalView(db,actor,p),etag:etag(updated)};
  }
  const updated=await confirm(db,m,date,slot,'intersection');
  return {data:await detail(db,actor,id),etag:etag(updated)};
}
export async function accept(db:DB,actor:Actor,id:string,proposalId:string,expected:string|null) {
  const m=await getMeeting(db,actor,id),ms=await members(db,id),member=requireMember(ms,actor);checkVersion(m,expected);
  const p=(await db.meetings.findProposal([proposalId,id])).rows[0];
  requireThat(p && p.status!=='cancelled',409,'PROPOSAL_STALE');
  const view=await proposalView(db,actor,p);
  if(view.myAccepted) return {data:{...view,state:m.state},etag:etag(m)};
  requireThat(m.state==='proposing' && p.status==='pending',409,'PROPOSAL_STALE');
  await validateDate(db,m.term_id,actor.school_id,p.proposed_date,p.proposed_slot);
  await db.meetings.acceptProposal([proposalId,actor.id]);
  view.acceptedMemberNos=[...view.acceptedMemberNos,member.member_no].sort((a,b)=>a-b);
  view.myAccepted=true;
  let updated;
  if(view.acceptedMemberNos.length===ms.length) {
    await db.meetings.completeProposal([proposalId]);
    updated=await confirm(db,m,p.proposed_date,p.proposed_slot,'proposal');view.status='accepted';
  } else updated=(await db.meetings.incrementVersionReturningState([id])).rows[0];
  return {data:{...view,state:updated.state},etag:etag(updated)};
}
export function commentView(c:Record<string,any>,userId:string) {
  return {id:c.id,memberNo:c.author_member_no,body:c.body,createdAt:c.created_at.toISOString(),isMine:c.author_id===userId};
}
export async function addComment(db:DB,actor:Actor,id:string,body:string) {
  await getMeeting(db,actor,id);const member=requireMember(await members(db,id),actor);
  const c=(await db.meetings.createComment([id,actor.id,member.member_no,body])).rows[0];
  return commentView(c,actor.id);
}
