import {run} from './run';
import {transaction} from '../lib/db';
import {seedDemo,demoEnabled} from '../lib/models/demo';
import {requireThat} from '../lib/errors';
import {execFileSync} from 'node:child_process';

await run('DEMO_SETUP_FAILED',async()=>{
  requireThat(demoEnabled(),400,'INVALID_INPUT');
  execFileSync(process.execPath,['--env-file-if-exists=frontend/.env.local','--conditions=react-server','--import','tsx','backend/scripts/migrate.ts'],{stdio:'inherit'});
  await transaction(seedDemo);
});
