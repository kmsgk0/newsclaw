import { z } from 'zod';
import { unavailable } from '../../errors.js';
export interface MindmapNode { label: string; sourceIds: string[]; children?: MindmapNode[] }
export const mindmapSchema: z.ZodType<MindmapNode> = z.lazy(() => z.object({ label: z.string().trim().min(1), sourceIds: z.array(z.string().uuid()).min(1), children: z.array(mindmapSchema).optional() }).strict());
export function validateMindmap(value: unknown, sourceIds: string[]): MindmapNode {
  const parsed = mindmapSchema.safeParse(value);
  if (!parsed.success) throw unavailable('导图结构无效，请重新生成');
  const allowed = new Set(sourceIds); let nodes = 0;
  const visit = (node: MindmapNode, depth: number) => {
    nodes++;
    if (depth > 16 || nodes > 500 || !node.sourceIds.length || node.sourceIds.some(id => !allowed.has(id))) throw unavailable('导图含无效层级或无依据来源，请重新生成');
    node.children?.forEach(child => visit(child, depth + 1));
  };
  visit(parsed.data, 0); return parsed.data;
}
export const graphExtractionSchema = z.object({
  entities: z.array(z.object({ name: z.string().trim().min(1), type: z.enum(['company','person','product','event']) }).strict()),
  relations: z.array(z.object({ source: z.string().min(1), target: z.string().min(1), label: z.string().min(1), sourceIds: z.array(z.string().uuid()).min(1) }).strict()),
}).strict();
export type GraphExtraction = z.infer<typeof graphExtractionSchema>;
export function validateGraph(value: unknown, sourceIds: string[]): GraphExtraction {
  const parsed = graphExtractionSchema.safeParse(value);
  if (!parsed.success) throw unavailable('关系图结构无效');
  const entities = new Set(parsed.data.entities.map(x => x.name)); const allowed = new Set(sourceIds);
  if (parsed.data.relations.some(r => !entities.has(r.source) || !entities.has(r.target) || r.sourceIds.some(id => !allowed.has(id)))) throw unavailable('关系图含无依据节点或来源');
  return parsed.data;
}
