import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SkillsService } from '../../src/server/modules/skills/service.js';
import { EditorService } from '../../src/server/modules/editor/service.js';
import { createAPIEnvironment } from '../fixtures/environment.js';

test('SEC-07 skill audit supports authorized actor, skill and time-window lookup', async () => {
  const env=await createAPIEnvironment();
  try {
    const a=await env.auth.login({username:env.a.username,password:'correct-password'});
    const admin=await env.auth.login({username:env.admin.username,password:'correct-password'});
    const skills=new SkillsService(env.ctx), template=(await skills.list()).find(item=>item.kind==='explain');
    assert.ok(template);
    const skill=await skills.install(env.a,template.id); assert.ok(skill);
    const headers={authorization:`Bearer ${a.accessToken}`,'content-type':'application/json'};
    const adminHeaders={authorization:`Bearer ${admin.accessToken}`};
    const start=new Date(Date.now()-5000).toISOString();
    const created=await fetch(`${env.baseUrl}/api/v1/conversations`,{method:'POST',headers,body:JSON.stringify({title:'合成审计回查',context:{kind:'news',id:env.state.toolNewsId}})});
    assert.equal(created.status,201);
    const conversation=(await created.json() as {data:{id:string}}).data.id;
    const send=async ()=>fetch(`${env.baseUrl}/api/v1/conversations/${conversation}/messages`,{method:'POST',headers,body:JSON.stringify({content:'private-skill-input-marker',skillId:skill.id})});
    const success=await send();assert.equal(success.status,200);
    const successId=success.headers.get('x-request-id');assert.ok(successId);
    assert.match(await success.text(),/event: complete/);
    env.state.fail=true;
    const failure=await send();assert.equal(failure.status,200);
    const failureId=failure.headers.get('x-request-id');assert.ok(failureId);
    assert.match(await failure.text(),/event: error/);
    const end=new Date(Date.now()+5000).toISOString();
    const query=new URL(`${env.baseUrl}/api/v1/admin/skill-audit`);
    for(const [key,value] of Object.entries({actorId:env.a.id,skillId:skill.id,from:start,to:end})) query.searchParams.set(key,value);
    assert.equal((await fetch(query,{headers:{authorization:`Bearer ${a.accessToken}`}})).status,403);
    assert.equal((await fetch(query)).status,401);
    const response=await fetch(query,{headers:adminHeaders});assert.equal(response.status,200);
    const data=await response.json() as {data:{items:Record<string,unknown>[]}};
    assert.equal(data.data.items.length,2);
    const ok=data.data.items.find(row=>row.request_id===successId), failed=data.data.items.find(row=>row.request_id===failureId);
    assert.ok(ok);assert.ok(failed);
    for(const row of [ok,failed]) {
      assert.equal(row.actor_id,env.a.id);assert.equal(row.skill_id,skill.id);assert.equal(row.object_id,conversation);
      assert.equal(row.operation,'skill.invoke');assert.equal(typeof row.occurred_at,'string');assert.equal(typeof row.duration_ms,'number');
      assert.equal(typeof row.message_id,'string');
    }
    assert.equal(ok.result,'succeeded');assert.equal(ok.input_tokens,40);assert.equal(ok.output_tokens,50);assert.equal(ok.total_tokens,90);
    assert.equal(failed.result,'failed');assert.equal(failed.error_code,'DEPENDENCY_UNAVAILABLE');assert.equal(failed.total_tokens,null);
    for(const row of [ok,failed]) console.log('SEC-07 audit evidence:',JSON.stringify({actor:row.actor_id,time:row.occurred_at,operation:row.operation,object:row.object_id,result:row.result,skill:row.skill_id,inputTokens:row.input_tokens,outputTokens:row.output_tokens,totalTokens:row.total_tokens,durationMs:row.duration_ms,requestId:row.request_id,errorCode:row.error_code}));
    assert.ok(!JSON.stringify(data).includes('private-skill-input-marker'));assert.ok(!JSON.stringify(data).includes(a.accessToken));
    query.searchParams.set('actorId',env.b.id);
    assert.equal(((await (await fetch(query,{headers:adminHeaders})).json()) as {data:{items:unknown[]}}).data.items.length,0);
    query.searchParams.set('actorId',env.a.id);query.searchParams.set('skillId',randomUUID());
    assert.equal(((await (await fetch(query,{headers:adminHeaders})).json()) as {data:{items:unknown[]}}).data.items.length,0);
    query.searchParams.set('skillId',skill.id);query.searchParams.set('requestId',successId);
    assert.equal(((await (await fetch(query,{headers:adminHeaders})).json()) as {data:{items:unknown[]}}).data.items.length,1);
    query.searchParams.delete('requestId');query.searchParams.set('from','2099-01-01T00:00:00Z');query.searchParams.set('to','2099-01-02T00:00:00Z');
    assert.equal(((await (await fetch(query,{headers:adminHeaders})).json()) as {data:{items:unknown[]}}).data.items.length,0);
    query.searchParams.set('from',end);query.searchParams.set('to',start);
    assert.equal((await fetch(query,{headers:adminHeaders})).status,400);
  } finally {await env.cleanup();}
});

test('SEC-07 skill result and audit record roll back together if audit persistence fails', async () => {
  const env=await createAPIEnvironment();
  try {
    const skills=new SkillsService(env.ctx), template=(await skills.list()).find(item=>item.kind==='explain');
    assert.ok(template);const skill=await skills.install(env.a,template.id);assert.ok(skill);
    const editor=new EditorService(env.ctx), conversation=await editor.createConversation(env.a,'审计事务',{kind:'news',id:env.state.toolNewsId});
    assert.ok(conversation);
    await env.ctx.db.query("CREATE FUNCTION reject_skill_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
    await env.ctx.db.query('CREATE TRIGGER reject_skill_audit BEFORE INSERT ON skill_audit FOR EACH ROW EXECUTE FUNCTION reject_skill_audit()');
    const prepared=await editor.prepare(env.a,conversation.id,{content:'合成问题',skillId:skill.id});
    const events:string[]=[];
    await assert.rejects(editor.execute(prepared,name=>events.push(name)));
    assert.ok(!events.includes('text'));assert.ok(!events.includes('complete'));
    const message=await env.ctx.db.one<{status:string;content:string}>('SELECT status,content FROM messages WHERE id=$1',[prepared.messageId]);
    assert.ok(message);assert.equal(message.status,'pending');assert.equal(message.content,'');
    const count=await env.ctx.db.one<{count:string}>('SELECT count(*) FROM skill_audit WHERE message_id=$1',[prepared.messageId]);
    assert.equal(count?.count,'0');
  } finally {await env.cleanup();}
});
