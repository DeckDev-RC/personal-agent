import type { Tool } from "@mariozechner/pi-ai";
import type { McpTool } from "../../src/types/mcp.js";
import type { ToolMetadata } from "../../src/types/runtime.js";
import { buildBrowserTools, type BrowserToolName } from "./browserTools.js";
import { executeBrowserTool } from "./browserRuntime.js";
import { callTool as callMcpTool, getToolsForServers } from "./mcpManager.js";
import {
  buildNativeTools,
  classifyNativeToolRisk,
  executeNativeTool,
  type NativeToolContext,
  type NativeToolExecutionResult,
  type NativeToolName,
  type ToolRiskDecision,
} from "./nativeTools.js";

export type RegisteredTool = {
  publicName: string;
  actualName: string;
  source: "native" | "mcp" | "browser";
  serverId?: string;
  serverName?: string;
  metadata: ToolMetadata;
  tool: Tool;
};

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "tool";
}

function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type) {
    return schema;
  }
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
    ...schema,
  };
}

export function buildRegisteredTools(mcpServerIds: string[]): RegisteredTool[] {
  const native = buildNativeTools().map<RegisteredTool>((tool) => ({
    publicName: tool.name,
    actualName: tool.name,
    source: "native",
    metadata: tool.metadata,
    tool,
  }));
  const browser = buildBrowserTools().map<RegisteredTool>((tool) => ({
    publicName: tool.name,
    actualName: tool.name,
    source: "browser",
    metadata: tool.metadata,
    tool,
  }));

  const mcpTools = getToolsForServers(mcpServerIds);
  const counts = new Map<string, number>();
  for (const tool of mcpTools) {
    counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  }

  const mappedMcp = mcpTools.map<RegisteredTool>((tool) => {
    const duplicate = [...native, ...browser].some((entry) => entry.publicName === tool.name) || (counts.get(tool.name) ?? 0) > 1;
    const publicName = duplicate ? `${sanitize(tool.serverName)}__${tool.name}` : tool.name;
    return {
      publicName,
      actualName: tool.name,
      source: "mcp",
      serverId: tool.serverId,
      serverName: tool.serverName,
      metadata: {
        capabilities: ["read_only", "networked"],
        defaultTimeoutMs: 30_000,
      },
      tool: {
        name: publicName,
        description: duplicate ? `${tool.description} (server: ${tool.serverName})` : tool.description,
        parameters: normalizeSchema(tool.inputSchema) as Tool["parameters"],
      },
    };
  });

  return [...native, ...browser, ...mappedMcp];
}

export function splitToolsByMutability(registered: RegisteredTool[]): {
  readOnly: RegisteredTool[];
  all: RegisteredTool[];
} {
  const readOnly = registered.filter((tool) => tool.metadata.capabilities.includes("read_only"));
  return { readOnly, all: registered };
}

export function getRiskDecision(tool: RegisteredTool, args: Record<string, unknown>): ToolRiskDecision {
  if (tool.source === "native") {
    return classifyNativeToolRisk(tool.actualName as NativeToolName, args);
  }
  if (tool.source === "browser") {
    if (tool.metadata.capabilities.includes("requires_approval")) {
      return {
        mode: "approval",
        reason: `Browser action "${tool.publicName}" requires approval by default.`,
        riskLevel: tool.metadata.capabilities.includes("mutating") ? "high" : "medium",
      };
    }
    return { mode: "allow", reason: "Read-only browser action." };
  }
  return { mode: "allow", reason: "MCP tools are delegated to the configured server." };
}

export async function invokeRegisteredTool(
  tool: RegisteredTool,
  args: Record<string, unknown>,
  nativeCtx: NativeToolContext & { sessionId?: string },
): Promise<NativeToolExecutionResult> {
  if (tool.source === "native") {
    return await executeNativeTool(tool.actualName as NativeToolName, args, nativeCtx);
  }
  if (tool.source === "browser") {
    if (!nativeCtx.sessionId) {
      return {
        content: "Browser tools require a session.",
        isError: true,
      };
    }
    return await executeBrowserTool(tool.actualName as BrowserToolName, args, {
      sessionId: nativeCtx.sessionId,
      connectionId:
        typeof args.connectionId === "string" ? args.connectionId.trim() || undefined : undefined,
      signal: nativeCtx.signal,
    });
  }

  const result = await callMcpTool(tool.serverId!, tool.actualName, args);
  return {
    content: result.content,
    isError: result.isError,
  };
}
