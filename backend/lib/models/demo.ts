import 'server-only';
import {privacyKeys} from '../../../shared/privacy';
import type {DB} from '../db';
import {requireThat} from '../errors';

export const demoAccounts=[
  {email:'institution.demo@tukorea.ac.kr',role:'institution',label:'담당자'},
  {email:'student.demo@tukorea.ac.kr',role:'student',label:'학생 1'},
  {email:'student2.demo@tukorea.ac.kr',role:'student',label:'학생 2'},
] as const;
export const demoPrivacyVersion='local-demo-v1';

export function demoEnabled(env:Record<string,string|undefined>=process.env) {
  if(env.NODE_ENV==='production'||env.DEMO_LOGIN!=='true') return false;
  try {
    const origin=new URL(env.APP_ORIGIN??''),database=new URL(env.DATABASE_URL??'');
    const local=(host:string)=>['localhost','127.0.0.1','[::1]'].includes(host);
    return origin.protocol==='http:'&&local(origin.hostname)&&local(database.hostname)&&database.pathname.endsWith('_demo');
  } catch {return false;}
}

export async function seedDemo(db:DB) {
  requireThat(demoEnabled(),400,'INVALID_INPUT');
  const existing=(await db.query('SELECT privacy_version,school_id FROM app_settings WHERE id=1')).rows[0];
  requireThat(existing?.privacy_version===demoPrivacyVersion||!(await db.query('SELECT 1 FROM schools LIMIT 1')).rowCount,409,'STATE_CONFLICT');
  let school=existing?.school_id;
  if(!existing) {
    school=(await db.query("INSERT INTO schools(name,timezone) VALUES('tukorea.ac.kr · 로컬 데모','Asia/Seoul') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO school_domains(domain,school_id) VALUES('tukorea.ac.kr',$1)",[school]);
    const term=(await db.query("INSERT INTO terms(school_id,name,starts_on,ends_on) VALUES($1,'합성 데모 학기',current_date-1,current_date+90) RETURNING id",[school])).rows[0].id;
    const notice=Object.fromEntries(privacyKeys.map(key=>[key,'로컬 합성 데이터 시연용입니다. 실제 운영 고지가 아닙니다. 실제 메일은 발송하지 않습니다.']));
    await db.query("INSERT INTO app_settings(id,school_id,current_term_id,service_ends_on,privacy_version,privacy_notice) VALUES(1,$1,$2,current_date+90,$3,$4)",[school,term,demoPrivacyVersion,JSON.stringify(notice)]);
  }
  const places=['TIP','중앙도서관','공학관E동'];
  await db.query("UPDATE places SET name='TIP' WHERE school_id=$1 AND name='합성 데모 공간 · 실제 장소 아님'",[school]);
  await db.query(`INSERT INTO places(school_id,name)
    SELECT $1,name FROM unnest($2::text[]) AS name
    WHERE NOT EXISTS(SELECT 1 FROM places WHERE school_id=$1 AND places.name=name.name)`,[school,places]);
  await db.query('UPDATE places SET active=(name=ANY($2::text[])) WHERE school_id=$1',[school,places]);
  await db.query(`INSERT INTO term_slots(term_id,slot_code,starts_at,ends_at)
    SELECT current_term_id,day*100+period,make_time(8+period,30,0),make_time(9+period,20,0)
    FROM app_settings CROSS JOIN generate_series(1,5) AS day CROSS JOIN generate_series(1,12) AS period WHERE id=1
    ON CONFLICT(term_id,slot_code) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at`);
  for(const account of demoAccounts) await db.query('INSERT INTO users(school_id,email,role,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO NOTHING',[school,account.email,account.role,demoPrivacyVersion]);
}
