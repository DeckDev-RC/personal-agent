import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getWorkspaceRecordBySession,
  searchMemoryRecords,
  replaceWorkspaceFileChunks,
  searchSessionMessageRecords,
  searchWorkspaceChunkRecords,
  upsertWorkspaceRecord,
} from "./v2SessionStore.js";

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage"]);
const MAX_FILE_BYTES = 256_000;
const CHUNK_SIZE = 1800;

function tokenizeQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((part) => part.trim().replace(/"/g, ""))
    .filter(Boolean)
    .map((part) => `"${part}"`)
    .join(" OR ");
}

async function walk(root: string, visitor: (absolutePath: string, relativePath: string) => Promise<void>) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(root, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (entry.isDirectory()) {
      await walk(absolutePath, async (nestedPath, nestedRelative) => {
        await visitor(nestedPath, path.join(entry.name, nestedRelative));
      });
      continue;
    }
    await visitor(absolutePath, relativePath);
  }
}

function chunkText(content: string): string[] {
  if (content.length <= CHUNK_SIZE) {
    return [content];
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
    chunks.push(content.slice(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

export async function setWorkspaceRootForSession(
  sessionId: string,
  rootPath: string,
): Promise<void> {
  const existing = await getWorkspaceRecordBySession(sessionId);
  await upsertWorkspaceRecord({
    workspaceId: existing?.workspaceId ?? randomUUID(),
    sessionId,
    rootPath,
    status: "idle",
    indexedAt: existing?.indexedAt,
    fileCount: existing?.fileCount ?? 0,
    chunkCount: existing?.chunkCount ?? 0,
    lastError: undefined,
  });
}

export async function reindexWorkspace(sessionId: string): Promise<void> {
  const workspace = await getWorkspaceRecordBySession(sessionId);
  if (!workspace) {
    throw new Error("No workspace configured for session.");
  }

  await upsertWorkspaceRecord({ ...workspace, status: "indexing", lastError: undefined });

  let fileCount = 0;
  let chunkCount = 0;

  try {
    await walk(workspace.rootPath, async (absolutePath, relativePath) => {
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.size > MAX_FILE_BYTES) {
          return;
        }
        const content = await fs.readFile(absolutePath, "utf8");
        const chunks = chunkText(content).map((chunk, index) => ({
          chunkId: randomUUID(),
          chunkIndex: index,
          content: chunk,
          mtimeMs: stats.mtimeMs,
          sizeBytes: stats.size,
        }));
        await replaceWorkspaceFileChunks(workspace.workspaceId, relativePath, chunks);
        fileCount += 1;
        chunkCount += chunks.length;
      } catch {
        // Best-effort indexing.
      }
    });

    await upsertWorkspaceRecord({
      ...workspace,
      status: "ready",
      indexedAt: Date.now(),
      fileCount,
      chunkCount,
      lastError: undefined,
    });
  } catch (error) {
    await upsertWorkspaceRecord({
      ...workspace,
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
      fileCount,
      chunkCount,
      indexedAt: workspace.indexedAt,
    });
    throw error;
  }
}

export async function gatherContextForPrompt(params: {
  sessionId: string;
  workspaceRoot?: string;
  prompt: string;
}): Promise<string> {
  const parts: string[] = [];
  const query = tokenizeQuery(params.prompt);
  if (!query) {
    return "";
  }

  const workspace = await getWorkspaceRecordBySession(params.sessionId);
  if (workspace) {
    const memoryHits = await searchMemoryRecords({
      query,
      sessionId: params.sessionId,
      workspaceId: workspace.workspaceId,
      limit: 4,
    });
    if (memoryHits.length > 0) {
      parts.push(
        "Persistent memory:\n" +
          memoryHits
            .map((hit) => `# ${hit.title}${hit.path ? ` (${hit.path})` : ""}\n${hit.content}`)
            .join("\n\n---\n\n"),
      );
    }

    const workspaceHits = await searchWorkspaceChunkRecords(workspace.workspaceId, query, 4);
    if (workspaceHits.length > 0) {
      parts.push(
        "Workspace context:\n" +
          workspaceHits
            .map((hit) => `# ${hit.path}\n${hit.content}`)
            .join("\n\n---\n\n"),
      );
    }
  }

  const historyHits = await searchSessionMessageRecords(params.sessionId, query, 4);
  if (historyHits.length > 0) {
    parts.push(
      "Session history context:\n" +
        historyHits.map((hit) => `[${hit.role}] ${hit.content}`).join("\n"),
    );
  }

  return parts.join("\n\n====\n\n");
}
