import 'server-only';
import type {DB} from '../db';
import {requireThat} from '../errors';
import {creationRestricted,publicProfile,revalidate} from './meetings';
import {termFor,validateSlots} from './configuration';
import type {Actor} from './meetings';
export async function me(db:DB,actor:Actor) {
  const u=(await db.query('SELECT * FROM users WHERE id=$1',[actor.id])).rows[0];requireThat(u,401,'UNAUTHENTICATED');
  return {id:u.id,email:u.email,displayName:u.display_name,...publicProfile(u),optionalProfileConsent:Boolean(u.optional_profile_consented_at),creationRestricted:await creationRestricted(db,u.id)};
}
export async function updateProfile(db:DB,actor:Actor,input:Record<string,any>) {
  const u=(await db.query('SELECT * FROM users WHERE id=$1',[actor.id])).rows[0];
  const consent=input.optionalProfileConsent??Boolean(u.optional_profile_consented_at);
  const mapping={displayName:'display_name',department:'department',entryYear:'entry_year',interests:'interests'};
  if(!consent) {
    requireThat(input.optionalProfileConsent===false || !Object.keys(mapping).some(k=>input[k]!=null && (k!=='interests'||input[k].length)),400,'INVALID_INPUT');
    await db.query('UPDATE users SET display_name=NULL,department=NULL,entry_year=NULL,interests=\'{}\',optional_profile_consented_at=NULL WHERE id=$1',[actor.id]);
  } else {
    const school=(await db.query('SELECT departments,entry_years FROM schools WHERE id=$1',[actor.school_id])).rows[0];
    if(input.department!=null) requireThat(school.departments.includes(input.department),400,'INVALID_INPUT');
    if(input.entryYear!=null) requireThat(school.entry_years.includes(input.entryYear),400,'INVALID_INPUT');
    const values=Object.entries(mapping).map(([key,column])=>input[key]===undefined?u[column]:input[key]);
    await db.query(`UPDATE users SET display_name=$2,department=$3,entry_year=$4,interests=$5,optional_profile_consented_at=coalesce(optional_profile_consented_at,now()) WHERE id=$1`,[actor.id,...values.map((v,i)=>i===3?(v??[]):v)]);
  }
  return me(db,actor);
}
export async function availability(db:DB,actor:Actor,termId:string,slots?:number[]) {
  await termFor(db,termId,actor.school_id);
  const row=(await db.query('SELECT * FROM availability WHERE user_id=$1 AND term_id=$2',[actor.id,termId])).rows[0];
  if(slots!==undefined) {
    await validateSlots(db,termId,slots);
    if(!row || JSON.stringify(row.slots)!==JSON.stringify(slots)) {
      await db.query(`INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3) ON CONFLICT(user_id,term_id) DO UPDATE SET slots=EXCLUDED.slots,updated_at=now()`,[actor.id,termId,slots]);
      for(const m of (await db.query(`SELECT m.id FROM meetings m JOIN meeting_members mm ON mm.meeting_id=m.id WHERE mm.user_id=$1 AND m.term_id=$2 ORDER BY m.id`,[actor.id,termId])).rows) await revalidate(db,m.id);
    }
  }
  const r=(await db.query('SELECT * FROM availability WHERE user_id=$1 AND term_id=$2',[actor.id,termId])).rows[0];
  return {termId,registered:Boolean(r),slots:r?.slots??[],updatedAt:r?.updated_at.toISOString()??null};
}
export async function deleteAccount(db:DB,actor:Actor) {
  const affected=(await db.query('SELECT meeting_id FROM meeting_members WHERE user_id=$1 ORDER BY meeting_id',[actor.id])).rows;
  const email=(await db.query('SELECT email FROM users WHERE id=$1',[actor.id])).rows[0]?.email;
  // Tombstones are written in the same transaction, including hosted meetings.
  await db.query('INSERT INTO deletion_outbox(entity_id) SELECT id FROM meetings WHERE host_id=$1',[actor.id]);
  await db.query('INSERT INTO deletion_outbox(entity_id) VALUES($1)',[actor.id]);
  await db.query('DELETE FROM otp_challenges WHERE email=$1',[email]);
  await db.query('DELETE FROM users WHERE id=$1',[actor.id]);
  for(const m of affected) await revalidate(db,m.meeting_id,true,false);
}
