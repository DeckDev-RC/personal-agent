import {
  getDefaultModelRef,
  getModelId,
  normalizeProviderName,
  splitModelRef,
  type CanonicalProviderName,
} from "../types/model.js";
import type { PersonaConfig } from "../types/persona.js";
import type { ProactivitySettings } from "../types/proactive.js";

export type ThemeMode = "dark" | "light" | "system";
export type AppLanguage = "pt-BR" | "en" | "es" | "de" | "zh-CN" | "zh-TW";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type ApprovalMode = "manual" | "free";

export type AppSettings = {
  provider: CanonicalProviderName;
  fallbackProviders: CanonicalProviderName[];
  defaultModelRef: string;
  fastModelRef: string;
  reviewModelRef: string;
  defaultModel: string;
  fastModel: string;
  reviewModel: string;
  language: AppLanguage;
  themeMode: ThemeMode;
  reasoningEffort: ReasoningEffort;
  approvalMode: ApprovalMode;
  planMode: boolean;
  fastMode: boolean;
  onboardingCompleted: boolean;
  globalSystemPrompt: string;
  contextWindow: number;
  compactAtTokens: number;
  maxOutputTokens: number;
  webSearch: {
    endpoint: string;
    apiKey: string;
    timeoutMs: number;
    maxResults: number;
  };
  reasoningPolicyByTask: Record<string, ReasoningEffort>;
  proactivity: ProactivitySettings;
  persona?: PersonaConfig;
};

export const DEFAULT_PROACTIVITY_SETTINGS: ProactivitySettings = {
  enabled: true,
  dashboard: true,
  chat: true,
  frequency: "balanced",
  suggestionTypes: {
    tasks: true,
    routines: true,
    context: true,
    communication: true,
  },
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  provider: "openai-codex",
  fallbackProviders: [],
  defaultModelRef: getDefaultModelRef("openai-codex"),
  fastModelRef: "openai-codex/gpt-5.4-mini",
  reviewModelRef: getDefaultModelRef("openai-codex"),
  defaultModel: getDefaultModelRef("openai-codex"),
  fastModel: "openai-codex/gpt-5.4-mini",
  reviewModel: getDefaultModelRef("openai-codex"),
  language: "pt-BR",
  themeMode: "dark",
  reasoningEffort: "medium",
  approvalMode: "manual",
  planMode: false,
  fastMode: false,
  onboardingCompleted: false,
  globalSystemPrompt: "",
  contextWindow: 128000,
  compactAtTokens: 96000,
  maxOutputTokens: 4096,
  webSearch: {
    endpoint: "",
    apiKey: "",
    timeoutMs: 15000,
    maxResults: 5,
  },
  reasoningPolicyByTask: {
    chat_simple: "low",
    plan_research: "medium",
    code_read: "medium",
    code_change: "high",
    command_exec: "medium",
    review_fix: "high",
    tool_invoke: "medium",
  },
  proactivity: DEFAULT_PROACTIVITY_SETTINGS,
};

export function sanitizeFallbackProviders(
  provider: string | null | undefined,
  fallbackProviders: readonly string[] | null | undefined,
): CanonicalProviderName[] {
  const activeProvider = normalizeProviderName(provider);
  const seen = new Set<CanonicalProviderName>();

  return (fallbackProviders ?? [])
    .map((item) => normalizeProviderName(item))
    .filter((item) => item !== activeProvider)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

export function normalizeAppSettings(settings?: Partial<AppSettings> | null): AppSettings {
  const provider = normalizeProviderName(
    settings?.provider ??
      splitModelRef(settings?.defaultModelRef ?? settings?.defaultModel).provider,
  );
  const defaultModelRef =
    settings?.defaultModelRef || settings?.defaultModel
      ? splitModelRef(
          getModelId(settings?.defaultModelRef ?? settings?.defaultModel),
          provider,
        ).modelRef
      : getDefaultModelRef(provider);
  const fastModelRef =
    settings?.fastModelRef || settings?.fastModel
      ? splitModelRef(
          getModelId(settings?.fastModelRef ?? settings?.fastModel),
          provider,
        ).modelRef
      : defaultModelRef;
  const reviewModelRef =
    settings?.reviewModelRef || settings?.reviewModel
      ? splitModelRef(
          getModelId(settings?.reviewModelRef ?? settings?.reviewModel),
          provider,
        ).modelRef
      : defaultModelRef;

  return {
    ...DEFAULT_APP_SETTINGS,
    ...(settings ?? {}),
    provider,
    fallbackProviders: sanitizeFallbackProviders(
      provider,
      Array.isArray(settings?.fallbackProviders)
        ? settings?.fallbackProviders
        : DEFAULT_APP_SETTINGS.fallbackProviders,
    ),
    defaultModelRef,
    fastModelRef,
    reviewModelRef,
    defaultModel: defaultModelRef,
    fastModel: fastModelRef,
    reviewModel: reviewModelRef,
    reasoningPolicyByTask: {
      ...DEFAULT_APP_SETTINGS.reasoningPolicyByTask,
      ...(settings?.reasoningPolicyByTask ?? {}),
    },
    proactivity: {
      ...DEFAULT_PROACTIVITY_SETTINGS,
      ...(settings?.proactivity ?? {}),
      suggestionTypes: {
        ...DEFAULT_PROACTIVITY_SETTINGS.suggestionTypes,
        ...(settings?.proactivity?.suggestionTypes ?? {}),
      },
    },
  };
}
