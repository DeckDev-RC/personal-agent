import type { DraftType } from "../../src/types/communication.js";
import type {
  UnifiedInboxItem,
  UnifiedInboxQuery,
  UnifiedInboxSnapshot,
  UnifiedInboxSource,
} from "../../src/types/inbox.js";
import type { McpServerConfig, McpTool } from "../../src/types/mcp.js";
import { callTool, getServerStatus, getToolsForServer } from "./mcpManager.js";
import { listMcpServersV2 } from "./v2EntityStore.js";

const CHANNEL_BY_CATALOG_ID: Partial<Record<string, DraftType>> = {
  gmail: "email",
  slack: "slack",
  "microsoft-teams-bridge": "teams",
  "discord-bridge": "discord",
  "telegram-bridge": "telegram",
  "whatsapp-bridge": "whatsapp",
  "signal-bridge": "signal",
  "twilio-sms-bridge": "sms",
};

const INBOX_TOOL_PRIORITY = new Map<string, number>([
  ["list_messages", 120],
  ["list_inbox", 115],
  ["recent_messages", 110],
  ["list_emails", 105],
  ["list_threads", 100],
  ["list_conversations", 95],
  ["search_email", 90],
  ["search_messages", 80],
]);

const ARRAY_KEYS = [
  "messages",
  "items",
  "results",
  "emails",
  "threads",
  "conversations",
  "records",
  "data",
];

function normalizeToolName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(", ");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const compact = [
      normalizeText(record.name),
      normalizeText(record.email),
      normalizeText(record.username),
      normalizeText(record.id),
    ].filter(Boolean);
    if (compact.length > 0) {
      return compact.join(" ");
    }
  }
  return "";
}

function truncateText(value: string, maxLength = 280): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function pickText(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeText(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function pickValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function pickTimestamp(record: Record<string, unknown>): number | undefined {
  return parseTimestamp(
    pickValue(record, [
      "receivedAt",
      "sentAt",
      "createdAt",
      "timestamp",
      "date",
      "updatedAt",
      "ts",
    ]),
  );
}

function pickUnread(record: Record<string, unknown>): boolean | undefined {
  const unreadCandidate = pickValue(record, ["unread", "isUnread", "unseen"]);
  if (typeof unreadCandidate === "boolean") {
    return unreadCandidate;
  }

  const readCandidate = pickValue(record, ["read", "isRead", "seen"]);
  if (typeof readCandidate === "boolean") {
    return !readCandidate;
  }

  const status = normalizeText(record.status).toLowerCase();
  if (status.includes("unread")) {
    return true;
  }
  if (status.includes("read")) {
    return false;
  }
  return undefined;
}

function inferChannel(server: McpServerConfig, tool?: McpTool): DraftType {
  const catalogChannel = server.catalogId ? CHANNEL_BY_CATALOG_ID[server.catalogId] : undefined;
  if (catalogChannel) {
    return catalogChannel;
  }

  const haystack = [server.name, server.catalogId, tool?.name, tool?.description]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  if (haystack.includes("email") || haystack.includes("gmail")) return "email";
  if (haystack.includes("slack")) return "slack";
  if (haystack.includes("teams")) return "teams";
  if (haystack.includes("discord")) return "discord";
  if (haystack.includes("telegram")) return "telegram";
  if (haystack.includes("whatsapp")) return "whatsapp";
  if (haystack.includes("signal")) return "signal";
  if (haystack.includes("sms") || haystack.includes("twilio")) return "sms";
  return "generic";
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

function getRequiredSchemaProperties(tool: McpTool): Set<string> {
  const schema =
    tool.inputSchema && typeof tool.inputSchema === "object"
      ? (tool.inputSchema as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return new Set(required.map((item) => String(item).toLowerCase()));
}

function setFirstMatchingArg(
  target: Record<string, unknown>,
  properties: Set<string>,
  keys: string[],
  value: unknown,
): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  for (const key of keys) {
    if (properties.has(key.toLowerCase())) {
      target[key] = value;
      return;
    }
  }
}

function getToolPriority(tool: McpTool, channel: DraftType): number {
  const normalized = normalizeToolName(tool.name);
  const base = INBOX_TOOL_PRIORITY.get(normalized) ?? -1;
  if (base < 0) {
    return -1;
  }

  if (channel === "email" && normalized === "search_email") {
    return base + 20;
  }
  if (channel !== "email" && normalized === "list_messages") {
    return base + 10;
  }
  return base;
}

function findInboxTool(server: McpServerConfig, query?: string): { tool?: McpTool; error?: string } {
  const tools = getToolsForServer(server.id);
  const channel = inferChannel(server);
  const ranked = [...tools]
    .map((tool) => ({ tool, score: getToolPriority(tool, channel) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name));

  if (ranked.length === 0) {
    return { error: "No inbox-compatible MCP tool is exposed by this server." };
  }

  const top = ranked[0].tool;
  const normalized = normalizeToolName(top.name);
  if (normalized === "search_messages" && !query?.trim()) {
    return { error: "This server only exposes search-based inbox access. Add a query to fetch results." };
  }

  return { tool: top };
}

function buildInboxArgs(tool: McpTool, params: UnifiedInboxQuery, channel: DraftType): { args?: Record<string, unknown>; error?: string } {
  const properties = getToolSchemaProperties(tool);
  const required = getRequiredSchemaProperties(tool);
  const normalized = normalizeToolName(tool.name);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const args: Record<string, unknown> = {};

  setFirstMatchingArg(args, properties, ["limit", "max_results", "maxResults", "page_size", "pageSize", "count"], limit);

  if (params.onlyUnread) {
    setFirstMatchingArg(args, properties, ["unread_only", "unreadOnly", "only_unread", "onlyUnread"], true);
    setFirstMatchingArg(args, properties, ["include_read", "includeRead"], false);
    setFirstMatchingArg(args, properties, ["status", "read_state"], "unread");
  }

  if (channel === "email") {
    setFirstMatchingArg(args, properties, ["folder", "mailbox", "label"], "INBOX");
  }

  const explicitQuery = params.query?.trim();
  const derivedQuery =
    explicitQuery
    || (normalized === "search_email"
      ? `in:inbox${params.onlyUnread ? " is:unread" : ""}`
      : undefined);

  if (derivedQuery) {
    setFirstMatchingArg(args, properties, ["query", "q", "search", "term"], derivedQuery);
  }

  if (
    required.has("query")
    && !Object.keys(args).some((key) => key.toLowerCase() === "query")
    && !Object.keys(args).some((key) => key.toLowerCase() === "q")
  ) {
    return { error: "The MCP tool requires a query before inbox results can be listed." };
  }

  return { args };
}

function looksLikeInboxRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    pickText(record, ["subject", "title", "name", "snippet", "preview", "body", "text", "content", "message"])
      || pickText(record, ["from", "sender", "author", "user"])
      || pickText(record, ["id", "messageId", "emailId", "threadId"]),
  );
}

function extractStructuredItems(structuredContent?: Record<string, unknown>): Record<string, unknown>[] {
  if (!structuredContent) {
    return [];
  }

  for (const key of ARRAY_KEYS) {
    const candidate = structuredContent[key];
    if (Array.isArray(candidate)) {
      const records = candidate.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
      if (records.length > 0) {
        return records;
      }
    }
  }

  for (const value of Object.values(structuredContent)) {
    if (Array.isArray(value)) {
      const records = value.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
      if (records.length > 0) {
        return records;
      }
    }
  }

  if (looksLikeInboxRecord(structuredContent)) {
    return [structuredContent];
  }

  return [];
}

function normalizeInboxItem(
  record: Record<string, unknown>,
  defaults: {
    serverId: string;
    serverName: string;
    catalogId?: string;
    channel: DraftType;
    toolName: string;
    fallbackId: string;
  },
): UnifiedInboxItem | null {
  const title =
    pickText(record, ["subject", "title", "name", "summary"])
    || pickText(record, ["snippet", "preview"])
    || pickText(record, ["body", "text", "content", "message"]);
  const snippet =
    pickText(record, ["snippet", "preview", "body", "text", "content", "message", "description"])
    || title;

  if (!title && !snippet) {
    return null;
  }

  const id =
    pickText(record, ["id", "messageId", "emailId", "threadId", "conversationId", "ts", "url"])
    || defaults.fallbackId;

  return {
    id,
    serverId: defaults.serverId,
    serverName: defaults.serverName,
    catalogId: defaults.catalogId,
    channel: defaults.channel,
    toolName: defaults.toolName,
    title: truncateText(title ?? snippet ?? "Untitled message", 140),
    snippet: truncateText(snippet ?? "", 280),
    from: pickText(record, ["from", "sender", "author", "user", "fromName", "source"]),
    to: pickText(record, ["to", "recipient", "channel", "chat", "conversation"]),
    unread: pickUnread(record),
    receivedAt: pickTimestamp(record),
    threadId: pickText(record, ["threadId", "conversationId", "chatId", "channelId"]),
    url: pickText(record, ["url", "link", "permalink"]),
    raw: record,
  };
}

function parseTextFallback(
  text: string,
  defaults: {
    serverId: string;
    serverName: string;
    catalogId?: string;
    channel: DraftType;
    toolName: string;
  },
): UnifiedInboxItem[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const blocks = trimmed
    .split(/\r?\n\s*\r?\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 10);

  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const title = truncateText(lines[0] ?? `Message ${index + 1}`, 140);
    const snippet = truncateText(lines.slice(1).join(" "), 280);

    return {
      id: `${defaults.serverId}:${defaults.toolName}:text:${index + 1}`,
      serverId: defaults.serverId,
      serverName: defaults.serverName,
      catalogId: defaults.catalogId,
      channel: defaults.channel,
      toolName: defaults.toolName,
      title,
      snippet,
      rawText: block,
    } satisfies UnifiedInboxItem;
  });
}

async function fetchInboxFromServer(server: McpServerConfig, params: UnifiedInboxQuery): Promise<{
  source: UnifiedInboxSource;
  items: UnifiedInboxItem[];
}> {
  const channel = inferChannel(server);
  const status = getServerStatus(server.id);

  if (!status.connected) {
    return {
      source: {
        serverId: server.id,
        serverName: server.name,
        catalogId: server.catalogId,
        channel,
        connected: false,
        itemCount: 0,
        error: status.error ?? "MCP server is not connected.",
      },
      items: [],
    };
  }

  const toolResolution = findInboxTool(server, params.query);
  if (!toolResolution.tool) {
    return {
      source: {
        serverId: server.id,
        serverName: server.name,
        catalogId: server.catalogId,
        channel,
        connected: true,
        itemCount: 0,
        error: toolResolution.error,
      },
      items: [],
    };
  }

  const argsResolution = buildInboxArgs(toolResolution.tool, params, channel);
  if (!argsResolution.args) {
    return {
      source: {
        serverId: server.id,
        serverName: server.name,
        catalogId: server.catalogId,
        channel,
        connected: true,
        toolName: toolResolution.tool.name,
        itemCount: 0,
        error: argsResolution.error,
      },
      items: [],
    };
  }

  const result = await callTool(server.id, toolResolution.tool.name, argsResolution.args);
  if (result.isError) {
    return {
      source: {
        serverId: server.id,
        serverName: server.name,
        catalogId: server.catalogId,
        channel,
        connected: true,
        toolName: toolResolution.tool.name,
        itemCount: 0,
        error: result.content,
      },
      items: [],
    };
  }

  const structuredItems = extractStructuredItems(result.structuredContent);
  const items =
    structuredItems.length > 0
      ? structuredItems
          .map((record, index) =>
            normalizeInboxItem(record, {
              serverId: server.id,
              serverName: server.name,
              catalogId: server.catalogId,
              channel,
              toolName: toolResolution.tool!.name,
              fallbackId: `${server.id}:${toolResolution.tool!.name}:${index + 1}`,
            }),
          )
          .filter((item): item is UnifiedInboxItem => Boolean(item))
      : parseTextFallback(result.content, {
          serverId: server.id,
          serverName: server.name,
          catalogId: server.catalogId,
          channel,
          toolName: toolResolution.tool.name,
        });

  return {
    source: {
      serverId: server.id,
      serverName: server.name,
      catalogId: server.catalogId,
      channel,
      connected: true,
      toolName: toolResolution.tool.name,
      itemCount: items.length,
    },
    items,
  };
}

export async function listUnifiedInbox(params: UnifiedInboxQuery = {}): Promise<UnifiedInboxSnapshot> {
  const enabledServers = (await listMcpServersV2()).filter((server) => server.enabled);
  const perServerLimit = Math.min(50, Math.max(1, params.limit ?? 20));
  const requestedChannel = params.channel;
  const query = params.query?.trim().toLowerCase();

  const results = await Promise.all(
    enabledServers.map((server) =>
      fetchInboxFromServer(server, {
        ...params,
        limit: perServerLimit,
      }),
    ),
  );

  const filteredItems = results
    .flatMap((entry) => entry.items)
    .filter((item) => !requestedChannel || item.channel === requestedChannel)
    .filter((item) => {
      if (!query) {
        return true;
      }

      const haystack = [item.title, item.snippet, item.from, item.to, item.url]
        .map((value) => String(value ?? "").toLowerCase())
        .join("\n");
      return haystack.includes(query);
    })
    .sort((left, right) => (right.receivedAt ?? 0) - (left.receivedAt ?? 0))
    .slice(0, perServerLimit * Math.max(1, enabledServers.length));

  return {
    fetchedAt: Date.now(),
    items: filteredItems,
    sources: results.map((entry) => entry.source),
  };
}
