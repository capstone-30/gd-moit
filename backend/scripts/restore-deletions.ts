import {run} from './run';
import {readFile} from 'node:fs/promises';
import {transaction} from '../lib/db';
import {deleteAccount} from '../lib/models/profile';
import {cleanup} from '../lib/models/retention';
import {uuid} from '../lib/controllers/input';
// Input must merge the separate private deletion store and ALL undelivered outbox records.
await run('RESTORE_DELETIONS_FAILED',async()=>{
  const records:unknown=JSON.parse(await readFile(process.argv[2],'utf8'));
  if(!Array.isArray(records)) throw new Error('INVALID_DELETION_LIST');
  const ids=records.map(r=>uuid(r.entityId));
  await transaction(async db=>{
    await db.query('UPDATE app_settings SET registration_open=false,launch_verified_at=NULL');
    for(const id of ids) {
      const u=(await db.query('SELECT id,school_id FROM users WHERE id=$1',[id])).rows[0];if(u) await deleteAccount(db,u);
      await db.query('DELETE FROM meetings WHERE id=$1',[id]);
      await db.query('DELETE FROM hosted_meetings WHERE id=$1',[id]);
      await db.query('DELETE FROM hosted_projects WHERE id=$1',[id]);
      await db.query('DELETE FROM hosted_members WHERE id=$1',[id]);
    }
    await cleanup(db);
  });
});
