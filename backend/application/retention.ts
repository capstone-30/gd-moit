import type {DB} from './ports';
import {revalidate} from './meetings';
import {deleteAccount} from './profile';
export async function cleanup(db:DB) {
  const affected=(await db.retention.listMeetingsWithExpiredAvailability()).rows;
  await db.retention.deleteExpiredAvailability();
  for(const m of affected) await revalidate(db,m.meeting_id);
  for(const table of ['meetings','hosted_projects','hosted_meetings']) {
    await db.retention.deleteExpiredEntities(table);
  }
  for(const table of ['otp_challenges','auth_limits','sessions','reports']) await db.retention.deleteExpiredRecords(table);
  const ended=(await db.retention.findEndedService()).rows[0];
  if(ended) {
    await db.retention.closeRegistration();
    for(const u of (await db.retention.listSchoolUsers([ended.school_id])).rows) await deleteAccount(db,u);
  }
  await db.retention.deleteDeliveredHistory();
}
