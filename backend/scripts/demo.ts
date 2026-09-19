import {run} from './run';
import {transaction} from '../composition';
import {seedDemo,demoEnabled} from '../application/demo';
import {requireThat} from '../domain/errors';
import {execFileSync} from 'node:child_process';

await run('DEMO_SETUP_FAILED',async()=>{
  requireThat(demoEnabled(process.env),400,'INVALID_INPUT');
  execFileSync(process.execPath,['--env-file-if-exists=frontend/.env.local','--conditions=react-server','--import','tsx','backend/scripts/migrate.ts'],{stdio:'inherit'});
  await transaction(seedDemo);
});
