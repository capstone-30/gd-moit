import 'server-only';
import type {DB} from '../db';
import {requireThat} from '../errors';
import {termFor,termSlots,validateDate,validateSlots,validatePlace} from './configuration';
export type Actor={id:string,school_id:string};
export const publicProfile=(r:Record<string,unknown>)=>({department:r.department,entryYear:r.entry_year,interests:r.interests});
export const etag=(m:{id:string,version:string|number})=>`"meeting-${m.id}-v${m.version}"`;
export function intersection(arrays:number[][]) {return arrays.length?arrays[0].filter(s=>arrays.every(a=>a.includes(s))):[];}
export function shouldReset(state:string,count:number,confirmedSlot:number|null,slots:number[],checkTime=true) {
  if(state==='proposing') return true;
  if(state!=='confirmed') return false;
  if(count<2) return true;
  return checkTime && !slots.includes(confirmedSlot!);
}
export async function creationRestricted(db:DB,id:string) {
  return Number((await db.query(`SELECT count(DISTINCT reporter_id) AS n FROM reports WHERE target_user_id=$1 AND status<>'dismissed' AND expires_at>now()`,[id])).rows[0].n)>=3;
}
export async function members(db:DB,meetingId:string) {
  return (await db.query(`SELECT u.id AS user_id,u.department,u.entry_year,u.interests,mm.member_no,
    coalesce(o.slots,a.slots,'{}'::smallint[]) AS slots
    FROM meeting_members mm JOIN users u ON u.id=mm.user_id JOIN meetings m ON m.id=mm.meeting_id
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id
    LEFT JOIN meeting_overrides o ON o.meeting_id=mm.meeting_id AND o.user_id=mm.user_id AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    LEFT JOIN availability a ON a.user_id=mm.user_id AND a.term_id=m.term_id AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    WHERE mm.meeting_id=$1 ORDER BY mm.member_no`,[meetingId])).rows;
}
export async function getMeeting(db:DB,actor:Actor,id:string) {
  const m=(await db.query(`SELECT m.*,p.name AS place_name,t.school_id,t.starts_on,t.ends_on,s.timezone,
    now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone AS term_available FROM meetings m
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id JOIN places p ON p.id=m.place_id
    WHERE m.id=$1 AND t.school_id=$2 AND m.expires_at>now()
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=m.host_id) OR (b.blocked_id=$3 AND b.blocker_id=m.host_id))`,[id,actor.school_id,actor.id])).rows[0];
  requireThat(m,404,'NOT_FOUND');return m;
}
async function mySlots(db:DB,actor:Actor,m:Record<string,any>,ms:Awaited<ReturnType<typeof members>>) {
  const member=ms.find(r=>r.user_id===actor.id);
  if(member) return member.slots as number[];
  const r=(await db.query(`SELECT a.slots FROM availability a JOIN terms t ON t.id=a.term_id JOIN schools s ON s.id=t.school_id
    WHERE a.user_id=$1 AND a.term_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`,[actor.id,m.term_id])).rows[0];
  return (r?.slots??[]) as number[];
}
export async function membershipConflict(db:DB,userId:string,meetingId:string) {
  return Boolean((await db.query(`SELECT 1 FROM blocks b JOIN meeting_members mm ON mm.meeting_id=$2
    WHERE (b.blocker_id=$1 AND b.blocked_id=mm.user_id) OR (b.blocked_id=$1 AND b.blocker_id=mm.user_id) LIMIT 1`,[userId,meetingId])).rowCount);
}
export async function proposalView(db:DB,actor:Actor,id:string) {
  const p=(await db.query('SELECT * FROM proposals WHERE id=$1',[id])).rows[0];
  requireThat(p,409,'PROPOSAL_STALE');
  const accepted=(await db.query(`SELECT a.user_id,mm.member_no FROM proposal_acceptances a JOIN meeting_members mm ON mm.user_id=a.user_id AND mm.meeting_id=$2 WHERE a.proposal_id=$1 ORDER BY mm.member_no`,[id,p.meeting_id])).rows;
  return {id:p.id,date:p.proposed_date,slot:p.proposed_slot,status:p.status,acceptedMemberNos:accepted.map(r=>r.member_no),myAccepted:accepted.some(r=>r.user_id===actor.id)};
}
export async function detail(db:DB,actor:Actor,id:string,summaryOnly=false) {
  const m=await getMeeting(db,actor,id),ms=await members(db,id),own=ms.find(r=>r.user_id===actor.id);
  const common=intersection(ms.map(r=>r.slots)),mine=await mySlots(db,actor,m,ms);
  const overlap=m.state==='confirmed'?mine.includes(m.confirmed_slot):common.some(s=>mine.includes(s));
  const summary={id:m.id,topic:m.topic,type:m.type,place:{id:m.place_id,name:m.place_name},capacity:m.capacity,memberCount:ms.length,isMember:Boolean(own),state:m.state,
    confirmation:m.state==='confirmed'?{date:m.confirmed_date,slot:m.confirmed_slot,source:m.confirmation_source}:null,
    overlapsMyAvailability:overlap,canJoin:Boolean(own) || m.state!=='proposing' && ms.length<m.capacity && (m.state!=='confirmed'||overlap) && !await membershipConflict(db,actor.id,id),expiresAt:m.expires_at.toISOString(),version:Number(m.version)};
  if(summaryOnly) return summary;
  const term=own && m.term_available?{id:m.term_id,startsOn:m.starts_on,endsOn:m.ends_on,
    slots:await termSlots(db,m.term_id)}:null;
  const pending=own?(await db.query("SELECT id FROM proposals WHERE meeting_id=$1 AND status='pending'",[id])).rows[0]:null;
  return {...summary,termId:m.term_id,term,hostId:m.host_id,members:ms.map(r=>({userId:r.user_id,memberNo:r.member_no,isHost:r.user_id===m.host_id,profile:publicProfile(r)})),
    ...(own?{intersectionSlots:common,proposal:pending?await proposalView(db,actor,pending.id):null}:{})};
}
export async function revalidate(db:DB,id:string,checkTime=true) {
  const m=(await db.query('SELECT * FROM meetings WHERE id=$1',[id])).rows[0];if(!m) return;
  const ms=await members(db,id),common=intersection(ms.map(r=>r.slots));
  // Unanimous consent applies to this dated meeting, independently of recurring availability.
  if(shouldReset(m.state,ms.length,m.confirmed_slot,common,checkTime && m.confirmation_source!=='proposal')) {
    await db.query("UPDATE proposals SET status='cancelled' WHERE meeting_id=$1 AND status='pending'",[id]);
    await db.query(`UPDATE meetings SET state='undecided',confirmed_date=NULL,confirmed_slot=NULL,confirmation_source=NULL,
      expires_at=created_at+interval '90 days' WHERE id=$1`,[id]);
  }
  await db.query('UPDATE meetings SET version=version+1 WHERE id=$1',[id]);
}
export function checkVersion(m:{id:string,version:number},expected:string|null) {requireThat(expected,428,'PRECONDITION_REQUIRED');requireThat(expected===etag(m),412,'VERSION_CONFLICT');}
export function requireMember(ms:Record<string,any>[],actor:Actor) {const member=ms.find(r=>r.user_id===actor.id);requireThat(member,403,'FORBIDDEN');return member;}
export async function createMeeting(db:DB,actor:Actor,input:{termId:string,topic:string,type:string,placeId:string,capacity:number,twoPersonAcknowledged?:boolean}) {
  const term=await termFor(db,input.termId,actor.school_id);
  requireThat(term.today>=term.starts_on && term.today<=term.ends_on,422,'DATE_OUT_OF_RANGE');
  requireThat(!await creationRestricted(db,actor.id),403,'CREATION_RESTRICTED');
  requireThat(input.capacity!==2 || input.twoPersonAcknowledged,422,'TWO_PERSON_ACK_REQUIRED');
  await validatePlace(db,input.placeId,actor.school_id);
  const m=(await db.query(`INSERT INTO meetings(host_id,term_id,topic,type,place_id,capacity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[actor.id,input.termId,input.topic,input.type,input.placeId,input.capacity])).rows[0];
  await db.query('INSERT INTO meeting_members(meeting_id,user_id,member_no) VALUES($1,$2,1)',[m.id,actor.id]);
  return detail(db,actor,m.id);
}
export async function join(db:DB,actor:Actor,id:string) {
  const m=await getMeeting(db,actor,id),ms=await members(db,id),existing=ms.find(r=>r.user_id===actor.id);
  if(existing) return {userId:actor.id,memberNo:existing.member_no};
  requireThat(m.state!=='proposing',409,'PROPOSAL_IN_PROGRESS');
  requireThat(ms.length<m.capacity,409,'MEETING_FULL');
  requireThat(!await membershipConflict(db,actor.id,id),409,'MEMBERSHIP_CONFLICT');
  requireThat(m.state!=='confirmed' || (await mySlots(db,actor,m,ms)).includes(m.confirmed_slot),422,'SLOT_NOT_ALLOWED');
  await db.query('INSERT INTO meeting_members(meeting_id,user_id,member_no) VALUES($1,$2,$3)',[id,actor.id,m.next_member_no]);
  await db.query('UPDATE meetings SET next_member_no=next_member_no+1,version=version+1 WHERE id=$1',[id]);
  return {userId:actor.id,memberNo:m.next_member_no};
}
export async function leave(db:DB,actor:Actor,id:string,target=actor.id,kick=false) {
  const m=await getMeeting(db,actor,id);
  if(kick) requireThat(m.host_id===actor.id && target!==actor.id,403,'FORBIDDEN');
  else requireThat(m.host_id!==actor.id,409,'HOST_CANNOT_LEAVE');
  const removed=await db.query('DELETE FROM meeting_members WHERE meeting_id=$1 AND user_id=$2',[id,target]);
  if(removed.rowCount) await revalidate(db,id,false);
}
async function overrideState(db:DB,actor:Actor,id:string) {
  const m = await getMeeting(db,actor,id);
  const member = requireMember(await members(db,id),actor);
  const row = m.term_available?(await db.query('SELECT slots FROM meeting_overrides WHERE meeting_id=$1 AND user_id=$2',[id,actor.id])).rows[0]:undefined;
  const currentSlots: number[] | null = row?.slots ?? null;

  return {m,view:{overrideSlots:currentSlots,effectiveSlots:member.slots}};
}
export async function override(db:DB,actor:Actor,id:string) {
  return (await overrideState(db,actor,id)).view;
}
export async function saveOverride(db:DB,actor:Actor,id:string,slots:number[]) {
  const {m,view:current}=await overrideState(db,actor,id);
  await termFor(db,m.term_id,actor.school_id);
  await validateSlots(db,m.term_id,slots);
  if(JSON.stringify(current.overrideSlots)===JSON.stringify(slots)) return current;
  await db.query(`INSERT INTO meeting_overrides(meeting_id,user_id,slots) VALUES($1,$2,$3)
    ON CONFLICT(meeting_id,user_id) DO UPDATE SET slots=EXCLUDED.slots,updated_at=now()`,[id,actor.id,slots]);
  await revalidate(db,id);
  return {overrideSlots:slots,effectiveSlots:slots};
}
export async function deleteOverride(db:DB,actor:Actor,id:string) {
  const current=await override(db,actor,id);
  if(current.overrideSlots===null) return;
  await db.query('DELETE FROM meeting_overrides WHERE meeting_id=$1 AND user_id=$2',[id,actor.id]);
  await revalidate(db,id);
}
async function confirm(db:DB,m:Record<string,any>,date:string,slot:number,source:string) {
  return (await db.query(`UPDATE meetings SET state='confirmed',confirmed_date=$2,confirmed_slot=$3,confirmation_source=$4,version=version+1,
    expires_at=least(created_at+interval '120 days',($2::date+30)::timestamp AT TIME ZONE $5) WHERE id=$1 RETURNING id,version,state`,[m.id,date,slot,source,m.timezone])).rows[0];
}
export async function coordinate(db:DB,actor:Actor,id:string,date:string,slot:number,expected:string|null,proposal=false) {
  const m=await getMeeting(db,actor,id);requireThat(m.host_id===actor.id,403,'FORBIDDEN');checkVersion(m,expected);
  requireThat(m.state==='undecided',409,'STATE_CONFLICT');
  const ms=await members(db,id);requireThat(ms.length>=2,422,'TOO_FEW_MEMBERS');
  const common=intersection(ms.map(r=>r.slots));
  requireThat(proposal?!common.length:common.includes(slot),422,proposal?'INTERSECTION_EXISTS':'NO_INTERSECTION');
  await validateDate(db,m.term_id,actor.school_id,date,slot);
  if(proposal) {
    const p=(await db.query('INSERT INTO proposals(meeting_id,proposed_date,proposed_slot) VALUES($1,$2,$3) RETURNING id',[id,date,slot])).rows[0];
    const updated=(await db.query("UPDATE meetings SET state='proposing',version=version+1 WHERE id=$1 RETURNING id,version",[id])).rows[0];
    return {data:await proposalView(db,actor,p.id),etag:etag(updated)};
  }
  const updated=await confirm(db,m,date,slot,'intersection');
  return {data:await detail(db,actor,id),etag:etag(updated)};
}
export async function accept(db:DB,actor:Actor,id:string,proposalId:string,expected:string|null) {
  const m=await getMeeting(db,actor,id),ms=await members(db,id),member=requireMember(ms,actor);checkVersion(m,expected);
  const p=(await db.query('SELECT * FROM proposals WHERE id=$1 AND meeting_id=$2',[proposalId,id])).rows[0];
  requireThat(p && p.status!=='cancelled',409,'PROPOSAL_STALE');
  const view=await proposalView(db,actor,proposalId);
  if(view.myAccepted) return {data:{...view,state:m.state},etag:etag(m)};
  requireThat(m.state==='proposing' && p.status==='pending',409,'PROPOSAL_STALE');
  await validateDate(db,m.term_id,actor.school_id,p.proposed_date,p.proposed_slot);
  await db.query('INSERT INTO proposal_acceptances(proposal_id,user_id) VALUES($1,$2)',[proposalId,actor.id]);
  view.acceptedMemberNos=[...view.acceptedMemberNos,member.member_no].sort((a,b)=>a-b);
  view.myAccepted=true;
  let updated;
  if(view.acceptedMemberNos.length===ms.length) {
    await db.query("UPDATE proposals SET status='accepted' WHERE id=$1",[proposalId]);
    updated=await confirm(db,m,p.proposed_date,p.proposed_slot,'proposal');view.status='accepted';
  } else updated=(await db.query('UPDATE meetings SET version=version+1 WHERE id=$1 RETURNING id,version,state',[id])).rows[0];
  return {data:{...view,state:updated.state},etag:etag(updated)};
}
export async function addComment(db:DB,actor:Actor,id:string,body:string) {
  await getMeeting(db,actor,id);const member=requireMember(await members(db,id),actor);
  const c=(await db.query('INSERT INTO comments(meeting_id,author_id,author_member_no,body) VALUES($1,$2,$3,$4) RETURNING *',[id,actor.id,member.member_no,body])).rows[0];
  return {id:c.id,memberNo:c.author_member_no,body:c.body,createdAt:c.created_at.toISOString(),isMine:true};
}
