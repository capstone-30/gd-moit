import {readFile} from 'node:fs/promises';
import {pool,transaction} from '../lib/db';
import {deleteAccount} from '../lib/models/profile';
import {cleanup} from '../lib/models/retention';
import {uuid} from '../lib/controllers/input';
// Input must merge the separate private deletion store and ALL undelivered outbox records.
try {
  const records:unknown=JSON.parse(await readFile(process.argv[2],'utf8'));
  if(!Array.isArray(records)) throw new Error('INVALID_DELETION_LIST');
  const ids=records.map(r=>uuid(r.entityId));
  await transaction(async db=>{
    await db.query('UPDATE app_settings SET registration_open=false,launch_verified_at=NULL');
    for(const id of ids) {
      const u=(await db.query('SELECT id,school_id FROM users WHERE id=$1',[id])).rows[0];if(u) await deleteAccount(db,u);
      await db.query('DELETE FROM meetings WHERE id=$1',[id]);
    }
    await cleanup(db);
  });
} catch {console.error(JSON.stringify({code:'RESTORE_DELETIONS_FAILED',at:new Date().toISOString()}));process.exitCode=1;}
finally {await pool.end();}
