import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/server/config.js';
import { Db } from '../../src/server/db.js';

const environment = {
  DATABASE_URL: 'postgresql://test:test@localhost/test', REDIS_URL: 'redis://localhost:6379',
  CHAT_BASE_URL: 'http://localhost:4999/v1', CHAT_API_KEY: 'synthetic-key', CHAT_MODEL: 'fixture-chat',
  EMBEDDING_BASE_URL: 'http://localhost:4999/v1', EMBEDDING_API_KEY: 'synthetic-key', EMBEDDING_MODEL: 'fixture-embedding',
};
test('OPS-01 required configuration fails by name without revealing values', () => {
  assert.throws(() => loadConfig({ ...environment, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => loadConfig({ ...environment, CHAT_API_KEY: '' }), /CHAT_API_KEY/);
  try { loadConfig({ ...environment, DATABASE_URL: 'private-password' }); } catch (error) {
    assert.ok(!String(error).includes('private-password'));
  }
});
test('OPS-01 configuration distinguishes local secure-cookie setup and production', () => {
  assert.equal(loadConfig(environment).port, 3100);
  assert.equal(loadConfig(environment).secureCookies, true);
  assert.throws(() => loadConfig({ ...environment, NODE_ENV: 'production', COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
});
test('PERF-02 database pool limit has a safe default and applies to the pool', async () => {
  assert.equal(loadConfig(environment).databasePoolMax,12);
  const config=loadConfig({...environment,DB_POOL_MAX:'4'});
  const db=new Db(config.databaseUrl,undefined,config.databasePoolMax);
  try { assert.equal(db.pool.options.max,4); } finally { await db.close(); }
  for(const invalid of ['0','101','1.5','not-a-number']) assert.throws(()=>loadConfig({...environment,DB_POOL_MAX:invalid}),/DB_POOL_MAX/);
});
