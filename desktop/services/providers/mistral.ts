import { streamSimpleMistral } from "@mariozechner/pi-ai";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";
import { buildProviderDescriptor, forwardAssistantStream, getProviderBaseUrl, stripToolsFromPayloadWhenEmpty } from "./shared.js";

function buildMistralModel(params: {
  model: string;
  baseUrl: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}) {
  return {
    id: params.model,
    name: params.model,
    api: "mistral-conversations",
    provider: "mistral",
    baseUrl: params.baseUrl,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow ?? 128000,
    maxTokens: params.maxOutputTokens ?? 8192,
  };
}

export const mistralProvider: LLMProvider = {
  ...buildProviderDescriptor({
    name: "mistral",
    displayName: "Mistral AI",
    authKind: "apiKey",
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultModel: "mistral-large-latest",
    supportedModels: [
      "mistral-large-latest",
      "codestral-latest",
      "ministral-8b-latest",
    ],
  }),
  async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
    if (!params.credential.apiKey) {
      yield { type: "error", message: "Mistral API key is missing." };
      return;
    }

    yield* forwardAssistantStream(
      streamSimpleMistral(
        buildMistralModel({
          model: params.model,
          baseUrl: getProviderBaseUrl(params, "https://api.mistral.ai/v1"),
          contextWindow: params.contextWindow,
          maxOutputTokens: params.maxOutputTokens,
        }) as any,
        params.context,
        {
          apiKey: params.credential.apiKey,
          reasoning: params.reasoningEffort ?? "medium",
          signal: params.signal,
          onPayload: stripToolsFromPayloadWhenEmpty(params.context),
        },
      ),
    );
  },
};
