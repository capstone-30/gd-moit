import type {DB} from './ports';
import {requireThat} from '../domain/errors';
import {creationRestricted,publicProfile,revalidate} from './meetings';
import {termFor,validateSlots} from './configuration';
import type {Actor} from './meetings';
import type {Account} from './auth';
export async function me(db:DB,u:Account) {
  return {id:u.id,email:u.email,role:u.role,displayName:u.display_name,...publicProfile(u),optionalProfileConsent:Boolean(u.optional_profile_consented_at),creationRestricted:u.role==='student'?await creationRestricted(db,u.id):false};
}
export async function updateProfile(db:DB,u:Account,input:Record<string,any>) {
  const consent=input.optionalProfileConsent??Boolean(u.optional_profile_consented_at);
  let updated;
  if(!consent) {
    requireThat(input.optionalProfileConsent===false || ![input.displayName,input.department,input.entryYear].some(value=>value!=null) && !input.interests?.length,400,'INVALID_INPUT');
    updated=(await db.profile.clearOptionalProfile([u.id])).rows[0];
  } else {
    const school=(await db.profile.findProfileOptions([u.school_id])).rows[0];
    if(input.department!=null) requireThat(school.departments.includes(input.department),400,'INVALID_INPUT');
    if(input.entryYear!=null) requireThat(school.entry_years.includes(input.entryYear),400,'INVALID_INPUT');
    const {displayName=u.display_name,department=u.department,entryYear=u.entry_year,interests=u.interests}=input;
    updated=(await db.profile.saveProfile([u.id,displayName,department,entryYear,interests??[]])).rows[0];
  }
  return me(db,updated);
}
export async function savedAvailability(db:DB,actor:Actor) {
  return (await db.profile.listSavedAvailability([actor.id,actor.school_id])).rows;
}
export async function availability(db:DB,actor:Actor,termId:string) {
  await termFor(db,termId,actor.school_id);
  const row=(await db.profile.findAvailability([actor.id,termId])).rows[0];
  return {termId,registered:Boolean(row),slots:row?.slots??[],updatedAt:row?.updated_at.toISOString()??null};
}
export async function saveAvailability(db:DB,actor:Actor,termId:string,slots:number[]) {
  const current=await availability(db,actor,termId);
  await validateSlots(db,termId,slots);
  if(current.registered && current.slots.length===slots.length && current.slots.every((slot:number,index:number)=>slot===slots[index])) return current;
  const row=(await db.profile.saveAvailability([actor.id,termId,slots])).rows[0];
  for(const m of (await db.profile.listJoinedMeetingIds([actor.id,termId])).rows) await revalidate(db,m.id);
  return {termId,registered:true,slots,updatedAt:row.updated_at.toISOString()};
}
export async function deleteAccount(db:DB,actor:Actor) {
  const affected=(await db.profile.listAffectedMeetings([actor.id])).rows;
  // Tombstones are written in the same transaction, including hosted meetings.
  await db.profile.recordAccountDeletion([actor.id]);
  await db.profile.removeAccountChallenges([actor.id]);
  await db.profile.deleteUser([actor.id]);
  for(const m of affected) await revalidate(db,m.meeting_id,false);
}
