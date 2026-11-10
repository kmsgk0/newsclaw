import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EditorService, validateCitations } from '../../src/server/modules/editor/service.js';
import { EditorRepository } from '../../src/server/modules/editor/repository.js';
import { SkillsService } from '../../src/server/modules/skills/service.js';
import { createNewsMcp } from '../../src/server/adapters/mcp.js';
import { createEditorHandlers, prepareJournalInput, preparePersonalDailyInput } from '../../src/server/modules/editor/background.js';
import type { TaskRecord } from '../../src/server/runtime/tasks.js';
import { editorEnvironment } from '../support/editor-fixture.js';
import { businessDate } from '../../src/server/modules/editor/calendar.js';

test('EDITOR-02 source labels remain valid with model whitespace or a named source heading', () => {
  const sources=[{id:'report-one',label:'N1',title:'实际报道',url:'https://example.com/news',sourceName:'Fixture'}];
  assert.doesNotThrow(()=>validateCitations('试用日期为10月10日[ N1 ]。',sources));
  assert.doesNotThrow(()=>validateCitations('英文原文（来源：N1）\nCommercial pricing has not been announced.',sources));
  assert.doesNotThrow(()=>validateCitations('商业价格尚未公布[1]。',sources));
  assert.throws(()=>validateCitations('不明报价 [ N999 ]',sources),/范围/);
  assert.throws(()=>validateCitations('不明报价 [999]',sources),/范围/);
});

test('EDITOR-01/05 settings and explicit memories persist with account isolation', async () => {
  const env=await editorEnvironment();
  try {
    const service=new EditorService(env.ctx),repository=service.repository;
    await repository.updateProfile(env.a.id,{name:'阿闻',style:'简洁',interests:'关注开源，少看融资'});
    assert.equal((await service.profile(env.a)).interests,'关注开源，少看融资');
    const memory=await repository.writeMemory(env.a.id,'response-style','回答简洁');
    await assert.rejects(repository.editMemory(env.b.id,memory!.id,'越权内容'),{code:'NOT_FOUND'});
    assert.equal(await repository.memory(env.b.id,memory!.id),undefined);
    await repository.editMemory(env.a.id,memory!.id,'用简短段落');
    assert.equal((await repository.memories(env.a.id))[0].origin,'manual');
    await repository.editMemory(env.a.id,memory!.id);
    assert.equal((await repository.memories(env.a.id)).length,0);
    assert.equal((await env.ctx.db.one('SELECT origin FROM memories WHERE id=$1',[memory!.id]))!.origin,'manual');
  } finally {await env.cleanup();}
});

test('EDITOR-02/03 MCP-backed streaming preserves citations and private conversation history', async () => {
  const env=await editorEnvironment();
  try {
    const service=new EditorService(env.ctx);
    const conversation=await service.createConversation(env.a,'试用解读',{kind:'news',id:env.newsId});
    await assert.rejects(service.conversation(env.b,conversation!.id),{code:'NOT_FOUND'});
    await assert.rejects(service.prepare(env.a,conversation!.id,{content:'  '}),{code:'INVALID_INPUT'});
    await assert.rejects(service.prepare(env.a,conversation!.id,{content:'读取',context:{kind:'news',id:randomUUID()}}),{code:'NOT_FOUND'});
    assert.equal((await service.conversation(env.a,conversation!.id)).messages.length,0);
    env.state.mode='tool';
    const prepared=await service.prepare(env.a,conversation!.id,{content:'何时试用，价格多少？'});
    await assert.rejects(service.prepare(env.a,conversation!.id,{content:'同时追问'}),{code:'CONFLICT'});
    const events:{name:string;data:unknown}[]=[];
    await service.execute(prepared,(name,data)=>events.push({name,data}),undefined,'fixture-request');
    assert.ok(events.some(event=>event.name==='complete')); assert.ok(events.filter(event=>event.name==='text').length>=2);
    const restored=await service.conversation(env.a,conversation!.id);
    assert.equal(restored.messages.length,2);assert.equal(restored.messages[1].status,'completed');
    assert.equal(restored.messages[1].sources[0].id,env.newsId);
    assert.match(restored.messages[1].content,/价格尚未公布/);
    assert.equal((await env.ctx.db.query("SELECT * FROM activities WHERE user_id=$1 AND kind='question'",[env.a.id])).length,1);
    const mcp=await createNewsMcp(env.ctx,env.a);
    try {
      await assert.rejects(mcp.call('news_read',{id:env.newsId,userId:env.b.id}),{code:'INVALID_INPUT'});
      const topic=await env.ctx.db.one<{id:string}>(`INSERT INTO topics(user_id,name,filter) VALUES($1,'私人专题','{"query":"云杉"}') RETURNING id`,[env.b.id]);
      await assert.rejects(mcp.call('materials_read',{kind:'topic',id:topic!.id}),{code:'NOT_FOUND'});
      await assert.rejects(mcp.call('materials_read',{kind:'topic',id:randomUUID()}),{code:'NOT_FOUND'});
    } finally {await mcp.close();}
  } finally {await env.cleanup();}
});

test('SKILL-01/03 automatic matching leaves unscoped questions available and explicit skills require materials', async () => {
  const env=await editorEnvironment();
  try {
    const service=new EditorService(env.ctx),skills=new SkillsService(env.ctx),catalog=await skills.list();
    const installed=await skills.install(env.a,catalog.find(skill=>skill.kind==='explain')!.id);
    const conversation=await service.createConversation(env.a,'新闻解释');
    await assert.rejects(service.prepare(env.a,conversation!.id,{content:'解释新闻',skillId:installed!.id}),{code:'INVALID_INPUT'});
    const prepared=await service.prepare(env.a,conversation!.id,{content:'解释一下云杉引擎的新消息'});
    assert.equal(prepared.skill,null);
    await service.execute(prepared,()=>{});
    assert.equal((await service.conversation(env.a,conversation!.id)).messages.at(-1)!.status,'completed');
  } finally {await env.cleanup();}
});

test('SKILL-01/03 fixed-material brief completes without searching outside its selected reports', async () => {
  const env=await editorEnvironment();
  try {
    const service=new EditorService(env.ctx),skills=new SkillsService(env.ctx);
    const catalog=await skills.list(),installed=await skills.install(env.a,catalog.find(skill=>skill.kind==='brief')!.id);
    const conversation=(await service.createConversation(env.a,'试用简报',{kind:'news',id:env.newsId}))!;
    env.state.mode='scope-expansion';
    const events:{name:string;data:unknown}[]=[];
    await service.execute(await service.prepare(env.a,conversation.id,{content:'整理试用进展简报',skillId:installed!.id}),(name,data)=>events.push({name,data}));
    const answer=(await service.conversation(env.a,conversation.id)).messages.at(-1)!;
    assert.equal(answer.status,'completed');
    assert.equal(answer.artifact?.kind,'brief');
    assert.deepEqual(answer.sources.map(source=>source.id),[env.newsId]);
    assert.ok(events.some(event=>event.name==='tool'&&(event.data as {name:string;status:string}).name==='materials_read'&&(event.data as {status:string}).status==='completed'));
    assert.ok(!events.some(event=>event.name==='tool'&&(event.data as {name:string}).name==='news_search'));
  } finally {await env.cleanup();}
});

test('EDITOR-03/SKILL-03 failures preserve prior answers and cannot become completed results', async () => {
  const env=await editorEnvironment();
  try {
    const service=new EditorService(env.ctx),skills=new SkillsService(env.ctx);
    const conversation=await service.createConversation(env.a,'失败恢复',{kind:'news',id:env.newsId});
    await service.execute(await service.prepare(env.a,conversation!.id,{content:'开放日期？'}),()=>{});
    for (const mode of ['failure','truncated','bad-citation']) {
      env.state.mode=mode;const events:string[]=[];
      await service.execute(await service.prepare(env.a,conversation!.id,{content:'继续解释'}),name=>events.push(name));
      assert.ok(events.includes('error'));assert.ok(!events.includes('complete'));
    }
    const catalog=await skills.list(),map=await skills.install(env.a,catalog.find(skill=>skill.kind==='mindmap')!.id);
    env.state.mode='bad-map';const events:string[]=[];
    await service.execute(await service.prepare(env.a,conversation!.id,{content:'生成导图',skillId:map!.id}),name=>events.push(name));
    assert.ok(events.includes('error'));assert.ok(!events.includes('artifact'));
    await skills.update(env.a,map!.id,{enabled:false});
    const calls=env.state.calls;
    await assert.rejects(service.prepare(env.a,conversation!.id,{content:'生成导图',skillId:map!.id}),{code:'INVALID_INPUT'});
    assert.equal(env.state.calls,calls);
    const messages=(await service.conversation(env.a,conversation!.id)).messages.filter(message=>message.role==='assistant');
    assert.equal(messages[0].status,'completed');assert.ok(messages.slice(1).every(message=>message.status==='failed'));
    assert.ok(messages.every(message=>message.artifact===null));
  } finally {await env.cleanup();}
});

test('EDITOR-02/SKILL-01 summary-only bilingual reading declares its actual material scope', async () => {
  const env=await editorEnvironment();
  try {
    await env.ctx.db.query("UPDATE news SET content_scope='summary',content=$2 WHERE id=$1",[env.newsId,'Spruce Engine will open for trial on October 10, 2026. Commercial pricing has not been announced.']);
    const service=new EditorService(env.ctx),skills=new SkillsService(env.ctx),catalog=await skills.list();
    const installed=await skills.install(env.a,catalog.find(skill=>skill.kind==='bilingual')!.id);
    const conversation=await service.createConversation(env.a,'双语摘要',{kind:'news',id:env.newsId});
    await service.execute(await service.prepare(env.a,conversation!.id,{content:'全文中英对照',skillId:installed!.id}),()=>{});
    const answer=(await service.conversation(env.a,conversation!.id)).messages.at(-1)!;
    assert.equal(answer.status,'completed');assert.match(answer.content,/^以下内容依据来源提供的摘要整理/);
    assert.match(answer.content,/> Spruce Engine will open for trial/);
    assert.match(answer.content,/Commercial pricing has not been announced\./);
    assert.match(answer.content,/商业价格尚未公布/);
    env.state.mode='bad-bilingual';
    await service.execute(await service.prepare(env.a,conversation!.id,{content:'再对照一次',skillId:installed!.id}),()=>{});
    const invalid=(await service.conversation(env.a,conversation!.id)).messages.at(-1)!;
    assert.equal(invalid.status,'failed');
    assert.ok(!invalid.content.includes('Invented original'));
  } finally {await env.cleanup();}
});

test('AI-10 failed MCP news search is an error rather than an empty successful answer', async () => {
  const env=await editorEnvironment();
  try {
    const service=new EditorService(env.ctx),conversation=await service.createConversation(env.a,'工具故障');
    const prepared=await service.prepare(env.a,conversation!.id,{content:'查询最新新闻'});
    env.state.mode='failure';const events:{name:string;data:unknown}[]=[];
    await service.execute(prepared,(name,data)=>events.push({name,data}));
    assert.ok(events.some(event=>event.name==='error'));assert.ok(!events.some(event=>event.name==='complete'));
    const restored=await service.conversation(env.a,conversation!.id);
    assert.equal(restored.messages.at(-1)!.status,'failed');assert.equal(restored.messages.at(-1)!.content,'');
    assert.equal(env.state.requests.length,1);
  } finally {await env.cleanup();}
});

test('EDITOR-04 daily regeneration is unique and a late older task cannot replace newer content', async () => {
  const env=await editorEnvironment();
  try {
    const handlers=createEditorHandlers(env.ctx),date=businessDate();
    const input=await preparePersonalDailyInput(env.ctx,env.a.id,date);
    assert.equal(input.snapshot.profile.interests,'');
    const one=await env.ctx.tasks.submit(env.a,'daily',input,'daily-one',env.a.id,env.ctx.db,{date});
    const same=await env.ctx.tasks.submit(env.a,'daily',{...input,snapshot:{...input.snapshot,news:[]}},'daily-one',env.a.id,env.ctx.db,{date});
    assert.equal(same.taskId,one.taskId);
    const newer=await env.ctx.tasks.submit(env.a,'daily',input,'daily-two',env.a.id,env.ctx.db,{date});
    const task=await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[newer.taskId]);
    const generated=await handlers.daily(task!,{executionId:randomUUID(),signal:new AbortController().signal,attempt:1});
    await env.ctx.db.tx(tx=>generated.commit(tx));
    const repository=new EditorRepository(env.ctx.db);
    await env.ctx.db.tx(tx=>new EditorRepository(tx).saveDigest(env.a.id,date,'旧日报',[],new Date(0),one.taskId));
    const rows=await repository.digests(env.a.id);assert.equal(rows.length,1);assert.match(String(rows[0].content),/今日精选/);
    assert.match(String(rows[0].content),/补充兴趣/);
    assert.equal((await repository.digests(env.b.id)).length,0);
    env.state.mode='failure';await assert.rejects(handlers.daily(task!,{executionId:randomUUID(),signal:new AbortController().signal,attempt:2}));
    assert.deepEqual(await repository.digests(env.a.id),rows);
    await repository.updateProfile(env.a.id,{interests:'关注开源模型'});
    const personal=await preparePersonalDailyInput(env.ctx,env.a.id,date);
    assert.equal(personal.snapshot.profile.interests,'关注开源模型');
  } finally {await env.cleanup();}
});

test('EDITOR-05/06 journal atomically advances only new activities and protects manual/deleted memories', async () => {
  const env=await editorEnvironment();
  try {
    const repository=new EditorRepository(env.ctx.db),date=businessDate(),handlers=createEditorHandlers(env.ctx);
    await repository.updateProfile(env.a.id,{style:'回答简洁'});
    await repository.writeMemory(env.a.id,'response-style','回答简洁');
    env.state.memories.push({key:'inferred-length',content:'偏好长篇解释'});
    await env.ctx.db.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'read',$2)",[env.a.id,env.newsId]);
    const input=await prepareJournalInput(env.ctx,env.a.id,date);
    const accepted=await env.ctx.tasks.submit(null,'journal',input,'journal-one',env.a.id);
    const task=(await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[accepted.taskId]))!;
    const prepared=await handlers.journal(task,{executionId:randomUUID(),signal:new AbortController().signal,attempt:1});
    await assert.rejects(env.ctx.db.tx(async tx=>{await prepared.commit(tx);throw new Error('fixture rollback');}),/fixture rollback/);
    assert.equal((await repository.journals(env.a.id)).length,0);assert.equal((await repository.profile(env.a.id))!.activityCursor,'0');
    await env.ctx.db.tx(tx=>prepared.commit(tx));
    assert.equal((await repository.journals(env.a.id)).length,1);assert.equal((await repository.memories(env.a.id)).find(memory=>memory.key==='response-style')!.content,'回答简洁');
    const memory=(await repository.memories(env.a.id)).find(memory=>memory.key==='inferred-length')!;assert.equal(memory.origin,'automatic');await repository.editMemory(env.a.id,memory.id);
    const calls=env.state.calls;
    const repeated=await handlers.journal(task,{executionId:randomUUID(),signal:new AbortController().signal,attempt:2});
    assert.deepEqual(await env.ctx.db.tx(tx=>repeated.commit(tx)),{skipped:true,date});
    assert.equal(env.state.calls,calls);assert.equal((await repository.memories(env.a.id)).length,1);
    await env.ctx.db.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'favorite',$2)",[env.a.id,env.newsId]);
    const nextInput=await prepareJournalInput(env.ctx,env.a.id,date),next=await env.ctx.tasks.submit(null,'journal',nextInput,'journal-two',env.a.id);
    const nextTask=(await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[next.taskId]))!;
    env.state.mode='failure';const cursor=(await repository.profile(env.a.id))!.activityCursor;
    await assert.rejects(handlers.journal(nextTask,{executionId:randomUUID(),signal:new AbortController().signal,attempt:1}));
    assert.equal((await repository.profile(env.a.id))!.activityCursor,cursor);
    env.state.mode='valid';const nextResult=await handlers.journal(nextTask,{executionId:randomUUID(),signal:new AbortController().signal,attempt:2});
    await env.ctx.db.tx(tx=>nextResult.commit(tx));
    assert.equal((await repository.journals(env.a.id)).length,1);assert.ok(BigInt((await repository.profile(env.a.id))!.activityCursor)>BigInt(cursor));
    assert.equal((await repository.memories(env.a.id)).length,1);
    const editor=new EditorService(env.ctx),conversation=await editor.createConversation(env.a,'记忆回归',{kind:'news',id:env.newsId});
    const answer=await editor.prepare(env.a,conversation!.id,{content:'用一句话说明试用安排'});
    assert.equal(answer.profile.style,'回答简洁');assert.ok(answer.memories.every(memory=>!memory.content.includes('长篇')));
    await editor.execute(answer,()=>{});
  } finally {await env.cleanup();}
});

test('EDITOR-06 same-day incremental journals retain unique source labels across batches', async () => {
  const env=await editorEnvironment();
  try {
    const repository=new EditorRepository(env.ctx.db),date='2026-11-06';
    const first={id:env.newsId,label:'N1',title:'第一篇',url:'https://example.com/news',sourceName:'Fixture'};
    const second={id:randomUUID(),label:'N1',title:'第二篇',url:'https://example.com/second',sourceName:'Fixture'};
    await env.ctx.db.tx(tx=>new EditorRepository(tx).saveJournal(env.a.id,date,'0','1','0','第一批 [N1]。',[first],[]));
    await env.ctx.db.tx(tx=>new EditorRepository(tx).saveJournal(env.a.id,date,'1','2','0','第二批 [ N1 ] 和 [N1,N2]，以及数字来源 [1]。',[second,{...first,label:'N2'}],[]));
    const journals=await repository.journals(env.a.id);assert.equal(journals.length,1);
    assert.equal(journals[0].content,'第一批 [N1]。\n\n第二批 [ N2 ] 和 [N2,N1]，以及数字来源 [N2]。');
    assert.deepEqual(journals[0].sources,[first,{...second,label:'N2'}]);
  } finally {await env.cleanup();}
});
