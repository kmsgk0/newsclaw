import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../support/helpers.js';
import { NewsRepository } from '../../src/server/modules/news/repository.js';

test('NEWS-01/02 title-only reports never share an empty-body processing result',async()=>{
  const env=await createTestDb();try{
    const repo=new NewsRepository(env.db);const source=await repo.saveSource({name:'Title-only RSS',kind:'rss',url:'https://news.example/feed',enabled:true,config:{}});
    const first=await repo.upsert(source.id,{title:'World simulation model',url:'https://news.example/simulation',content:'',publishedAt:null,contentScope:'summary'});
    const second=await repo.upsert(source.id,{title:'On-device speech model',url:'https://news.example/speech',content:'',publishedAt:null,contentScope:'summary'});
    assert.notEqual(first.content_hash,second.content_hash);
    await repo.updateProcessing(String(first.id),String(first.content_hash),{summary:'World simulation model announcement',processing:{summary:'succeeded'}});
    assert.equal(await repo.processedTwin(String(second.content_hash),String(second.id)),undefined);
    const sameTitle=await repo.upsert(source.id,{title:'World simulation model',url:'https://news.example/another-simulation',content:'',publishedAt:null,contentScope:'summary'});
    assert.equal(await repo.processedTwin(String(sameTitle.content_hash),String(sameTitle.id)),undefined);
    assert.equal((await repo.get(String(second.id))).summary,null);
  }finally{await env.cleanup();}
});
