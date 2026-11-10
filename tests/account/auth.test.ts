import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../../src/server/modules/account/service.js';
import { createTestDb } from '../support/helpers.js';

test('ACC-01 registers one user and editor, rejects duplicate and invalid registration atomically', async () => {
  const env = await createTestDb();
  try {
    const auth = new AuthService(env.db);
    const user = await auth.register({ username: 'reader_a', password: 'correct-password' });
    assert.equal(user.role, 'user'); assert.ok(!('password_hash' in user));
    assert.equal((await env.db.query('SELECT * FROM editors WHERE user_id=$1',[user.id])).length, 1);
    await assert.rejects(auth.register({username:'reader_a',password:'correct-password'}), {code:'CONFLICT'});
    await assert.rejects(auth.register({username:'reader_b',password:'correct-password',role:'admin'}), /Unrecognized|unrecognized/);
    await env.db.query("CREATE FUNCTION reject_editor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
    await env.db.query('CREATE TRIGGER reject_editor BEFORE INSERT ON editors FOR EACH ROW EXECUTE FUNCTION reject_editor()');
    await assert.rejects(auth.register({username:'reader_fail',password:'correct-password'}));
    assert.equal((await env.db.query("SELECT id FROM users WHERE username='reader_fail'")).length,0);
  } finally { await env.cleanup(); }
});
test('ACC-02 refresh rotates tokens and logout/password immediately revoke existing access', async () => {
  const env = await createTestDb();
  try {
    const auth = new AuthService(env.db);
    await auth.register({username:'reader_a',password:'correct-password'});
    for (const username of ['reader_a','missing_reader']) {
      await assert.rejects(auth.login({username,password:'wrong-password'}), {code:'UNAUTHENTICATED',message:'用户名或密码错误'});
    }
    const login = await auth.login({username:'reader_a',password:'correct-password'});
    assert.equal((await auth.authenticate(login.accessToken))?.actor.username,'reader_a');
    const rotated = await auth.refresh(login.refreshToken);
    assert.equal(await auth.authenticate(login.accessToken),null);
    await assert.rejects(auth.refresh(login.refreshToken), {code:'UNAUTHENTICATED'});
    await auth.logout(rotated.sessionId);
    assert.equal(await auth.authenticate(rotated.accessToken),null);
    const first = await auth.login({username:'reader_a',password:'correct-password'});
    const second = await auth.login({username:'reader_a',password:'correct-password'});
    await auth.changePassword(first.user.id,{oldPassword:'correct-password',newPassword:'new-correct-password'});
    assert.equal(await auth.authenticate(first.accessToken),null);
    assert.equal(await auth.authenticate(second.accessToken),null);
    await assert.rejects(auth.refresh(second.refreshToken), {code:'UNAUTHENTICATED'});
    assert.ok((await auth.login({username:'reader_a',password:'new-correct-password'})).accessToken);
  } finally { await env.cleanup(); }
});
