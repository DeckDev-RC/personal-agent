import type { MemorySourceType } from "./runtime.js";

export type KnowledgeSyncStatus = {
  backend: "lancedb";
  ready: boolean;
  sourceCount: number;
  chunkCount: number;
  lastSyncAt?: number;
  lastSyncDurationMs?: number;
  lastError?: string;
};

export type KnowledgeSearchQuery = {
  query: string;
  limit?: number;
  sourceTypes?: MemorySourceType[];
  sessionId?: string;
  projectContextId?: string;
};

export type KnowledgeSearchResult = {
  chunkId: string;
  sourceId: string;
  sourceType: MemorySourceType;
  title: string;
  content: string;
  preview: string;
  path?: string;
  sessionId?: string;
  sessionTitle?: string;
  projectContextId?: string;
  projectContextName?: string;
  runId?: string;
  workspaceId?: string;
  updatedAt: number;
  score: number;
  origin: "vector" | "fts" | "hybrid";
};

export type KnowledgeSearchResponse = {
  query: string;
  results: KnowledgeSearchResult[];
  status: KnowledgeSyncStatus;
};
