import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Db } from './db.js';
import { loadConfig } from './config.js';

export async function migrate(db: Db) {
  await db.tx(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(7381204)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir('migrations')).filter(n => n.endsWith('.sql')).sort()) {
      if (await tx.one('SELECT name FROM schema_migrations WHERE name=$1', [name])) continue;
      await tx.query(await readFile(path.join('migrations', name), 'utf8'));
      await tx.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const db = new Db(loadConfig().databaseUrl);
  try { await migrate(db); console.log('Migrations applied'); } finally { await db.close(); }
}
