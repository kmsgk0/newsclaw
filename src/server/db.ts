import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { logger } from './logger.js';

export class Db {
  readonly pool: pg.Pool;
  constructor(connection: string | pg.Pool, private client?: PoolClient) {
    this.pool = typeof connection === 'string' ? new pg.Pool({ connectionString: connection, max: 12, connectionTimeoutMillis: 3000 }) : connection;
    if(typeof connection==='string') this.pool.on('error',()=>logger.warn({module:'database',result:'connection-lost'},'Idle database connection closed'));
  }
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await (this.client ?? this.pool).query<T>(sql, params)).rows;
  }
  async one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }
  async tx<T>(operation: (db: Db) => Promise<T>): Promise<T> {
    if (this.client) return operation(this);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(new Db(this.pool, client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async close() { if (!this.client) await this.pool.end(); }
}
