import { streamSimpleOpenAICodexResponses } from "@mariozechner/pi-ai";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Message,
  Tool,
  ToolResultMessage,
  Usage,
} from "@mariozechner/pi-ai";

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

export type SimpleChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  model?: string;
  thinkingContent?: string;
  toolCallId?: string;
  toolName?: string;
};

export type StreamOpenAIResponsesParams = {
  accessToken: string;
  model: string;
  context: Context;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  contextWindow?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type StreamChatParams = {
  accessToken: string;
  model: string;
  systemPrompt: string;
  messages: SimpleChatMessage[];
  tools?: Tool[];
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  contextWindow?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "toolcall_end"; toolCallId: string; toolName: string; args: Record<string, any> }
  | { type: "done"; text: string; stopReason: string; raw: AssistantMessage }
  | { type: "error"; message: string };

function buildCodexModel(params: {
  model: string;
  maxOutputTokens?: number;
  contextWindow?: number;
}): any {
  return {
    api: "openai-codex-responses",
    provider: "openai-codex",
    id: params.model,
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow ?? 128000,
    maxTokens: params.maxOutputTokens ?? 4096,
  };
}

function extractAssistantText(message: AssistantMessage): string {
  const texts: string[] = [];
  for (const part of message.content) {
    const contentType = (part as { type?: unknown }).type;
    if (contentType === "text" && typeof (part as { text?: unknown }).text === "string") {
      texts.push((part as { text: string }).text);
    } else if (
      contentType === "thinking" &&
      typeof (part as { thinking?: unknown }).thinking === "string" &&
      !(part as { redacted?: unknown }).redacted
    ) {
      texts.push((part as { thinking: string }).thinking);
    }
  }
  return texts.join("").trim();
}

function convertSimpleMessage(message: SimpleChatMessage, model: string): Message {
  if (message.role === "assistant") {
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
      api: "openai-codex-responses",
      provider: "openai-codex",
      model: message.model ?? model,
      usage: EMPTY_USAGE,
      stopReason: "stop",
      timestamp: message.timestamp,
    };
  }

  if (message.role === "tool") {
    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: message.toolCallId ?? `tool-${message.timestamp}`,
      toolName: message.toolName ?? "tool",
      content: [{ type: "text", text: message.content }],
      isError: false,
      timestamp: message.timestamp,
    };
    return toolResult;
  }

  return {
    role: "user",
    content: message.content,
    timestamp: message.timestamp,
  };
}

export async function* streamOpenAIResponses(
  params: StreamOpenAIResponsesParams,
): AsyncGenerator<StreamEvent> {
  const codexModel = buildCodexModel(params);
  const hasTools = Boolean(params.context.tools && params.context.tools.length > 0);

  const stream: AssistantMessageEventStream = streamSimpleOpenAICodexResponses(
    codexModel,
    params.context,
    {
      apiKey: params.accessToken,
      reasoning: params.reasoningEffort ?? "medium",
      sessionId: undefined,
      signal: params.signal,
      onPayload: (payload: any) => {
        if (payload && typeof payload === "object" && !hasTools) {
          payload.tool_choice = "none";
          payload.parallel_tool_calls = false;
          delete payload.tools;
        }
        return payload;
      },
    },
  );

  let finalMessage: AssistantMessage | null = null;

  for await (const event of stream as AsyncIterable<AssistantMessageEvent>) {
    switch (event.type) {
      case "text_delta":
        yield { type: "text_delta", delta: event.delta };
        break;
      case "thinking_delta":
        yield { type: "thinking_delta", delta: event.delta };
        break;
      case "toolcall_end":
        yield {
          type: "toolcall_end",
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.name,
          args: event.toolCall.arguments,
        };
        break;
      case "done":
        finalMessage = event.message;
        break;
      case "error":
        finalMessage = event.error;
        break;
    }
  }

  if (!finalMessage) {
    finalMessage = await stream.result();
  }

  if (finalMessage.stopReason === "error" || finalMessage.stopReason === "aborted") {
    yield {
      type: "error",
      message: finalMessage.errorMessage ?? "Unknown error",
    };
    return;
  }

  yield {
    type: "done",
    text: extractAssistantText(finalMessage),
    stopReason: finalMessage.stopReason,
    raw: finalMessage,
  };
}

export async function* streamChat(params: StreamChatParams): AsyncGenerator<StreamEvent> {
  const context: Context = {
    systemPrompt: params.systemPrompt,
    messages: params.messages.map((message) => convertSimpleMessage(message, params.model)),
    tools: params.tools,
  };

  yield* streamOpenAIResponses({
    accessToken: params.accessToken,
    model: params.model,
    context,
    maxOutputTokens: params.maxOutputTokens,
    reasoningEffort: params.reasoningEffort,
    contextWindow: params.contextWindow,
    signal: params.signal,
  });
}

type ResponsesCallParams = {
  accessToken: string;
  model: string;
  input: string;
  instructions?: string;
  maxOutputTokens?: number;
};

export async function callOpenAIResponses(params: ResponsesCallParams): Promise<{
  text: string;
  raw: any;
}> {
  const codexModel = buildCodexModel(params);

  const context: Context = {
    systemPrompt: params.instructions ?? "You are a helpful AI assistant.",
    messages: [
      {
        role: "user",
        content: params.input,
        timestamp: Date.now(),
      },
    ],
  };

  const stream = streamSimpleOpenAICodexResponses(codexModel, context, {
    apiKey: params.accessToken,
    reasoning: "medium",
    sessionId: undefined,
    onPayload: (payload: any) => {
      if (payload && typeof payload === "object") {
        payload.tool_choice = "none";
        payload.parallel_tool_calls = false;
        delete payload.tools;
      }
      return payload;
    },
  });

  const final = await stream.result();
  const text = extractAssistantText(final);

  if (final.stopReason === "error") {
    throw new Error(
      `Codex falhou: ${((final as { errorMessage?: string }).errorMessage as string | undefined) ?? "sem mensagem"}`,
    );
  }

  if (!text) {
    throw new Error(
      `Codex respondeu sem texto. stopReason=${String((final as { stopReason?: unknown }).stopReason ?? "unknown")}`,
    );
  }

  return { text, raw: final };
}
