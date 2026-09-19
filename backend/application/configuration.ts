import {privacyKeys} from '../../shared/privacy';
import type {DB} from './ports';
import {parseDate,coordinationRange,slotMatchesDate} from '../../shared/date';
import {requireThat} from '../domain/errors';
import {demoAccounts,demoPrivacyVersion} from './demo';
export async function settings(db:DB) {
  return (await db.configuration.getSettings()).rows[0];
}
export async function registrationReady(db:DB,config:Awaited<ReturnType<typeof settings>>) {
  if(db.runtime.demoEnabled&&config?.privacy_version===demoPrivacyVersion) return true;
  if(!config || !config.registration_open || !config.launch_verified_at || config.today>=config.service_ends_on || config.today<config.starts_on || config.today>config.ends_on) return false;
  const notice=config.privacy_notice;
  if(!privacyKeys.every(k=>notice[k] && (typeof notice[k]!=='string'||notice[k].trim()))) return false;
  if(!db.runtime.deletionDeliveryReady||!db.runtime.mailReady) return false;
  return Boolean((await db.configuration.hasRegistrationData([config.current_term_id,config.school_id])).rowCount);
}
export async function configuration(db:DB) {
  const c=await settings(db);
  if(!c) return {school:null,term:null,places:[],registrationAvailable:false,privacyVersion:null,privacyNotice:null};
  return {school:{id:c.school_id,name:c.school_name,timezone:c.timezone,departments:c.departments,entryYears:c.entry_years},term:{id:c.current_term_id,startsOn:c.starts_on,endsOn:c.ends_on,
    slots:await termSlots(db,c.current_term_id)},
    places:(await db.configuration.listActivePlaces([c.school_id])).rows,
    registrationAvailable:await registrationReady(db,c),privacyVersion:c.privacy_version,privacyNotice:c.privacy_notice,
    ...(db.runtime.demoEnabled&&c.privacy_version===demoPrivacyVersion?{demoAccounts}:{}),
  };
}
export async function termSlots(db:DB,termId:string) {
  return (await db.configuration.listTermSlots([termId])).rows;
}
export async function validatePlace(db:DB,placeId:string,schoolId:string) {
  requireThat((await db.configuration.findActivePlace([placeId,schoolId])).rowCount,404,'NOT_FOUND');
}
export async function termFor(db:DB,termId:string,schoolId:string) {
  const term=(await db.configuration.findRetainedTerm([termId,schoolId])).rows[0];
  requireThat(term,404,'NOT_FOUND');return term;
}
export async function validateSlots(db:DB,termId:string,slots:number[]) {
  const allowed=(await termSlots(db,termId)).map(r=>r.slot);
  requireThat(slots.every(s=>allowed.includes(s)),422,'SLOT_NOT_ALLOWED');
}
export async function validateDate(db:DB,termId:string,schoolId:string,date:string,slot:number) {
  const term=await termFor(db,termId,schoolId);await validateSlots(db,termId,[slot]);
  const range=coordinationRange(term.today,term.starts_on,term.ends_on);
  requireThat(parseDate(date) && date>=range.min && date<=range.max && slotMatchesDate(date,slot),422,'DATE_OUT_OF_RANGE');
}
