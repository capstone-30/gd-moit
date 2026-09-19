import {pool,transaction} from '../lib/db';
import {cleanup,deliverDeletions} from '../lib/models/retention';
try {await transaction(cleanup);await deliverDeletions();}
catch {console.error(JSON.stringify({code:'RETENTION_FAILED',at:new Date().toISOString()}));process.exitCode=1;}
finally {await pool.end();}
