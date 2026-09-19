import {pool} from '../adapters/db';
import {logError} from '../adapters/log';

export async function run(code:string,work:()=>Promise<void>) {
  try {await work();}
  catch {logError(code);process.exitCode=1;}
  finally {await pool.end();}
}
