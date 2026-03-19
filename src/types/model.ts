export type CanonicalProviderName = "openai-codex" | "anthropic" | "ollama";
export type ProviderName = CanonicalProviderName | "openai";
export type ModelRef = `${CanonicalProviderName}/${string}`;

export type ProviderAuthKind = "oauth" | "apiKey" | "local";
export type ProviderCapabilityFlag =
  | "streaming"
  | "tool_use"
  | "reasoning"
  | "oauth"
  | "api_key"
  | "local_runtime";

export type ProviderCatalogEntry = {
  id: CanonicalProviderName;
  aliases: ProviderName[];
  displayName: string;
  authKind: ProviderAuthKind;
  defaultModelId: string;
  supportedModelIds: string[];
  capabilityFlags: ProviderCapabilityFlag[];
};

export type ProviderAuthStatus = {
  provider: CanonicalProviderName;
  displayName: string;
  authKind: ProviderAuthKind;
  configured: boolean;
  authenticated: boolean;
  owner?: string;
  baseUrl?: string;
  message?: string;
  lastValidatedAt?: number;
};

const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "openai-codex",
    aliases: ["openai-codex", "openai"],
    displayName: "OpenAI Codex",
    authKind: "oauth",
    defaultModelId: "gpt-5.4",
    supportedModelIds: [
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
    capabilityFlags: ["streaming", "tool_use", "reasoning", "oauth"],
  },
  {
    id: "anthropic",
    aliases: ["anthropic"],
    displayName: "Anthropic Claude",
    authKind: "apiKey",
    defaultModelId: "claude-sonnet-4-6",
    supportedModelIds: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250514",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
  },
  {
    id: "ollama",
    aliases: ["ollama"],
    displayName: "Ollama (Local)",
    authKind: "local",
    defaultModelId: "llama3.3",
    supportedModelIds: [
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
    capabilityFlags: ["streaming", "tool_use", "reasoning", "local_runtime"],
  },
];

function findCatalogEntry(provider: string): ProviderCatalogEntry | undefined {
  const normalized = provider.trim().toLowerCase();
  return PROVIDER_CATALOG.find((entry) => entry.aliases.includes(normalized as ProviderName));
}

export function listProviderCatalog(): ProviderCatalogEntry[] {
  return [...PROVIDER_CATALOG];
}

export function normalizeProviderName(provider?: string | null): CanonicalProviderName {
  const entry = provider ? findCatalogEntry(provider) : undefined;
  return entry?.id ?? "openai-codex";
}

export function getProviderCatalogEntry(provider?: string | null): ProviderCatalogEntry {
  const normalized = normalizeProviderName(provider);
  const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === normalized);
  if (!entry) {
    throw new Error(`Unknown provider: ${provider ?? "undefined"}`);
  }
  return entry;
}

export function getProviderDisplayName(provider?: string | null): string {
  return getProviderCatalogEntry(provider).displayName;
}

export function getSupportedModelIds(provider?: string | null): string[] {
  return [...getProviderCatalogEntry(provider).supportedModelIds];
}

export function buildModelRef(provider: CanonicalProviderName, model: string): ModelRef {
  const normalizedModel = model.trim().replace(/^\/+|\/+$/g, "");
  return `${provider}/${normalizedModel}` as ModelRef;
}

export function isCanonicalModelRef(modelRef?: string | null): modelRef is ModelRef {
  if (!modelRef) {
    return false;
  }

  const separator = modelRef.indexOf("/");
  if (separator <= 0) {
    return false;
  }

  const provider = modelRef.slice(0, separator);
  const model = modelRef.slice(separator + 1);
  return Boolean(model.trim()) && listProviderCatalog().some((entry) => entry.id === provider);
}

export function inferProviderFromModel(model?: string | null): CanonicalProviderName {
  const normalized = String(model ?? "").trim().toLowerCase();
  if (!normalized) {
    return "openai-codex";
  }
  if (normalized.startsWith("claude")) {
    return "anthropic";
  }
  if (
    normalized.startsWith("llama") ||
    normalized.startsWith("codellama") ||
    normalized.startsWith("deepseek") ||
    normalized.startsWith("qwen") ||
    normalized.startsWith("mistral") ||
    normalized.startsWith("mixtral") ||
    normalized.startsWith("phi") ||
    normalized.startsWith("gemma")
  ) {
    return "ollama";
  }
  return "openai-codex";
}

export function splitModelRef(
  modelRefOrModel?: string | null,
  providerHint?: string | null,
): { provider: CanonicalProviderName; model: string; modelRef: ModelRef } {
  const raw = String(modelRefOrModel ?? "").trim();
  if (!raw) {
    const provider = normalizeProviderName(providerHint);
    const model = getProviderCatalogEntry(provider).defaultModelId;
    return {
      provider,
      model,
      modelRef: buildModelRef(provider, model),
    };
  }

  if (isCanonicalModelRef(raw)) {
    const separator = raw.indexOf("/");
    return {
      provider: normalizeProviderName(raw.slice(0, separator)),
      model: raw.slice(separator + 1),
      modelRef: raw,
    };
  }

  const provider = providerHint
    ? normalizeProviderName(providerHint)
    : inferProviderFromModel(raw);
  return {
    provider,
    model: raw,
    modelRef: buildModelRef(provider, raw),
  };
}

export function getModelId(modelRefOrModel?: string | null, providerHint?: string | null): string {
  return splitModelRef(modelRefOrModel, providerHint).model;
}

export function getDefaultModelRef(provider?: string | null): ModelRef {
  const entry = getProviderCatalogEntry(provider);
  return buildModelRef(entry.id, entry.defaultModelId);
}
