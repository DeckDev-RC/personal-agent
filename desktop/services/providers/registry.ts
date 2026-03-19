import {
  buildModelRef,
  getProviderCatalogEntry,
  listProviderCatalog,
  normalizeProviderName,
  splitModelRef,
  type CanonicalProviderName,
  type ModelRef,
  type ProviderCatalogEntry,
} from "../../../src/types/model.js";
import type { LLMProvider } from "./types.js";
import { anthropicProvider } from "./anthropic.js";
import { openaiProvider } from "./openai.js";
import { ollamaProvider } from "./ollama.js";

export type ProviderRegistryEntry = ProviderCatalogEntry & {
  runtime: LLMProvider;
};

const PROVIDER_RUNTIME_MAP = new Map<CanonicalProviderName, LLMProvider>([
  [openaiProvider.name, openaiProvider],
  [anthropicProvider.name, anthropicProvider],
  [ollamaProvider.name, ollamaProvider],
]);

export function listProviderRegistry(): ProviderRegistryEntry[] {
  return listProviderCatalog().map((entry) => ({
    ...entry,
    runtime: getProvider(entry.id),
  }));
}

export function getProvider(provider?: string | null): LLMProvider {
  const normalized = normalizeProviderName(provider);
  const runtime = PROVIDER_RUNTIME_MAP.get(normalized);
  if (!runtime) {
    throw new Error(`Unknown provider: ${provider ?? "undefined"}`);
  }
  return runtime;
}

export function resolveProviderModel(modelRefOrModel?: string | null, providerHint?: string | null): {
  providerName: CanonicalProviderName;
  model: string;
  modelRef: ModelRef;
  provider: LLMProvider;
} {
  const resolved = splitModelRef(modelRefOrModel, providerHint);
  return {
    providerName: resolved.provider,
    model: resolved.model,
    modelRef: resolved.modelRef,
    provider: getProvider(resolved.provider),
  };
}

export function isProviderModelSupported(modelRefOrModel?: string | null, providerHint?: string | null): boolean {
  const resolved = splitModelRef(modelRefOrModel, providerHint);
  const entry = getProviderCatalogEntry(resolved.provider);
  return entry.supportedModelIds.includes(resolved.model);
}

export function normalizeModelRef(modelRefOrModel?: string | null, providerHint?: string | null): ModelRef {
  return resolveProviderModel(modelRefOrModel, providerHint).modelRef;
}

export function buildProviderModelRef(provider: CanonicalProviderName, model: string): ModelRef {
  return buildModelRef(provider, model);
}
