import { streamSimpleGoogle } from "@mariozechner/pi-ai";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";
import { buildProviderDescriptor, forwardAssistantStream, stripToolsFromPayloadWhenEmpty } from "./shared.js";

function buildGoogleModel(params: {
  model: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}) {
  return {
    id: params.model,
    name: params.model,
    api: "google-generative-ai",
    provider: "google-gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow ?? 1_000_000,
    maxTokens: params.maxOutputTokens ?? 8192,
  };
}

export const googleGeminiProvider: LLMProvider = {
  ...buildProviderDescriptor({
    name: "google-gemini",
    displayName: "Google Gemini",
    authKind: "apiKey",
    capabilityFlags: ["streaming", "tool_use", "reasoning", "vision", "api_key"],
    defaultModel: "gemini-2.5-flash",
    supportedModels: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ],
  }),
  async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
    if (!params.credential.apiKey) {
      yield { type: "error", message: "Google Gemini API key is missing." };
      return;
    }

    yield* forwardAssistantStream(
      streamSimpleGoogle(buildGoogleModel(params) as any, params.context, {
        apiKey: params.credential.apiKey,
        reasoning: params.reasoningEffort ?? "medium",
        signal: params.signal,
        onPayload: stripToolsFromPayloadWhenEmpty(params.context),
      }),
    );
  },
};
