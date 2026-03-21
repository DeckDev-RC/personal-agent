import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { DraftRecord, DraftStatus, DraftType } from "../../src/types/communication.js";
import { ensureV2Db } from "./v2Db.js";
import * as mcp from "./mcpManager.js";

const VALID_STATUSES = new Set<DraftStatus>(["draft", "sent", "failed"]);
const VALID_TYPES = new Set<DraftType>(["email", "slack", "teams", "generic"]);

function rowToDraft(row: Record<string, unknown>): DraftRecord {
  return {
    id: String(row.id),
    type: VALID_TYPES.has(String(row.type) as DraftType) ? (String(row.type) as DraftType) : "generic",
    to: String(row.to_addr ?? ""),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    status: VALID_STATUSES.has(String(row.status) as DraftStatus) ? (String(row.status) as DraftStatus) : "draft",
    mcpServerId: typeof row.mcp_server_id === "string" ? row.mcp_server_id : undefined,
    projectContextId: typeof row.project_context_id === "string" ? row.project_context_id : undefined,
    sessionId: typeof row.session_id === "string" ? row.session_id : undefined,
    attachments: typeof row.attachments_json === "string" ? JSON.parse(row.attachments_json) : undefined,
    sentAt: typeof row.sent_at === "number" ? row.sent_at : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

export async function listDrafts(opts?: {
  status?: DraftStatus;
  type?: DraftType;
  projectContextId?: string;
}): Promise<DraftRecord[]> {
  const db = await ensureV2Db();
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.type) {
    clauses.push("type = ?");
    params.push(opts.type);
  }
  if (opts?.projectContextId) {
    clauses.push("project_context_id = ?");
    params.push(opts.projectContextId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM drafts ${where} ORDER BY updated_at DESC`).all(...params) as Record<string, unknown>[];
  return rows.map(rowToDraft);
}

export async function getDraft(id: string): Promise<DraftRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToDraft(row) : null;
}

export async function createDraft(partial: Partial<DraftRecord>): Promise<DraftRecord> {
  const db = await ensureV2Db();
  const now = Date.now();
  const draft: DraftRecord = {
    id: partial.id ?? randomUUID(),
    type: VALID_TYPES.has(partial.type as DraftType) ? (partial.type as DraftType) : "generic",
    to: partial.to?.trim() ?? "",
    subject: partial.subject?.trim() ?? "",
    body: partial.body ?? "",
    status: "draft",
    mcpServerId: partial.mcpServerId,
    projectContextId: partial.projectContextId,
    sessionId: partial.sessionId,
    attachments: partial.attachments,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO drafts (id, type, to_addr, subject, body, status, mcp_server_id, project_context_id, session_id, attachments_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    draft.id, draft.type, draft.to, draft.subject, draft.body, draft.status,
    draft.mcpServerId ?? null, draft.projectContextId ?? null, draft.sessionId ?? null,
    draft.attachments ? JSON.stringify(draft.attachments) : null,
    draft.createdAt, draft.updatedAt,
  );
  return draft;
}

export async function updateDraft(id: string, patch: Partial<DraftRecord>): Promise<DraftRecord | null> {
  const existing = await getDraft(id);
  if (!existing) return null;
  const now = Date.now();
  const updated: DraftRecord = {
    ...existing,
    to: patch.to?.trim() ?? existing.to,
    subject: patch.subject?.trim() ?? existing.subject,
    body: patch.body ?? existing.body,
    type: VALID_TYPES.has(patch.type as DraftType) ? (patch.type as DraftType) : existing.type,
    mcpServerId: patch.mcpServerId ?? existing.mcpServerId,
    projectContextId: patch.projectContextId ?? existing.projectContextId,
    attachments: patch.attachments ?? existing.attachments,
    updatedAt: now,
  };
  const db = await ensureV2Db();
  db.prepare(`
    UPDATE drafts SET type = ?, to_addr = ?, subject = ?, body = ?, mcp_server_id = ?, project_context_id = ?, attachments_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updated.type, updated.to, updated.subject, updated.body,
    updated.mcpServerId ?? null, updated.projectContextId ?? null,
    updated.attachments ? JSON.stringify(updated.attachments) : null,
    updated.updatedAt, id,
  );
  return updated;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
  return (result as any).changes > 0;
}

export async function sendDraft(id: string): Promise<DraftRecord | null> {
  const draft = await getDraft(id);
  if (!draft) return null;

  const db = await ensureV2Db();
  const now = Date.now();
  let status: DraftStatus = "sent";

  if (draft.mcpServerId) {
    try {
      const toolName = draft.type === "email" ? "send_email" : draft.type === "slack" ? "send_message" : "send_message";
      await mcp.callTool(draft.mcpServerId, toolName, {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      });
    } catch {
      status = "failed";
    }
  }

  db.prepare("UPDATE drafts SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?").run(status, now, now, id);
  return { ...draft, status, sentAt: now, updatedAt: now };
}
