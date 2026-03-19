import type { AssistantMessage, Usage } from "@mariozechner/pi-ai";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";

const EMPTY_USAGE: Usage = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export const ollamaProvider: LLMProvider = {
  name: "ollama",
  displayName: "Ollama (Local)",
  authKind: "local",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "local_runtime"],
  defaultModel: "llama3.3",
  supportedModels: [
    "llama3.3",
    "llama3.2",
    "llama3.1",
    "codellama",
    "deepseek-coder-v2",
    "qwen2.5-coder",
    "mistral",
    "mixtral",
    "phi-4",
    "gemma2",
  ],
  async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
    // Ollama uses OpenAI-compatible chat/completions endpoint
    const baseUrl = params.credential.baseUrl || "http://localhost:11434";

    const messages: any[] = [];
    if (params.context.systemPrompt) {
      messages.push({ role: "system", content: params.context.systemPrompt });
    }

    for (const m of params.context.messages) {
      if (m.role === "user") {
        messages.push({
          role: "user",
          content: typeof m.content === "string" ? m.content : "",
        });
      } else if (m.role === "assistant") {
        const text = (m as AssistantMessage).content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        messages.push({ role: "assistant", content: text });
      }
    }

    const body: any = {
      model: params.model,
      messages,
      stream: true,
    };

    if (params.context.tools && params.context.tools.length > 0) {
      body.tools = params.context.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    try {
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: params.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        yield { type: "error", message: `Ollama API error ${resp.status}: ${errText}` };
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        yield { type: "error", message: "No response body from Ollama" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();

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
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullText += delta.content;
              yield { type: "text_delta", delta: delta.content };
            }

            // Handle tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!pendingToolCalls.has(idx)) {
                  pendingToolCalls.set(idx, {
                    id: tc.id ?? `tool-${idx}-${Date.now()}`,
                    name: tc.function?.name ?? "",
                    args: "",
                  });
                }
                const pending = pendingToolCalls.get(idx)!;
                if (tc.function?.name) pending.name = tc.function.name;
                if (tc.function?.arguments) pending.args += tc.function.arguments;
              }
            }

            // Check finish reason
            if (chunk.choices?.[0]?.finish_reason === "tool_calls") {
              for (const [, tc] of pendingToolCalls) {
                let args: Record<string, any> = {};
                try { args = JSON.parse(tc.args); } catch { /* empty */ }
                yield { type: "toolcall_end", toolCallId: tc.id, toolName: tc.name, args };
              }
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }

      // Emit any remaining tool calls
      for (const [, tc] of pendingToolCalls) {
        let args: Record<string, any> = {};
        try { args = JSON.parse(tc.args); } catch { /* empty */ }
        yield { type: "toolcall_end", toolCallId: tc.id, toolName: tc.name, args };
      }

      const rawMessage: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: fullText }],
        api: "openai-responses",
        provider: "ollama",
        model: params.model,
        usage: EMPTY_USAGE,
        stopReason: pendingToolCalls.size > 0 ? "toolUse" : "stop",
        timestamp: Date.now(),
      };

      yield {
        type: "done",
        text: fullText,
        stopReason: rawMessage.stopReason,
        raw: rawMessage,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      yield {
        type: "error",
        message: err?.message?.includes("ECONNREFUSED")
          ? "Cannot connect to Ollama. Make sure Ollama is running on localhost:11434."
          : (err?.message ?? "Ollama request failed"),
      };
    }
  },
};
