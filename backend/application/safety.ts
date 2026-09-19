import type {DB} from './ports';
import {requireThat} from '../domain/errors';
import {getMeeting,revalidate,type Actor} from './meetings';
export async function targetUser(db:DB,actor:Actor,id:string,allowBlocked=false) {
  const u=(await db.safety.findVisibleUser([id,actor.school_id,actor.id,allowBlocked])).rows[0];
  requireThat(u,404,'NOT_FOUND');return u;
}
export async function report(db:DB,actor:Actor,input:{targetType:string,targetId:string,reason:string}) {
  if(input.targetType==='user') {await targetUser(db,actor,input.targetId);requireThat(input.targetId!==actor.id,403,'FORBIDDEN');}
  else {const m=await getMeeting(db,actor,input.targetId);requireThat(m.host_id!==actor.id,403,'FORBIDDEN');}
  const r=(await db.safety.createReport([actor.id,input.targetType==='user'?input.targetId:null,input.targetType==='meeting'?input.targetId:null,input.reason])).rows[0];
  return {id:r.id,status:r.status,createdAt:r.created_at.toISOString()};
}
export async function block(db:DB,actor:Actor,id:string,remove=false) {
  if(remove) {await db.safety.removeBlock([actor.id,id]);return;}
  await targetUser(db,actor,id,true);requireThat(actor.id!==id,400,'INVALID_INPUT');
  await db.safety.createBlock([actor.id,id]);
  for(const m of (await db.safety.listSharedMeetings([actor.id,id])).rows) {
    await db.safety.removeConflictingMember([m.id,m.host_id===actor.id?id:actor.id]);await revalidate(db,m.id,false);
  }
  const b=(await db.safety.findBlock([actor.id,id])).rows[0];
  return {userId:id,createdAt:b.created_at.toISOString()};
}
