import {pool} from '../lib/db';
import {logError} from '../lib/log';

export async function run(code:string,work:()=>Promise<void>) {
  try {await work();}
  catch {logError(code);process.exitCode=1;}
  finally {await pool.end();}
}
