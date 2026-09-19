import {run} from './run';
import {transaction} from '../lib/db';
import {cleanup,deliverDeletions} from '../lib/models/retention';
await run('RETENTION_FAILED',async()=>{await transaction(cleanup);while(await deliverDeletions()===500) {}});
