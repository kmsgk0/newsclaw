import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import type { Actor, AppContext } from '../context.js';
import { AppError, invalid, unavailable } from '../errors.js';
import { NewsService } from '../modules/news/service.js';
import type { NewsItem } from '../modules/news/types.js';
import type { ToolDefinition } from './model.js';

export async function createNewsMcp(ctx: AppContext, actor: Actor, allowedSourceIds?: string[], requestId?: string) {
  const server = new McpServer({ name: 'newsclaw-news', version: '1.0.0' });
  const news = new NewsService(ctx);
  const materials = new Map<string, NewsItem>();
  async function execute(action: () => Promise<{ items: NewsItem[]; [key: string]: unknown }>) {
    try {
      const result = await action();
      if (allowedSourceIds) {
        result.items = result.items.filter(item => allowedSourceIds.includes(item.id));
        delete result.event;
        if (!result.items.length) throw invalid('工具材料不属于本次技能范围');
      }
      for (const article of result.items) materials.set(article.id, article);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const safe = error instanceof AppError ? error : unavailable('新闻工具暂不可用');
      return { isError: true, content: [{ type: 'text' as const, text: safe.message }], structuredContent: { error: { status: safe.status, code: safe.code, message: safe.message } } };
    }
  }
  server.registerTool('news_search', {
    description: 'Search the shared news library. Return real reports and their original sources.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(1000), semantic: z.boolean().optional() }).strict(),
  }, ({ query, semantic }) => execute(async () => {
    const result = await news.search({ q: query, semantic: semantic ?? true, page: 1, pageSize: 20 });
    return { ...result, items: result.items };
  }));
  server.registerTool('news_read', { description: 'Read a report by its news identifier.', inputSchema: z.object({ id: z.string().uuid() }).strict() }, ({ id }) => execute(async () => ({ items: [await news.get(id, actor)] })));
  server.registerTool('events_read', { description: 'Read an event and its associated reports.', inputSchema: z.object({ id: z.string().uuid() }).strict() }, ({ id }) => execute(async () => ({ event: await news.event(id), items: await news.materials(actor, { kind: 'event', id }) })));
  server.registerTool('materials_read', {
    description: 'Read explicitly selected news, event or own favorites. Private resources always use the authenticated account.',
    inputSchema: z.object({ kind: z.enum(['news', 'event', 'favorites']), id: z.string().uuid().optional() }).strict(),
  }, scope => execute(async () => ({ items: await news.materials(actor, scope) })));
  const client = new Client({ name: 'newsclaw-editor', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const listing = await client.listTools();
  const tools: ToolDefinition[] = listing.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description ?? tool.name, parameters: tool.inputSchema } }));
  return {
    tools, materials,
    async call(name: string, args: Record<string, unknown>) {
      const started = Date.now();
      try {
        if (!listing.tools.some(tool => tool.name === name)) throw invalid('工具不可用');
        const result = await client.callTool({ name, arguments: args });
        if (result.isError) {
          const fault = z.object({ error: z.object({ status: z.number(), code: z.string(), message: z.string() }) }).safeParse(result.structuredContent);
          if (fault.success) throw new AppError(fault.data.error.status, fault.data.error.code, fault.data.error.message);
          throw invalid('新闻工具参数无效');
        }
        ctx.logger.info({ module: 'mcp', requestId, actorId: actor.id, tool: name, result: 'succeeded', durationMs: Date.now() - started }, 'mcp.call');
        return result.structuredContent ?? result.content;
      } catch (error) {
        const safe = error instanceof AppError ? error : unavailable('新闻工具暂不可用');
        ctx.logger.warn({ module: 'mcp', requestId, actorId: actor.id, tool: name, result: 'failed', code: safe.code, message: safe.message, durationMs: Date.now() - started }, 'mcp.call');
        throw error;
      }
    },
    async close() { await client.close(); await server.close(); },
  };
}
