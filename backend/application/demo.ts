import {privacyKeys} from '../../shared/privacy';
import type {DB} from './ports';
import {requireThat} from '../domain/errors';

export const demoAccounts=[
  {email:'institution.demo@tukorea.ac.kr',role:'institution',label:'담당자'},
  {email:'student.demo@tukorea.ac.kr',role:'student',label:'학생 1'},
  {email:'student2.demo@tukorea.ac.kr',role:'student',label:'학생 2'},
] as const;
export const demoPrivacyVersion='local-demo-v1';

export {demoEnabled} from '../domain/demo';

export async function seedDemo(db:DB) {
  requireThat(db.runtime.demoEnabled,400,'INVALID_INPUT');
  const existing=(await db.demo.getDemoSettings()).rows[0];
  requireThat(existing?.privacy_version===demoPrivacyVersion||!(await db.demo.hasSchools()).rowCount,409,'STATE_CONFLICT');
  let school=existing?.school_id;
  if(!existing) {
    school=(await db.demo.createDemoSchool()).rows[0].id;
    await db.demo.createDemoDomain([school]);
    const term=(await db.demo.createDemoTerm([school])).rows[0].id;
    const notice=Object.fromEntries(privacyKeys.map(key=>[key,'로컬 합성 데이터 시연용입니다. 실제 운영 고지가 아닙니다. 실제 메일은 발송하지 않습니다.']));
    await db.demo.createDemoSettings([school,term,demoPrivacyVersion,JSON.stringify(notice)]);
  }
  const places=['TIP','중앙도서관','공학관E동'];
  await db.demo.renameLegacyDemoPlace([school]);
  await db.demo.createDemoPlaces([school,places]);
  await db.demo.activateDemoPlaces([school,places]);
  await db.demo.upsertDemoSlots();
  for(const account of demoAccounts) await db.demo.createDemoUser([school,account.email,account.role,demoPrivacyVersion]);
}
