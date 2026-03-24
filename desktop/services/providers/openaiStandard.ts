import { streamSimpleOpenAIResponses } from "@mariozechner/pi-ai";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";
import {
  buildOpenAICompatibleModel,
  buildProviderDescriptor,
  forwardAssistantStream,
  getProviderBaseUrl,
  stripToolsFromPayloadWhenEmpty,
} from "./shared.js";

export const openaiStandardProvider: LLMProvider = {
  ...buildProviderDescriptor({
    name: "openai",
    displayName: "OpenAI API",
    authKind: "apiKey",
    capabilityFlags: ["streaming", "tool_use", "reasoning", "vision", "api_key"],
    defaultModel: "gpt-4.1",
    supportedModels: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o4-mini",
    ],
  }),
  async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
    if (!params.credential.apiKey) {
      yield { type: "error", message: "OpenAI API key is missing." };
      return;
    }

    const model = buildOpenAICompatibleModel({
      api: "openai-responses",
      provider: "openai",
      model: params.model,
      baseUrl: getProviderBaseUrl(params, "https://api.openai.com/v1"),
      reasoning: true,
      supportsVision: true,
      contextWindow: params.contextWindow,
      maxOutputTokens: params.maxOutputTokens,
    });

    yield* forwardAssistantStream(
      streamSimpleOpenAIResponses(model as any, params.context, {
        apiKey: params.credential.apiKey,
        reasoning: params.reasoningEffort ?? "medium",
        signal: params.signal,
        onPayload: stripToolsFromPayloadWhenEmpty(params.context),
      }),
    );
  },
};
