export type CanonicalProviderName =
  | "openai-codex"
  | "openai"
  | "anthropic"
  | "ollama"
  | "google-gemini"
  | "mistral"
  | "groq"
  | "deepseek"
  | "together"
  | "openrouter"
  | "xai"
  | "cohere"
  | "perplexity";
export type ProviderName = CanonicalProviderName;
export type ModelRef = `${CanonicalProviderName}/${string}`;

export type ProviderAuthKind = "oauth" | "apiKey" | "local";
export type ProviderCapabilityFlag =
  | "streaming"
  | "tool_use"
  | "reasoning"
  | "vision"
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
  defaultBaseUrl?: string;
  apiKeyPlaceholder?: string;
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
  validationStatus?: "untested" | "success" | "error";
  validationMessage?: string;
};

const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "openai-codex",
    aliases: ["openai-codex"],
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
    id: "openai",
    aliases: ["openai"],
    displayName: "OpenAI API",
    authKind: "apiKey",
    defaultModelId: "gpt-4.1",
    supportedModelIds: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o4-mini",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "vision", "api_key"],
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-proj-...",
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
    capabilityFlags: ["streaming", "tool_use", "reasoning", "vision", "api_key"],
    defaultBaseUrl: "https://api.anthropic.com",
    apiKeyPlaceholder: "sk-ant-...",
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
    defaultBaseUrl: "http://localhost:11434",
  },
  {
    id: "google-gemini",
    aliases: ["google-gemini"],
    displayName: "Google Gemini",
    authKind: "apiKey",
    defaultModelId: "gemini-2.5-flash",
    supportedModelIds: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "vision", "api_key"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyPlaceholder: "AIza...",
  },
  {
    id: "mistral",
    aliases: ["mistral"],
    displayName: "Mistral AI",
    authKind: "apiKey",
    defaultModelId: "mistral-large-latest",
    supportedModelIds: [
      "mistral-large-latest",
      "codestral-latest",
      "ministral-8b-latest",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.mistral.ai/v1",
    apiKeyPlaceholder: "mistral-...",
  },
  {
    id: "groq",
    aliases: ["groq"],
    displayName: "Groq",
    authKind: "apiKey",
    defaultModelId: "llama-3.3-70b-versatile",
    supportedModelIds: [
      "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768",
      "qwen/qwen3-32b",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    apiKeyPlaceholder: "gsk_...",
  },
  {
    id: "deepseek",
    aliases: ["deepseek"],
    displayName: "DeepSeek",
    authKind: "apiKey",
    defaultModelId: "deepseek-chat",
    supportedModelIds: [
      "deepseek-chat",
      "deepseek-reasoner",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.deepseek.com",
    apiKeyPlaceholder: "sk-...",
  },
  {
    id: "together",
    aliases: ["together"],
    displayName: "Together AI",
    authKind: "apiKey",
    defaultModelId: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    supportedModelIds: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-V3",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.together.xyz/v1",
    apiKeyPlaceholder: "tsk_...",
  },
  {
    id: "openrouter",
    aliases: ["openrouter"],
    displayName: "OpenRouter",
    authKind: "apiKey",
    defaultModelId: "openai/gpt-4.1-mini",
    supportedModelIds: [
      "openai/gpt-4.1-mini",
      "anthropic/claude-sonnet-4.5",
      "google/gemini-2.5-flash",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyPlaceholder: "sk-or-...",
  },
  {
    id: "xai",
    aliases: ["xai"],
    displayName: "xAI",
    authKind: "apiKey",
    defaultModelId: "grok-3-mini",
    supportedModelIds: [
      "grok-3-mini",
      "grok-3",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.x.ai/v1",
    apiKeyPlaceholder: "xai-...",
  },
  {
    id: "cohere",
    aliases: ["cohere"],
    displayName: "Cohere",
    authKind: "apiKey",
    defaultModelId: "command-r-plus",
    supportedModelIds: [
      "command-r-plus",
      "command-r7b-12-2024",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.cohere.com/compatibility/v1",
    apiKeyPlaceholder: "co-...",
  },
  {
    id: "perplexity",
    aliases: ["perplexity"],
    displayName: "Perplexity",
    authKind: "apiKey",
    defaultModelId: "sonar",
    supportedModelIds: [
      "sonar",
      "sonar-pro",
      "sonar-reasoning",
    ],
    capabilityFlags: ["streaming", "tool_use", "reasoning", "api_key"],
    defaultBaseUrl: "https://api.perplexity.ai",
    apiKeyPlaceholder: "pplx-...",
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

export function getProviderBaseUrl(provider?: string | null): string | undefined {
  return getProviderCatalogEntry(provider).defaultBaseUrl;
}

export function getProviderApiKeyPlaceholder(provider?: string | null): string | undefined {
  return getProviderCatalogEntry(provider).apiKeyPlaceholder;
}

export function providerSupportsCapability(
  provider: string | null | undefined,
  capability: ProviderCapabilityFlag,
): boolean {
  return getProviderCatalogEntry(provider).capabilityFlags.includes(capability);
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
  if (
    normalized.startsWith("gpt-4.1") ||
    normalized.startsWith("gpt-4o") ||
    normalized === "o3" ||
    normalized.startsWith("o3-") ||
    normalized === "o4-mini" ||
    normalized.startsWith("o4-")
  ) {
    return "openai";
  }
  if (normalized.startsWith("claude")) {
    return "anthropic";
  }
  if (normalized.startsWith("gemini")) {
    return "google-gemini";
  }
  if (
    normalized.startsWith("mistral-large") ||
    normalized.startsWith("codestral") ||
    normalized.startsWith("ministral")
  ) {
    return "mistral";
  }
  if (
    normalized === "deepseek-chat" ||
    normalized === "deepseek-reasoner" ||
    normalized === "deepseek-v3" ||
    normalized === "deepseek-r1"
  ) {
    return "deepseek";
  }
  if (normalized.startsWith("sonar")) {
    return "perplexity";
  }
  if (normalized.startsWith("grok")) {
    return "xai";
  }
  if (normalized.startsWith("command-r")) {
    return "cohere";
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
