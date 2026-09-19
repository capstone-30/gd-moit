import type {DB} from './ports';
import {detail,getMeeting,members,requireMember,publicProfile,commentView,type Actor} from './meetings';
import {paginate,type Page} from './pagination';
export async function listMeetings(db:DB,actor:Actor,filter:{type:string|null,membership:string},p:Page) {
  const ranked=filter.membership==='unjoined';
  const rows=(await db.lists.listVisibleCandidates([actor.school_id,filter.type,ranked?null:p.after?.at??null,p.after?.id??null,actor.id,filter.membership])).rows;
  // shortcut: scan pilot meetings for overlap ranking; move ranking into SQL if the dataset grows.
  const selected:{id:string,cursor_at:string,cursor_rank?:number,data:Awaited<ReturnType<typeof detail>>}[]=[];
  for(const row of rows) {
    const data=await detail(db,actor,row.id,true);
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
  const rows=(await db.lists.listComments([id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,c=>commentView(c,actor.id));
}
export async function blocks(db:DB,actor:Actor,p:Page) {
  const rows=(await db.lists.listBlockedUsers([actor.id,p.after?.at??null,p.after?.id??null,p.limit+1])).rows;
  return paginate(rows,p,b=>({userId:b.id,profile:publicProfile(b),createdAt:b.created_at.toISOString()}));
}
