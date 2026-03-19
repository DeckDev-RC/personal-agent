import type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Usage,
} from "@mariozechner/pi-ai";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";

const EMPTY_USAGE: Usage = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function buildAnthropicModel(params: { model: string; maxOutputTokens?: number; contextWindow?: number }): any {
  return {
    api: "anthropic-messages",
    provider: "anthropic",
    id: params.model,
    baseUrl: "https://api.anthropic.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow ?? 200000,
    maxTokens: params.maxOutputTokens ?? 4096,
  };
}

function extractAssistantText(message: AssistantMessage): string {
  const texts: string[] = [];
  for (const part of message.content) {
    const ct = (part as any).type;
    if (ct === "text" && typeof (part as any).text === "string") {
      texts.push((part as any).text);
    } else if (ct === "thinking" && typeof (part as any).thinking === "string" && !(part as any).redacted) {
      texts.push((part as any).thinking);
    }
  }
  return texts.join("").trim();
}

export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  displayName: "Anthropic Claude",
  authKind: "apiKey",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
  defaultModel: "claude-sonnet-4-6",
  supportedModels: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250514",
  ],
  async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
    if (!params.credential.apiKey) {
      yield { type: "error", message: "Anthropic API key is missing." };
      return;
    }

    // Dynamic import to avoid bundling issues if pi-ai doesn't expose anthropic streaming directly.
    // pi-ai's anthropic-messages API is accessed through the same streaming interface.
    let streamFn: any;
    try {
      const piAi = await import("@mariozechner/pi-ai");
      // Use generic streaming if available, otherwise fall back to fetch-based implementation
      streamFn = piAi.streamSimpleOpenAICodexResponses ?? piAi.streamSimpleAnthropic;
    } catch {
      yield { type: "error", message: "Anthropic provider requires @mariozechner/pi-ai with anthropic support." };
      return;
    }

    if (!streamFn) {
      // Fallback: direct Anthropic API call via fetch
      yield* streamAnthropicDirect(params);
      return;
    }

    const model = buildAnthropicModel(params);
    const hasTools = Boolean(params.context.tools && params.context.tools.length > 0);

    const stream = streamFn(model, params.context, {
      apiKey: params.credential.apiKey,
      reasoning: params.reasoningEffort ?? "medium",
      sessionId: undefined,
      signal: params.signal,
      onPayload: (payload: any) => {
        if (payload && typeof payload === "object" && !hasTools) {
          delete payload.tools;
          delete payload.tool_choice;
        }
        return payload;
      },
    });

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

    const resolvedFinalMessage = finalMessage ?? await stream.result();

    if (!resolvedFinalMessage) {
      yield { type: "error", message: "Anthropic stream ended without a final message." };
      return;
    }

    if (resolvedFinalMessage.stopReason === "error" || resolvedFinalMessage.stopReason === "aborted") {
      yield { type: "error", message: resolvedFinalMessage.errorMessage ?? "Unknown error" };
      return;
    }

    yield {
      type: "done",
      text: extractAssistantText(resolvedFinalMessage),
      stopReason: resolvedFinalMessage.stopReason,
      raw: resolvedFinalMessage,
    };
  },
};

async function* streamAnthropicDirect(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
  const body: any = {
    model: params.model,
    max_tokens: params.maxOutputTokens ?? 4096,
    stream: true,
    messages: params.context.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        if (m.role === "user") {
          return { role: "user", content: typeof m.content === "string" ? m.content : "" };
        }
        const text = (m as AssistantMessage).content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        return { role: "assistant", content: text };
      }),
  };

  if (params.context.systemPrompt) {
    body.system = params.context.systemPrompt;
  }

  if (params.context.tools && params.context.tools.length > 0) {
    body.tools = params.context.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": params.credential.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      yield { type: "error", message: `Anthropic API error ${resp.status}: ${errText}` };
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body from Anthropic API" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            fullText += event.delta.text;
            yield { type: "text_delta", delta: event.delta.text };
          } else if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
            yield { type: "thinking_delta", delta: event.delta.thinking };
          } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
            // Tool use streaming - handled at content_block_stop
          } else if (event.type === "message_stop") {
            // End of message
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    const rawMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: fullText }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: params.model,
      usage: EMPTY_USAGE,
      stopReason: "stop",
      timestamp: Date.now(),
    };

    yield { type: "done", text: fullText, stopReason: "stop", raw: rawMessage };
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    yield { type: "error", message: err?.message ?? "Anthropic request failed" };
  }
}
