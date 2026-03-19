import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig, McpServerStatus, McpTool } from "../../src/types/mcp.js";

type ManagedServer = {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
  transportType: "stdio" | "streamable-http" | "sse";
  tools: McpTool[];
  connected: boolean;
  error?: string;
};

const servers = new Map<string, ManagedServer>();

function createClient(): Client {
  return new Client({ name: "codex-agent", version: "1.0.0" }, { capabilities: {} });
}

async function connectHttpClient(url: string): Promise<{
  client: Client;
  transport: SSEClientTransport | StreamableHTTPClientTransport;
  transportType: "streamable-http" | "sse";
}> {
  const target = new URL(url);

  try {
    const client = createClient();
    const transport = new StreamableHTTPClientTransport(target);
    await client.connect(transport);
    return { client, transport, transportType: "streamable-http" };
  } catch (streamableError) {
    const client = createClient();
    const transport = new SSEClientTransport(target);
    try {
      await client.connect(transport);
      return { client, transport, transportType: "sse" };
    } catch (sseError: any) {
      const streamableMessage =
        streamableError instanceof Error ? streamableError.message : String(streamableError);
      const sseMessage = sseError?.message ?? String(sseError);
      throw new Error(
        `HTTP MCP connection failed. Streamable HTTP: ${streamableMessage}. SSE fallback: ${sseMessage}.`,
      );
    }
  }
}

function mapTools(config: McpServerConfig, tools: Array<Record<string, unknown>>): McpTool[] {
  return tools.map((tool) => ({
    name: String(tool.name ?? ""),
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema:
      tool.inputSchema && typeof tool.inputSchema === "object"
        ? (tool.inputSchema as Record<string, unknown>)
        : {},
    serverId: config.id,
    serverName: config.name,
  }));
}

function formatToolContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return typeof content === "string" ? content : JSON.stringify(content, null, 2);
  }

  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return JSON.stringify(item);
      }

      const block = item as { type?: unknown; text?: unknown };
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }

      return JSON.stringify(item, null, 2);
    })
    .filter(Boolean);

  return parts.join("\n\n");
}

export async function connectServer(config: McpServerConfig): Promise<void> {
  if (servers.has(config.id)) {
    await disconnectServer(config.id);
  }

  let client: Client;
  let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
  let transportType: ManagedServer["transportType"];

  if (config.type === "stdio") {
    if (!config.command) {
      throw new Error("Comando nao definido para servidor stdio.");
    }

    client = createClient();
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
      cwd: config.cwd,
    });
    transportType = "stdio";
  } else {
    if (!config.url) {
      throw new Error("URL nao definida para servidor HTTP.");
    }

    const httpClient = await connectHttpClient(config.url);
    client = httpClient.client;
    transport = httpClient.transport;
    transportType = httpClient.transportType;
  }

  const managed: ManagedServer = {
    config,
    client,
    transport,
    transportType,
    tools: [],
    connected: false,
  };

  servers.set(config.id, managed);

  try {
    if (config.type === "stdio") {
      await client.connect(transport);
    }

    managed.connected = true;
    managed.error = undefined;

    const toolsResult = await client.listTools();
    managed.tools = mapTools(config, (toolsResult.tools ?? []) as Array<Record<string, unknown>>);
  } catch (error: any) {
    managed.connected = false;
    managed.error = error?.message ?? String(error);
    throw error;
  }
}

export async function disconnectServer(id: string): Promise<void> {
  const managed = servers.get(id);
  if (!managed) {
    return;
  }

  try {
    await managed.client.close();
  } catch {
    // Best-effort cleanup.
  }

  servers.delete(id);
}

export async function callTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const managed = servers.get(serverId);
  if (!managed || !managed.connected) {
    return { content: `MCP server "${serverId}" not connected.`, isError: true };
  }

  try {
    const result = await managed.client.callTool({ name: toolName, arguments: args });
    return {
      content: formatToolContent(result.content),
      isError: result.isError === true,
    };
  } catch (error: any) {
    return { content: error?.message ?? String(error), isError: true };
  }
}

export function getServerStatus(id: string): McpServerStatus {
  const managed = servers.get(id);
  if (!managed) {
    return { id, connected: false, error: "Not started", toolCount: 0 };
  }

  return {
    id,
    connected: managed.connected,
    error: managed.error,
    toolCount: managed.tools.length,
  };
}

export function getAllStatuses(): McpServerStatus[] {
  return Array.from(servers.values()).map((managed) => ({
    id: managed.config.id,
    connected: managed.connected,
    error: managed.error,
    toolCount: managed.tools.length,
  }));
}

export function getToolsForServer(id: string): McpTool[] {
  return servers.get(id)?.tools ?? [];
}

export function getAllTools(): McpTool[] {
  const all: McpTool[] = [];
  for (const managed of servers.values()) {
    all.push(...managed.tools);
  }
  return all;
}

export function getToolsForServers(ids: string[]): McpTool[] {
  const requestedIds = new Set(ids);
  const all: McpTool[] = [];

  for (const managed of servers.values()) {
    if (managed.connected && requestedIds.has(managed.config.id)) {
      all.push(...managed.tools);
    }
  }

  return all;
}

export async function connectEnabledServers(configs: McpServerConfig[]): Promise<void> {
  for (const config of configs) {
    if (!config.enabled) {
      if (servers.has(config.id)) {
        await disconnectServer(config.id);
      }
      continue;
    }

    if (servers.get(config.id)?.connected) {
      continue;
    }

    try {
      await connectServer(config);
    } catch {
      // Preserve failed status for the UI without aborting startup.
    }
  }
}

export async function disconnectAll(): Promise<void> {
  const ids = Array.from(servers.keys());
  for (const id of ids) {
    await disconnectServer(id);
  }
}
