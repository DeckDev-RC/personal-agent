import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  getDefaultModelRef,
} from "../../src/types/model.js";
import type {
  SpawnSubagentInput,
  SubagentRecord,
  SubagentRequestedBy,
  SubagentStatus,
} from "../../src/types/subagent.js";
import type { AgentConfig } from "../../src/types/agent.js";
import type { RunPhase, RunStatus } from "../../src/types/runtime.js";
import type { RuntimeEvent } from "./runtimeExecutor.js";
import { normalizeModelRef } from "./providers/index.js";
import { getAgentV2, getSettingsV2 } from "./v2EntityStore.js";
import { getSessionRecord } from "./v2SessionStore.js";
import { ensureV2Db } from "./v2Db.js";

const SUBAGENT_STATUSES = new Set<SubagentStatus>([
  "queued",
  "running",
  "completed",
  "failed",
  "aborted",
]);
const REQUESTED_BY_VALUES = new Set<SubagentRequestedBy>(["user", "agent"]);
const RUN_PHASES = new Set<RunPhase>(["plan", "execute", "review", "repair", "complete"]);

const DEFAULT_SUBAGENT_PROMPT =
  "You are a delegated subagent. Complete the assigned subtask independently, summarize the result, and call out blockers or follow-up actions.";

export type SubagentExecutorParams = {
  subagentId: string;
  title: string;
  prompt: string;
  parentSessionId?: string;
  parentRunId?: string;
  agentId?: string;
  projectContextId?: string;
  modelRef: string;
  systemPrompt: string;
  mcpServerIds: string[];
  onEvent: (event: RuntimeEvent) => void;
};

export type SubagentExecutor = (params: SubagentExecutorParams) => Promise<{
  runId: string;
  sessionId: string;
}>;

type ResolvedSubagentLaunch = {
  title: string;
  prompt: string;
  requestedBy: SubagentRequestedBy;
  parentSessionId?: string;
  parentRunId?: string;
  agentId?: string;
  projectContextId?: string;
  modelRef: string;
  systemPrompt: string;
  mcpServerIds: string[];
};

let subagentExecutor: SubagentExecutor | null = null;

function slicePromptTitle(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 72) || "Subagent run";
}

function normalizeRequestedBy(value: unknown): SubagentRequestedBy {
  return REQUESTED_BY_VALUES.has(String(value) as SubagentRequestedBy)
    ? (String(value) as SubagentRequestedBy)
    : "user";
}

function coercePhase(value: unknown): RunPhase | undefined {
  return RUN_PHASES.has(String(value) as RunPhase) ? (String(value) as RunPhase) : undefined;
}

function coerceSubagentStatus(value: unknown, fallback: SubagentStatus = "queued"): SubagentStatus {
  return SUBAGENT_STATUSES.has(String(value) as SubagentStatus)
    ? (String(value) as SubagentStatus)
    : fallback;
}

function mapRunStatusToSubagentStatus(value: unknown): SubagentStatus | undefined {
  const runStatus = String(value ?? "") as RunStatus;
  if (runStatus === "queued" || runStatus === "running" || runStatus === "retrying" || runStatus === "awaiting_approval") {
    return "running";
  }
  if (runStatus === "completed") {
    return "completed";
  }
  if (runStatus === "failed") {
    return "failed";
  }
  if (runStatus === "aborted") {
    return "aborted";
  }
  return undefined;
}

function rowToSubagent(row: Record<string, unknown>): SubagentRecord {
  const persistedStatus = coerceSubagentStatus(row.status, "queued");
  const runStatus = mapRunStatusToSubagentStatus(row.run_status);
  const status = persistedStatus === "queued" || persistedStatus === "running"
    ? runStatus ?? persistedStatus
    : persistedStatus;

  return {
    id: String(row.id),
    title: String(row.title ?? "Subagent run"),
    prompt: String(row.prompt ?? ""),
    status,
    requestedBy: normalizeRequestedBy(row.requested_by),
    parentSessionId: typeof row.parent_session_id === "string" ? row.parent_session_id : undefined,
    parentRunId: typeof row.parent_run_id === "string" ? row.parent_run_id : undefined,
    sessionId: typeof row.session_id === "string" ? row.session_id : undefined,
    runId: typeof row.run_id === "string" ? row.run_id : undefined,
    agentId: typeof row.agent_id === "string" ? row.agent_id : undefined,
    projectContextId: typeof row.project_context_id === "string" ? row.project_context_id : undefined,
    modelRef: normalizeModelRef(String(row.model_ref ?? getDefaultModelRef("openai-codex"))),
    phase: coercePhase(row.run_phase ?? row.phase),
    resultText: typeof row.result_text === "string" ? row.result_text : undefined,
    reviewText: typeof row.review_text === "string" ? row.review_text : undefined,
    error: typeof row.run_error === "string"
      ? row.run_error
      : typeof row.error === "string"
        ? row.error
        : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    startedAt: typeof row.started_at === "number" ? row.started_at : undefined,
    completedAt: typeof row.completed_at === "number" ? row.completed_at : undefined,
  };
}

async function updateSubagentRecord(
  id: string,
  patch: Partial<SubagentRecord>,
): Promise<SubagentRecord | null> {
  const existing = await getSubagent(id);
  if (!existing) {
    return null;
  }

  const next: SubagentRecord = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    modelRef: normalizeModelRef(patch.modelRef ?? existing.modelRef),
  };
  const db = await ensureV2Db();
  db.prepare(
    `
      UPDATE subagents
      SET title = ?2,
          prompt = ?3,
          status = ?4,
          requested_by = ?5,
          parent_session_id = ?6,
          parent_run_id = ?7,
          session_id = ?8,
          run_id = ?9,
          agent_id = ?10,
          project_context_id = ?11,
          model_ref = ?12,
          phase = ?13,
          result_text = ?14,
          review_text = ?15,
          error = ?16,
          updated_at = ?17,
          started_at = ?18,
          completed_at = ?19
      WHERE id = ?1
    `,
  ).run(
    next.id,
    next.title,
    next.prompt,
    next.status,
    next.requestedBy,
    next.parentSessionId ?? null,
    next.parentRunId ?? null,
    next.sessionId ?? null,
    next.runId ?? null,
    next.agentId ?? null,
    next.projectContextId ?? null,
    next.modelRef,
    next.phase ?? null,
    next.resultText ?? null,
    next.reviewText ?? null,
    next.error ?? null,
    next.updatedAt,
    next.startedAt ?? null,
    next.completedAt ?? null,
  );
  return next;
}

async function resolveAgentDefaults(agentId?: string): Promise<AgentConfig | null> {
  if (!agentId || agentId === "__default__") {
    return null;
  }
  return await getAgentV2(agentId);
}

async function resolveLaunchConfig(input: SpawnSubagentInput): Promise<ResolvedSubagentLaunch> {
  const settings = await getSettingsV2();
  const parentSession = input.parentSessionId ? await getSessionRecord(input.parentSessionId) : null;
  const requestedAgentId = input.agentId?.trim() || undefined;
  const parentAgent = await resolveAgentDefaults(parentSession?.agentId);
  const selectedAgent = await resolveAgentDefaults(requestedAgentId ?? parentSession?.agentId);
  const resolvedAgent = selectedAgent ?? parentAgent;

  const modelRef = normalizeModelRef(
    input.modelRef
      ?? resolvedAgent?.model
      ?? parentSession?.model
      ?? settings.defaultModelRef
      ?? getDefaultModelRef(settings.provider),
  );

  const baseSystemPrompt =
    input.systemPrompt?.trim()
    || resolvedAgent?.systemPrompt
    || parentSession?.systemPrompt
    || settings.globalSystemPrompt.trim()
    || "You are a helpful AI assistant.";

  return {
    title: input.title?.trim() || slicePromptTitle(input.prompt),
    prompt: input.prompt.trim(),
    requestedBy: input.requestedBy ?? "user",
    parentSessionId: input.parentSessionId?.trim() || undefined,
    parentRunId: input.parentRunId?.trim() || undefined,
    agentId: requestedAgentId && requestedAgentId !== "__default__"
      ? requestedAgentId
      : parentSession?.agentId,
    projectContextId:
      input.projectContextId?.trim()
      || resolvedAgent?.projectContextId
      || parentSession?.projectContextId
      || undefined,
    modelRef,
    systemPrompt: `${baseSystemPrompt}\n\n${DEFAULT_SUBAGENT_PROMPT}`,
    mcpServerIds: Array.isArray(input.mcpServerIds)
      ? input.mcpServerIds.map((item) => String(item).trim()).filter(Boolean)
      : resolvedAgent?.mcpServerIds ?? [],
  };
}

async function createSubagentRecord(config: ResolvedSubagentLaunch): Promise<SubagentRecord> {
  const db = await ensureV2Db();
  const now = Date.now();
  const subagent: SubagentRecord = {
    id: randomUUID(),
    title: config.title,
    prompt: config.prompt,
    status: "queued",
    requestedBy: config.requestedBy,
    parentSessionId: config.parentSessionId,
    parentRunId: config.parentRunId,
    agentId: config.agentId,
    projectContextId: config.projectContextId,
    modelRef: config.modelRef,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
      INSERT INTO subagents (
        id, title, prompt, status, requested_by, parent_session_id, parent_run_id, session_id, run_id, agent_id,
        project_context_id, model_ref, phase, result_text, review_text, error, created_at, updated_at, started_at, completed_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?9, ?10, NULL, NULL, NULL, NULL, ?11, ?12, NULL, NULL)
    `,
  ).run(
    subagent.id,
    subagent.title,
    subagent.prompt,
    subagent.status,
    subagent.requestedBy,
    subagent.parentSessionId ?? null,
    subagent.parentRunId ?? null,
    subagent.agentId ?? null,
    subagent.projectContextId ?? null,
    subagent.modelRef,
    subagent.createdAt,
    subagent.updatedAt,
  );

  return subagent;
}

export function bindSubagentExecutor(executor: SubagentExecutor): void {
  subagentExecutor = executor;
}

export function hasSubagentExecutor(): boolean {
  return subagentExecutor !== null;
}

export async function getSubagent(id: string): Promise<SubagentRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare(
    `
      SELECT s.*, r.status AS run_status, r.phase AS run_phase, r.error AS run_error
      FROM subagents s
      LEFT JOIN runs r ON r.run_id = s.run_id
      WHERE s.id = ?
    `,
  ).get(id) as Record<string, unknown> | undefined;
  return row ? rowToSubagent(row) : null;
}

export async function listSubagents(options?: {
  status?: SubagentStatus;
  parentSessionId?: string;
  requestedBy?: SubagentRequestedBy;
  limit?: number;
}): Promise<SubagentRecord[]> {
  const db = await ensureV2Db();
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];

  if (options?.status) {
    clauses.push("s.status = ?");
    params.push(options.status);
  }
  if (options?.parentSessionId) {
    clauses.push("s.parent_session_id = ?");
    params.push(options.parentSessionId);
  }
  if (options?.requestedBy) {
    clauses.push("s.requested_by = ?");
    params.push(options.requestedBy);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(250, options?.limit ?? 50));
  const rows = db.prepare(
    `
      SELECT s.*, r.status AS run_status, r.phase AS run_phase, r.error AS run_error
      FROM subagents s
      LEFT JOIN runs r ON r.run_id = s.run_id
      ${where}
      ORDER BY s.created_at DESC
      LIMIT ?
    `,
  ).all(...params, limit) as Array<Record<string, unknown>>;

  return rows.map(rowToSubagent);
}

export async function recordSubagentRuntimeEvent(subagentId: string, event: RuntimeEvent): Promise<void> {
  const current = await getSubagent(subagentId);
  if (!current) {
    return;
  }

  if (event.type === "phase") {
    await updateSubagentRecord(subagentId, {
      status: current.status === "queued" ? "running" : current.status,
      phase: event.phase,
      startedAt: current.startedAt ?? Date.now(),
    });
    return;
  }

  if (event.type === "done") {
    await updateSubagentRecord(subagentId, {
      status: event.success ? "completed" : "failed",
      phase: "complete",
      resultText: event.text,
      reviewText: event.review,
      error: event.success ? undefined : current.error,
      startedAt: current.startedAt ?? Date.now(),
      completedAt: Date.now(),
    });
    return;
  }

  if (event.type === "error") {
    await updateSubagentRecord(subagentId, {
      status: "failed",
      phase: "complete",
      error: event.message,
      startedAt: current.startedAt ?? Date.now(),
      completedAt: Date.now(),
    });
    return;
  }

  if (event.type === "toolcall" || event.type === "toolresult" || event.type === "approval_required" || event.type === "approval_resolved" || event.type === "artifact" || event.type === "text_delta" || event.type === "thinking_delta") {
    await updateSubagentRecord(subagentId, {
      status: current.status === "queued" ? "running" : current.status,
      startedAt: current.startedAt ?? Date.now(),
    });
  }
}

export async function spawnSubagent(input: SpawnSubagentInput): Promise<SubagentRecord> {
  if (!input.prompt?.trim()) {
    throw new Error("Subagent prompt is required.");
  }
  if (!subagentExecutor) {
    throw new Error("Subagent executor is not configured.");
  }

  const launch = await resolveLaunchConfig(input);
  const subagent = await createSubagentRecord(launch);

  try {
    const started = await subagentExecutor({
      subagentId: subagent.id,
      title: launch.title,
      prompt: launch.prompt,
      parentSessionId: launch.parentSessionId,
      parentRunId: launch.parentRunId,
      agentId: launch.agentId,
      projectContextId: launch.projectContextId,
      modelRef: launch.modelRef,
      systemPrompt: launch.systemPrompt,
      mcpServerIds: launch.mcpServerIds,
      onEvent: (event) => {
        void recordSubagentRuntimeEvent(subagent.id, event);
      },
    });

    await updateSubagentRecord(subagent.id, {
      runId: started.runId,
      sessionId: started.sessionId,
      status: "running",
      startedAt: Date.now(),
    });
  } catch (error) {
    await updateSubagentRecord(subagent.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      completedAt: Date.now(),
    });
    throw error;
  }

  return (await getSubagent(subagent.id)) ?? subagent;
}

export async function markSubagentAborted(id: string): Promise<SubagentRecord | null> {
  return await updateSubagentRecord(id, {
    status: "aborted",
    phase: "complete",
    completedAt: Date.now(),
  });
}
