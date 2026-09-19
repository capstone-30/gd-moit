import 'server-only';
import {pool,transaction,type DB} from '../db';
import {revalidate} from './meetings';
import {deleteAccount} from './profile';
export async function cleanup(db:DB) {
  const affected=(await db.query(`SELECT DISTINCT mm.meeting_id FROM meeting_members mm JOIN meetings m ON m.id=mm.meeting_id
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id WHERE now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`)).rows;
  await db.query(`DELETE FROM availability a USING terms t,schools s WHERE a.term_id=t.id AND s.id=t.school_id AND now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`);
  await db.query(`DELETE FROM meeting_overrides o USING meetings m,terms t,schools s WHERE o.meeting_id=m.id AND m.term_id=t.id AND s.id=t.school_id AND now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`);
  for(const m of affected) await revalidate(db,m.meeting_id);
  await db.query('INSERT INTO deletion_outbox(entity_id) SELECT id FROM meetings WHERE expires_at<=now()');
  await db.query('DELETE FROM meetings WHERE expires_at<=now()');
  for(const table of ['otp_challenges','auth_limits','sessions','reports']) await db.query(`DELETE FROM ${table} WHERE expires_at<=now()`);
  const ended=(await db.query(`SELECT a.school_id FROM app_settings a JOIN schools s ON s.id=a.school_id WHERE now() AT TIME ZONE s.timezone>=a.service_ends_on::timestamp`)).rows[0];
  if(ended) {
    await db.query('UPDATE app_settings SET registration_open=false WHERE id=1');
    for(const u of (await db.query('SELECT id,school_id FROM users WHERE school_id=$1 ORDER BY id',[ended.school_id])).rows) await deleteAccount(db,u);
  }
  await db.query("DELETE FROM deletion_outbox WHERE delivered_at IS NOT NULL AND deleted_at<now()-interval '8 days'");
}
export async function deliverDeletions() {
  const records=(await pool.query('SELECT id,entity_id,deleted_at FROM deletion_outbox WHERE delivered_at IS NULL ORDER BY deleted_at,id LIMIT 500')).rows;
  if(!records.length) return;
  if(!process.env.DELETION_DELIVERY_URL || !process.env.DELETION_DELIVERY_TOKEN) throw new Error('DELETION_DELIVERY_UNCONFIGURED');
  // Receiver must idempotently persist {entityId,deletedAt} in a separate private store with an 8-day lifecycle.
  const response=await fetch(process.env.DELETION_DELIVERY_URL,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.DELETION_DELIVERY_TOKEN}`},body:JSON.stringify(records.map(r=>({entityId:r.entity_id,deletedAt:r.deleted_at.toISOString()}))),signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('DELETION_DELIVERY_FAILED');
  await transaction(db=>db.query('UPDATE deletion_outbox SET delivered_at=now() WHERE id=ANY($1::uuid[])',[records.map(r=>r.id)]));
}
