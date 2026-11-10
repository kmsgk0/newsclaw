import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { inputErrors } from '../../src/server/validation-errors.js';
import { createBaseApp } from '../../src/server/base-app.js';
import { makeTestContext } from '../support/helpers.js';

test('OPS-03 invalid fields identify the controls without exposing entered values', () => {
  const result = z.object({ username: z.string().min(3), password: z.string().min(8) })
    .safeParse({ username: 'a', password: 'secret' });
  assert.equal(result.success, false);
  const fields = inputErrors(result.error);
  assert.deepEqual(fields, { username: '用户名至少需要 3 个字符', password: '密码至少需要 8 个字符' });
  assert.equal(JSON.stringify(fields).includes('secret'), false);
});

test('OPS-03 route schema validation preserves field identity for form errors', () => {
  assert.deepEqual(inputErrors({ validation: [
    { instancePath: '', keyword: 'required', params: { missingProperty: 'username' } },
    { instancePath: '/newPassword', keyword: 'minLength', params: { limit: 8 } },
  ] }), { username: '请填写用户名', newPassword: '新密码至少需要 8 个字符' });
  assert.equal(inputErrors(new Error('network unavailable')), null);
});

test('OPS-03 malformed JSON is an input error at the actual HTTP entry', async () => {
  const environment = await makeTestContext();
  const app = await createBaseApp(environment.ctx);
  try {
    for (const payload of ['{', '']) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'content-type': 'application/json' }, payload });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, 'INVALID_INPUT');
      assert.equal(typeof response.json().requestId, 'string');
    }
    assert.equal((await environment.ctx.db.one<{count:string}>('SELECT count(*) FROM sessions'))?.count, '0');
  } finally {
    await app.close();
    await environment.cleanup();
  }
});
