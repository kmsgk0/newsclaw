import type { Actor } from '../../context.js';
import type { Db } from '../../db.js';

type Credentials = Actor & { password_hash: string };
type SessionActor = Actor & { session_id: string };

export class AccountRepository {
  constructor(private db: Db) {}

  async create(username: string, passwordHash: string) {
    return this.db.tx(async tx => {
      const user = await tx.one<Actor>(
        'INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username,role',
        [username, passwordHash],
      );
      await tx.query('INSERT INTO editors(user_id) VALUES($1)', [user!.id]);
      return user!;
    });
  }

  credentials(username: string) {
    return this.db.one<Credentials>(
      'SELECT id,username,role,password_hash FROM users WHERE username=$1',
      [username],
    );
  }

  lockCredentials(userId: string, tx: Db) {
    return tx.one<Credentials>(
      'SELECT id,username,role,password_hash FROM users WHERE id=$1 FOR UPDATE',
      [userId],
    );
  }

  createSession(userId: string, accessHash: string, refreshHash: string, db: Db) {
    return db.one<{ id: string }>(
      "INSERT INTO sessions(user_id,access_hash,refresh_hash,access_expires,refresh_expires) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '7 days') RETURNING id",
      [userId, accessHash, refreshHash],
    );
  }

  rotateSession(sessionId: string, previousRefresh: string | undefined, accessHash: string, refreshHash: string, tx: Db) {
    return tx.one<{ id: string }>(
      "UPDATE sessions SET access_hash=$1,refresh_hash=$2,access_expires=now()+interval '15 minutes' WHERE id=$3 AND refresh_hash=$4 AND refresh_expires>now() RETURNING id",
      [accessHash, refreshHash, sessionId, previousRefresh],
    );
  }

  refreshSession(refreshHash: string, tx: Db) {
    return tx.one<SessionActor>(
      'SELECT u.id,u.username,u.role,s.id session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_hash=$1 AND s.refresh_expires>now() FOR UPDATE OF s',
      [refreshHash],
    );
  }

  accessSession(accessHash: string) {
    return this.db.one<SessionActor>(
      'SELECT u.id,u.username,u.role,s.id session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.access_hash=$1 AND s.access_expires>now() AND s.refresh_expires>now()',
      [accessHash],
    );
  }

  async removeSession(sessionId: string) {
    await this.db.query('DELETE FROM sessions WHERE id=$1', [sessionId]);
  }

  password(userId: string) {
    return this.db.one<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id=$1',
      [userId],
    );
  }

  replacePassword(userId: string, previousHash: string, nextHash: string, tx: Db) {
    return tx.one(
      'UPDATE users SET password_hash=$1 WHERE id=$2 AND password_hash=$3 RETURNING id',
      [nextHash, userId, previousHash],
    );
  }

  async removeUserSessions(userId: string, tx: Db) {
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
  }
}
