import type { Context, AssistantMessage } from "@mariozechner/pi-ai";
import type {
  CanonicalProviderName,
  ProviderAuthKind,
  ProviderCapabilityFlag,
} from "../../../src/types/model.js";

export type ProviderRuntimeCredential = {
  provider: CanonicalProviderName;
  authKind: ProviderAuthKind;
  apiKey?: string;
  baseUrl?: string;
  owner?: string;
  valid: boolean;
};

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "toolcall_end"; toolCallId: string; toolName: string; args: Record<string, any> }
  | { type: "done"; text: string; stopReason: string; raw: AssistantMessage }
  | { type: "error"; message: string };

export type LLMProviderParams = {
  credential: ProviderRuntimeCredential;
  model: string;
  context: Context;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  contextWindow?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export interface LLMProvider {
  name: CanonicalProviderName;
  displayName: string;
  authKind: ProviderAuthKind;
  capabilityFlags: ProviderCapabilityFlag[];
  defaultModel: string;
  supportedModels: string[];
  stream(params: LLMProviderParams): AsyncGenerator<StreamEvent>;
}
