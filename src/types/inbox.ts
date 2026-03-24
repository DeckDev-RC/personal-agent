import type { DraftType } from "./communication.js";

export type UnifiedInboxQuery = {
  limit?: number;
  onlyUnread?: boolean;
  query?: string;
  channel?: DraftType;
};

export type UnifiedInboxItem = {
  id: string;
  serverId: string;
  serverName: string;
  catalogId?: string;
  channel: DraftType;
  toolName: string;
  title: string;
  snippet: string;
  from?: string;
  to?: string;
  unread?: boolean;
  receivedAt?: number;
  threadId?: string;
  url?: string;
  rawText?: string;
  raw?: Record<string, unknown>;
};

export type UnifiedInboxSource = {
  serverId: string;
  serverName: string;
  catalogId?: string;
  channel: DraftType;
  connected: boolean;
  toolName?: string;
  itemCount: number;
  error?: string;
};

export type UnifiedInboxSnapshot = {
  fetchedAt: number;
  items: UnifiedInboxItem[];
  sources: UnifiedInboxSource[];
};
