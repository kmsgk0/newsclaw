import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { SkillsService } from './service.js';

const text = z.string().trim().min(1).max(12000);
const idSchema = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'], additionalProperties: false };
const update = z.object({ name: text.max(100).optional(), instructions: text.optional(), outputFormat: text.max(2000).optional(), enabled: z.boolean().optional() }).strict().refine(x => Object.keys(x).length > 0);
export async function registerSkills(app: FastifyInstance, ctx: AppContext) {
  const service = new SkillsService(ctx);
  app.get('/api/v1/skills', { config: { public: true }, schema: { tags: ['Skills'], summary: '浏览已发布技能' } }, async () => ({ items: await service.list() }));
  app.get('/api/v1/skills/mine', { schema: { tags: ['Skills'], summary: '读取本人技能副本' } }, async request => ({ items: await service.mine(request.actor!) }));
  app.get('/api/v1/admin/skills', { config: { admin: true }, schema: { tags: ['Skills'], summary: '管理员查看公共技能发布状态' } }, async () => ({ items: await service.repository.all() }));
  app.post<{ Params: { id: string } }>('/api/v1/skills/:id/install', { schema: { tags: ['Skills'], summary: '安装公开技能，重复安装复用副本', params: idSchema } }, async (request, reply) => {
    const skill = await service.install(request.actor!, request.params.id); reply.code(201); return skill;
  });
  app.patch<{ Params: { id: string } }>('/api/v1/skills/mine/:id', { schema: { tags: ['Skills'], summary: '修改或启停本人技能', params: idSchema, body: z.toJSONSchema(update, { target: 'draft-7' }) } }, async request => service.update(request.actor!, request.params.id, update.parse(request.body)));
  const publish = z.object({ description: text.max(2000), example: text.max(6000), status: z.enum(['draft', 'published']).default('published') }).strict();
  app.post<{ Params: { id: string } }>('/api/v1/skills/mine/:id/publish', { schema: { tags: ['Skills'], summary: '发布本人技能版本', params: idSchema, body: z.toJSONSchema(publish, { target: 'draft-7' }) } }, async request => service.publish(request.actor!, request.params.id, publish.parse(request.body)));
  const publicUpdate = z.object({ name: text.max(100).optional(), description: text.max(2000).optional(), instructions: text.optional(), outputFormat: text.max(2000).optional(), example: text.max(6000).optional(), status: z.enum(['draft', 'published', 'unlisted']).optional() }).strict();
  app.patch<{ Params: { id: string } }>('/api/v1/skills/:id', { schema: { tags: ['Skills'], summary: '作者或管理员维护公开技能', params: idSchema, body: z.toJSONSchema(publicUpdate, { target: 'draft-7' }) } }, async request => service.updatePublic(request.actor!, request.params.id, publicUpdate.parse(request.body)));
}
export { SkillsService } from './service.js';
