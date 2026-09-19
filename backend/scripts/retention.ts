import {run} from './run';
import {transaction,deliverDeletions} from '../composition';
import {cleanup} from '../application/retention';
await run('RETENTION_FAILED',async()=>{await transaction(cleanup);while(await deliverDeletions()===500) {}});
