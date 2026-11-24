import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const task = {
  type: 'object', required: ['taskId', 'status', 'statusUrl'],
  properties: {
    taskId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['pending', 'running', 'succeeded', 'failed'] },
    statusUrl: { type: 'string', description: '任务状态查询路径' },
  },
};
const envelope = (data: object = {}) => ({
  type: 'object', required: ['code', 'message', 'data', 'requestId'],
  properties: { code: { type: 'string' }, message: { type: 'string' }, data, requestId: { type: 'string', format: 'uuid' } },
});
const errors = Object.fromEntries([400, 401, 403, 404, 409, 500, 503].map(status => [status, envelope()]));

export async function registerApiDocumentation(app: FastifyInstance, version: string) {
  await app.register(swagger, {
    openapi: { info: { title: 'NewsClaw API', version }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } },
    transform: ({ schema, url, route }) => {
      const status = route.config?.openapiStatus ?? 200;
      const contentType = route.config?.openapiContentType;
      const success = contentType ? {
        description: 'SSE 事件依次包含 meta、tool、text、sources、artifact，以及终态 complete 或 error。每条事件的 data 为 JSON。',
        content: { [contentType]: { schema: { type: 'string' }, example: 'event: text\ndata: {"text":"新闻摘要 [N1]"}\n\n' } },
      } : envelope(status === 202 ? task : {});
      return { url, schema: {
        ...schema,
        security: schema?.security ?? (route.config?.public ? [] : [{ bearerAuth: [] }]),
        response: { ...errors, ...(schema?.response ?? { [status]: route.config?.rawResponse ? {} : success }) },
      } };
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs/api',
    uiConfig: {
      requestInterceptor: async function (input) {
        const request = input as { url: string; method: string; headers: Record<string, string> };
        const url = new URL(request.url, window.location.href);
        const authorization = request.headers.Authorization ?? request.headers.authorization;
        if (url.origin === window.location.origin && url.pathname.startsWith('/api/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) && (authorization || url.pathname === '/api/v1/auth/refresh')) {
          const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', headers: authorization ? { Authorization: authorization } : {} });
          if (response.ok) {
            const result = await response.json();
            request.headers['X-CSRF-Token'] = result.data.token;
          }
        }
        return request;
      },
    },
  });
}
