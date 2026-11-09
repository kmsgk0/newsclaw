export interface NewsItem {
  id: string; title: string; sourceId: string; sourceName: string; url: string; publishedAt: string | null;
  content: string; contentScope: 'full' | 'summary'; summary: string | null; translation: string | null;
  language: string; domain: string; eventId: string | null; createdAt: string;
  processing: Record<string, unknown>; favorite?: boolean; unread?: boolean;
}
export interface Source {
  id: string; name: string; kind: 'rss' | 'json' | 'web'; url: string; enabled: boolean;
  config: Record<string, unknown>; lastCollectedAt: string | null; lastError: string | null;
}
export interface SearchInput { q?: string; domain?: string; sourceId?: string; language?: 'zh' | 'en' | 'other'; page?: number; pageSize?: number; semantic?: boolean }
export interface MaterialScope { kind: 'news' | 'event' | 'favorites' | 'topic'; id?: string }
export interface GraphNode { id: string; label: string; type: string; sourceIds: string[] }
export interface GraphEdge { id: string; source: string; target: string; label: string; sourceIds: string[] }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }
