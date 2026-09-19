import 'server-only';
import type {DB} from '../db';
import {requireThat} from '../errors';
import {settings,termSlots,validateDate,validatePlace} from './configuration';
import {paginate,type Page} from '../pagination';

type Actor={id:string;school_id:string;role:'student'|'institution'};
type MeetingInput={title:string;studentEmails:string[]};
export type DocumentsInput={content:string;outcome:string;expenses:{date:string;description:string;amount:number}[]};

async function project(db:DB,actor:Actor,id:string) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const row=(await db.query(`SELECT p.* FROM hosted_projects p JOIN terms t ON t.id=p.term_id
    WHERE p.id=$1 AND p.host_id=$2 AND t.school_id=$3 AND p.expires_at>now()`,[id,actor.id,actor.school_id])).rows[0];
  requireThat(row,404,'NOT_FOUND');return row;
}
export async function projects(db:DB,actor:Actor,p:Page) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const rows=(await db.query(`SELECT p.id,p.title,p.expires_at AS "expiresAt",
    (SELECT count(*)::integer FROM hosted_meetings h WHERE h.project_id=p.id AND h.expires_at>now()) AS "meetingCount",
    to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_projects p JOIN terms t ON t.id=p.term_id
    WHERE p.host_id=$1 AND t.school_id=$2 AND p.expires_at>now()
    AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3::timestamptz,$4::uuid))
    ORDER BY p.created_at DESC,p.id DESC LIMIT $5`,[actor.id,actor.school_id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,({cursor_at,...row})=>row);
}
export async function createProject(db:DB,actor:Actor,input:{title:string}) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const c=await settings(db);requireThat(c&&c.school_id===actor.school_id,422,'INVALID_INPUT');
  return (await db.query(`INSERT INTO hosted_projects(host_id,term_id,title) VALUES($1,$2,$3)
    RETURNING id,title,expires_at AS "expiresAt",0 AS "meetingCount"`,[actor.id,c.current_term_id,input.title])).rows[0];
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
  const row=(await db.query(`SELECT h.*,p.name AS place_name,hp.title AS project_title,t.school_id,t.starts_on,t.ends_on,
    EXISTS(SELECT 1 FROM activity_documents WHERE meeting_id=h.id) AS has_documents,
    to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM hosted_meetings h JOIN terms t ON t.id=h.term_id JOIN schools s ON s.id=t.school_id LEFT JOIN places p ON p.id=h.place_id LEFT JOIN hosted_projects hp ON hp.id=h.project_id
    WHERE h.id=$1 AND t.school_id=$2 AND h.expires_at>now() AND (h.project_id IS NULL OR hp.expires_at>now()) AND (($3='student' AND EXISTS(SELECT 1 FROM hosted_members WHERE meeting_id=h.id AND user_id=$4)) OR ($3='institution' AND h.host_id=$4))`,[id,actor.school_id,actor.role,actor.id])).rows[0];
  requireThat(row,404,'NOT_FOUND');return row;
}
const etag=(id:string,version:string|number)=>`"${id}-v${version}"`;
function document(row:Record<string,any>) {
  return {content:row.content,outcome:row.outcome,expenses:row.expenses as DocumentsInput['expenses'],submittedAt:row.submitted_at.toISOString(),updatedAt:row.updated_at.toISOString(),etag:etag(row.membership_id,row.version)};
}
export async function detail(db:DB,actor:Actor,id:string) {
  const h=await get(db,actor,id);
  const members=(await db.query(`SELECT d.*,m.user_id,m.member_no,m.id AS membership_id
    FROM hosted_members m LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id AND ($2 OR d.user_id=$3)
    WHERE m.meeting_id=$1 ORDER BY m.member_no`,[id,actor.role==='institution',actor.id])).rows;
  const isMember=members.some(m=>m.user_id===actor.id);
  const own=members.find(m=>m.user_id===actor.id);
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
  const rows=(await db.query(`SELECT h.id,h.title,h.activity_date AS date,h.slot,p.name AS place,h.capacity,
    count(m.user_id)::integer AS "memberCount",coalesce(bool_or(m.user_id=$3),false) AS "isMember",
    count(d.user_id)::integer AS "submittedCount",
    h.project_id,hp.title AS project_title,
    to_char(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_meetings h JOIN terms t ON t.id=h.term_id LEFT JOIN places p ON p.id=h.place_id LEFT JOIN hosted_projects hp ON hp.id=h.project_id
    LEFT JOIN hosted_members m ON m.meeting_id=h.id
    LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id
    WHERE t.school_id=$1 AND h.expires_at>now() AND (($2='student' AND EXISTS(SELECT 1 FROM hosted_members WHERE meeting_id=h.id AND user_id=$3)) OR ($2='institution' AND h.host_id=$3))
    AND (h.project_id IS NULL OR hp.expires_at>now()) AND ($7::uuid IS NULL OR h.project_id=$7)
    AND ($4::timestamptz IS NULL OR (h.created_at,h.id)<($4::timestamptz,$5::uuid))
    GROUP BY h.id,p.name,hp.title ORDER BY h.created_at DESC,h.id DESC LIMIT $6`,[actor.school_id,actor.role,actor.id,p.after?.at??null,p.after?.id??null,p.limit+1,projectId??null])).rows;
  return paginate(rows,p,({cursor_at,submittedCount,project_id,project_title,...meeting})=>({
    ...meeting,...(project_id?{projectId:project_id,projectTitle:project_title}:{}),...(actor.role==='institution'?{submittedCount}:{}),
  }));
}
export async function create(db:DB,actor:Actor,input:MeetingInput) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  const c=await settings(db);requireThat(c&&c.school_id===actor.school_id,422,'INVALID_INPUT');
  return insertMeeting(db,actor,input,c.current_term_id);
}
async function insertMeeting(db:DB,actor:Actor,input:MeetingInput,termId:string,p?:{id:string;expires_at:Date}) {
  const students=(await db.query(`SELECT u.id FROM unnest($2::text[]) WITH ORDINALITY AS e(email,member_no)
    JOIN users u ON u.email=e.email WHERE u.school_id=$1 AND u.role='student' ORDER BY e.member_no`,[actor.school_id,input.studentEmails])).rows;
  requireThat(students.length===input.studentEmails.length,422,'INVALID_INPUT');
  const h=(await db.query(`INSERT INTO hosted_meetings(host_id,term_id,title,capacity,expires_at,project_id)
    VALUES($1,$2,$3,$4,least(now()+interval '90 days',$6::timestamptz),$5) RETURNING id`,[actor.id,termId,input.title,students.length,p?.id??null,p?.expires_at??null])).rows[0];
  await db.query(`INSERT INTO hosted_members(meeting_id,user_id,member_no)
    SELECT $1,user_id,member_no FROM unnest($2::uuid[]) WITH ORDINALITY AS m(user_id,member_no)`,[h.id,students.map(s=>s.id)]);
  return detail(db,actor,h.id);
}
export async function schedule(db:DB,actor:Actor,id:string,input:{date:string;slot:number;placeId:string},expected:string|null) {
  requireThat(actor.role==='student',403,'FORBIDDEN');
  const h=await get(db,actor,id);
  requireThat(etag(h.id,h.version)===expected,412,'VERSION_CONFLICT');
  requireThat(!h.has_documents,409,'STATE_CONFLICT');
  await validateDate(db,h.term_id,actor.school_id,input.date,input.slot);
  await validatePlace(db,input.placeId,actor.school_id);
  await db.query(`UPDATE hosted_meetings h SET activity_date=$2,slot=$3,place_id=$4,version=h.version+1,
    expires_at=least(($2::date+30)::timestamp AT TIME ZONE s.timezone,h.created_at+interval '120 days',
      (SELECT expires_at FROM hosted_projects WHERE id=h.project_id))
    FROM schools s WHERE h.id=$1 AND s.id=$5`,[id,input.date,input.slot,input.placeId,actor.school_id]);
  return detail(db,actor,id);
}
export async function publishNotice(db:DB,actor:Actor,input:{meetingIds:string[];title:string;body:string}) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');
  for(const id of input.meetingIds) await get(db,actor,id);
  await db.query('INSERT INTO hosted_notices(meeting_id,title,body) SELECT unnest($1::uuid[]),$2,$3',[input.meetingIds,input.title,input.body]);
  return {publishedCount:input.meetingIds.length};
}
export async function notices(db:DB,actor:Actor,id:string,p:Page) {
  await get(db,actor,id);
  const rows=(await db.query(`SELECT id,title,body,created_at AS "createdAt",
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_notices WHERE meeting_id=$1
    AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
    ORDER BY created_at DESC,id DESC LIMIT $4`,[id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,({cursor_at,...notice})=>notice);
}
export async function remove(db:DB,actor:Actor,id:string) {
  requireThat(actor.role==='institution',403,'FORBIDDEN');await get(db,actor,id);
  await db.query('INSERT INTO deletion_outbox(entity_id) VALUES($1)',[id]);
  await db.query('DELETE FROM hosted_meetings WHERE id=$1',[id]);
}
export async function leave(db:DB,actor:Actor,id:string) {
  requireThat(actor.role==='student',403,'FORBIDDEN');await get(db,actor,id);
  await db.query('INSERT INTO deletion_outbox(entity_id) SELECT id FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',[id,actor.id]);
  await db.query('DELETE FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',[id,actor.id]);
}
export async function submit(db:DB,actor:Actor,id:string,input:DocumentsInput,expected:string|null) {
  requireThat(actor.role==='student',403,'FORBIDDEN');const h=await get(db,actor,id);
  requireThat(h.activity_date!==null&&h.activity_date<=h.today&&input.expenses.every(e=>e.date<=h.today),422,'DATE_OUT_OF_RANGE');
  const current=(await db.query('SELECT d.version,m.id AS membership_id FROM activity_documents d JOIN hosted_members m USING(meeting_id,user_id) WHERE d.meeting_id=$1 AND d.user_id=$2',[id,actor.id])).rows[0];
  requireThat((current?etag(current.membership_id,current.version):null)===expected,412,'VERSION_CONFLICT');
  await db.query(`INSERT INTO activity_documents(meeting_id,user_id,content,outcome,expenses) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(meeting_id,user_id) DO UPDATE SET content=EXCLUDED.content,outcome=EXCLUDED.outcome,expenses=EXCLUDED.expenses,updated_at=now(),version=activity_documents.version+1`,[id,actor.id,input.content,input.outcome,JSON.stringify(input.expenses)]);
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
  const row=(await db.query(`SELECT d.*,m.member_no FROM activity_documents d JOIN hosted_members m USING(meeting_id,user_id) WHERE d.meeting_id=$1 AND d.user_id=$2`,[id,userId])).rows[0];
  requireThat(row,404,'NOT_FOUND');
  if(kind==='activity') return csv([['모임','활동일','참여 번호','활동 내용','활동 성과','최초 제출','최종 수정'],[h.title,h.activity_date,row.member_no,row.content,row.outcome,row.submitted_at.toISOString(),row.updated_at.toISOString()]]);
  const expenses=row.expenses as DocumentsInput['expenses'];
  return csv([['모임','참여 번호','지출일','사용 목적','금액(원)'],...expenses.map(e=>[h.title,row.member_no,e.date,e.description,e.amount]),['합계','','','',expenses.reduce((n,e)=>n+e.amount,0)]]);
}
