import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
export async function registerTasks(app: FastifyInstance, ctx: AppContext) {
  const params = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } };
  app.get<{
    Params: {
      id: string;
    };
  }>('/api/v1/tasks/:id', { schema: { tags: ['tasks'], params } }, async (req) => ctx.tasks.get(req.actor!, req.params.id));
  app.get('/api/v1/admin/tasks', { config: { admin: true }, schema: { tags: ['tasks'] } }, async () => ctx.tasks.listPublic());
  app.post<{
    Params: {
      id: string;
    };
    Body: {
      operationId: string;
    };
  }>('/api/v1/admin/tasks/:id/retry', { config: { admin: true }, schema: { tags: ['tasks'], params, body: { type: 'object', required: ['operationId'], additionalProperties: false, properties: { operationId: { type: 'string', minLength: 1, maxLength: 160 } } } } }, async (req, reply) => { reply.code(202); return ctx.tasks.replay(req.actor!, req.params.id, req.body.operationId); });
}
