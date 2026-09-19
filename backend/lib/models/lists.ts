import 'server-only';
import type {DB} from '../db';
import {detail,getMeeting,members,requireMember,publicProfile,type Actor} from './meetings';
import {paginate,type Page} from '../pagination';
export async function listMeetings(db:DB,actor:Actor,filter:{topic:string,type:string|null,overlapOnly:boolean,membership:string},p:Page) {
  const ranked=filter.membership==='unjoined';
  const rows=(await db.query(`SELECT m.id,m.created_at,to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM meetings m JOIN terms t ON t.id=m.term_id WHERE t.school_id=$1 AND m.expires_at>now()
    AND position(lower($2) IN lower(m.topic))>0 AND ($3::text IS NULL OR m.type=$3)
    AND ($4::timestamptz IS NULL OR (m.created_at,m.id)<($4::timestamptz,$5::uuid))
    AND ($7::text='all' OR EXISTS(SELECT 1 FROM meeting_members mm WHERE mm.meeting_id=m.id AND mm.user_id=$6)=($7='joined'))
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$6 AND b.blocked_id=m.host_id) OR (b.blocked_id=$6 AND b.blocker_id=m.host_id)) ORDER BY m.created_at DESC,m.id DESC`,[actor.school_id,filter.topic,filter.type,ranked?null:p.after?.at??null,p.after?.id??null,actor.id,filter.membership])).rows;
  // shortcut: scan pilot meetings for overlap ranking; move ranking into SQL if the dataset grows.
  const selected:{id:string,cursor_at:string,cursor_rank?:number,data:Awaited<ReturnType<typeof detail>>}[]=[];
  for(const row of rows) {
    const data=await detail(db,actor,row.id,true);
    if(filter.overlapOnly && !data.overlapsMyAvailability) continue;
    const rank=data.overlapsMyAvailability?0:1;
    if(ranked && p.after) {
      const afterRank=p.after.rank??0;
      if(rank<afterRank || rank===afterRank && (row.cursor_at>p.after.at || row.cursor_at===p.after.at && row.id>=p.after.id)) continue;
    }
    selected.push({id:row.id,cursor_at:row.cursor_at,...(ranked?{cursor_rank:rank}:{}),data});
    if(!ranked && selected.length>p.limit) break;
  }
  if(ranked) selected.sort((a,b)=>a.cursor_rank!-b.cursor_rank!);
  return paginate(selected,p,v=>v.data);
}
export async function comments(db:DB,actor:Actor,id:string,p:Page) {
  await getMeeting(db,actor,id);requireMember(await members(db,id),actor);
  const rows=(await db.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM comments WHERE meeting_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT $4`,[id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,c=>({id:c.id,memberNo:c.author_member_no,body:c.body,createdAt:c.created_at.toISOString(),isMine:c.author_id===actor.id}));
}
export async function blocks(db:DB,actor:Actor,p:Page) {
  const rows=(await db.query(`SELECT b.blocked_id AS id,b.created_at,to_char(b.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,u.department,u.entry_year,u.interests FROM blocks b JOIN users u ON u.id=b.blocked_id
    WHERE b.blocker_id=$1 AND ($2::timestamptz IS NULL OR (b.created_at,b.blocked_id)>($2::timestamptz,$3::uuid)) ORDER BY b.created_at,b.blocked_id LIMIT $4`,[actor.id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,b=>({userId:b.id,profile:publicProfile(b),createdAt:b.created_at.toISOString()}));
}
