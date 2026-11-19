import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { editorEnvironment } from '../support/editor-fixture.js';
import { GenerationRepository } from '../../src/server/modules/generation/repository.js';
import { preparePersonalDailyInput } from '../../src/server/modules/editor/background.js';
import { createHandlers, schedule } from '../../src/server/worker.js';
import { businessDate } from '../../src/server/modules/editor/calendar.js';
import { createApp } from '../../src/server/application.js';

test('EDITOR-07 defaults require opt-in and concurrent automatic attempts obey a shared limit', async () => {
  const env = await editorEnvironment();
  try {
    const repository = new GenerationRepository(env.ctx.db);
    assert.equal((await repository.settings(env.a.id)).mode,'manual');
    const task = await env.ctx.tasks.submit(null,'daily',{},randomUUID(),env.a.id);
    assert.match((await repository.reserve(env.a.id,task.taskId,randomUUID(),true))!,/关闭/);
    await repository.update(env.a.id,{mode:'updates',dailyLimit:1});
    const runs = [randomUUID(),randomUUID(),randomUUID()];
    const results = await Promise.all(runs.map(id=>repository.reserve(env.a.id,task.taskId,id,true)));
    assert.equal(results.filter(result=>result===null).length,1);
    const accepted = runs[results.indexOf(null)];
    assert.match((await repository.reserve(env.a.id,task.taskId,accepted,true))!,/重复/);
    await repository.finish(accepted,{inputTokens:10,outputTokens:null,totalTokens:null});
    const manual = randomUUID();
    assert.equal(await repository.reserve(env.a.id,task.taskId,manual,false),null);
    await repository.finish(manual,{inputTokens:5,outputTokens:6,totalTokens:11});
    const usage = await repository.usage(env.a.id);
    assert.equal(usage.automaticCalls,1);assert.equal(usage.manualCalls,1);
    assert.equal(usage.knownInputTokens,15);assert.equal(usage.knownTotalTokens,11);assert.equal(usage.unknownCalls,1);
    assert.equal(await repository.reserve(env.a.id,task.taskId,randomUUID(),true,new Date(Date.now()+86400000)),null);
    assert.equal((await repository.usage(env.b.id)).automaticCalls,0);
  } finally { await env.cleanup(); }
});

test('EDITOR-07 upstream quota pauses automatic calls and preserves failed-attempt usage', async () => {
  const env = await editorEnvironment();
  try {
    const repository = new GenerationRepository(env.ctx.db);
    await repository.update(env.a.id,{mode:'updates',dailyLimit:3});
    const input = {...await preparePersonalDailyInput(env.ctx,env.a.id,businessDate()),automatic:true};
    const first = await env.ctx.tasks.submit(null,'daily',input,randomUUID(),env.a.id);
    env.state.mode='quota';
    await assert.rejects(env.ctx.tasks.execute({taskId:first.taskId,generation:1},createHandlers(env.ctx)),/额度/);
    assert.ok((await repository.settings(env.a.id)).pausedUntil! > new Date());
    const calls=env.state.calls;
    const second=await env.ctx.tasks.submit(null,'daily',input,randomUUID(),env.a.id);
    await env.ctx.tasks.execute({taskId:second.taskId,generation:1},createHandlers(env.ctx));
    assert.equal(env.state.calls,calls);
    assert.equal((await env.ctx.tasks.get(env.a,second.taskId)).result?.skipped,true);
    await repository.update(env.a.id,{resume:true});
    env.state.mode='bad-digest-source';
    const third=await env.ctx.tasks.submit(null,'daily',input,randomUUID(),env.a.id);
    await assert.rejects(env.ctx.tasks.execute({taskId:third.taskId,generation:1},createHandlers(env.ctx)));
    const usage=await repository.usage(env.a.id);
    assert.equal(usage.automaticCalls,2);assert.equal(usage.knownTotalTokens,30);assert.equal(usage.unknownCalls,1);
    await assert.rejects(env.ctx.tasks.execute({taskId:third.taskId,generation:1},createHandlers(env.ctx)));
    assert.equal((await repository.usage(env.a.id)).automaticCalls,3);
    const retriedCalls=env.state.calls;
    await env.ctx.tasks.execute({taskId:third.taskId,generation:1},createHandlers(env.ctx));
    assert.equal(env.state.calls,retriedCalls);
    assert.equal((await env.ctx.tasks.get(env.a,third.taskId)).result?.skipped,true);
    await repository.update(env.a.id,{mode:'manual'});
    const disabled=await env.ctx.tasks.submit(null,'daily',input,randomUUID(),env.a.id);
    await env.ctx.tasks.execute({taskId:disabled.taskId,generation:1},createHandlers(env.ctx));
    assert.equal(env.state.calls,retriedCalls);
    assert.equal((await repository.settings(env.b.id)).pausedUntil,null);
  } finally { await env.cleanup(); }
});

test('EDITOR-07 daily mode runs once after the configured hour and updates mode follows new material', async () => {
  const env=await editorEnvironment();
  try {
    const repository=new GenerationRepository(env.ctx.db),date=businessDate();
    await env.ctx.db.query('UPDATE news_sources SET enabled=false');
    await repository.update(env.a.id,{mode:'daily',startHour:8,dailyLimit:3});
    await schedule(env.ctx,new Date(`${date}T07:00:00+08:00`));
    assert.equal((await env.ctx.db.query('SELECT id FROM tasks WHERE owner_id=$1',[env.a.id])).length,0);
    await schedule(env.ctx,new Date(`${date}T12:00:00+08:00`));
    const task=(await env.ctx.db.one<{id:string}>("SELECT id FROM tasks WHERE owner_id=$1 AND type='daily'",[env.a.id]))!;
    await env.ctx.tasks.execute({taskId:task.id,generation:1},createHandlers(env.ctx));
    await env.ctx.db.query("UPDATE news SET title=title||'更新' WHERE id=$1",[env.newsId]);
    await schedule(env.ctx,new Date(`${date}T13:00:00+08:00`));
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE owner_id=$1 AND type='daily'",[env.a.id])).length,1);
    await repository.update(env.a.id,{mode:'updates'});
    await schedule(env.ctx,new Date(`${date}T14:00:00+08:00`));
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE owner_id=$1 AND type='daily'",[env.a.id])).length,2);
    assert.equal((await env.ctx.db.query('SELECT id FROM tasks WHERE owner_id=$1',[env.b.id])).length,0);
  } finally {await env.cleanup();}
});

test('EDITOR-07 generation settings validate inputs and stay scoped to the authenticated account', async()=>{
  const env=await editorEnvironment();const app=await createApp(env.ctx);
  try {
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:env.a.username,password:'correct-password'}});
    const headers={authorization:`Bearer ${login.json().data.accessToken}`};
    assert.equal((await app.inject({url:'/api/v1/editor/generation'})).statusCode,401);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/editor/generation',headers,payload:{dailyLimit:0}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/editor/generation',headers,payload:{mode:'updates',userId:env.b.id}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/editor/generation',headers,payload:{mode:'updates',dailyLimit:2}})).statusCode,200);
    const state=(await app.inject({url:'/api/v1/editor/generation',headers})).json().data;
    assert.equal(state.settings.dailyLimit,2);
    assert.equal((await new GenerationRepository(env.ctx.db).settings(env.b.id)).mode,'manual');
  } finally {await app.close();await env.cleanup();}
});
