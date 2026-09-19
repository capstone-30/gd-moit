import 'server-only';
import type {DB} from '../db';
import {requireThat} from '../errors';
import {creationRestricted,publicProfile,revalidate} from './meetings';
import {termFor,validateSlots} from './configuration';
import type {Actor} from './meetings';
import type {Account} from './auth';
export async function me(db:DB,u:Account) {
  return {id:u.id,email:u.email,role:u.role,displayName:u.display_name,...publicProfile(u),optionalProfileConsent:Boolean(u.optional_profile_consented_at),creationRestricted:u.role==='student'?await creationRestricted(db,u.id):false};
}
export async function updateProfile(db:DB,u:Account,input:Record<string,any>) {
  const consent=input.optionalProfileConsent??Boolean(u.optional_profile_consented_at);
  const mapping={displayName:'display_name',department:'department',entryYear:'entry_year',interests:'interests'} as const;
  let updated;
  if(!consent) {
    requireThat(input.optionalProfileConsent===false || !Object.keys(mapping).some(k=>input[k]!=null && (k!=='interests'||input[k].length)),400,'INVALID_INPUT');
    updated=(await db.query('UPDATE users SET display_name=NULL,department=NULL,entry_year=NULL,interests=\'{}\',optional_profile_consented_at=NULL WHERE id=$1 RETURNING *',[u.id])).rows[0];
  } else {
    const school=(await db.query('SELECT departments,entry_years FROM schools WHERE id=$1',[u.school_id])).rows[0];
    if(input.department!=null) requireThat(school.departments.includes(input.department),400,'INVALID_INPUT');
    if(input.entryYear!=null) requireThat(school.entry_years.includes(input.entryYear),400,'INVALID_INPUT');
    const values=Object.entries(mapping).map(([key,column])=>input[key]===undefined?u[column]:input[key]);
    updated=(await db.query(`UPDATE users SET display_name=$2,department=$3,entry_year=$4,interests=$5,optional_profile_consented_at=coalesce(optional_profile_consented_at,now()) WHERE id=$1 RETURNING *`,[u.id,...values.map((v,i)=>i===3?(v??[]):v)])).rows[0];
  }
  return me(db,updated);
}
export async function savedAvailability(db:DB,actor:Actor) {
  return (await db.query(`SELECT t.id AS "termId",t.name,t.starts_on AS "startsOn",t.ends_on AS "endsOn",a.slots,
    (SELECT coalesce(json_agg(json_build_object('slot',ts.slot_code,'startsAt',ts.starts_at,'endsAt',ts.ends_at) ORDER BY ts.slot_code),'[]'::json)
      FROM term_slots ts WHERE ts.term_id=t.id) AS "termSlots"
    FROM availability a JOIN terms t ON t.id=a.term_id JOIN schools s ON s.id=t.school_id
    WHERE a.user_id=$1 AND t.school_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    ORDER BY t.starts_on DESC,t.id`,[actor.id,actor.school_id])).rows;
}
export async function availability(db:DB,actor:Actor,termId:string) {
  await termFor(db,termId,actor.school_id);
  const row=(await db.query('SELECT * FROM availability WHERE user_id=$1 AND term_id=$2',[actor.id,termId])).rows[0];
  return {termId,registered:Boolean(row),slots:row?.slots??[],updatedAt:row?.updated_at.toISOString()??null};
}
export async function saveAvailability(db:DB,actor:Actor,termId:string,slots:number[]) {
  const current=await availability(db,actor,termId);
  await validateSlots(db,termId,slots);
  if(current.registered && JSON.stringify(current.slots)===JSON.stringify(slots)) return current;
  const row=(await db.query(`INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3) ON CONFLICT(user_id,term_id) DO UPDATE SET slots=EXCLUDED.slots,updated_at=now() RETURNING updated_at`,[actor.id,termId,slots])).rows[0];
  for(const m of (await db.query(`SELECT m.id FROM meetings m JOIN meeting_members mm ON mm.meeting_id=m.id WHERE mm.user_id=$1 AND m.term_id=$2 ORDER BY m.id`,[actor.id,termId])).rows) await revalidate(db,m.id);
  return {termId,registered:true,slots,updatedAt:row.updated_at.toISOString()};
}
export async function deleteAccount(db:DB,actor:Actor) {
  const affected=(await db.query('SELECT meeting_id FROM meeting_members WHERE user_id=$1 ORDER BY meeting_id',[actor.id])).rows;
  const email=(await db.query('SELECT email FROM users WHERE id=$1',[actor.id])).rows[0]?.email;
  // Tombstones are written in the same transaction, including hosted meetings.
  await db.query(`INSERT INTO deletion_outbox(entity_id)
    SELECT id FROM meetings WHERE host_id=$1 UNION ALL
    SELECT id FROM hosted_meetings WHERE host_id=$1 UNION ALL
    SELECT id FROM hosted_projects WHERE host_id=$1 UNION ALL SELECT $1::uuid`,[actor.id]);
  await db.query('DELETE FROM otp_challenges WHERE email=$1',[email]);
  await db.query('DELETE FROM users WHERE id=$1',[actor.id]);
  for(const m of affected) await revalidate(db,m.meeting_id,false);
}
