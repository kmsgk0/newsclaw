

export interface User {
  id: string;
  username: string;
  role: "user" | "admin";
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Source {
  id: string;
  name: string;
  kind: "rss" | "json" | "web";
  url: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastError?: string;
  lastCollectedAt?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  sourceId: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  content: string;
  contentScope: "full" | "summary";
  summary: string | null;
  translation: string | null;
  language: string;
  domain: string;
  eventId: string | null;
  favorite?: boolean;
  processing?: Record<string, unknown>;
}

export interface Citation {
  id: string;
  label?: string;
  title: string;
  url: string;
  sourceName?: string;
}

export interface GraphData {
  nodes: { id: string; label: string; type: string; sourceIds: string[] }[];
  edges: {
    id: string;
    source: string;
    target: string;
    label: string;
    sourceIds: string[];
  }[];
}

export interface NewsEvent {
  id: string;
  title: string;
  summary: string;
  news: NewsItem[];
  timeline: NewsItem[];
  graph: GraphData;
  following: boolean;
}

export interface EventSummary {
  id: string;
  title: string;
  summary: string;
  reportCount: number;
  sourceCount: number;
  updatedAt: string;
}

export interface Trend {
  id: string;
  title: string;
  reportCount: number;
  sourceCount: number;
  lastPublishedAt: string;
  history: { date: string; reportCount: number; sourceCount: number }[];
}

export interface Digest {
  id?: string;
  date: string;
  title?: string;
  content: string;
  news?: NewsItem[];
  sources?: Citation[];
  generatedAt: string;
}

export interface DigestHistory {
  items: Digest[];
  availableDates: string[];
  latestDate?: string | null;
  date?: string;
  latestTask?: Task | null;
  status: "ready" | "pending" | "running" | "failed" | "empty" | "idle";
  error?: string;
}

export interface Task {
  taskId?: string;
  id?: string;
  status: "pending" | "running" | "succeeded" | "failed";
  statusUrl?: string;
  result?: Record<string, unknown>;
  error?: string | { message?: string };
  type?: string;
  attempts?: number;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface Editor {
  userId: string;
  name: string;
  avatar: string;
  style: string;
  interests: string;
}

export interface MaterialContext {
  kind: "news" | "event" | "favorites" | "topic";
  id?: string;
}

export interface MindNode {
  label: string;
  sourceIds: string[];
  children?: MindNode[];
}

export interface Artifact {
  id?: string;
  messageId?: string;
  title: string;
  kind: "brief" | "comparison" | "mindmap";
  content: string;
  structure?: MindNode;
  skillId?: string;
  sourceIds: string[];
  sources?: Citation[];
  createdAt?: string;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  status: "pending" | "completed" | "failed";
  sources: Citation[];
  skillId?: string;
  skillName?: string;
  artifact?: Artifact;
  createdAt: string;
  request?: { content: string; skillId?: string; context?: MaterialContext };
  error?: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
  } | null;
}

export interface Conversation {
  id: string;
  title: string;
  context: MaterialContext | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export interface Memory {
  id: string;
  key: string;
  content: string;
  origin: "manual" | "automatic";
  updatedAt: string;
}

export interface Skill {
  id: string;
  slug: string;
  kind: "explain" | "comparison" | "brief" | "mindmap" | "bilingual";
  name: string;
  description: string;
  instructions: string;
  outputFormat: string;
  example: string;
  status: "draft" | "published" | "unlisted";
}

export interface PersonalSkill {
  id: string;
  templateId: string;
  kind: Skill["kind"];
  name: string;
  instructions: string;
  outputFormat: string;
  enabled: boolean;
  publication: {
    id: string;
    status: string;
    description: string;
    example: string;
  } | null;
}

export interface Follow {
  kind: "event" | "topic";
  id: string;
  title: string;
  url: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  newsId: string;
  title: string;
  sourceName: string;
  createdAt: string;
  readAt: string | null;
  reasons?: Follow[];
}

export interface TopicSummary {
  id: string;
  name: string;
  description: string;
  filter: { keywords?: string; domain?: string; eventId?: string };
  newsCount: number;
  unreadCount: number;
  updatedAt: string;
}
