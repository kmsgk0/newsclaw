import type { Artifact, Citation, NewsItem, TopicSummary } from "../../types";


export interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Topic extends TopicSummary {
  news?: NewsItem[];
  notes?: Note[];
  artifacts?: SavedArtifact[];
  following?: boolean;
}

export interface SavedArtifact extends Artifact {
  id: string;
  shares: { token: string; url: string; revokedAt: string | null }[];
}

export interface SharedArtifact extends Artifact {
  sources: Citation[];
}
