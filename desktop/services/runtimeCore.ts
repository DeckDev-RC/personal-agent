import type { Context } from "@mariozechner/pi-ai";
import { resolveProviderCredential, type ResolvedProviderCredential } from "./providerAuthStore.js";
import {
  resolveProviderModel,
  type LLMProvider,
  type StreamEvent,
} from "./providers/index.js";

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
  const resolved = await resolveModelExecutionContext(params.modelRef);
  yield* resolved.provider.stream({
    credential: resolved.credential,
    model: resolved.model,
    context: params.context,
    reasoningEffort: params.reasoningEffort,
    contextWindow: params.contextWindow,
    maxOutputTokens: params.maxOutputTokens,
    signal: params.signal,
  });
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
