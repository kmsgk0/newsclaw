import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { AppError, notFound, unavailable } from '../../errors.js';
import { EditorService } from './service.js';
import { prepareJournalInput, preparePersonalDailyInput } from './background.js';
import { businessDate } from './calendar.js';

const text = z.string().trim().min(1);
const scope = z.object({ kind: z.enum(['news', 'event', 'favorites', 'topic']), id: z.string().uuid().optional() }).strict().refine(value => value.kind === 'favorites' || !!value.id, '请选择材料');
const params = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'], additionalProperties: false };
const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-7' });
export async function registerEditor(app: FastifyInstance, ctx: AppContext) {
  const service = new EditorService(ctx), repository = service.repository;
  app.get('/api/v1/editor', { schema: { tags: ['Editor'], summary: '读取本人编辑配置' } }, async request => service.profile(request.actor!));
  const profile = z.object({ name: text.max(100).optional(), avatar: z.union([z.literal(''), z.string().url().regex(/^https?:\/\//)]).optional(), style: text.max(2000).optional(), interests: z.string().trim().max(4000).optional() }).strict();
  app.patch('/api/v1/editor', { schema: { tags: ['Editor'], summary: '修改本人编辑配置', body: jsonSchema(profile) } }, async request => {
    const saved = await repository.updateProfile(request.actor!.id, profile.parse(request.body)); if (!saved) throw notFound(); return saved;
  });
  app.get('/api/v1/conversations', { schema: { tags: ['Editor'], summary: '列出本人会话' } }, async request => ({ items: await repository.conversations(request.actor!.id) }));
  const create = z.object({ title: text.max(200).default('新的阅读会话'), context: scope.optional() }).strict();
  app.post('/api/v1/conversations', { schema: { tags: ['Editor'], summary: '建立私人阅读会话', body: jsonSchema(create) } }, async (request, reply) => {
    const body = create.parse(request.body); const conversation = await service.createConversation(request.actor!, body.title, body.context); reply.code(201); return conversation;
  });
  app.get<{ Params: { id: string } }>('/api/v1/conversations/:id', { schema: { tags: ['Editor'], summary: '恢复本人会话与消息', params } }, async request => service.conversation(request.actor!, request.params.id));
  const rename = z.object({ title: text.max(200) }).strict();
  app.patch<{ Params: { id: string } }>('/api/v1/conversations/:id', { schema: { tags: ['Editor'], summary: '重命名本人会话', params, body: jsonSchema(rename) } }, async request => repository.renameConversation(request.actor!.id, request.params.id, rename.parse(request.body).title));
  app.delete<{ Params: { id: string } }>('/api/v1/conversations/:id', { schema: { tags: ['Editor'], summary: '删除本人会话及消息', params } }, async request => repository.removeConversation(request.actor!.id, request.params.id));
  const send = z.object({ content: text.max(12000), skillId: z.string().uuid().optional(), context: scope.optional(), retryMessageId: z.string().uuid().optional() }).strict();
  app.post<{ Params: { id: string } }>('/api/v1/conversations/:id/messages', { schema: { tags: ['Editor'], summary: '发送问题，流式返回回答与来源', params, body: jsonSchema(send) } }, async (request, reply) => {
    const prepared = await service.prepare(request.actor!, request.params.id, send.parse(request.body));
    const controller = new AbortController();
    reply.hijack(); reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', 'x-request-id': request.id });
    const emit = (event: string, data: unknown) => { if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    reply.raw.on('close', abort);
    try { await service.execute(prepared, emit, controller.signal, request.id); }
    catch (error) {
      const safe = error instanceof AppError ? error : unavailable('回答保存失败，请重新打开会话查看状态');
      emit('error', { status: safe.status, code: safe.code, message: safe.message, requestId: request.id });
    } finally { reply.raw.removeListener('close', abort); if (!reply.raw.destroyed) reply.raw.end(); }
  });
  app.get('/api/v1/memories', { schema: { tags: ['Editor'], summary: '列出本人长期记忆' } }, async request => ({ items: await repository.memories(request.actor!.id) }));
  app.get<{ Params: { id: string } }>('/api/v1/memories/:id', { schema: { tags: ['Editor'], summary: '读取本人长期记忆', params } }, async request => { const memory = await repository.memory(request.actor!.id, request.params.id); if (!memory) throw notFound(); return memory; });
  const memory = z.object({ key: text.max(100), content: text.max(2000) }).strict();
  app.post('/api/v1/memories', { schema: { tags: ['Editor'], summary: '保存明确的个人记忆', body: jsonSchema(memory) } }, async (request, reply) => { const data = memory.parse(request.body); reply.code(201); return repository.writeMemory(request.actor!.id, data.key, data.content); });
  const memoryUpdate = z.object({ content: text.max(2000) }).strict();
  app.patch<{ Params: { id: string } }>('/api/v1/memories/:id', { schema: { tags: ['Editor'], summary: '修改本人记忆，保留明确偏好', params, body: jsonSchema(memoryUpdate) } }, async request => repository.editMemory(request.actor!.id, request.params.id, memoryUpdate.parse(request.body).content));
  app.delete<{ Params: { id: string } }>('/api/v1/memories/:id', { schema: { tags: ['Editor'], summary: '删除本人记忆', params } }, async request => { await repository.editMemory(request.actor!.id, request.params.id); return null; });
  const history = z.object({ date: z.iso.date().optional() }).strict();
  app.get('/api/v1/editor/digests', { schema: { tags: ['Editor'], summary: '回看个人日报及生成状态', querystring: jsonSchema(history) } }, async request => repository.readingHistory(request.actor!.id, 'daily', history.parse(request.query).date));
  app.get('/api/v1/editor/journals', { schema: { tags: ['Editor'], summary: '回看编辑手记及整理状态', querystring: jsonSchema(history) } }, async request => repository.readingHistory(request.actor!.id, 'journal', history.parse(request.query).date));
  const generate = z.object({ date: z.iso.date().optional(), operationId: text.max(160) }).strict();
  app.post('/api/v1/editor/digests/generate', { schema: { tags: ['Editor'], summary: '接收个人日报生成任务', body: jsonSchema(generate) } }, async (request, reply) => {
    const data = generate.parse(request.body), date = data.date ?? businessDate();
    const input = await preparePersonalDailyInput(ctx, request.actor!.id, date);
    const task = await ctx.tasks.submit(request.actor!, 'daily', input, data.operationId, request.actor!.id, ctx.db, { date });
    reply.code(202); return task;
  });
  app.post('/api/v1/editor/journals/generate', { schema: { tags: ['Editor'], summary: '整理本人新增阅读活动', body: jsonSchema(generate) } }, async (request, reply) => {
    const data = generate.parse(request.body), date = data.date ?? businessDate();
    const input = await prepareJournalInput(ctx, request.actor!.id, date);
    const task = await ctx.tasks.submit(request.actor!, 'journal', input, data.operationId, request.actor!.id, ctx.db, { date });
    reply.code(202); return task;
  });
}
export { EditorService } from './service.js';
export { createEditorHandlers, prepareJournalInput, preparePersonalDailyInput } from './background.js';
