import {run} from './run';
import {readFile} from 'node:fs/promises';
import {transaction} from '../composition';
import {restoreDeletions} from '../application/operations';
import {uuid} from '../adapters/http/input';
// Input must merge the separate private deletion store and ALL undelivered outbox records.
await run('RESTORE_DELETIONS_FAILED',async()=>{
  const records:unknown=JSON.parse(await readFile(process.argv[2],'utf8'));
  if(!Array.isArray(records)) throw new Error('INVALID_DELETION_LIST');
  const ids=records.map(r=>uuid(r.entityId));
  await transaction(db=>restoreDeletions(db,ids));
});
