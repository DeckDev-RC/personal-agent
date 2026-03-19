import { streamOpenAIResponses } from "../../../src/openai/responsesClient.js";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";

export const openaiProvider: LLMProvider = {
  name: "openai-codex",
  displayName: "OpenAI Codex",
  authKind: "oauth",
  capabilityFlags: ["streaming", "tool_use", "reasoning", "oauth"],
  defaultModel: "gpt-5.4",
  supportedModels: [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
    "gpt-5-codex",
    "gpt-5-mini",
    "gpt-5-nano",
  ],
  async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
    if (!params.credential.apiKey) {
      yield { type: "error", message: "OpenAI Codex credential is missing." };
      return;
    }

    yield* streamOpenAIResponses({
      accessToken: params.credential.apiKey,
      model: params.model,
      context: params.context,
      reasoningEffort: params.reasoningEffort,
      contextWindow: params.contextWindow,
      maxOutputTokens: params.maxOutputTokens,
      signal: params.signal,
    });
  },
};
