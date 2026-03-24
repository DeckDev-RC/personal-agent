import type { Context } from "@mariozechner/pi-ai";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getDefaultModelRef,
  getProviderBaseUrl,
  getProviderCatalogEntry,
  listProviderCatalog,
  normalizeProviderName,
  splitModelRef,
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
import { getProvider } from "./providers/registry.js";

type StoredProviderRecord = {
  apiKey?: string;
  baseUrl?: string;
  owner?: string;
  updatedAt: number;
  lastValidatedAt?: number;
  lastValidationOk?: boolean;
  lastValidationMessage?: string;
};

type StoredProviderMap = Partial<Record<CanonicalProviderName, StoredProviderRecord>>;

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

function buildLocalStatus(provider: CanonicalProviderName, record?: StoredProviderRecord): ProviderAuthStatus {
  const entry = getProviderCatalogEntry(provider);
  const validationStatus =
    typeof record?.lastValidationOk === "boolean"
      ? (record.lastValidationOk ? "success" : "error")
      : "untested";
  const validationMessage = record?.lastValidationMessage;
  return {
    provider: entry.id,
    displayName: entry.displayName,
    authKind: entry.authKind,
    configured: true,
    authenticated: true,
    baseUrl: record?.baseUrl?.trim() || entry.defaultBaseUrl,
    owner: record?.owner,
    message: validationMessage ?? "Local runtime does not require login.",
    lastValidatedAt: record?.lastValidatedAt,
    validationStatus,
    validationMessage,
  };
}

function buildApiKeyStatus(provider: CanonicalProviderName, record?: StoredProviderRecord): ProviderAuthStatus {
  const entry = getProviderCatalogEntry(provider);
  const configured = Boolean(record?.apiKey?.trim());
  const validationStatus =
    !configured
      ? "untested"
      : typeof record?.lastValidationOk === "boolean"
        ? (record.lastValidationOk ? "success" : "error")
        : "untested";
  const validationMessage = record?.lastValidationMessage;
  return {
    provider: entry.id,
    displayName: entry.displayName,
    authKind: entry.authKind,
    configured,
    authenticated: configured,
    owner: record?.owner,
    baseUrl: record?.baseUrl?.trim() || entry.defaultBaseUrl,
    message: configured ? (validationMessage ?? "API key configured.") : `${entry.displayName} API key required.`,
    lastValidatedAt: record?.lastValidatedAt,
    validationStatus,
    validationMessage,
  };
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
        validationStatus: codex?.creds ? "untested" : "untested",
      } satisfies ProviderAuthStatus;
    }

    const record = stored[entry.id];
    if (entry.authKind === "local") {
      return buildLocalStatus(entry.id, record);
    }

    return buildApiKeyStatus(entry.id, record);
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
      baseUrl: fallback.defaultBaseUrl,
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
  const entry = getProviderCatalogEntry(provider);
  if (provider === "openai-codex") {
    throw new Error("OpenAI Codex credentials must be created via OAuth login.");
  }

  const stored = await readProviderMap();
  const updatedAt = Date.now();

  if (entry.authKind === "apiKey") {
    const apiKey = params.apiKey?.trim();
    if (!apiKey) {
      throw new Error(`${entry.displayName} API key is required.`);
    }
    stored[provider] = {
      apiKey,
      baseUrl: params.baseUrl?.trim() || getProviderBaseUrl(provider),
      owner: params.owner?.trim() || undefined,
      updatedAt,
      lastValidatedAt: undefined,
      lastValidationOk: undefined,
      lastValidationMessage: undefined,
    };
  } else if (entry.authKind === "local") {
    stored[provider] = {
      baseUrl: params.baseUrl?.trim() || getProviderBaseUrl(provider),
      owner: params.owner?.trim() || undefined,
      updatedAt,
      lastValidatedAt: undefined,
      lastValidationOk: undefined,
      lastValidationMessage: undefined,
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
  delete stored[normalized];
  await writeProviderMap(stored);
  return await getProviderAuthStatus(normalized);
}

export async function resolveProviderCredential(providerOrModelRef?: string | null): Promise<ResolvedProviderCredential> {
  const provider = normalizeProviderName(providerOrModelRef?.includes("/") ? providerOrModelRef.split("/")[0] : providerOrModelRef);
  const entry = getProviderCatalogEntry(provider);

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
  const record = stored[provider];

  if (entry.authKind === "apiKey") {
    const apiKey = record?.apiKey?.trim();
    if (!apiKey) {
      throw new Error(`${entry.displayName} API key is not configured.`);
    }
    return {
      provider,
      authKind: "apiKey",
      apiKey,
      baseUrl: record?.baseUrl?.trim() || entry.defaultBaseUrl,
      owner: record?.owner,
      valid: true,
    };
  }

  return {
    provider,
    authKind: "local",
    baseUrl: record?.baseUrl?.trim() || entry.defaultBaseUrl,
    owner: record?.owner,
    valid: true,
  };
}

export function getFallbackModelRefForProvider(provider?: string | null): string {
  return getDefaultModelRef(provider);
}

async function updateStoredValidationResult(
  provider: CanonicalProviderName,
  params: {
    ok: boolean;
    message: string;
    testedAt: number;
  },
): Promise<void> {
  if (provider === "openai-codex") {
    return;
  }

  const stored = await readProviderMap();
  const entry = getProviderCatalogEntry(provider);
  const existing = stored[provider];
  if (!existing && entry.authKind !== "local") {
    return;
  }

  stored[provider] = {
    ...(existing ?? { updatedAt: params.testedAt }),
    lastValidatedAt: params.testedAt,
    lastValidationOk: params.ok,
    lastValidationMessage: params.message,
  };
  await writeProviderMap(stored);
}

function buildTestStatus(
  baseline: ProviderAuthStatus,
  params: {
    ok: boolean;
    message: string;
    testedAt: number;
  },
): ProviderAuthStatus {
  return {
    ...baseline,
    message: params.message,
    lastValidatedAt: params.testedAt,
    validationStatus: params.ok ? "success" : "error",
    validationMessage: params.message,
  };
}

async function resolveCredentialForConnectionTest(params: {
  provider: CanonicalProviderName;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ credential: ResolvedProviderCredential; usedStoredConfig: boolean }> {
  const provider = params.provider;
  const entry = getProviderCatalogEntry(provider);
  const apiKeyOverride = params.apiKey?.trim();
  const baseUrlOverride = params.baseUrl?.trim();

  if (!apiKeyOverride && !baseUrlOverride) {
    return {
      credential: await resolveProviderCredential(provider),
      usedStoredConfig: true,
    };
  }

  if (provider === "openai-codex") {
    throw new Error("OpenAI Codex connection tests require an active OAuth login.");
  }

  const stored = await readProviderMap();
  const existing = stored[provider];

  if (entry.authKind === "apiKey") {
    const apiKey = apiKeyOverride || existing?.apiKey?.trim();
    if (!apiKey) {
      throw new Error(`${entry.displayName} API key is required.`);
    }
    return {
      credential: {
        provider,
        authKind: "apiKey",
        apiKey,
        baseUrl: baseUrlOverride || existing?.baseUrl?.trim() || entry.defaultBaseUrl,
        owner: existing?.owner,
        valid: true,
      },
      usedStoredConfig: false,
    };
  }

  return {
    credential: {
      provider,
      authKind: "local",
      baseUrl: baseUrlOverride || existing?.baseUrl?.trim() || entry.defaultBaseUrl,
      owner: existing?.owner,
      valid: true,
    },
    usedStoredConfig: false,
  };
}

async function probeProviderConnection(params: {
  provider: CanonicalProviderName;
  credential: ResolvedProviderCredential;
  modelRef?: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = Math.min(30_000, Math.max(3_000, params.timeoutMs ?? 12_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const providerRuntime = getProvider(params.provider);
  const resolvedModel = splitModelRef(params.modelRef ?? getDefaultModelRef(params.provider), params.provider);
  const context: Context = {
    messages: [
      {
        role: "user",
        content: "Reply with the single word OK.",
        timestamp: Date.now(),
      },
    ],
  };

  try {
    for await (const event of providerRuntime.stream({
      credential: params.credential,
      model: resolvedModel.model,
      context,
      reasoningEffort: "low",
      contextWindow: 4_096,
      maxOutputTokens: 16,
      signal: controller.signal,
    })) {
      if (event.type === "error") {
        throw new Error(event.message);
      }
      if (event.type === "done") {
        return;
      }
    }

    if (controller.signal.aborted) {
      throw new Error(`Connection test timed out after ${timeoutMs}ms.`);
    }

    throw new Error("Provider did not return a completion for the connection test.");
  } finally {
    clearTimeout(timer);
  }
}

export async function testProviderConnection(params: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  modelRef?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: ProviderAuthStatus; message: string }> {
  const provider = normalizeProviderName(params.provider);
  const baseline = await getProviderAuthStatus(provider);
  const entry = getProviderCatalogEntry(provider);
  const testedAt = Date.now();

  try {
    const { credential, usedStoredConfig } = await resolveCredentialForConnectionTest({
      provider,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
    });

    await probeProviderConnection({
      provider,
      credential,
      modelRef: params.modelRef,
      timeoutMs: params.timeoutMs,
    });

    const message = `${entry.displayName} connection verified.`;
    if (usedStoredConfig) {
      await updateStoredValidationResult(provider, { ok: true, message, testedAt });
      return {
        ok: true,
        status: await getProviderAuthStatus(provider),
        message,
      };
    }

    return {
      ok: true,
      status: buildTestStatus(baseline, { ok: true, message, testedAt }),
      message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!params.apiKey?.trim() && !params.baseUrl?.trim()) {
      await updateStoredValidationResult(provider, { ok: false, message, testedAt });
      return {
        ok: false,
        status: await getProviderAuthStatus(provider),
        message,
      };
    }

    return {
      ok: false,
      status: buildTestStatus(baseline, { ok: false, message, testedAt }),
      message,
    };
  }
}
