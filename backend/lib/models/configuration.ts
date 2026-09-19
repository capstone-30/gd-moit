import 'server-only';
import {privacyKeys} from '../../../shared/privacy';
import type {DB} from '../db';
import {parseDate,coordinationRange,slotMatchesDate} from '../../../shared/date';
import {requireThat} from '../errors';
import {demoEnabled,demoAccounts,demoPrivacyVersion} from './demo';
export async function settings(db:DB) {
  return (await db.query(`SELECT a.*, s.name AS school_name,s.timezone,s.departments,s.entry_years,t.starts_on,t.ends_on,
    to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM app_settings a JOIN schools s ON s.id=a.school_id JOIN terms t ON t.id=a.current_term_id AND t.school_id=a.school_id WHERE a.id=1`)).rows[0];
}
export async function registrationReady(db:DB,config:Awaited<ReturnType<typeof settings>>) {
  if(demoEnabled()&&config?.privacy_version===demoPrivacyVersion) return true;
  if(!config || !config.registration_open || !config.launch_verified_at || config.today>=config.service_ends_on || config.today<config.starts_on || config.today>config.ends_on) return false;
  const notice=config.privacy_notice;
  if(!privacyKeys.every(k=>notice[k] && (typeof notice[k]!=='string'||notice[k].trim()))) return false;
  if(!process.env.DELETION_DELIVERY_URL || !process.env.DELETION_DELIVERY_TOKEN) return false;
  if(!process.env.SMTP_HOST && !(process.env.NODE_ENV!=='production' && process.env.TEST_MAIL_DIR)) return false;
  return Boolean((await db.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM term_slots WHERE term_id=$1)
    AND EXISTS(SELECT 1 FROM places WHERE school_id=$2 AND active) AND EXISTS(SELECT 1 FROM school_domains WHERE school_id=$2)`,[config.current_term_id,config.school_id])).rowCount);
}
export async function configuration(db:DB) {
  const c=await settings(db);
  if(!c) return {school:null,term:null,places:[],registrationAvailable:false,privacyVersion:null,privacyNotice:null};
  return {school:{id:c.school_id,name:c.school_name,timezone:c.timezone,departments:c.departments,entryYears:c.entry_years},term:{id:c.current_term_id,startsOn:c.starts_on,endsOn:c.ends_on,
    slots:await termSlots(db,c.current_term_id)},
    places:(await db.query('SELECT id,name FROM places WHERE school_id=$1 AND active ORDER BY name,id',[c.school_id])).rows,
    registrationAvailable:await registrationReady(db,c),privacyVersion:c.privacy_version,privacyNotice:c.privacy_notice,
    ...(demoEnabled()&&c.privacy_version===demoPrivacyVersion?{demoAccounts}:{}),
  };
}
export async function termSlots(db:DB,termId:string) {
  return (await db.query('SELECT slot_code AS slot,starts_at AS "startsAt",ends_at AS "endsAt" FROM term_slots WHERE term_id=$1 ORDER BY slot_code',[termId])).rows;
}
export async function validatePlace(db:DB,placeId:string,schoolId:string) {
  requireThat((await db.query('SELECT 1 FROM places WHERE id=$1 AND school_id=$2 AND active',[placeId,schoolId])).rowCount,404,'NOT_FOUND');
}
export async function termFor(db:DB,termId:string,schoolId:string) {
  const term=(await db.query(`SELECT t.*,s.timezone,to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM terms t JOIN schools s ON s.id=t.school_id WHERE t.id=$1 AND t.school_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`,[termId,schoolId])).rows[0];
  requireThat(term,404,'NOT_FOUND');return term;
}
export async function validateSlots(db:DB,termId:string,slots:number[]) {
  const allowed=(await db.query('SELECT slot_code FROM term_slots WHERE term_id=$1',[termId])).rows.map(r=>r.slot_code);
  requireThat(slots.every(s=>allowed.includes(s)),422,'SLOT_NOT_ALLOWED');
}
export async function validateDate(db:DB,termId:string,schoolId:string,date:string,slot:number) {
  const term=await termFor(db,termId,schoolId);await validateSlots(db,termId,[slot]);
  const range=coordinationRange(term.today,term.starts_on,term.ends_on);
  requireThat(parseDate(date) && date>=range.min && date<=range.max && slotMatchesDate(date,slot),422,'DATE_OUT_OF_RANGE');
}
