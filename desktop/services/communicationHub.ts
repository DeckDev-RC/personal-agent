import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  getDraftChannel,
  listDraftChannels,
  type DraftRecord,
  type DraftStatus,
  type DraftType,
} from "../../src/types/communication.js";
import type { McpTool } from "../../src/types/mcp.js";
import { ensureV2Db } from "./v2Db.js";
import { listMcpServersV2 } from "./v2EntityStore.js";
import * as mcp from "./mcpManager.js";

const VALID_STATUSES = new Set<DraftStatus>(["draft", "sent", "failed"]);
const VALID_TYPES = new Set<DraftType>(listDraftChannels().map((channel) => channel.type));
const TOOL_NAME_CANDIDATES: Record<DraftType, string[]> = {
  email: ["send_email", "draft_reply", "send_message", "post_message"],
  slack: ["post_message", "send_message", "send_dm", "send_direct_message", "create_message"],
  teams: ["send_message", "post_message", "send_teams_message", "create_message"],
  discord: ["send_message", "post_message", "create_message", "send_dm"],
  telegram: ["send_message", "send_telegram_message", "post_message", "create_message"],
  whatsapp: ["send_whatsapp_message", "send_message", "post_message"],
  signal: ["send_message", "post_message", "create_message"],
  sms: ["send_sms", "send_text_message", "send_message"],
  generic: ["send_message", "post_message", "create_message", "send_email"],
};

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function getToolSchemaProperties(tool: McpTool): Set<string> {
  const schema =
    tool.inputSchema && typeof tool.inputSchema === "object"
      ? (tool.inputSchema as Record<string, unknown>)
      : {};
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  return new Set(Object.keys(properties).map((key) => key.toLowerCase()));
}

function setFirstMatchingArg(
  target: Record<string, unknown>,
  schemaProperties: Set<string>,
  candidateKeys: string[],
  value: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  for (const candidate of candidateKeys) {
    if (schemaProperties.has(candidate.toLowerCase())) {
      target[candidate] = trimmed;
      return;
    }
  }
}

function findPreferredTool(tools: McpTool[], type: DraftType): McpTool | undefined {
  const candidates = TOOL_NAME_CANDIDATES[type].map(normalizeToolName);
  return tools.find((tool) => candidates.includes(normalizeToolName(tool.name)));
}

function buildDraftToolArgs(tool: McpTool, draft: DraftRecord): Record<string, unknown> {
  const schemaProperties = getToolSchemaProperties(tool);
  const args: Record<string, unknown> = {};

  setFirstMatchingArg(
    args,
    schemaProperties,
    [
      "to",
      "recipient",
      "recipients",
      "email",
      "address",
      "phone",
      "phone_number",
      "number",
      "channel",
      "channel_id",
      "conversation",
      "chat_id",
      "user",
      "username",
      "target",
      "target_id",
    ],
    draft.to,
  );
  setFirstMatchingArg(args, schemaProperties, ["subject", "title", "summary"], draft.subject);
  setFirstMatchingArg(args, schemaProperties, ["body", "message", "text", "content", "markdown", "html"], draft.body);

  if (Object.keys(args).length > 0) {
    return args;
  }

  const normalizedToolName = normalizeToolName(tool.name);
  if (draft.type === "email" || normalizedToolName.includes("email")) {
    return {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    };
  }

  if (draft.type === "sms" || normalizedToolName.includes("sms")) {
    return {
      to: draft.to,
      message: draft.body,
    };
  }

  return {
    to: draft.to,
    message: draft.body,
  };
}

async function resolveDraftDelivery(draft: DraftRecord): Promise<
  | { serverId: string; tool: McpTool; args: Record<string, unknown> }
  | { error: string }
> {
  const channel = getDraftChannel(draft.type);
  const preferredCatalogIds = new Set(channel.preferredCatalogIds);
  const configuredServers = (await listMcpServersV2()).filter((server) => server.enabled);
  const candidateServers = draft.mcpServerId
    ? configuredServers.filter((server) => server.id === draft.mcpServerId)
    : configuredServers;

  if (candidateServers.length === 0) {
    return {
      error: draft.mcpServerId
        ? `Configured MCP server "${draft.mcpServerId}" is not enabled.`
        : `No enabled MCP server is configured for ${channel.label}.`,
    };
  }

  const ranked = candidateServers
    .map((server) => {
      const tool = findPreferredTool(mcp.getToolsForServer(server.id), draft.type);
      return {
        server,
        tool,
        score:
          (draft.mcpServerId === server.id ? 1_000 : 0) +
          (preferredCatalogIds.has(server.catalogId ?? "") ? 100 : 0) +
          (tool ? 10 : 0),
      };
    })
    .filter((item): item is { server: (typeof configuredServers)[number]; tool: McpTool; score: number } => Boolean(item.tool))
    .sort((left, right) => right.score - left.score || left.server.name.localeCompare(right.server.name));

  if (ranked.length === 0) {
    return {
      error: draft.mcpServerId
        ? `No compatible outbound tool was found on MCP server "${draft.mcpServerId}".`
        : `No connected MCP server exposes a compatible outbound tool for ${channel.label}.`,
    };
  }

  const selected = ranked[0];
  return {
    serverId: selected.server.id,
    tool: selected.tool,
    args: buildDraftToolArgs(selected.tool, draft),
  };
}

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
  let status: DraftStatus = "failed";
  let sentAt: number | undefined;
  let resolvedServerId = draft.mcpServerId;

  try {
    const delivery = await resolveDraftDelivery(draft);
    if ("error" in delivery) {
      throw new Error(delivery.error);
    }

    const result = await mcp.callTool(delivery.serverId, delivery.tool.name, delivery.args);
    resolvedServerId = delivery.serverId;
    if (result.isError) {
      throw new Error(result.content);
    }

    status = "sent";
    sentAt = now;
  } catch {
    status = "failed";
  }

  db.prepare("UPDATE drafts SET status = ?, sent_at = ?, updated_at = ?, mcp_server_id = ? WHERE id = ?").run(
    status,
    sentAt ?? null,
    now,
    resolvedServerId ?? null,
    id,
  );
  return { ...draft, status, sentAt, updatedAt: now, mcpServerId: resolvedServerId };
}
