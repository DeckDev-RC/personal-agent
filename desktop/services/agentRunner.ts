import type { AssistantMessage, Context, Message, Tool, ToolResultMessage, Usage } from "@mariozechner/pi-ai";
import type { ConversationMessage } from "../../src/types/conversation.js";
import { splitModelRef } from "../../src/types/model.js";
import type { McpTool } from "../../src/types/mcp.js";
import { getToolsForServers, callTool } from "./mcpManager.js";
import { streamModelResponse } from "./runtimeCore.js";

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

type RuntimeTool = {
  publicName: string;
  actualName: string;
  serverId: string;
  serverName: string;
  tool: Tool;
};

export type AgentRunnerParams = {
  model: string;
  systemPrompt: string;
  messages: ConversationMessage[];
  mcpServerIds?: string[];
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  contextWindow?: number;
  compactAtTokens?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AgentRunnerEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | {
      type: "toolcall";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      serverId?: string;
      serverName?: string;
    }
  | {
      type: "toolresult";
      toolCallId: string;
      toolName: string;
      content: string;
      isError: boolean;
      serverId?: string;
      serverName?: string;
    }
  | { type: "done"; text: string; stopReason: string }
  | { type: "error"; message: string };

function sanitizeToolNameSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "server";
}

function normalizeToolSchema(schema: Record<string, unknown>): Record<string, unknown> {
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

function buildRuntimeTools(mcpTools: McpTool[]): RuntimeTool[] {
  const counts = new Map<string, number>();
  for (const tool of mcpTools) {
    counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  }

  return mcpTools.map((tool) => {
    const duplicateName = (counts.get(tool.name) ?? 0) > 1;
    const publicName = duplicateName
      ? `${sanitizeToolNameSegment(tool.serverName)}__${tool.name}`
      : tool.name;

    return {
      publicName,
      actualName: tool.name,
      serverId: tool.serverId,
      serverName: tool.serverName,
      tool: {
        name: publicName,
        description: duplicateName
          ? `${tool.description} (server: ${tool.serverName})`
          : tool.description,
        parameters: normalizeToolSchema(tool.inputSchema) as Tool["parameters"],
      },
    };
  });
}

function buildAssistantMessage(message: ConversationMessage, model: string): AssistantMessage {
  const resolved = splitModelRef(message.model ?? model);
  const content: AssistantMessage["content"] = [];
  if (message.thinkingContent) {
    content.push({ type: "thinking", thinking: message.thinkingContent });
  }
  if (message.content) {
    content.push({ type: "text", text: message.content });
  }

  return {
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    api:
      resolved.provider === "anthropic"
        ? "anthropic-messages"
        : resolved.provider === "ollama"
          ? "openai-responses"
          : "openai-codex-responses",
    provider: resolved.provider,
    model: resolved.modelRef,
    usage: EMPTY_USAGE,
    stopReason: "stop",
    timestamp: message.timestamp,
  };
}

function buildContextMessages(messages: ConversationMessage[], model: string): Message[] {
  const contextMessages: Message[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      contextMessages.push({
        role: "user",
        content: message.content,
        timestamp: message.timestamp,
      });
      continue;
    }

    if (message.role === "assistant") {
      contextMessages.push(buildAssistantMessage(message, model));
      continue;
    }

    // Persisted tool transcript entries are UI-facing only. They do not include the
    // originating assistant tool-call blocks, so they are skipped from model context replay.
  }

  return contextMessages;
}

function estimateTokens(text: string | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(message: Message): number {
  if (message.role === "user") {
    return typeof message.content === "string"
      ? estimateTokens(message.content)
      : message.content.reduce((sum, part) => sum + ("text" in part ? estimateTokens(part.text) : 0), 0);
  }

  if (message.role === "assistant") {
    return message.content.reduce((sum, part) => {
      if (part.type === "text") return sum + estimateTokens(part.text);
      if (part.type === "thinking") return sum + estimateTokens(part.thinking);
      return sum;
    }, 0);
  }

  return message.content.reduce((sum, part) => sum + ("text" in part ? estimateTokens(part.text) : 0), 0);
}

function compactContextMessages(messages: Message[], compactAtTokens: number | undefined): Message[] {
  if (!compactAtTokens || compactAtTokens <= 0) {
    return messages;
  }

  const total = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  if (total <= compactAtTokens) {
    return messages;
  }

  const target = Math.max(4000, Math.floor(compactAtTokens * 0.75));
  const kept: Message[] = [];
  let keptTokens = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const tokens = estimateMessageTokens(message);
    if (kept.length === 0 || keptTokens + tokens <= target) {
      kept.unshift(message);
      keptTokens += tokens;
    } else {
      break;
    }
  }

  const compactedNotice: Message = {
    role: "user",
    content:
      "Earlier conversation turns were compacted to fit the configured context budget. Prioritize the remaining recent turns.",
    timestamp: Date.now(),
  };

  return [compactedNotice, ...kept];
}

function extractToolCalls(message: AssistantMessage) {
  return message.content.filter(
    (block): block is Extract<AssistantMessage["content"][number], { type: "toolCall" }> =>
      block.type === "toolCall",
  );
}

function buildToolResultMessage(params: {
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  serverId?: string;
  serverName?: string;
}): ToolResultMessage<{ serverId?: string; serverName?: string }> {
  return {
    role: "toolResult",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    content: [{ type: "text", text: params.content }],
    isError: params.isError,
    details: {
      serverId: params.serverId,
      serverName: params.serverName,
    },
    timestamp: Date.now(),
  };
}

export async function* runAgentChat(
  params: AgentRunnerParams,
): AsyncGenerator<AgentRunnerEvent> {
  const runtimeTools = buildRuntimeTools(getToolsForServers(params.mcpServerIds ?? []));
  const runtimeToolMap = new Map(runtimeTools.map((tool) => [tool.publicName, tool] as const));

  const context: Context = {
    systemPrompt: params.systemPrompt,
    messages: compactContextMessages(
      buildContextMessages(params.messages, params.model),
      params.compactAtTokens,
    ),
    tools: runtimeTools.map((tool) => tool.tool),
  };

  while (true) {
    if (params.signal?.aborted) {
      return;
    }

    let finalMessage: AssistantMessage | null = null;

    for await (const event of streamModelResponse({
      modelRef: params.model,
      context,
      reasoningEffort: params.reasoningEffort,
      contextWindow: params.contextWindow,
      maxOutputTokens: params.maxOutputTokens,
      signal: params.signal,
    })) {
      if (params.signal?.aborted) {
        return;
      }

      switch (event.type) {
        case "text_delta":
          yield event;
          break;
        case "thinking_delta":
          yield event;
          break;
        case "toolcall_end": {
          const runtimeTool = runtimeToolMap.get(event.toolName);
          yield {
            type: "toolcall",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            serverId: runtimeTool?.serverId,
            serverName: runtimeTool?.serverName,
          };
          break;
        }
        case "done":
          finalMessage = event.raw;
          break;
        case "error":
          yield event;
          return;
      }
    }

    if (!finalMessage) {
      yield { type: "error", message: "No final assistant message was produced." };
      return;
    }

    context.messages.push(finalMessage);

    if (finalMessage.stopReason !== "toolUse") {
      yield {
        type: "done",
        text: finalMessage.content
          .filter((block): block is Extract<AssistantMessage["content"][number], { type: "text" }> =>
            block.type === "text",
          )
          .map((block) => block.text)
          .join(""),
        stopReason: finalMessage.stopReason,
      };
      return;
    }

    const toolCalls = extractToolCalls(finalMessage);
    if (toolCalls.length === 0) {
      yield { type: "error", message: "Model requested tool use without any tool calls." };
      return;
    }

    for (const toolCallDef of toolCalls) {
      if (params.signal?.aborted) {
        return;
      }

      const runtimeTool = runtimeToolMap.get(toolCallDef.name);
      let resultText: string;
      let isError: boolean;
      let serverId: string | undefined;
      let serverName: string | undefined;

      if (!runtimeTool) {
        resultText = `Tool "${toolCallDef.name}" is not available.`;
        isError = true;
      } else {
        const result = await callTool(
          runtimeTool.serverId,
          runtimeTool.actualName,
          toolCallDef.arguments as Record<string, unknown>,
        );
        resultText = result.content;
        isError = result.isError;
        serverId = runtimeTool.serverId;
        serverName = runtimeTool.serverName;
      }

      context.messages.push(
        buildToolResultMessage({
          toolCallId: toolCallDef.id,
          toolName: toolCallDef.name,
          content: resultText,
          isError,
          serverId,
          serverName,
        }),
      );

      yield {
        type: "toolresult",
        toolCallId: toolCallDef.id,
        toolName: toolCallDef.name,
        content: resultText,
        isError,
        serverId,
        serverName,
      };
    }
  }
}
