import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ArtifactRecord,
  BrowserSessionRecord,
  ContextCheckpoint,
  JobRecord,
  MemoryChunkRecord,
  MemorySearchResult,
  MemorySourceRecord,
  RunPhase,
  RunRecord,
  RunStatus,
  SessionMessageRecord,
  SessionRecord,
  ToolApprovalRequest,
  ToolHistoryRecord,
  WorkspaceRecord,
} from "../../src/types/runtime.js";
import { normalizeModelRef } from "./providers/index.js";
import { appendJsonl, ensureDir, writeTextFile } from "./v2Fs.js";
import { ensureV2Db } from "./v2Db.js";
import { artifactsDir, browserProfileDir, sessionArtifactsDir, sessionDir, transcriptPath } from "./v2Paths.js";
import { chunkMemoryContent, estimateTokenCount, hashMemoryContent } from "./memoryChunks.js";

type ArtifactDraft = Omit<ArtifactRecord, "sessionId" | "runId" | "createdAt">;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToSession(row: Record<string, unknown>): SessionRecord {
  return {
    sessionId: String(row.session_id),
    title: String(row.title ?? "Nova sessao"),
    agentId: typeof row.agent_id === "string" ? row.agent_id : undefined,
    projectContextId: typeof row.project_context_id === "string" ? row.project_context_id : undefined,
    model: normalizeModelRef(String(row.model ?? "openai-codex/gpt-5.4")),
    systemPrompt: String(row.system_prompt ?? ""),
    workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : undefined,
    workspaceRoot: typeof row.workspace_root === "string" ? row.workspace_root : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    messageCount: Number(row.message_count ?? 0),
    lastRunId: typeof row.last_run_id === "string" ? row.last_run_id : undefined,
    lastRunStatus: typeof row.last_run_status === "string" ? (row.last_run_status as RunStatus) : undefined,
    lastRunPhase: typeof row.last_run_phase === "string" ? (row.last_run_phase as RunPhase) : undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): SessionMessageRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    role: String(row.role) as SessionMessageRecord["role"],
    content: String(row.content ?? ""),
    thinkingContent: typeof row.thinking_content === "string" ? row.thinking_content : undefined,
    model: typeof row.model === "string" ? normalizeModelRef(row.model) : undefined,
    timestamp: Number(row.timestamp ?? Date.now()),
    toolCallId: typeof row.tool_call_id === "string" ? row.tool_call_id : undefined,
    toolName: typeof row.tool_name === "string" ? row.tool_name : undefined,
    phase: typeof row.phase === "string" ? (row.phase as RunPhase) : undefined,
    kind: typeof row.kind === "string" ? row.kind : undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  };
}

function rowToRun(row: Record<string, unknown>): RunRecord {
  return {
    runId: String(row.run_id),
    sessionId: String(row.session_id),
    workflowId: typeof row.workflow_id === "string" ? row.workflow_id : undefined,
    taskType: String(row.task_type) as RunRecord["taskType"],
    phase: String(row.phase) as RunPhase,
    status: String(row.status) as RunStatus,
    prompt: String(row.prompt ?? ""),
    planText: typeof row.plan_text === "string" ? row.plan_text : undefined,
    reviewText: typeof row.review_text === "string" ? row.review_text : undefined,
    attempt: Number(row.attempt ?? 0),
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    error: typeof row.error === "string" ? row.error : undefined,
  };
}

function rowToApproval(row: Record<string, unknown>): ToolApprovalRequest {
  const resolution = parseJson<Record<string, unknown>>(row.resolution_json, {});
  return {
    approvalId: String(row.approval_id),
    sessionId: String(row.session_id),
    runId: String(row.run_id),
    toolCallId: String(row.tool_call_id),
    toolName: String(row.tool_name),
    riskLevel: String(row.risk_level) as ToolApprovalRequest["riskLevel"],
    reason: String(row.reason ?? ""),
    source: String(row.source) as ToolApprovalRequest["source"],
    request: parseJson<Record<string, unknown>>(row.request_json, {}),
    createdAt: Number(row.created_at ?? Date.now()),
    status: String(row.status) as ToolApprovalRequest["status"],
    resolution:
      typeof resolution.approved === "boolean"
        ? {
            approved: resolution.approved,
            decidedAt: Number(resolution.decidedAt ?? Date.now()),
            note: typeof resolution.note === "string" ? resolution.note : undefined,
          }
        : undefined,
  };
}

function rowToArtifact(row: Record<string, unknown>): ArtifactRecord {
  return {
    artifactId: String(row.artifact_id),
    sessionId: String(row.session_id),
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    type: String(row.type) as ArtifactRecord["type"],
    label: String(row.label),
    filePath: typeof row.file_path === "string" ? row.file_path : undefined,
    contentText: typeof row.content_text === "string" ? row.content_text : undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: Number(row.created_at ?? Date.now()),
  };
}

function rowToWorkspace(row: Record<string, unknown>): WorkspaceRecord {
  return {
    workspaceId: String(row.workspace_id),
    sessionId: String(row.session_id),
    rootPath: String(row.root_path),
    status: String(row.status) as WorkspaceRecord["status"],
    lastJobId: typeof row.last_job_id === "string" ? row.last_job_id : undefined,
    indexedAt: typeof row.indexed_at === "number" ? row.indexed_at : undefined,
    fileCount: Number(row.file_count ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    lastError: typeof row.last_error === "string" ? row.last_error : undefined,
  };
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    jobId: String(row.job_id),
    kind: String(row.kind) as JobRecord["kind"],
    scopeType: String(row.scope_type) as JobRecord["scopeType"],
    scopeId: String(row.scope_id),
    status: String(row.status) as JobRecord["status"],
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    resultSummary: typeof row.result_summary === "string" ? row.result_summary : undefined,
    error: typeof row.error === "string" ? row.error : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    startedAt: typeof row.started_at === "number" ? row.started_at : undefined,
    completedAt: typeof row.completed_at === "number" ? row.completed_at : undefined,
  };
}

function rowToBrowserSession(row: Record<string, unknown>): BrowserSessionRecord {
  return {
    browserSessionId: String(row.browser_session_id),
    sessionId: String(row.session_id),
    profilePath: String(row.profile_path),
    currentUrl: typeof row.current_url === "string" ? row.current_url : undefined,
    status: String(row.status) as BrowserSessionRecord["status"],
    lastActivityAt: Number(row.last_activity_at ?? Date.now()),
    lastError: typeof row.last_error === "string" ? row.last_error : undefined,
  };
}

function rowToMemorySource(row: Record<string, unknown>): MemorySourceRecord {
  return {
    sourceId: String(row.source_id),
    sourceType: String(row.source_type) as MemorySourceRecord["sourceType"],
    sessionId: typeof row.session_id === "string" ? row.session_id : undefined,
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : undefined,
    path: typeof row.path === "string" ? row.path : undefined,
    title: String(row.title ?? ""),
    contentHash: String(row.content_hash ?? ""),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

function rowToMemoryChunk(row: Record<string, unknown>): MemoryChunkRecord {
  return {
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    sessionId: typeof row.session_id === "string" ? row.session_id : undefined,
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : undefined,
    path: typeof row.path === "string" ? row.path : undefined,
    chunkIndex: Number(row.chunk_index ?? 0),
    content: String(row.content ?? ""),
    tokenEstimate: Number(row.token_estimate ?? 0),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

async function upsertMemoryFromContent(params: {
  sourceId: string;
  sourceType: MemorySourceRecord["sourceType"];
  sessionId?: string;
  runId?: string;
  workspaceId?: string;
  path?: string;
  title: string;
  content: string;
}): Promise<void> {
  const trimmed = params.content.trim();
  if (!trimmed) {
    return;
  }

  const db = await ensureV2Db();
  const updatedAt = Date.now();
  const contentHash = hashMemoryContent(trimmed);
  db.prepare(
    `
      INSERT OR REPLACE INTO memory_sources (
        source_id, source_type, session_id, run_id, workspace_id, path, title, content_hash, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `,
  ).run(
    params.sourceId,
    params.sourceType,
    params.sessionId ?? null,
    params.runId ?? null,
    params.workspaceId ?? null,
    params.path ?? null,
    params.title,
    contentHash,
    updatedAt,
  );

  db.prepare("DELETE FROM memory_chunks WHERE source_id = ?").run(params.sourceId);
  db.prepare("DELETE FROM memory_chunks_fts WHERE source_id = ?").run(params.sourceId);

  const insertChunk = db.prepare(
    `
      INSERT INTO memory_chunks (
        chunk_id, source_id, session_id, run_id, workspace_id, path, chunk_index, content, token_estimate, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    `,
  );
  const insertFts = db.prepare(
    `
      INSERT INTO memory_chunks_fts (chunk_id, source_id, session_id, run_id, workspace_id, path, content)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `,
  );

  const chunks = chunkMemoryContent(trimmed);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkId = `${params.sourceId}:${index}`;
    const chunk = chunks[index];
    insertChunk.run(
      chunkId,
      params.sourceId,
      params.sessionId ?? null,
      params.runId ?? null,
      params.workspaceId ?? null,
      params.path ?? null,
      index,
      chunk,
      estimateTokenCount(chunk),
      updatedAt,
    );
    insertFts.run(
      chunkId,
      params.sourceId,
      params.sessionId ?? null,
      params.runId ?? null,
      params.workspaceId ?? null,
      params.path ?? null,
      chunk,
    );
  }
}

export async function saveMemorySourceContent(params: {
  sourceId: string;
  sourceType: MemorySourceRecord["sourceType"];
  sessionId?: string;
  runId?: string;
  workspaceId?: string;
  path?: string;
  title: string;
  content: string;
}): Promise<void> {
  await upsertMemoryFromContent(params);
}

function rowToToolHistory(row: Record<string, unknown>): ToolHistoryRecord {
  return {
    toolCallId: String(row.tool_call_id),
    sessionId: String(row.session_id),
    runId: String(row.run_id),
    toolName: String(row.tool_name),
    source: String(row.source) as ToolHistoryRecord["source"],
    serverId: typeof row.server_id === "string" ? row.server_id : undefined,
    serverName: typeof row.server_name === "string" ? row.server_name : undefined,
    status: String(row.status) as ToolHistoryRecord["status"],
    args: parseJson<Record<string, unknown>>(row.args_json, {}),
    resultText: typeof row.result_text === "string" ? row.result_text : undefined,
    isError: Number(row.is_error ?? 0) === 1,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    approvalId: typeof row.approval_id === "string" ? row.approval_id : undefined,
  };
}

export async function createSessionRecord(params: {
  title?: string;
  model: string;
  systemPrompt: string;
  agentId?: string;
  projectContextId?: string;
  sessionId?: string;
}): Promise<SessionRecord> {
  const db = await ensureV2Db();
  const now = Date.now();
  const session: SessionRecord = {
    sessionId: params.sessionId ?? randomUUID(),
    title: params.title?.trim() || "Nova sessao",
    agentId: params.agentId,
    projectContextId: params.projectContextId?.trim() || undefined,
    model: normalizeModelRef(params.model),
    systemPrompt: params.systemPrompt,
    workspaceId: randomUUID(),
    workspaceRoot: process.cwd(),
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  db.prepare(
    `
      INSERT OR REPLACE INTO sessions (
        session_id, title, agent_id, project_context_id, model, system_prompt, workspace_id, workspace_root,
        created_at, updated_at, message_count, last_run_id, last_run_status, last_run_phase
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, NULL, NULL, NULL)
    `,
  ).run(
    session.sessionId,
    session.title,
    session.agentId ?? null,
    session.projectContextId ?? null,
    session.model,
    session.systemPrompt,
    session.workspaceId ?? randomUUID(),
    session.workspaceRoot ?? process.cwd(),
    session.createdAt,
    session.updatedAt,
  );

  await ensureDir(sessionDir(session.sessionId));
  await ensureDir(browserProfileDir(session.sessionId));
  return session;
}

export async function listSessionRecords(): Promise<SessionRecord[]> {
  const db = await ensureV2Db();
  const rows = db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Array<
    Record<string, unknown>
  >;
  return rows.map(rowToSession);
}

export async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToSession(row) : null;
}

export async function patchSessionRecord(
  sessionId: string,
  patch: Partial<
    Pick<
      SessionRecord,
      | "title"
      | "agentId"
      | "projectContextId"
      | "model"
      | "systemPrompt"
      | "workspaceId"
      | "workspaceRoot"
      | "lastRunId"
      | "lastRunStatus"
      | "lastRunPhase"
    >
  >,
): Promise<SessionRecord | null> {
  const current = await getSessionRecord(sessionId);
  if (!current) {
    return null;
  }
  const next: SessionRecord = {
    ...current,
    ...patch,
    projectContextId:
      typeof patch.projectContextId === "string"
        ? patch.projectContextId.trim() || undefined
        : current.projectContextId,
    model: patch.model ? normalizeModelRef(patch.model) : current.model,
    updatedAt: Date.now(),
  };
  const db = await ensureV2Db();
  db.prepare(
    `
      UPDATE sessions
      SET title = ?2,
          agent_id = ?3,
          project_context_id = ?4,
          model = ?5,
          system_prompt = ?6,
          workspace_id = ?7,
          workspace_root = ?8,
          updated_at = ?9,
          last_run_id = ?10,
          last_run_status = ?11,
          last_run_phase = ?12
      WHERE session_id = ?1
    `,
  ).run(
    sessionId,
    next.title,
    next.agentId ?? null,
    next.projectContextId ?? null,
    next.model,
    next.systemPrompt,
    next.workspaceId ?? null,
    next.workspaceRoot ?? null,
    next.updatedAt,
    next.lastRunId ?? null,
    next.lastRunStatus ?? null,
    next.lastRunPhase ?? null,
  );
  return next;
}

export async function deleteSessionRecord(sessionId: string): Promise<void> {
  const db = await ensureV2Db();
  db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
}

export async function listMessagesForSession(sessionId: string): Promise<SessionMessageRecord[]> {
  const db = await ensureV2Db();
  const rows = db
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC, rowid ASC")
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(rowToMessage);
}

export async function saveMessageRecord(
  message: SessionMessageRecord,
  appendTranscript = true,
): Promise<void> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO messages (
        id, session_id, run_id, role, content, thinking_content, model, timestamp,
        tool_call_id, tool_name, phase, kind, metadata_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `,
  ).run(
    message.id,
    message.sessionId,
    message.runId ?? null,
    message.role,
    message.content,
    message.thinkingContent ?? null,
    message.model ?? null,
    message.timestamp,
    message.toolCallId ?? null,
    message.toolName ?? null,
    message.phase ?? null,
    message.kind ?? null,
    JSON.stringify(message.metadata ?? {}),
  );
  db.prepare(
    `
      UPDATE sessions
      SET updated_at = ?2, message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?1)
      WHERE session_id = ?1
    `,
  ).run(message.sessionId, Date.now());
  db.prepare(
    `
      INSERT INTO message_chunks_fts (message_id, session_id, content)
      VALUES (?1, ?2, ?3)
    `,
  ).run(message.id, message.sessionId, `${message.role} ${message.phase ?? ""} ${message.content}`);

  if (appendTranscript) {
    await appendJsonl(transcriptPath(message.sessionId), message);
  }

  await upsertMemoryFromContent({
    sourceId: `message:${message.id}`,
    sourceType: "session_message",
    sessionId: message.sessionId,
    runId: message.runId,
    title: `${message.role} message`,
    content: `${message.role} ${message.toolName ?? ""}\n${message.content}`.trim(),
  });
}

export async function replaceMessagesForSession(
  sessionId: string,
  messages: SessionMessageRecord[],
): Promise<void> {
  const db = await ensureV2Db();
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM message_chunks_fts WHERE session_id = ?").run(sessionId);
  await writeTextFile(transcriptPath(sessionId), "");
  for (const message of messages) {
    await saveMessageRecord(message);
  }
}

export async function createRunRecord(run: Omit<RunRecord, "createdAt" | "updatedAt">): Promise<RunRecord> {
  const db = await ensureV2Db();
  const next: RunRecord = {
    ...run,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.prepare(
    `
      INSERT OR REPLACE INTO runs (
        run_id, session_id, workflow_id, task_type, phase, status, prompt, plan_text, review_text,
        attempt, created_at, updated_at, error
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `,
  ).run(
    next.runId,
    next.sessionId,
    next.workflowId ?? null,
    next.taskType,
    next.phase,
    next.status,
    next.prompt,
    next.planText ?? null,
    next.reviewText ?? null,
    next.attempt,
    next.createdAt,
    next.updatedAt,
    next.error ?? null,
  );
  await patchSessionRecord(next.sessionId, {
    lastRunId: next.runId,
    lastRunStatus: next.status,
    lastRunPhase: next.phase,
  });
  return next;
}

export async function updateRunRecord(
  runId: string,
  patch: Partial<Pick<RunRecord, "phase" | "status" | "planText" | "reviewText" | "error" | "attempt">>,
): Promise<RunRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return null;
  }
  const next: RunRecord = {
    ...rowToRun(row),
    ...patch,
    updatedAt: Date.now(),
  };
  db.prepare(
    `
      UPDATE runs
      SET phase = ?2, status = ?3, plan_text = ?4, review_text = ?5, updated_at = ?6, error = ?7, attempt = ?8
      WHERE run_id = ?1
    `,
  ).run(
    next.runId,
    next.phase,
    next.status,
    next.planText ?? null,
    next.reviewText ?? null,
    next.updatedAt,
    next.error ?? null,
    next.attempt,
  );
  await patchSessionRecord(next.sessionId, {
    lastRunId: next.runId,
    lastRunStatus: next.status,
    lastRunPhase: next.phase,
  });
  return next;
}

export async function listRunRecords(sessionId?: string): Promise<RunRecord[]> {
  const db = await ensureV2Db();
  const rows = (
    sessionId
      ? db.prepare("SELECT * FROM runs WHERE session_id = ? ORDER BY created_at DESC").all(sessionId)
      : db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all()
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToRun);
}

export async function saveToolHistoryRecord(record: ToolHistoryRecord): Promise<void> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO tool_calls (
        tool_call_id, session_id, run_id, tool_name, source, server_id, server_name, status,
        args_json, result_text, is_error, approval_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    `,
  ).run(
    record.toolCallId,
    record.sessionId,
    record.runId,
    record.toolName,
    record.source,
    record.serverId ?? null,
    record.serverName ?? null,
    record.status,
    JSON.stringify(record.args),
    record.resultText ?? null,
    record.isError ? 1 : 0,
    record.approvalId ?? null,
    record.createdAt,
    record.updatedAt,
  );
}

export async function listToolHistoryRecords(params?: {
  sessionId?: string;
  runId?: string;
}): Promise<ToolHistoryRecord[]> {
  const db = await ensureV2Db();
  const rows = (
    params?.runId
      ? db.prepare("SELECT * FROM tool_calls WHERE run_id = ? ORDER BY created_at ASC").all(params.runId)
      : params?.sessionId
        ? db.prepare("SELECT * FROM tool_calls WHERE session_id = ? ORDER BY created_at DESC").all(params.sessionId)
        : db.prepare("SELECT * FROM tool_calls ORDER BY created_at DESC").all()
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToToolHistory);
}

export async function createApprovalRecord(
  approval: Omit<ToolApprovalRequest, "createdAt" | "status">,
): Promise<ToolApprovalRequest> {
  const db = await ensureV2Db();
  const created: ToolApprovalRequest = {
    ...approval,
    createdAt: Date.now(),
    status: "pending",
  };
  db.prepare(
    `
      INSERT OR REPLACE INTO approvals (
        approval_id, session_id, run_id, tool_call_id, tool_name, risk_level, status, reason, source,
        request_json, resolution_json, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?12)
    `,
  ).run(
    created.approvalId,
    created.sessionId,
    created.runId,
    created.toolCallId,
    created.toolName,
    created.riskLevel,
    created.status,
    created.reason,
    created.source,
    JSON.stringify(created.request),
    created.createdAt,
    created.createdAt,
  );
  return created;
}

export async function resolveApprovalRecord(
  approvalId: string,
  resolution: { approved: boolean; note?: string },
): Promise<ToolApprovalRequest | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM approvals WHERE approval_id = ?").get(approvalId) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return null;
  }
  const nextResolution = {
    approved: resolution.approved,
    decidedAt: Date.now(),
    note: resolution.note,
  };
  const status = resolution.approved ? "approved" : "rejected";
  db.prepare(
    `
      UPDATE approvals
      SET status = ?2, resolution_json = ?3, updated_at = ?4
      WHERE approval_id = ?1
    `,
  ).run(approvalId, status, JSON.stringify(nextResolution), Date.now());
  return {
    ...rowToApproval(row),
    status,
    resolution: nextResolution,
  };
}

export async function listApprovalRecords(sessionId?: string): Promise<ToolApprovalRequest[]> {
  const db = await ensureV2Db();
  const rows = (
    sessionId
      ? db.prepare("SELECT * FROM approvals WHERE session_id = ? ORDER BY created_at DESC").all(sessionId)
      : db.prepare("SELECT * FROM approvals ORDER BY created_at DESC").all()
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToApproval);
}

function resolveArtifactBaseDir(sessionId: string, runId?: string): string {
  return runId ? artifactsDir(sessionId, runId) : sessionArtifactsDir(sessionId);
}

async function persistArtifactRecord(params: {
  sessionId: string;
  runId?: string;
  artifact: ArtifactDraft;
}): Promise<ArtifactRecord> {
  const db = await ensureV2Db();
  const createdAt = Date.now();
  const requestedFilePath =
    params.artifact.filePath && params.artifact.filePath.trim()
      ? params.artifact.filePath
      : params.artifact.contentText
        ? `${params.artifact.type}-${params.artifact.artifactId}.txt`
        : undefined;
  const filePath =
    requestedFilePath && !path.isAbsolute(requestedFilePath)
      ? path.join(resolveArtifactBaseDir(params.sessionId, params.runId), requestedFilePath).replace(/\\/g, "/")
      : requestedFilePath;
  const absoluteFilePath =
    filePath && !path.isAbsolute(filePath)
      ? path.join(resolveArtifactBaseDir(params.sessionId, params.runId), filePath).replace(/\\/g, "/")
      : filePath;

  const record: ArtifactRecord = {
    ...params.artifact,
    sessionId: params.sessionId,
    runId: params.runId,
    filePath: absoluteFilePath,
    createdAt,
  };

  db.prepare(
    `
      INSERT OR REPLACE INTO artifacts (
        artifact_id, session_id, run_id, type, label, file_path, content_text, metadata_json, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `,
  ).run(
    record.artifactId,
    record.sessionId,
    record.runId ?? null,
    record.type,
    record.label,
    record.filePath ?? null,
    record.contentText ?? null,
    JSON.stringify(record.metadata ?? {}),
    record.createdAt,
  );

  if (record.filePath && record.contentText) {
    await ensureDir(resolveArtifactBaseDir(record.sessionId, record.runId));
    await writeTextFile(record.filePath, record.contentText);
  }
  await appendJsonl(transcriptPath(record.sessionId), record);
  return record;
}

export async function saveRunArtifactRecord(params: {
  sessionId: string;
  runId: string;
  artifact: ArtifactDraft;
}): Promise<ArtifactRecord> {
  return await persistArtifactRecord(params);
}

export async function saveSessionArtifactRecord(params: {
  sessionId: string;
  artifact: ArtifactDraft;
}): Promise<ArtifactRecord> {
  return await persistArtifactRecord(params);
}

export async function listArtifactRecords(params?: {
  sessionId?: string;
  runId?: string;
}): Promise<ArtifactRecord[]> {
  const db = await ensureV2Db();
  const rows = (
    params?.runId
      ? db.prepare("SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at DESC").all(params.runId)
      : params?.sessionId
        ? db.prepare("SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC").all(params.sessionId)
        : db.prepare("SELECT * FROM artifacts ORDER BY created_at DESC").all()
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToArtifact);
}

export async function getArtifactRecord(artifactId: string): Promise<ArtifactRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM artifacts WHERE artifact_id = ?").get(artifactId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToArtifact(row) : null;
}

export async function saveCheckpointRecord(
  checkpoint: Omit<ContextCheckpoint, "checkpointId" | "createdAt">,
): Promise<ContextCheckpoint> {
  const record: ContextCheckpoint = {
    ...checkpoint,
    checkpointId: randomUUID(),
    createdAt: Date.now(),
  };
  if (record.runId) {
    await saveRunArtifactRecord({
      sessionId: record.sessionId,
      runId: record.runId,
      artifact: {
        artifactId: record.checkpointId,
        type: "checkpoint",
        label: "Context checkpoint",
        contentText: JSON.stringify(record, null, 2),
        metadata: record,
      },
    });
  } else {
    await saveSessionArtifactRecord({
      sessionId: record.sessionId,
      artifact: {
        artifactId: record.checkpointId,
        type: "checkpoint",
        label: "Context checkpoint",
        contentText: JSON.stringify(record, null, 2),
        metadata: record,
      },
    });
  }
  await appendJsonl(transcriptPath(record.sessionId), record);
  return record;
}

export async function upsertWorkspaceRecord(
  workspace: WorkspaceRecord,
): Promise<WorkspaceRecord> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO workspaces (
        workspace_id, session_id, root_path, status, last_job_id, indexed_at, file_count, chunk_count, last_error
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `,
  ).run(
    workspace.workspaceId,
    workspace.sessionId,
    workspace.rootPath,
    workspace.status,
    workspace.lastJobId ?? null,
    workspace.indexedAt ?? null,
    workspace.fileCount,
    workspace.chunkCount,
    workspace.lastError ?? null,
  );
  await patchSessionRecord(workspace.sessionId, {
    workspaceId: workspace.workspaceId,
    workspaceRoot: workspace.rootPath,
  });
  return workspace;
}

export async function getWorkspaceRecordBySession(sessionId: string): Promise<WorkspaceRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM workspaces WHERE session_id = ? ORDER BY indexed_at DESC LIMIT 1").get(
    sessionId,
  ) as Record<string, unknown> | undefined;
  return row ? rowToWorkspace(row) : null;
}

export async function replaceWorkspaceFileChunks(
  workspaceId: string,
  filePath: string,
  chunks: Array<{ chunkId: string; chunkIndex: number; content: string; mtimeMs: number; sizeBytes: number }>,
): Promise<void> {
  const db = await ensureV2Db();
  db.prepare("DELETE FROM workspace_chunks WHERE workspace_id = ? AND path = ?").run(workspaceId, filePath);
  db.prepare("DELETE FROM workspace_chunks_fts WHERE workspace_id = ? AND path = ?").run(workspaceId, filePath);

  const insertChunk = db.prepare(
    `
      INSERT INTO workspace_chunks (
        chunk_id, workspace_id, path, chunk_index, content, mtime_ms, size_bytes, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `,
  );
  const insertFts = db.prepare(
    `
      INSERT INTO workspace_chunks_fts (chunk_id, workspace_id, path, content)
      VALUES (?1, ?2, ?3, ?4)
    `,
  );
  const now = Date.now();
  for (const chunk of chunks) {
    insertChunk.run(
      chunk.chunkId,
      workspaceId,
      filePath,
      chunk.chunkIndex,
      chunk.content,
      chunk.mtimeMs,
      chunk.sizeBytes,
      now,
    );
    insertFts.run(chunk.chunkId, workspaceId, filePath, chunk.content);
  }

  await upsertMemoryFromContent({
    sourceId: `workspace:${workspaceId}:${filePath}`,
    sourceType: "workspace_file",
    workspaceId,
    path: filePath,
    title: filePath,
    content: chunks.map((chunk) => chunk.content).join("\n"),
  });

  const stats = db.prepare(
    `
      SELECT COUNT(DISTINCT path) AS file_count, COUNT(*) AS chunk_count
      FROM workspace_chunks
      WHERE workspace_id = ?
    `,
  ).get(workspaceId) as Record<string, unknown> | undefined;

  db.prepare(
    `
      UPDATE workspaces
      SET status = 'ready', indexed_at = ?2, file_count = ?3, chunk_count = ?4, last_error = NULL
      WHERE workspace_id = ?1
    `,
  ).run(
    workspaceId,
    Date.now(),
    Number(stats?.file_count ?? 0),
    Number(stats?.chunk_count ?? 0),
  );
}

export async function searchWorkspaceChunkRecords(
  workspaceId: string,
  query: string,
  limit = 8,
): Promise<Array<{ chunkId: string; path: string; content: string }>> {
  const db = await ensureV2Db();
  const rows = db.prepare(
    `
      SELECT chunk_id, path, content
      FROM workspace_chunks_fts
      WHERE workspace_id = ?1 AND workspace_chunks_fts MATCH ?2
      LIMIT ?3
    `,
  ).all(workspaceId, query, limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    chunkId: String(row.chunk_id),
    path: String(row.path),
    content: String(row.content),
  }));
}

export async function searchSessionMessageRecords(
  sessionId: string,
  query: string,
  limit = 8,
): Promise<SessionMessageRecord[]> {
  const db = await ensureV2Db();
  const rows = db.prepare(
    `
      SELECT m.*
      FROM message_chunks_fts f
      JOIN messages m ON m.id = f.message_id
      WHERE f.session_id = ?1 AND message_chunks_fts MATCH ?2
      ORDER BY m.timestamp DESC
      LIMIT ?3
    `,
  ).all(sessionId, query, limit) as Array<Record<string, unknown>>;
  return rows.map(rowToMessage);
}

export async function createJobRecord(
  job: Omit<JobRecord, "createdAt" | "updatedAt" | "startedAt" | "completedAt">,
): Promise<JobRecord> {
  const db = await ensureV2Db();
  const now = Date.now();
  const record: JobRecord = {
    ...job,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `
      INSERT OR REPLACE INTO jobs (
        job_id, kind, scope_type, scope_id, status, payload_json, result_summary, error, created_at, updated_at, started_at, completed_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL)
    `,
  ).run(
    record.jobId,
    record.kind,
    record.scopeType,
    record.scopeId,
    record.status,
    JSON.stringify(record.payload ?? {}),
    record.resultSummary ?? null,
    record.error ?? null,
    record.createdAt,
    record.updatedAt,
  );
  return record;
}

export async function updateJobRecord(
  jobId: string,
  patch: Partial<Pick<JobRecord, "status" | "payload" | "resultSummary" | "error" | "startedAt" | "completedAt">>,
): Promise<JobRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }
  const next: JobRecord = {
    ...rowToJob(row),
    ...patch,
    updatedAt: Date.now(),
  };
  db.prepare(
    `
      UPDATE jobs
      SET status = ?2,
          payload_json = ?3,
          result_summary = ?4,
          error = ?5,
          updated_at = ?6,
          started_at = ?7,
          completed_at = ?8
      WHERE job_id = ?1
    `,
  ).run(
    jobId,
    next.status,
    JSON.stringify(next.payload ?? {}),
    next.resultSummary ?? null,
    next.error ?? null,
    next.updatedAt,
    next.startedAt ?? null,
    next.completedAt ?? null,
  );
  return next;
}

export async function getJobRecord(jobId: string): Promise<JobRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export async function listJobRecords(scopeType?: JobRecord["scopeType"], scopeId?: string): Promise<JobRecord[]> {
  const db = await ensureV2Db();
  const rows = (
    scopeType && scopeId
      ? db.prepare("SELECT * FROM jobs WHERE scope_type = ? AND scope_id = ? ORDER BY created_at DESC").all(scopeType, scopeId)
      : db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all()
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToJob);
}

export async function searchMemoryRecords(params: {
  query: string;
  sessionId?: string;
  workspaceId?: string;
  limit?: number;
}): Promise<MemorySearchResult[]> {
  const db = await ensureV2Db();
  const rows = db.prepare(
    `
      SELECT
        c.chunk_id,
        c.source_id,
        s.source_type,
        s.title,
        c.content,
        c.path
      FROM memory_chunks_fts f
      JOIN memory_chunks c ON c.chunk_id = f.chunk_id
      JOIN memory_sources s ON s.source_id = c.source_id
      WHERE memory_chunks_fts MATCH ?1
        AND (?2 IS NULL OR c.session_id = ?2)
        AND (?3 IS NULL OR c.workspace_id = ?3)
      LIMIT ?4
    `,
  ).all(params.query, params.sessionId ?? null, params.workspaceId ?? null, params.limit ?? 8) as Array<Record<string, unknown>>;

  return rows.map((row, index) => ({
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    sourceType: String(row.source_type) as MemorySearchResult["sourceType"],
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    path: typeof row.path === "string" ? row.path : undefined,
    score: Math.max(0, 1 - index * 0.1),
  }));
}

export async function listMemorySourceRecords(sessionId?: string): Promise<MemorySourceRecord[]> {
  const db = await ensureV2Db();
  const rows = (
    sessionId
      ? db.prepare("SELECT * FROM memory_sources WHERE session_id = ? ORDER BY updated_at DESC").all(sessionId)
      : db.prepare("SELECT * FROM memory_sources ORDER BY updated_at DESC").all()
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToMemorySource);
}

export async function listMemoryChunkRecords(sourceId: string): Promise<MemoryChunkRecord[]> {
  const db = await ensureV2Db();
  const rows = db.prepare("SELECT * FROM memory_chunks WHERE source_id = ? ORDER BY chunk_index ASC").all(sourceId) as Array<Record<string, unknown>>;
  return rows.map(rowToMemoryChunk);
}

export async function upsertBrowserSessionRecord(
  browserSession: BrowserSessionRecord,
): Promise<BrowserSessionRecord> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO browser_sessions (
        browser_session_id, session_id, profile_path, current_url, status, last_activity_at, last_error
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `,
  ).run(
    browserSession.browserSessionId,
    browserSession.sessionId,
    browserSession.profilePath,
    browserSession.currentUrl ?? null,
    browserSession.status,
    browserSession.lastActivityAt,
    browserSession.lastError ?? null,
  );
  return browserSession;
}

export async function getBrowserSessionRecord(sessionId: string): Promise<BrowserSessionRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM browser_sessions WHERE session_id = ? LIMIT 1").get(sessionId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToBrowserSession(row) : null;
}

export async function deleteBrowserSessionRecord(sessionId: string): Promise<void> {
  const db = await ensureV2Db();
  db.prepare("DELETE FROM browser_sessions WHERE session_id = ?").run(sessionId);
}
