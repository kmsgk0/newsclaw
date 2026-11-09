import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillsService } from '../../src/server/modules/skills/service.js';
import { editorEnvironment } from '../support/editor-fixture.js';

test('SKILL-01/02 five skills install as unique independent personal copies', async () => {
  const env = await editorEnvironment();
  try {
    const service = new SkillsService(env.ctx), catalog = await service.list();
    assert.equal(catalog.length,5); assert.equal(new Set(catalog.map(skill=>skill.kind)).size,5);
    const one = await service.install(env.a,catalog[0].id), twice = await service.install(env.a,catalog[0].id);
    assert.equal(one!.id,twice!.id);
    await service.update(env.a,one!.id,{instructions:'只输出三个要点'});
    await env.ctx.db.query("UPDATE skills SET instructions='新公共模板' WHERE id=$1",[catalog[0].id]);
    assert.equal((await service.mine(env.a))[0].instructions,'只输出三个要点');
    await assert.rejects(service.update(env.b,one!.id,{enabled:false}),{code:'NOT_FOUND'});
    await env.ctx.db.query("CREATE FUNCTION fail_skill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
    await env.ctx.db.query('CREATE TRIGGER fail_skill BEFORE INSERT ON user_skills FOR EACH ROW EXECUTE FUNCTION fail_skill()');
    await assert.rejects(service.install(env.b,catalog[1].id));
    assert.equal((await service.mine(env.b)).length,0);
  } finally {await env.cleanup();}
});
test('SKILL-03/04 explicit skill wins, disabled selection rejects and publication excludes private data', async () => {
  const env=await editorEnvironment();
  try {
    const service=new SkillsService(env.ctx),catalog=await service.list();
    const explain=await service.install(env.a,catalog.find(x=>x.kind==='explain')!.id);
    const compare=await service.install(env.a,catalog.find(x=>x.kind==='comparison')!.id);
    assert.equal((await service.choose(env.a,'请通俗解释',compare!.id))!.id,compare!.id);
    assert.equal((await service.choose(env.a,'请比较不同来源'))!.id,compare!.id);
    assert.equal(await service.choose(env.a,'你好'),null);
    await service.update(env.a,compare!.id,{enabled:false});
    await assert.rejects(service.choose(env.a,'比较',compare!.id),{code:'INVALID_INPUT'});
    assert.equal(await service.choose(env.a,'比较'),null);
    await assert.rejects(service.publish(env.b,explain!.id,{description:'其他人',example:'公开例子',status:'published'}),{code:'NOT_FOUND'});
    const published=await service.publish(env.a,explain!.id,{description:'我的解读',example:'明确填写的公开示例',status:'published'});
    assert.ok(!('messages' in published!)); assert.equal(published!.example,'明确填写的公开示例');
    const installed=await service.install(env.b,published!.id);
    await assert.rejects(service.updatePublic(env.b,published!.id,{status:'unlisted'}),{code:'FORBIDDEN'});
    await service.updatePublic({...env.b,role:'admin'},published!.id,{status:'unlisted'});
    assert.ok(!(await service.list()).some(x=>x.id===published!.id));
    assert.equal((await service.mine(env.b))[0].id,installed!.id);
    assert.equal((await env.ctx.db.query("SELECT * FROM management_actions WHERE action='skill.update'")).length,1);
  } finally {await env.cleanup();}
});
