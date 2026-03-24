import type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Model,
} from "@mariozechner/pi-ai";
import type { ProviderCapabilityFlag, CanonicalProviderName } from "../../../src/types/model.js";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";

export const EMPTY_USAGE = {
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

export function extractAssistantText(message: AssistantMessage): string {
  const texts: string[] = [];
  for (const part of message.content) {
    if (part.type === "text" && typeof part.text === "string") {
      texts.push(part.text);
    } else if (part.type === "thinking" && typeof part.thinking === "string" && !part.redacted) {
      texts.push(part.thinking);
    }
  }
  return texts.join("").trim();
}

export async function* forwardAssistantStream(
  stream: AssistantMessageEventStream,
): AsyncGenerator<StreamEvent> {
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

export function stripToolsFromPayloadWhenEmpty(context: Context) {
  const hasTools = Boolean(context.tools && context.tools.length > 0);
  return async (payload: unknown) => {
    if (payload && typeof payload === "object" && !hasTools) {
      const next = { ...(payload as Record<string, unknown>) };
      delete next.tools;
      delete next.tool_choice;
      delete next.parallel_tool_calls;
      return next;
    }
    return payload;
  };
}

type ProviderDescriptor = {
  name: CanonicalProviderName;
  displayName: string;
  authKind: LLMProvider["authKind"];
  capabilityFlags: ProviderCapabilityFlag[];
  defaultModel: string;
  supportedModels: string[];
};

export function buildProviderDescriptor(descriptor: ProviderDescriptor): Omit<LLMProvider, "stream"> {
  return {
    name: descriptor.name,
    displayName: descriptor.displayName,
    authKind: descriptor.authKind,
    capabilityFlags: descriptor.capabilityFlags,
    defaultModel: descriptor.defaultModel,
    supportedModels: descriptor.supportedModels,
  };
}

export function buildOpenAICompatibleModel(params: {
  api: "openai-completions" | "openai-responses";
  provider: CanonicalProviderName;
  model: string;
  baseUrl: string;
  reasoning: boolean;
  supportsVision: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
  compat?: Model<"openai-completions">["compat"];
}): Model<"openai-completions"> | Model<"openai-responses"> {
  return {
    id: params.model,
    name: params.model,
    api: params.api,
    provider: params.provider,
    baseUrl: params.baseUrl,
    reasoning: params.reasoning,
    input: params.supportsVision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow ?? 128000,
    maxTokens: params.maxOutputTokens ?? 4096,
    headers: params.headers,
    compat: params.api === "openai-completions" ? params.compat : undefined,
  } as Model<"openai-completions"> | Model<"openai-responses">;
}

export function getProviderBaseUrl(params: LLMProviderParams, fallback: string): string {
  return params.credential.baseUrl?.trim() || fallback;
}
