import {readFile,readdir} from 'node:fs/promises';
import {pool} from '../lib/db';
const db=await pool.connect();
try {
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(3042025)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
    if((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount) continue;
    await db.query(await readFile(`db/migrations/${name}`,'utf8'));
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
  }
  await db.query('COMMIT');
} catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();await pool.end();}
