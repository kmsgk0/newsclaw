import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { FeedbackRepository } from './repository.js';

const params=z.object({id:z.string().uuid()});
const input=z.object({category:z.enum(['helpful','inaccurate','unsupported_citation']),sourceLabel:z.string().min(1).max(40).optional(),note:z.string().max(1000).optional()}).strict();
const json=(schema:z.ZodType)=>z.toJSONSchema(schema,{target:'draft-7'});
export async function registerFeedback(app:FastifyInstance,ctx:AppContext) {
  const repository=new FeedbackRepository(ctx.db);
  app.get('/api/v1/messages/:id/feedback',{schema:{tags:['Editor'],summary:'读取本人回答反馈',params:json(params)}},request=>repository.read(request.actor!.id,params.parse(request.params).id));
  app.post('/api/v1/messages/:id/feedback',{schema:{tags:['Editor'],summary:'保存本人已完成回答的反馈',params:json(params),body:json(input)}},request=>repository.save(request.actor!.id,params.parse(request.params).id,input.parse(request.body)));
  app.delete('/api/v1/messages/:id/feedback',{schema:{tags:['Editor'],summary:'删除本人回答反馈',params:json(params)}},request=>repository.remove(request.actor!.id,params.parse(request.params).id));
  app.get('/api/v1/admin/feedback',{config:{admin:true},schema:{tags:['管理'],summary:'回答反馈类别及公开报道的聚合，不含私人问答和备注'}},()=>repository.aggregate());
}
