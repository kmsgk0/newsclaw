import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { invalid } from '../../errors.js';
import { AuditRepository } from './repository.js';
import { auditQuery, skillAuditQuery } from './schemas.js';
function checkRange({ from, to }: {
  from?: string;
  to?: string;
}) {
  if (from && to && Date.parse(from) > Date.parse(to))
    throw invalid('开始时间不能晚于结束时间');
}
export async function registerAudit(app: FastifyInstance, ctx: AppContext) {
  const repository = new AuditRepository(ctx.db);
  app.get('/api/v1/admin/audit', {
    config: { admin: true },
    schema: { tags: ['管理'], querystring: z.toJSONSchema(auditQuery, { target: 'draft-7' }) },
  }, async (request) => {
    const filters = auditQuery.parse(request.query);
    checkRange(filters);
    return repository.requests(filters);
  });
  app.get('/api/v1/admin/skill-audit', {
    config: { admin: true },
    schema: { tags: ['管理'], querystring: z.toJSONSchema(skillAuditQuery, { target: 'draft-7' }) },
  }, async (request) => {
    const filters = skillAuditQuery.parse(request.query);
    checkRange(filters);
    return repository.skills(filters);
  });
}
