import 'server-only';
import { Pool, types, type PoolClient } from 'pg';
import { ApiError } from './errors';
// Dates are school-local dates, never converted through the host timezone.
types.setTypeParser(1082, value => value);
const globalDb = globalThis as typeof globalThis & { moitPool?: Pool };
export const pool = globalDb.moitPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_CA ? {ca:process.env.DATABASE_CA.replace(/\\n/g,'\n'),rejectUnauthorized:true} : undefined,
  max: 10,
});
pool.on('error', () => console.error(JSON.stringify({code:'DB_CONNECTION_ERROR',at:new Date().toISOString()})));
export type DB = PoolClient;
export async function transaction<T>(work:(db:DB)=>Promise<T>, write=true):Promise<T> {
  for(let attempt=0;attempt<3;attempt++) {
    const db = await pool.connect();
    try {
      await db.query(write?'BEGIN ISOLATION LEVEL READ COMMITTED':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL lock_timeout = '5s'");
      if(write) {
        // ponytail: serialize the 50-user pilot; narrow to affected rows if throughput requires it.
        // All mutators (including cleanup/auth) use this gate and users -> meetings lock order.
        await db.query('SELECT pg_advisory_xact_lock(3042026)');
        await db.query('SELECT id FROM users ORDER BY id FOR UPDATE');
        await db.query('SELECT id FROM meetings ORDER BY id FOR UPDATE');
      }
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch(error) {
      await db.query('ROLLBACK');
      const code = (error as {code?:string}).code;
      if(['40001','40P01','55P03'].includes(code??'')) {
        if(attempt<2) continue;
        throw new ApiError(503,'RETRYABLE_CONFLICT');
      }
      throw error;
    } finally {db.release();}
  }
  throw new ApiError(503,'RETRYABLE_CONFLICT');
}
