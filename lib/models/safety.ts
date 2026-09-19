import 'server-only';
import type {DB} from '../db';
import {requireThat} from '../errors';
import {getMeeting,revalidate,type Actor} from './meetings';
export async function targetUser(db:DB,actor:Actor,id:string,allowBlocked=false) {
  const u=(await db.query(`SELECT * FROM users u WHERE u.id=$1 AND u.school_id=$2
    AND ($4 OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id)))`,[id,actor.school_id,actor.id,allowBlocked])).rows[0];
  requireThat(u,404,'NOT_FOUND');return u;
}
export async function report(db:DB,actor:Actor,input:{targetType:string,targetId:string,reason:string}) {
  if(input.targetType==='user') {await targetUser(db,actor,input.targetId);requireThat(input.targetId!==actor.id,403,'FORBIDDEN');}
  else {const m=await getMeeting(db,actor,input.targetId);requireThat(m.host_id!==actor.id,403,'FORBIDDEN');}
  const r=(await db.query('INSERT INTO reports(reporter_id,target_user_id,target_meeting_id,reason) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',[actor.id,input.targetType==='user'?input.targetId:null,input.targetType==='meeting'?input.targetId:null,input.reason])).rows[0];
  return {id:r.id,status:r.status,createdAt:r.created_at.toISOString()};
}
export async function block(db:DB,actor:Actor,id:string,remove=false) {
  if(remove) {await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',[actor.id,id]);return;}
  await targetUser(db,actor,id,true);requireThat(actor.id!==id,400,'INVALID_INPUT');
  await db.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor.id,id]);
  for(const m of (await db.query(`SELECT m.id,m.host_id FROM meetings m JOIN meeting_members a ON a.meeting_id=m.id AND a.user_id=$1
    JOIN meeting_members b ON b.meeting_id=m.id AND b.user_id=$2 ORDER BY m.id`,[actor.id,id])).rows) {
    await db.query('DELETE FROM meeting_members WHERE meeting_id=$1 AND user_id=$2',[m.id,m.host_id===actor.id?id:actor.id]);await revalidate(db,m.id,true,false);
  }
  const b=(await db.query('SELECT created_at FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',[actor.id,id])).rows[0];
  return {userId:id,createdAt:b.created_at.toISOString()};
}
