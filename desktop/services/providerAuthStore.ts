import fs from "node:fs/promises";
import path from "node:path";
import type { OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import {
  getDefaultModelRef,
  getProviderCatalogEntry,
  listProviderCatalog,
  normalizeProviderName,
  type CanonicalProviderName,
  type ProviderAuthStatus,
} from "../../src/types/model.js";
import {
  loadStoredOpenAICodexCreds,
  resolveOpenAICodexAccessToken,
  type StoredCodexCreds,
} from "../../src/auth/openaiCodexOAuth.js";
import { ensureDir } from "./v2Fs.js";
import { resolveDataRoot } from "./dataRoot.js";

type StoredProviderMap = {
  anthropic?: {
    apiKey: string;
    owner?: string;
    updatedAt: number;
  };
  ollama?: {
    baseUrl: string;
    owner?: string;
    updatedAt: number;
  };
};

export type ResolvedProviderCredential = {
  provider: CanonicalProviderName;
  authKind: "oauth" | "apiKey" | "local";
  apiKey?: string;
  baseUrl?: string;
  owner?: string;
  valid: boolean;
};

function authDir(): string {
  return path.join(resolveDataRoot(), "auth");
}

function providersPath(): string {
  return path.join(authDir(), "providers.json");
}

async function readProviderMap(): Promise<StoredProviderMap> {
  try {
    const raw = await fs.readFile(providersPath(), "utf8");
    return JSON.parse(raw) as StoredProviderMap;
  } catch {
    return {};
  }
}

async function writeProviderMap(next: StoredProviderMap): Promise<void> {
  await ensureDir(authDir());
  await fs.writeFile(providersPath(), JSON.stringify(next, null, 2), "utf8");
}

async function readOpenAICodexSummary(): Promise<StoredCodexCreds | null> {
  try {
    return await loadStoredOpenAICodexCreds();
  } catch {
    return null;
  }
}

export async function listProviderAuthStatuses(): Promise<ProviderAuthStatus[]> {
  const stored = await readProviderMap();
  const codex = await readOpenAICodexSummary();

  return listProviderCatalog().map((entry) => {
    if (entry.id === "openai-codex") {
      return {
        provider: entry.id,
        displayName: entry.displayName,
        authKind: entry.authKind,
        configured: Boolean(codex?.creds),
        authenticated: Boolean(codex?.creds),
        owner: codex?.email,
        message: codex?.creds ? "OAuth credentials available." : "OAuth login required.",
        lastValidatedAt:
          codex && typeof (codex.creds as { expires?: unknown }).expires === "number"
            ? ((codex.creds as { expires?: number }).expires as number)
            : undefined,
      } satisfies ProviderAuthStatus;
    }

    if (entry.id === "anthropic") {
      const record = stored.anthropic;
      return {
        provider: entry.id,
        displayName: entry.displayName,
        authKind: entry.authKind,
        configured: Boolean(record?.apiKey?.trim()),
        authenticated: Boolean(record?.apiKey?.trim()),
        owner: record?.owner,
        message: record?.apiKey?.trim() ? "API key configured." : "Anthropic API key required.",
        lastValidatedAt: record?.updatedAt,
      } satisfies ProviderAuthStatus;
    }

    const ollama = stored.ollama;
    return {
      provider: entry.id,
      displayName: entry.displayName,
      authKind: entry.authKind,
      configured: true,
      authenticated: true,
      baseUrl: ollama?.baseUrl?.trim() || "http://localhost:11434",
      owner: ollama?.owner,
      message: "Local runtime does not require login.",
      lastValidatedAt: ollama?.updatedAt,
    } satisfies ProviderAuthStatus;
  });
}

export async function getProviderAuthStatus(provider?: string | null): Promise<ProviderAuthStatus> {
  const normalized = normalizeProviderName(provider);
  const statuses = await listProviderAuthStatuses();
  const status = statuses.find((entry) => entry.provider === normalized);
  if (!status) {
    const fallback = getProviderCatalogEntry(normalized);
    return {
      provider: fallback.id,
      displayName: fallback.displayName,
      authKind: fallback.authKind,
      configured: false,
      authenticated: false,
      message: "Provider not configured.",
    };
  }
  return status;
}

export async function saveProviderAuthInput(params: {
  provider: string;
  apiKey?: string;
  owner?: string;
  baseUrl?: string;
}): Promise<ProviderAuthStatus> {
  const provider = normalizeProviderName(params.provider);
  if (provider === "openai-codex") {
    throw new Error("OpenAI Codex credentials must be created via OAuth login.");
  }

  const stored = await readProviderMap();
  const updatedAt = Date.now();

  if (provider === "anthropic") {
    const apiKey = params.apiKey?.trim();
    if (!apiKey) {
      throw new Error("Anthropic API key is required.");
    }
    stored.anthropic = {
      apiKey,
      owner: params.owner?.trim() || undefined,
      updatedAt,
    };
  } else if (provider === "ollama") {
    stored.ollama = {
      baseUrl: params.baseUrl?.trim() || "http://localhost:11434",
      owner: params.owner?.trim() || undefined,
      updatedAt,
    };
  }

  await writeProviderMap(stored);
  return await getProviderAuthStatus(provider);
}

export async function deleteProviderAuth(provider?: string | null): Promise<ProviderAuthStatus> {
  const normalized = normalizeProviderName(provider);
  if (normalized === "openai-codex") {
    throw new Error("Use the OAuth logout flow for OpenAI Codex.");
  }

  const stored = await readProviderMap();
  if (normalized === "anthropic") {
    delete stored.anthropic;
  } else if (normalized === "ollama") {
    delete stored.ollama;
  }
  await writeProviderMap(stored);
  return await getProviderAuthStatus(normalized);
}

export async function resolveProviderCredential(providerOrModelRef?: string | null): Promise<ResolvedProviderCredential> {
  const provider = normalizeProviderName(providerOrModelRef?.includes("/") ? providerOrModelRef.split("/")[0] : providerOrModelRef);

  if (provider === "openai-codex") {
    const stored = await loadStoredOpenAICodexCreds();
    const apiKey = await resolveOpenAICodexAccessToken({ creds: stored.creds });
    return {
      provider,
      authKind: "oauth",
      apiKey,
      owner: stored.email,
      valid: true,
    };
  }

  const stored = await readProviderMap();

  if (provider === "anthropic") {
    const apiKey = stored.anthropic?.apiKey?.trim();
    if (!apiKey) {
      throw new Error("Anthropic API key is not configured.");
    }
    return {
      provider,
      authKind: "apiKey",
      apiKey,
      owner: stored.anthropic?.owner,
      valid: true,
    };
  }

  return {
    provider,
    authKind: "local",
    baseUrl: stored.ollama?.baseUrl?.trim() || "http://localhost:11434",
    owner: stored.ollama?.owner,
    valid: true,
  };
}

export function getFallbackModelRefForProvider(provider?: string | null): string {
  return getDefaultModelRef(provider);
}
