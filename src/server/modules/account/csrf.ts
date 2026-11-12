import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../../db.js';
import { AppError } from '../../errors.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class CsrfService {
  constructor(private readonly db: Db) {}

  async issue(sessionId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.db.tx(async tx => {
      await tx.query('DELETE FROM csrf_tokens WHERE expires_at <= now()');
      await tx.query("INSERT INTO csrf_tokens(token_hash,session_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')", [digest(token), sessionId]);
    });
    return token;
  }

  async consume(sessionId: string, token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(403, 'FORBIDDEN', '安全验证已失效，请重试');
    const consumed = await this.db.one('DELETE FROM csrf_tokens WHERE token_hash=$1 AND session_id=$2 AND expires_at>now() RETURNING token_hash', [digest(token), sessionId]);
    if (!consumed) throw new AppError(403, 'FORBIDDEN', '安全验证已失效，请重试');
  }
}
