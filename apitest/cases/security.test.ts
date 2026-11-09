import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createAPIEnvironment } from '../fixtures/environment.js';
import { createNewsMcp } from '../../src/server/adapters/mcp.js';
import { createHandlers } from '../../src/server/worker.js';

test('SEC-01/02/03/04/07 real API and MCP enforce account ownership, management and traceable calls',async()=>{
  const env=await createAPIEnvironment();
  try {
    const login=await env.auth.login({username:env.a.username,password:'correct-password'}),other=await env.auth.login({username:env.b.username,password:'correct-password'});
    const records:Record<string,unknown>[]=[];
    const api=async(method:string,path:string,token?:string,body?:unknown)=>{
      const response=await fetch(`${env.baseUrl}/api/v1${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{}) ,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const value=await response.json() as {code:string;message:string;data:Record<string,unknown>;requestId:string};
      records.push({method,path,status:response.status,code:value.code,requestId:value.requestId});return {status:response.status,...value};
    };
    for(const path of ['/conversations','/memories','/library','/editor','/editor/digests','/editor/journals','/topics','/notifications','/skills/mine'])assert.equal((await api('GET',path)).status,401);
    assert.equal((await api('GET','/news')).status,200);
    const memory=await api('POST','/memories',other.accessToken,{key:'private-b',content:'Only account B can read this memory'});
    const topic=await api('POST','/topics',other.accessToken,{name:'B private topic',filter:{keywords:'云杉'}});
    for(const [path,field] of [[`/memories/${memory.data.id}`,'content'],[`/topics/${topic.data.id}`,'name']] as const) {
      assert.equal((await api('GET',path,login.accessToken)).status,404);
      assert.equal((await api('PATCH',path,login.accessToken,{[field]:'forbidden-change'})).status,404);
    }
    assert.equal((await api('GET',`/memories/${randomUUID()}`,login.accessToken)).status,404);
    assert.equal((await api('GET','/memories',login.accessToken)).data.items instanceof Array,true);
    assert.equal(((await api('GET','/memories',login.accessToken)).data.items as unknown[]).length,0);
    assert.equal((await api('POST','/admin/sources',login.accessToken,{name:'forbidden',kind:'rss',url:'https://example.org/feed'})).status,403);
    const before=await env.ctx.db.query('SELECT id FROM news_sources');
    assert.equal((await api('PATCH',`/admin/sources/${env.source.id}`,login.accessToken,{enabled:false})).status,403);
    assert.equal((await env.ctx.db.query('SELECT id FROM news_sources')).length,before.length);
    assert.equal((await api('PATCH','/editor',login.accessToken,{name:'我的编辑'})).status,200);
    assert.equal((await api('PATCH','/editor',login.accessToken,{userId:env.b.id,name:'forged'})).status,400);
    const mcp=await createNewsMcp(env.ctx,env.a,undefined,'security-mcp');
    try {await assert.rejects(mcp.call('materials_read',{kind:'topic',id:topic.data.id}),{code:'NOT_FOUND'});await assert.rejects(mcp.call('news_read',{id:env.state.toolNewsId,userId:env.b.id}),{code:'INVALID_INPUT'});}finally{await mcp.close();}
    const skillList=await api('GET','/skills');const skills=(skillList.data.items??skillList.data) as {id:string;kind:string}[];
    const skill=skills.find(item=>item.kind==='explain');assert.ok(skill);
    const installed=await api('POST',`/skills/${skill.id}/install`,login.accessToken);
    const conversation=await api('POST','/conversations',login.accessToken,{title:'Security trace',context:{kind:'news',id:env.state.toolNewsId}});
    const streamed=await fetch(`${env.baseUrl}/api/v1/conversations/${conversation.data.id}/messages`,{method:'POST',headers:{authorization:`Bearer ${login.accessToken}`,'content-type':'application/json'},body:JSON.stringify({content:'解释试用日期和价格',skillId:installed.data.id})});
    const content=await streamed.text();assert.equal(streamed.status,200);assert.match(content,/event: complete/);
    const logs=env.state.logs.map(line=>JSON.parse(line) as Record<string,unknown>);
    const skillLog=logs.find(row=>row.module==='editor'&&row.skillId===installed.data.id&&row.operation==='answer'&&row.usage);
    assert.ok(skillLog,'Skill execution must log identity, outcome, duration and usage');
    assert.equal(skillLog.actorId,env.a.id);assert.ok('durationMs' in skillLog);
    assert.ok(logs.some(row=>row.requestId==='security-mcp'&&row.result==='failed'));
    assert.ok(!env.state.logs.join('').includes('correct-password'));assert.ok(!env.state.logs.join('').includes(login.accessToken));assert.ok(!env.state.logs.join('').includes('Only account B'));
    const manager=await env.auth.login({username:env.admin.username,password:'correct-password'});
    const queued=await api('POST',`/admin/sources/${env.source.id}/collect`,manager.accessToken,{operationId:'source-disabled-after-receipt'});
    assert.equal(queued.status,202);
    await env.ctx.db.query('UPDATE news_sources SET enabled=false WHERE id=$1',[env.source.id]);
    const calls=env.state.modelCalls;
    await assert.rejects(env.ctx.tasks.execute({taskId:String(queued.data.taskId),generation:1},createHandlers(env.ctx)));
    assert.equal(env.state.modelCalls,calls);
    assert.equal((await env.ctx.db.one('SELECT status FROM tasks WHERE id=$1',[queued.data.taskId]))!.status,'failed');
    await env.ctx.db.query('UPDATE news_sources SET enabled=true WHERE id=$1',[env.source.id]);
    const revoked=await api('POST',`/admin/sources/${env.source.id}/collect`,manager.accessToken,{operationId:'role-revoked-after-receipt'});
    assert.equal(revoked.status,202);
    await env.ctx.db.query("UPDATE users SET role='user' WHERE id=$1",[env.admin.id]);
    await assert.rejects(env.ctx.tasks.execute({taskId:String(revoked.data.taskId),generation:1},createHandlers(env.ctx)));
    assert.equal(env.state.modelCalls,calls);
    await api('POST','/auth/logout',login.accessToken);
    assert.equal((await api('GET','/editor',login.accessToken)).status,401);
    await mkdir(process.env.VERIFICATION_DIR ?? '.local/verification',{recursive:true});
    await writeFile(`${process.env.VERIFICATION_DIR ?? '.local/verification'}/security-api-results.json`,JSON.stringify({checks:{'SEC-01':'passed','SEC-02':'passed','SEC-03':'passed','SEC-04':'passed','SEC-07-successful-call':'passed'},protectedInterfaces:9,requests:records,skillLog},null,2)+'\n');
  }finally{await env.cleanup();}
});
