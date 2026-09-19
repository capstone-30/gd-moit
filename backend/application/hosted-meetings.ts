import type {AccountRole} from '../../shared/account';
import type {DocumentsInput} from '../../shared/activity-documents';
import type {DB} from './ports';
import {requireThat} from '../domain/errors';
import {settings,termSlots,validateDate,validatePlace} from './configuration';
import {paginate,type Page} from './pagination';

type Actor={id:string;school_id:string;role:AccountRole};
type MeetingInput={title:string;studentEmails:string[]};

async function project(db:DB,actor:Actor,id:string) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const row=(await db.hostedMeetings.findOwnedProject([id,actor.id,actor.school_id])).rows[0];
  requireThat(row,404,'NOT_FOUND');return row;
}
export async function projects(db:DB,actor:Actor,p:Page) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const rows=(await db.hostedMeetings.listOwnedProjects([actor.id,actor.school_id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,({cursor_at,...row})=>row);
}
export async function createProject(db:DB,actor:Actor,input:{title:string}) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const c=await settings(db);requireThat(c&&c.school_id===actor.school_id,422,'INVALID_INPUT');
  return (await db.hostedMeetings.createProject([actor.id,c.current_term_id,input.title])).rows[0];
}
export async function createBatch(db:DB,actor:Actor,id:string,input:{meetings:MeetingInput[]}) {
  const p=await project(db,actor,id);
  const c=await settings(db);requireThat(c?.current_term_id===p.term_id,409,'STATE_CONFLICT');
  requireThat(c.school_id===actor.school_id,422,'INVALID_INPUT');
  const meetings=[];
  for(const meeting of input.meetings) meetings.push(await insertMeeting(db,actor,meeting,c.current_term_id,p));
  return {createdCount:meetings.length,meetings};
}

async function get(db:DB,actor:Actor,id:string) {
  const row=(await db.hostedMeetings.findVisibleMeeting([id,actor.school_id,actor.role,actor.id])).rows[0];
  requireThat(row,404,'NOT_FOUND');return row;
}
const etag=(id:string,version:string|number)=>`"${id}-v${version}"`;
function document(row:Record<string,any>) {
  return {content:row.content,outcome:row.outcome,expenses:row.expenses as DocumentsInput['expenses'],submittedAt:row.submitted_at.toISOString(),updatedAt:row.updated_at.toISOString(),etag:etag(row.membership_id,row.version)};
}
export async function detail(db:DB,actor:Actor,id:string) {
  const h=await get(db,actor,id);
  const members=(await db.hostedMeetings.listVisibleMembers([id,actor.role==='institution',actor.id])).rows;
  const own=members.find(m=>m.user_id===actor.id),isMember=Boolean(own);
  return {id:h.id,title:h.title,date:h.activity_date,slot:h.slot,place:h.place_name,placeId:h.place_id,capacity:h.capacity,memberCount:members.length,
    ...(h.project_id?{projectId:h.project_id,projectTitle:h.project_title}:{}),
    isMember,canSubmit:isMember&&h.activity_date!==null&&h.activity_date<=h.today,
    etag:etag(h.id,h.version),term:{id:h.term_id,startsOn:h.starts_on,endsOn:h.ends_on,slots:await termSlots(db,h.term_id)},
    canSchedule:isMember&&!h.has_documents,
    expiresAt:h.expires_at.toISOString(),myDocuments:own?.submitted_at&&actor.role==='student'?document(own):null,
    ...(actor.role==='institution'?{members:members.map(m=>({userId:m.user_id,memberNo:m.member_no,documents:m.submitted_at?document(m):null}))}:{}),
  };
}
export async function list(db:DB,actor:Actor,p:Page,projectId?:string) {
  if(projectId) await project(db,actor,projectId);
  const rows=(await db.hostedMeetings.listVisibleMeetings([actor.school_id,actor.role,actor.id,p.after?.at??null,p.after?.id??null,p.limit+1,projectId??null])).rows;
  return paginate(rows,p,({cursor_at,submittedCount,project_id,project_title,...meeting})=>({
    ...meeting,...(project_id?{projectId:project_id,projectTitle:project_title}:{}),...(actor.role==='institution'?{submittedCount}:{}),
  }));
}
async function insertMeeting(db:DB,actor:Actor,input:MeetingInput,termId:string,p:{id:string;expires_at:Date}) {
  const students=(await db.hostedMeetings.findAssignableStudents([actor.school_id,input.studentEmails])).rows;
  requireThat(students.length===input.studentEmails.length,422,'INVALID_INPUT');
  const h=(await db.hostedMeetings.createMeeting([actor.id,termId,input.title,students.length,p.id,p.expires_at])).rows[0];
  await db.hostedMeetings.assignMembers([h.id,students.map(s=>s.id)]);
  return detail(db,actor,h.id);
}
export async function schedule(db:DB,actor:Actor,id:string,input:{date:string;slot:number;placeId:string},expected:string|null) {
  requireThat(actor.role==='student',403,'FORBIDDEN');
  const h=await get(db,actor,id);
  requireThat(etag(h.id,h.version)===expected,412,'VERSION_CONFLICT');
  requireThat(!h.has_documents,409,'STATE_CONFLICT');
  await validateDate(db,h.term_id,actor.school_id,input.date,input.slot);
  await validatePlace(db,input.placeId,actor.school_id);
  await db.hostedMeetings.updateSchedule([id,input.date,input.slot,input.placeId,actor.school_id]);
  return detail(db,actor,id);
}
export async function publishNotice(db:DB,actor:Actor,input:{meetingIds:string[];title:string;body:string}) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  for(const id of input.meetingIds) await get(db,actor,id);
  await db.hostedMeetings.createNotice([input.meetingIds,input.title,input.body]);
  return {publishedCount:input.meetingIds.length};
}
export async function notices(db:DB,actor:Actor,id:string,p:Page) {
  await get(db,actor,id);
  const rows=(await db.hostedMeetings.listNotices([id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,({cursor_at,...notice})=>notice);
}
export async function remove(db:DB,actor:Actor,id:string) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');await get(db,actor,id);
  await db.hostedMeetings.recordMeetingDeletion([id]);
  await db.hostedMeetings.deleteMeeting([id]);
}
export async function leave(db:DB,actor:Actor,id:string) {
  requireThat(actor.role==='student',403,'FORBIDDEN');await get(db,actor,id);
  await db.hostedMeetings.recordMembershipDeletion([id,actor.id]);
  await db.hostedMeetings.deleteMembership([id,actor.id]);
}
export async function submit(db:DB,actor:Actor,id:string,input:DocumentsInput,expected:string|null) {
  requireThat(actor.role==='student',403,'FORBIDDEN');const h=await get(db,actor,id);
  requireThat(h.activity_date!==null&&h.activity_date<=h.today&&input.expenses.every(e=>e.date<=h.today),422,'DATE_OUT_OF_RANGE');
  const current=(await db.hostedMeetings.findOwnDocuments([id,actor.id])).rows[0];
  requireThat((current?etag(current.membership_id,current.version):null)===expected,412,'VERSION_CONFLICT');
  await db.hostedMeetings.saveDocuments([id,actor.id,input.content,input.outcome,JSON.stringify(input.expenses)]);
  return detail(db,actor,id);
}
export function csv(rows:(string|number)[][]) {
  return '\uFEFF'+rows.map(row=>row.map(value=>{
    let text=String(value);if(/^[\s\uFEFF]*[=+\-@]/u.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n')+'\r\n';
}
export async function download(db:DB,actor:Actor,id:string,userId:string,kind:'activity'|'expenses') {
  const h=await get(db,actor,id);
  requireThat(actor.role==='institution'||userId===actor.id,403,'FORBIDDEN');
  const row=(await db.hostedMeetings.findDownloadableDocuments([id,userId])).rows[0];
  requireThat(row,404,'NOT_FOUND');
  if(kind==='activity') return csv([['모임','활동일','참여 번호','활동 내용','활동 성과','최초 제출','최종 수정'],[h.title,h.activity_date,row.member_no,row.content,row.outcome,row.submitted_at.toISOString(),row.updated_at.toISOString()]]);
  const expenses=row.expenses as DocumentsInput['expenses'];
  return csv([['모임','참여 번호','지출일','사용 목적','금액(원)'],...expenses.map(e=>[h.title,row.member_no,e.date,e.description,e.amount]),['합계','','','',expenses.reduce((n,e)=>n+e.amount,0)]]);
}
