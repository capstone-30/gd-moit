import type {DB,AccessAudit} from './ports';
import {requireThat} from '../domain/errors';
import {deleteAccount} from './profile';
import {cleanup} from './retention';
import type {AccountRole} from '../../shared/account';

export async function changeAccountRole(db:DB,audit:AccessAudit,userId:string,role:AccountRole,reason:string) {
  const user=(await db.operations.findUser([userId])).rows[0];
  requireThat(user,404,'NOT_FOUND');
  await audit.record(user.id,`account.role.${role}`,reason);
  await db.operations.changeRole([userId,role]);
  await db.operations.revokeSessions([userId]);
}
export async function reviewReport(db:DB,audit:AccessAudit,reportId:string,status:string,reason:string) {
  const report=(await db.operations.findReport([reportId])).rows[0];
  requireThat(report,404,'NOT_FOUND');
  await audit.record(report.id,`report.${status}`,reason);
  await db.operations.reviewReport([reportId,status,audit.operatorId,reason]);
}
export async function restoreDeletions(db:DB,ids:string[]) {
  await db.operations.closeRegistration();
  for(const user of (await db.operations.deletedUsers([ids])).rows) await deleteAccount(db,user);
  for(const entity of ['meetings','hosted_meetings','hosted_projects','hosted_members']) await db.operations.eraseEntities([ids],entity);
  await cleanup(db);
}
