import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Actor } from '../../context.js';
import type { Db } from '../../db.js';
import { AppError } from '../../errors.js';
import { AccountRepository } from './repository.js';

const scrypt = promisify(scryptCallback);
const password = z.string().min(8).max(128);
const credentials = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[\p{L}\p{N}_-]+$/u),
  password,
}).strict();
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', '请重新登录');

async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(value, salt, 64) as Buffer).toString('hex')}`;
}

async function verifyPassword(value: string, hash: string) {
  const [salt, expected] = hash.split(':');
  const actual = await scrypt(value, salt, 64) as Buffer;
  return actual.length === Buffer.from(expected, 'hex').length
    && timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export class AuthService {
  private repository: AccountRepository;

  constructor(private db: Db) {
    this.repository = new AccountRepository(db);
  }

  async register(input: unknown): Promise<Actor> {
    const data = credentials.parse(input);
    const hash = await hashPassword(data.password);
    try {
      return await this.repository.create(data.username, hash);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, 'CONFLICT', '用户名已被使用');
      }
      throw error;
    }
  }

  private async issue(user: Actor, db: Db = this.db, sessionId?: string, previousRefresh?: string) {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const accessHash = tokenHash(accessToken);
    const refreshHash = tokenHash(refreshToken);
    const session = sessionId
      ? await this.repository.rotateSession(sessionId, previousRefresh, accessHash, refreshHash, db)
      : await this.repository.createSession(user.id, accessHash, refreshHash, db);
    if (!session) throw unauthenticated();
    return { user, accessToken, refreshToken, sessionId: session.id };
  }

  async login(input: unknown) {
    const data = credentials.parse(input);
    const user = await this.repository.credentials(data.username);
    const hash = user?.password_hash ?? `00000000000000000000000000000000:${'0'.repeat(128)}`;
    const valid = await verifyPassword(data.password, hash);
    if (!user || !valid) throw new AppError(401, 'UNAUTHENTICATED', '用户名或密码错误');
    return this.db.tx(async tx => {
      const current = await this.repository.lockCredentials(user.id, tx);
      if (!current || current.password_hash !== hash) {
        throw new AppError(401, 'UNAUTHENTICATED', '用户名或密码错误');
      }
      return this.issue({ id: current.id, username: current.username, role: current.role }, tx);
    });
  }

  async refresh(token: string) {
    if (!token) throw unauthenticated();
    return this.db.tx(async tx => {
      const row = await this.repository.refreshSession(tokenHash(token), tx);
      if (!row) throw unauthenticated();
      return this.issue({ id: row.id, username: row.username, role: row.role }, tx, row.session_id, tokenHash(token));
    });
  }

  async refreshSessionId(token: string) {
    if (!token) return null;
    return (await this.repository.refreshSessionId(tokenHash(token)))?.id ?? null;
  }

  async authenticate(token: string): Promise<{ actor: Actor; sessionId: string } | null> {
    if (!token) return null;
    const row = await this.repository.accessSession(tokenHash(token));
    return row
      ? { actor: { id: row.id, username: row.username, role: row.role }, sessionId: row.session_id }
      : null;
  }

  async logout(sessionId: string) {
    await this.repository.removeSession(sessionId);
  }

  async changePassword(userId: string, input: unknown) {
    const data = z.object({ oldPassword: password, newPassword: password }).strict().parse(input);
    const user = await this.repository.password(userId);
    if (!user || !await verifyPassword(data.oldPassword, user.password_hash)) {
      throw new AppError(401, 'UNAUTHENTICATED', '当前密码不正确');
    }
    const hash = await hashPassword(data.newPassword);
    await this.db.tx(async tx => {
      const changed = await this.repository.replacePassword(userId, user.password_hash, hash, tx);
      if (!changed) throw new AppError(409, 'CONFLICT', '密码已更新，请重新登录');
      await this.repository.removeUserSessions(userId, tx);
    });
  }
}
