import {
  loadStoredOpenAICodexCreds,
  resolveOpenAICodexAccessToken,
} from "../../src/auth/openaiCodexOAuth.js";
import { splitModelRef, type ProviderAuthStatus } from "../../src/types/model.js";
import { getAllStatuses } from "./mcpManager.js";
import { listProviderAuthStatuses } from "./providerAuthStore.js";
import { getSettingsV2 } from "./v2EntityStore.js";

export type UsageWindowStatus = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetAt?: number;
};

export type RuntimeStatus = {
  activeProvider: string;
  activeModelRef: string;
  authenticated: boolean;
  email?: string;
  tokenExpiresAt?: number;
  modelContextWindow: number;
  maxOutputTokens: number;
  mcpConnectedCount: number;
  mcpEnabledCount: number;
  usagePlan?: string;
  usageWindows: UsageWindowStatus[];
  usageError?: string;
  providerStatuses: ProviderAuthStatus[];
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

async function fetchCodexUsage(token: string, accountId?: string): Promise<{
  plan?: string;
  windows: UsageWindowStatus[];
  error?: string;
}> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "CodexBar",
    Accept: "application/json",
  };
  if (accountId) {
    headers["ChatGPT-Account-Id"] = accountId;
  }

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    return {
      plan: undefined,
      windows: [],
      error: response.status === 401 || response.status === 403 ? "Token expired" : `HTTP ${response.status}`,
    };
  }

  const data = (await response.json()) as {
    plan_type?: string;
    credits?: { balance?: number | string | null };
    rate_limit?: {
      primary_window?: {
        limit_window_seconds?: number;
        used_percent?: number;
        reset_at?: number;
      };
      secondary_window?: {
        limit_window_seconds?: number;
        used_percent?: number;
        reset_at?: number;
      };
    };
  };

  const windows: UsageWindowStatus[] = [];
  const primary = data.rate_limit?.primary_window;
  const secondary = data.rate_limit?.secondary_window;

  if (primary) {
    const hours = Math.round((primary.limit_window_seconds || 10800) / 3600);
    const usedPercent = clampPercent(primary.used_percent || 0);
    windows.push({
      label: `${hours}h`,
      usedPercent,
      remainingPercent: clampPercent(100 - usedPercent),
      resetAt: primary.reset_at ? primary.reset_at * 1000 : undefined,
    });
  }

  if (secondary) {
    const hours = Math.round((secondary.limit_window_seconds || 86400) / 3600);
    const usedPercent = clampPercent(secondary.used_percent || 0);
    windows.push({
      label: hours >= 24 ? (hours >= 168 ? "Week" : "Day") : `${hours}h`,
      usedPercent,
      remainingPercent: clampPercent(100 - usedPercent),
      resetAt: secondary.reset_at ? secondary.reset_at * 1000 : undefined,
    });
  }

  let plan = data.plan_type;
  if (data.credits?.balance !== undefined && data.credits.balance !== null) {
    const numericBalance =
      typeof data.credits.balance === "number"
        ? data.credits.balance
        : Number.parseFloat(String(data.credits.balance)) || 0;
    plan = plan ? `${plan} ($${numericBalance.toFixed(2)})` : `$${numericBalance.toFixed(2)}`;
  }

  return { plan, windows };
}

export async function getRuntimeStatus(params?: {
  enabledMcpCount?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}): Promise<RuntimeStatus> {
  const settings = await getSettingsV2();
  const activeModelRef = settings.defaultModelRef;
  const activeProvider = splitModelRef(activeModelRef).provider;
  const modelContextWindow = params?.contextWindow ?? settings.contextWindow;
  const maxOutputTokens = params?.maxOutputTokens ?? settings.maxOutputTokens;
  const mcpStatuses = getAllStatuses();
  const mcpConnectedCount = mcpStatuses.filter((status) => status.connected).length;
  const mcpEnabledCount = params?.enabledMcpCount ?? mcpStatuses.length;
  const providerStatuses = await listProviderAuthStatuses();
  const activeStatus =
    providerStatuses.find((status) => status.provider === activeProvider) ??
    ({
      provider: activeProvider,
      displayName: activeProvider,
      authKind: "local",
      configured: false,
      authenticated: false,
    } satisfies ProviderAuthStatus);

  let usagePlan: string | undefined;
  let usageWindows: UsageWindowStatus[] = [];
  let usageError: string | undefined;
  let tokenExpiresAt: number | undefined;

  if (activeProvider === "openai-codex" && activeStatus.authenticated) {
    try {
      const stored = await loadStoredOpenAICodexCreds();
      const token = await resolveOpenAICodexAccessToken({ creds: stored.creds });
      const usage = await fetchCodexUsage(token, (stored.creds as { accountId?: string }).accountId);
      usagePlan = usage.plan;
      usageWindows = usage.windows;
      usageError = usage.error;
      tokenExpiresAt = (stored.creds as { expires?: number }).expires;
    } catch {
      usageError = "Failed to refresh OpenAI Codex usage.";
    }
  }

  return {
    activeProvider,
    activeModelRef,
    authenticated: activeStatus.authenticated,
    email: activeStatus.owner,
    tokenExpiresAt,
    modelContextWindow,
    maxOutputTokens,
    mcpConnectedCount,
    mcpEnabledCount,
    usagePlan,
    usageWindows,
    usageError,
    providerStatuses,
  };
}
