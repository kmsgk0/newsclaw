import { setTimeout as delay } from 'node:timers/promises';
import { EditorService } from '../../src/server/modules/editor/service.js';
import { SkillsService } from '../../src/server/modules/skills/service.js';
import { startMetricsServer } from '../../src/server/runtime/metrics.js';
import { editorEnvironment } from '../support/editor-fixture.js';

const env=await editorEnvironment();
const server=await startMetricsServer(env.ctx.tasks,'0.0.0.0',9095);
try {
  const editor=new EditorService(env.ctx), skills=new SkillsService(env.ctx);
  const catalog=await skills.list();
  const selected=await Promise.all(['explain','comparison','brief'].map(async kind=>{
    const template=catalog.find(item=>item.kind===kind);
    if(!template) throw new Error(`missing ${kind}`);
    const installed=await skills.install(env.a,template.id);
    return {kind,id:installed!.id};
  }));
  console.log('metrics fixture ready');
  await delay(25000);
  for(const mode of ['valid','failure'] as const) {
    env.state.mode=mode;
    for(const skill of selected) {
      const conversation=await editor.createConversation(env.a,`metrics-${mode}-${skill.kind}`,{kind:'news',id:env.newsId});
      const events:string[]=[];
      await editor.execute(await editor.prepare(env.a,conversation!.id,{content:'根据报道回答',skillId:skill.id}),name=>events.push(name));
      const expected=mode==='valid'?'complete':'error';
      if(!events.includes(expected)) throw new Error(`${skill.kind} did not emit ${expected}`);
      console.log(`${skill.kind} ${mode} recorded`);
    }
    await delay(25000);
  }
  await delay(40000);
} finally {
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await env.cleanup();
}
