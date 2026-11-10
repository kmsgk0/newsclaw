import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../../context.js';
import { AuthService } from './service.js';
const credentialsSchema = { type: 'object', required: ['username', 'password'], additionalProperties: false, properties: { username: { type: 'string', minLength: 3, maxLength: 32 }, password: { type: 'string', minLength: 8, maxLength: 128 } } };
export async function registerAuth(app: FastifyInstance, ctx: AppContext) {
  const auth = new AuthService(ctx.db);
  const cookieOptions = { httpOnly: true, secure: ctx.config.secureCookies, sameSite: 'strict' as const, path: '/api/v1/auth', maxAge: 7 * 24 * 3600 };
  const sessionResponse = (reply: FastifyReply, session: Awaited<ReturnType<AuthService['login']>>) => {
    reply.setCookie('newsclaw_refresh', session.refreshToken, cookieOptions);
    return { user: session.user, accessToken: session.accessToken };
  };
  app.post('/api/v1/auth/register', { config: { public: true }, schema: { tags: ['account'], body: credentialsSchema } }, async (req, reply) => { reply.code(201); return { user: await auth.register(req.body) }; });
  app.post('/api/v1/auth/login', { config: { public: true }, schema: { tags: ['account'], body: credentialsSchema } }, async (req, reply) => sessionResponse(reply, await auth.login(req.body)));
  app.post('/api/v1/auth/refresh', { config: { public: true }, schema: { tags: ['account'] } }, async (req, reply) => sessionResponse(reply, await auth.refresh(req.cookies.newsclaw_refresh ?? '')));
  app.get('/api/v1/auth/me', { schema: { tags: ['account'] } }, async (req) => ({ user: req.actor }));
  app.post('/api/v1/auth/logout', { schema: { tags: ['account'] } }, async (req, reply) => { await auth.logout(req.sessionId!); reply.clearCookie('newsclaw_refresh', cookieOptions); return null; });
  app.post('/api/v1/auth/password', { schema: { tags: ['account'], body: { type: 'object', required: ['oldPassword', 'newPassword'], additionalProperties: false, properties: { oldPassword: { type: 'string', minLength: 8, maxLength: 128 }, newPassword: { type: 'string', minLength: 8, maxLength: 128 } } } } }, async (req, reply) => { await auth.changePassword(req.actor!.id, req.body); reply.clearCookie('newsclaw_refresh', cookieOptions); return null; });
}
