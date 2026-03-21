import fs from "node:fs/promises";
import path from "node:path";
import { connect, embedding, type Table } from "@lancedb/lancedb";
import type {
  KnowledgeSearchQuery,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
  KnowledgeSyncStatus,
} from "../../src/types/knowledge.js";
import type {
  MemoryChunkRecord,
  MemorySearchResult,
  MemorySourceRecord,
  MemorySourceType,
  SessionRecord,
} from "../../src/types/runtime.js";
import { resolveDataRoot } from "./dataRoot.js";
import { listProjectContextsV2 } from "./v2EntityStore.js";
import {
  listMemoryChunkRecords,
  listMemorySourceRecords,
  listSessionRecords,
  searchMemoryRecords,
} from "./v2SessionStore.js";

const TABLE_NAME = "knowledge_chunks";
const EMBEDDING_DIMS = 256;
const SYNC_TTL_MS = 60_000;
const SEARCH_FETCH_MULTIPLIER = 6;

type KnowledgeTableRow = {
  chunkId: string;
  sourceId: string;
  sourceType: MemorySourceType;
  title: string;
  searchText: string;
  content: string;
  path: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  projectContextId: string | null;
  projectContextName: string | null;
  runId: string | null;
  workspaceId: string | null;
  updatedAt: number;
};

const DEFAULT_STATUS: KnowledgeSyncStatus = {
  backend: "lancedb",
  ready: false,
  sourceCount: 0,
  chunkCount: 0,
};

let syncStatus: KnowledgeSyncStatus = { ...DEFAULT_STATUS };
let cachedRows = new Map<string, KnowledgeTableRow>();
let syncPromise: Promise<KnowledgeSyncStatus> | null = null;

function knowledgeDbPath(): string {
  return path.join(resolveDataRoot(), "knowledge", "lancedb");
}

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenizeForFts(input: string): string {
  return input
    .split(/\s+/)
    .map((part) => part.trim().replace(/"/g, ""))
    .filter(Boolean)
    .map((part) => `"${part}"`)
    .join(" OR ");
}

function tokenizeForEmbedding(input: string): string[] {
  const normalized = stripDiacritics(input).toLowerCase().replace(/[^a-z0-9\s/_:-]+/g, " ");
  const baseTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const tokens: string[] = [...baseTokens];
  for (let index = 0; index < baseTokens.length - 1; index += 1) {
    tokens.push(`${baseTokens[index]}_${baseTokens[index + 1]}`);
  }
  for (let index = 0; index < baseTokens.length - 2; index += 1) {
    tokens.push(`${baseTokens[index]}_${baseTokens[index + 1]}_${baseTokens[index + 2]}`);
  }
  return tokens.slice(0, 512);
}

function hashToken(token: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(input: string, dimensions = EMBEDDING_DIMS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenizeForEmbedding(input);
  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const weight = token.includes("_") ? 1.35 : 1;
    for (let seed = 0; seed < 4; seed += 1) {
      const slot = hashToken(token, 2166136261 ^ (seed * 374761393)) % dimensions;
      const sign = (hashToken(token, 1469598103 ^ (seed * 668265263)) & 1) === 0 ? 1 : -1;
      vector[slot] += sign * weight;
    }
  }

  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }
  if (magnitude === 0) {
    return vector;
  }

  const scale = 1 / Math.sqrt(magnitude);
  return vector.map((value) => value * scale);
}

function formatPreview(content: string, maxLength = 260): string {
  const trimmed = normalizeWhitespace(content);
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildSearchText(params: {
  source: MemorySourceRecord;
  chunk: MemoryChunkRecord;
  session?: SessionRecord;
  projectContextName?: string;
}): string {
  return [
    params.source.title,
    params.source.path ?? params.chunk.path ?? "",
    params.session?.title ?? "",
    params.projectContextName ?? "",
    params.chunk.content,
  ]
    .map((part) => normalizeWhitespace(String(part ?? "")))
    .filter(Boolean)
    .join("\n");
}

function toKnowledgeResult(
  row: KnowledgeTableRow,
  score: number,
  origin: KnowledgeSearchResult["origin"],
): KnowledgeSearchResult {
  return {
    chunkId: row.chunkId,
    sourceId: row.sourceId,
    sourceType: row.sourceType,
    title: row.title,
    content: row.content,
    preview: formatPreview(row.content),
    path: row.path ?? undefined,
    sessionId: row.sessionId ?? undefined,
    sessionTitle: row.sessionTitle ?? undefined,
    projectContextId: row.projectContextId ?? undefined,
    projectContextName: row.projectContextName ?? undefined,
    runId: row.runId ?? undefined,
    workspaceId: row.workspaceId ?? undefined,
    updatedAt: row.updatedAt,
    score,
    origin,
  };
}

function matchesFilters(row: KnowledgeTableRow, params: KnowledgeSearchQuery): boolean {
  if (params.sourceTypes?.length && !params.sourceTypes.includes(row.sourceType)) {
    return false;
  }
  if (params.sessionId && row.sessionId !== params.sessionId) {
    return false;
  }
  if (params.projectContextId && row.projectContextId !== params.projectContextId) {
    return false;
  }
  return true;
}

class CoworkTextEmbeddingFunction extends embedding.TextEmbeddingFunction<{ dims?: number }> {
  private readonly dimensions: number;

  constructor(options?: { dims?: number }) {
    super();
    this.dimensions = options?.dims ?? EMBEDDING_DIMS;
  }

  ndims(): number {
    return this.dimensions;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedText(text, this.dimensions));
  }
}

async function getConnection() {
  const targetPath = knowledgeDbPath();
  await fs.mkdir(targetPath, { recursive: true });
  return await connect(targetPath);
}

async function openKnowledgeTable(): Promise<Table | null> {
  const connection = await getConnection();
  try {
    const tableNames = await connection.tableNames();
    if (!tableNames.includes(TABLE_NAME)) {
      return null;
    }
    return await connection.openTable(TABLE_NAME);
  } finally {
    connection.close();
  }
}

async function rebuildKnowledgeRows(): Promise<KnowledgeTableRow[]> {
  const [sources, sessions, contexts] = await Promise.all([
    listMemorySourceRecords(),
    listSessionRecords(),
    listProjectContextsV2(),
  ]);

  const rows: KnowledgeTableRow[] = [];
  const sessionMap = new Map(sessions.map((session) => [session.sessionId, session]));
  const workspaceSessionMap = new Map(
    sessions
      .filter((session) => typeof session.workspaceId === "string" && session.workspaceId.trim())
      .map((session) => [session.workspaceId!, session]),
  );
  const contextMap = new Map(contexts.map((projectContext) => [projectContext.id, projectContext]));

  for (const source of sources) {
    const chunks = await listMemoryChunkRecords(source.sourceId);
    if (chunks.length === 0) {
      continue;
    }

    const resolvedSession =
      (source.sessionId ? sessionMap.get(source.sessionId) : undefined) ??
      (source.workspaceId ? workspaceSessionMap.get(source.workspaceId) : undefined);
    const projectContextId = resolvedSession?.projectContextId ?? null;
    const projectContextName = projectContextId ? contextMap.get(projectContextId)?.name ?? null : null;

    for (const chunk of chunks) {
      const session =
        (chunk.sessionId ? sessionMap.get(chunk.sessionId) : undefined) ??
        (chunk.workspaceId ? workspaceSessionMap.get(chunk.workspaceId) : undefined) ??
        resolvedSession;

      rows.push({
        chunkId: chunk.chunkId,
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        title: source.title || source.path || "Knowledge entry",
        searchText: buildSearchText({
          source,
          chunk,
          session,
          projectContextName: session?.projectContextId
            ? contextMap.get(session.projectContextId)?.name ?? projectContextName ?? undefined
            : projectContextName ?? undefined,
        }),
        content: chunk.content,
        path: chunk.path ?? source.path ?? null,
        sessionId: chunk.sessionId ?? session?.sessionId ?? null,
        sessionTitle: session?.title ?? null,
        projectContextId: session?.projectContextId ?? projectContextId,
        projectContextName:
          (session?.projectContextId ? contextMap.get(session.projectContextId)?.name : undefined) ??
          projectContextName,
        runId: chunk.runId ?? source.runId ?? null,
        workspaceId: chunk.workspaceId ?? source.workspaceId ?? null,
        updatedAt: Math.max(chunk.updatedAt, source.updatedAt),
      });
    }
  }

  return rows.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function writeKnowledgeTable(rows: KnowledgeTableRow[]): Promise<void> {
  const connection = await getConnection();
  try {
    const tableNames = await connection.tableNames();
    if (rows.length === 0) {
      if (tableNames.includes(TABLE_NAME)) {
        await connection.dropTable(TABLE_NAME);
      }
      return;
    }

    const table = await connection.createTable(TABLE_NAME, rows, {
      mode: "overwrite",
      embeddingFunction: {
        sourceColumn: "searchText",
        vectorColumn: "vector",
        function: new CoworkTextEmbeddingFunction({ dims: EMBEDDING_DIMS }),
      },
    });
    table.close();
  } finally {
    connection.close();
  }
}

async function ensureKnowledgeSync(force = false): Promise<KnowledgeSyncStatus> {
  if (!force && syncStatus.lastSyncAt && Date.now() - syncStatus.lastSyncAt < SYNC_TTL_MS) {
    return syncStatus;
  }

  if (syncPromise) {
    return await syncPromise;
  }

  syncPromise = (async () => {
    const startedAt = Date.now();
    try {
      const rows = await rebuildKnowledgeRows();
      cachedRows = new Map(rows.map((row) => [row.chunkId, row]));
      await writeKnowledgeTable(rows);
      syncStatus = {
        backend: "lancedb",
        ready: rows.length > 0,
        sourceCount: new Set(rows.map((row) => row.sourceId)).size,
        chunkCount: rows.length,
        lastSyncAt: Date.now(),
        lastSyncDurationMs: Date.now() - startedAt,
      };
      return syncStatus;
    } catch (error) {
      syncStatus = {
        ...syncStatus,
        backend: "lancedb",
        lastSyncAt: Date.now(),
        lastSyncDurationMs: Date.now() - startedAt,
        lastError: error instanceof Error ? error.message : String(error),
      };
      return syncStatus;
    }
  })();

  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

function mergeSearchResult(target: Map<string, KnowledgeSearchResult>, incoming: KnowledgeSearchResult): void {
  const existing = target.get(incoming.chunkId);
  if (!existing) {
    target.set(incoming.chunkId, incoming);
    return;
  }

  const nextOrigin =
    existing.origin === incoming.origin
      ? existing.origin
      : existing.origin === "hybrid" || incoming.origin === "hybrid"
        ? "hybrid"
        : "hybrid";

  target.set(incoming.chunkId, {
    ...existing,
    score: existing.score + incoming.score,
    origin: nextOrigin,
  });
}

function scoreVectorHit(distance: unknown): number {
  const numericDistance = typeof distance === "number" ? distance : Number(distance ?? 1);
  if (!Number.isFinite(numericDistance)) {
    return 0.35;
  }
  return 1 / (1 + Math.max(0, numericDistance));
}

function buildFallbackResult(hit: MemorySearchResult): KnowledgeSearchResult | null {
  const row = cachedRows.get(hit.chunkId);
  if (row) {
    return toKnowledgeResult(row, hit.score, "fts");
  }

  if (!hit.content.trim()) {
    return null;
  }

  return {
    chunkId: hit.chunkId,
    sourceId: hit.sourceId,
    sourceType: hit.sourceType,
    title: hit.title,
    content: hit.content,
    preview: formatPreview(hit.content),
    path: hit.path,
    updatedAt: Date.now(),
    score: hit.score,
    origin: "fts",
  };
}

export async function getKnowledgeStatus(): Promise<KnowledgeSyncStatus> {
  return await ensureKnowledgeSync(false);
}

export async function syncKnowledgeBase(): Promise<KnowledgeSyncStatus> {
  return await ensureKnowledgeSync(true);
}

export async function searchKnowledgeBase(params: KnowledgeSearchQuery): Promise<KnowledgeSearchResponse> {
  const query = params.query.trim();
  const status = await ensureKnowledgeSync(false);
  if (!query) {
    return {
      query,
      results: [],
      status,
    };
  }

  const limit = Math.max(1, Math.min(50, Math.round(params.limit ?? 12)));
  const merged = new Map<string, KnowledgeSearchResult>();

  try {
    const table = await openKnowledgeTable();
    if (table) {
      try {
        const vectorRows = (await table
          .search(query)
          .limit(Math.max(limit * SEARCH_FETCH_MULTIPLIER, limit))
          .toArray()) as Array<Record<string, unknown>>;

        for (const row of vectorRows) {
          const normalizedRow: KnowledgeTableRow = {
            chunkId: String(row.chunkId ?? ""),
            sourceId: String(row.sourceId ?? ""),
            sourceType: String(row.sourceType ?? "note") as MemorySourceType,
            title: String(row.title ?? "Knowledge entry"),
            searchText: String(row.searchText ?? ""),
            content: String(row.content ?? ""),
            path: typeof row.path === "string" ? row.path : null,
            sessionId: typeof row.sessionId === "string" ? row.sessionId : null,
            sessionTitle: typeof row.sessionTitle === "string" ? row.sessionTitle : null,
            projectContextId: typeof row.projectContextId === "string" ? row.projectContextId : null,
            projectContextName: typeof row.projectContextName === "string" ? row.projectContextName : null,
            runId: typeof row.runId === "string" ? row.runId : null,
            workspaceId: typeof row.workspaceId === "string" ? row.workspaceId : null,
            updatedAt: Number(row.updatedAt ?? Date.now()),
          };

          if (!matchesFilters(normalizedRow, params)) {
            continue;
          }

          mergeSearchResult(
            merged,
            toKnowledgeResult(normalizedRow, scoreVectorHit(row._distance), "vector"),
          );
        }
      } finally {
        table.close();
      }
    }
  } catch (error) {
    syncStatus = {
      ...syncStatus,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }

  const ftsQuery = tokenizeForFts(query);
  if (ftsQuery) {
    const ftsHits = await searchMemoryRecords({
      query: ftsQuery,
      sessionId: params.sessionId,
      limit: Math.max(limit * SEARCH_FETCH_MULTIPLIER, limit),
    });

    for (const hit of ftsHits) {
      const fallback = buildFallbackResult(hit);
      if (!fallback) {
        continue;
      }

      const row = cachedRows.get(hit.chunkId);
      if (row && !matchesFilters(row, params)) {
        continue;
      }
      if (!row && params.projectContextId) {
        continue;
      }
      if (params.sourceTypes?.length && !params.sourceTypes.includes(fallback.sourceType)) {
        continue;
      }

      mergeSearchResult(merged, {
        ...fallback,
        score: Math.max(0.2, hit.score),
      });
    }
  }

  const results = [...merged.values()]
    .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
    .slice(0, limit);

  return {
    query,
    results,
    status: syncStatus,
  };
}
