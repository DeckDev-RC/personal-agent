import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai";
import type { OpenAICompletionsCompat } from "@mariozechner/pi-ai";
import type { CanonicalProviderName, ProviderCapabilityFlag } from "../../../src/types/model.js";
import type { LLMProvider, LLMProviderParams, StreamEvent } from "./types.js";
import {
  buildOpenAICompatibleModel,
  buildProviderDescriptor,
  forwardAssistantStream,
  getProviderBaseUrl,
  stripToolsFromPayloadWhenEmpty,
} from "./shared.js";

type OpenAICompatibleProviderConfig = {
  name: CanonicalProviderName;
  displayName: string;
  defaultModel: string;
  supportedModels: string[];
  baseUrl: string;
  capabilityFlags: ProviderCapabilityFlag[];
  compat?: OpenAICompletionsCompat;
  headers?: Record<string, string>;
};

export function createOpenAICompatibleProvider(
  config: OpenAICompatibleProviderConfig,
): LLMProvider {
  return {
    ...buildProviderDescriptor({
      name: config.name,
      displayName: config.displayName,
      authKind: "apiKey",
      capabilityFlags: config.capabilityFlags,
      defaultModel: config.defaultModel,
      supportedModels: config.supportedModels,
    }),
    async *stream(params: LLMProviderParams): AsyncGenerator<StreamEvent> {
      if (!params.credential.apiKey) {
        yield { type: "error", message: `${config.displayName} API key is missing.` };
        return;
      }

      const model = buildOpenAICompatibleModel({
        api: "openai-completions",
        provider: config.name,
        model: params.model,
        baseUrl: getProviderBaseUrl(params, config.baseUrl),
        reasoning: config.capabilityFlags.includes("reasoning"),
        supportsVision: config.capabilityFlags.includes("vision"),
        contextWindow: params.contextWindow,
        maxOutputTokens: params.maxOutputTokens,
        headers: config.headers,
        compat: config.compat,
      });

      yield* forwardAssistantStream(
        streamSimpleOpenAICompletions(model as any, params.context, {
          apiKey: params.credential.apiKey,
          reasoning: params.reasoningEffort ?? "medium",
          signal: params.signal,
          onPayload: stripToolsFromPayloadWhenEmpty(params.context),
        }),
      );
    },
  };
}
