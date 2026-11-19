import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { GenerationRepository } from './repository.js';

const update = z.object({mode:z.enum(['manual','daily','updates']).optional(),startHour:z.number().int().min(0).max(23).optional(),dailyLimit:z.number().int().min(1).max(20).optional(),resume:z.literal(true).optional()}).strict().refine(value=>Object.keys(value).length>0,'请填写生成设置');
export async function registerGeneration(app: FastifyInstance,ctx: AppContext) {
  const repository = new GenerationRepository(ctx.db);
  app.get('/api/v1/editor/generation',{schema:{tags:['Editor'],summary:'本人自动生成设置和后台生成用量'}},async request=>({settings:await repository.settings(request.actor!.id),usage:await repository.usage(request.actor!.id)}));
  app.patch('/api/v1/editor/generation',{schema:{tags:['Editor'],summary:'修改本人自动生成策略',body:z.toJSONSchema(update,{target:'draft-7'})}},async request=>repository.update(request.actor!.id,update.parse(request.body)));
}
