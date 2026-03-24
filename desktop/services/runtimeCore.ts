import type { Context } from "@mariozechner/pi-ai";
import {
  getFallbackModelRefForProvider,
  resolveProviderCredential,
  type ResolvedProviderCredential,
} from "./providerAuthStore.js";
import {
  resolveProviderModel,
  type LLMProvider,
  type StreamEvent,
} from "./providers/index.js";
import { getSettingsV2 } from "./v2EntityStore.js";

export type ResolvedModelExecutionContext = {
  providerName: ReturnType<typeof resolveProviderModel>["providerName"];
  model: string;
  modelRef: string;
  provider: LLMProvider;
  credential: ResolvedProviderCredential;
};

export async function resolveModelExecutionContext(
  modelRefOrModel?: string | null,
  providerHint?: string | null,
): Promise<ResolvedModelExecutionContext> {
  const resolved = resolveProviderModel(modelRefOrModel, providerHint);
  const credential = await resolveProviderCredential(resolved.providerName);
  return {
    ...resolved,
    credential,
  };
}

export async function* streamModelResponse(params: {
  modelRef: string;
  context: Context;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  contextWindow?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const settings = await getSettingsV2().catch(() => null);
  const primary = await resolveModelExecutionContext(params.modelRef);
  const orderedProviders = [
    primary.providerName,
    ...((settings?.fallbackProviders ?? []).filter(
      (provider: string) => provider !== primary.providerName,
    )),
  ];
  const attemptedErrors: string[] = [];

  for (let index = 0; index < orderedProviders.length; index += 1) {
    const providerName = orderedProviders[index];
    let resolved: ResolvedModelExecutionContext;
    try {
      resolved =
        providerName === primary.providerName
          ? primary
          : await resolveModelExecutionContext(getFallbackModelRefForProvider(providerName), providerName);
    } catch (error) {
      attemptedErrors.push(
        `${providerName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    let emittedOutput = false;

    for await (const event of resolved.provider.stream({
      credential: resolved.credential,
      model: resolved.model,
      context: params.context,
      reasoningEffort: params.reasoningEffort,
      contextWindow: params.contextWindow,
      maxOutputTokens: params.maxOutputTokens,
      signal: params.signal,
    })) {
      if (event.type === "error") {
        if (!emittedOutput && index < orderedProviders.length - 1) {
          attemptedErrors.push(`${providerName}: ${event.message}`);
          break;
        }

        const fallbackLabel = attemptedErrors.length > 0
          ? ` Fallback attempts: ${attemptedErrors.join(" | ")}`
          : "";
        yield {
          type: "error",
          message: `${event.message}${fallbackLabel}`,
        };
        return;
      }

      emittedOutput = true;
      yield event;
      if (event.type === "done") {
        return;
      }
    }
  }

  yield {
    type: "error",
    message:
      attemptedErrors.length > 0
        ? `All configured providers failed. ${attemptedErrors.join(" | ")}`
        : "All configured providers failed.",
  };
}

export async function runSingleTurnText(params: {
  modelRef: string;
  systemPrompt: string;
  input: string;
  signal?: AbortSignal;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  contextWindow?: number;
  maxOutputTokens?: number;
}): Promise<{ text: string; stopReason: string }> {
  let text = "";
  let stopReason = "stop";

  for await (const event of streamModelResponse({
    modelRef: params.modelRef,
    context: {
      systemPrompt: params.systemPrompt,
      messages: [
        {
          role: "user",
          content: params.input,
          timestamp: Date.now(),
        },
      ],
    },
    reasoningEffort: params.reasoningEffort,
    contextWindow: params.contextWindow,
    maxOutputTokens: params.maxOutputTokens,
    signal: params.signal,
  })) {
    if (event.type === "text_delta") {
      text += event.delta;
      continue;
    }
    if (event.type === "done") {
      text = event.text || text;
      stopReason = event.stopReason;
      continue;
    }
    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return { text, stopReason };
}
