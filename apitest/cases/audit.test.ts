import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAPIEnvironment } from '../fixtures/environment.js';

test('SEC-13 request audit records successful and rejected actions without sensitive inputs', async () => {
  const env = await createAPIEnvironment();
  try {
    const a = await env.auth.login({ username: env.a.username, password: 'correct-password' });
    const b = await env.auth.login({ username: env.b.username, password: 'correct-password' });
    const admin = await env.auth.login({ username: env.admin.username, password: 'correct-password' });
    const call = async (path: string, token?: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${env.baseUrl}/api/v1${path}`, { method, headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json() as { requestId: string; data?: { id?: string } };
      return { response, result };
    };
    const memory = await call('/memories', b.accessToken, 'POST', { key: 'audit', content: 'private-audit-marker' });
    assert.equal(memory.response.status, 201);
    const id = memory.result.data?.id;
    assert.ok(id);
    const cases = [
      { value: await call('/editor'), status: 401, actor: 'anonymous', object: null },
      { value: await call('/admin/sources', a.accessToken), status: 403, actor: env.a.id, object: null },
      { value: await call(`/memories/${id}`, a.accessToken), status: 404, actor: env.a.id, object: id },
      { value: await call('/editor', a.accessToken), status: 200, actor: env.a.id, object: null },
      { value: await call('/memories/secret-path-marker?secret-query-marker=1', a.accessToken), status: 400, actor: env.a.id, object: null },
      { value: await call('/missing/private-path-marker', a.accessToken), status: 404, actor: env.a.id, object: null },
    ];
    const records = env.state.logs.map(line => JSON.parse(line) as Record<string, unknown>);
    for (const item of cases) {
      assert.equal(item.value.response.status, item.status);
      const record = records.find(row => row.requestId === item.value.result.requestId && row.msg === 'Request finished');
      assert.ok(record);
      assert.equal(record.actorId, item.actor);
      assert.equal(record.objectId, item.object);
      assert.equal(record.result, item.status);
      assert.equal(typeof record.timestamp, 'string');
      assert.equal(typeof record.operation, 'string');
      assert.equal(typeof record.durationMs, 'number');
      assert.equal(record.skillId, null);
      assert.equal(record.usage, null);
    }
    const requestLogs = records.filter(row => row.msg === 'Request finished');
    const serialized = JSON.stringify(requestLogs);
    for (const secret of [a.accessToken, b.accessToken, 'private-audit-marker', 'secret-path-marker', 'secret-query-marker', 'private-path-marker']) assert.ok(!serialized.includes(secret));
    const denied=await call('/admin/audit',a.accessToken);
    assert.equal(denied.response.status,403);
    const anonymous=await call('/admin/audit');
    assert.equal(anonymous.response.status,401);
    const selected=cases[2];
    let rows: Record<string,unknown>[]=[];
    for(let attempt=0;attempt<30;attempt++) {
      const query=await fetch(`${env.baseUrl}/api/v1/admin/audit?requestId=${selected.value.result.requestId}`,{headers:{authorization:`Bearer ${admin.accessToken}`}});
      assert.equal(query.status,200);
      const body=await query.json() as {data:{items:Record<string,unknown>[]}};
      rows=body.data.items;
      if(rows.length) break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(rows.length,1);
    assert.equal(rows[0].actor_id,env.a.id);
    assert.equal(rows[0].status,404);
    assert.equal(rows[0].object_id,id);
    assert.equal(rows[0].route,'/api/v1/memories/:id');
    const deniedQuery=new URL(`${env.baseUrl}/api/v1/admin/audit`);
    deniedQuery.searchParams.set('actorId',env.a.id);deniedQuery.searchParams.set('status','403');
    deniedQuery.searchParams.set('from',new Date(Date.now()-60000).toISOString());deniedQuery.searchParams.set('to',new Date(Date.now()+60000).toISOString());
    let deniedRows:{data:{items:Record<string,unknown>[]}}={data:{items:[]}};
    for(let attempt=0;attempt<30;attempt++) {
      deniedRows=await (await fetch(deniedQuery,{headers:{authorization:`Bearer ${admin.accessToken}`}})).json() as typeof deniedRows;
      if(deniedRows.data.items.some(row=>row.request_id===cases[1].value.result.requestId)) break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(deniedRows.data.items.some(row=>row.request_id===cases[1].value.result.requestId && row.status===403));
    deniedQuery.searchParams.set('actorId',env.b.id);
    const unrelated=await (await fetch(deniedQuery,{headers:{authorization:`Bearer ${admin.accessToken}`}})).json() as {data:{items:Record<string,unknown>[]}};
    assert.ok(!unrelated.data.items.some(row=>row.request_id===cases[1].value.result.requestId));
    let all: Record<string,unknown>[]=[];
    for(let attempt=0;attempt<30;attempt++) {
      all=await env.ctx.db.query('SELECT * FROM request_audit');
      if(cases.every(item=>all.some(row=>row.request_id===item.value.result.requestId))) break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    for(const item of cases) {
      const record=all.find(row=>row.request_id===item.value.result.requestId);
      assert.ok(record);
      assert.equal(record.status,item.status);
      assert.equal(record.actor_id,item.actor==='anonymous'?null:item.actor);
      assert.equal(record.object_id,item.object);
    }
    const persisted=JSON.stringify(all);
    for(const secret of [a.accessToken,b.accessToken,admin.accessToken,'private-audit-marker','secret-path-marker','secret-query-marker','private-path-marker']) assert.ok(!persisted.includes(secret));
  } finally { await env.cleanup(); }
});
