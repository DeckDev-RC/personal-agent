import { create } from "zustand";
import {
  getModelId,
  getDefaultModelRef,
  normalizeProviderName,
  splitModelRef,
  type CanonicalProviderName,
} from "../../../src/types/model.js";

export type ThemeMode = "dark" | "light" | "system";

export type ProviderName = CanonicalProviderName;

type AppSettings = {
  provider: ProviderName;
  defaultModelRef: string;
  fastModelRef: string;
  reviewModelRef: string;
  defaultModel: string;
  fastModel: string;
  reviewModel: string;
  language: "pt-BR" | "en" | "es" | "de" | "zh-CN" | "zh-TW";
  themeMode: ThemeMode;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  planMode: boolean;
  fastMode: boolean;
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
  reasoningPolicyByTask: Record<string, "low" | "medium" | "high" | "xhigh">;
};

type SettingsState = {
  settings: AppSettings;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  applyTheme: (mode: ThemeMode) => void;
};

const api = () => (window as any).codexAgent;

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return mode;
}

function applyThemeToDOM(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  if (resolved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  provider: "openai-codex",
  defaultModelRef: getDefaultModelRef("openai-codex"),
  fastModelRef: "openai-codex/gpt-5.4-mini",
  reviewModelRef: getDefaultModelRef("openai-codex"),
  defaultModel: getDefaultModelRef("openai-codex"),
  fastModel: "openai-codex/gpt-5.4-mini",
  reviewModel: getDefaultModelRef("openai-codex"),
  language: "pt-BR",
  themeMode: "dark",
  reasoningEffort: "medium",
  planMode: false,
  fastMode: false,
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
};

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  const provider = normalizeProviderName(
    settings?.provider ??
      splitModelRef(settings?.defaultModelRef ?? settings?.defaultModel).provider,
  );
  const defaultModelRef = splitModelRef(getModelId(settings?.defaultModelRef ?? settings?.defaultModel), provider).modelRef;
  const fastModelRef = splitModelRef(getModelId(settings?.fastModelRef ?? settings?.fastModel), provider).modelRef;
  const reviewModelRef = splitModelRef(getModelId(settings?.reviewModelRef ?? settings?.reviewModel), provider).modelRef;

  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    provider,
    defaultModelRef,
    fastModelRef,
    reviewModelRef,
    defaultModel: defaultModelRef,
    fastModel: fastModelRef,
    reviewModel: reviewModelRef,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  loadSettings: async () => {
    try {
      const s = await api().store.getSettings();
      const settings = normalizeSettings(s);
      set({ settings, loaded: true });
      applyThemeToDOM(settings.themeMode);
    } catch {
      set({ loaded: true });
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const updated = normalizeSettings({ ...current, ...partial });
    set({ settings: updated });
    if (partial.themeMode !== undefined) {
      applyThemeToDOM(partial.themeMode);
    }
    await api().store.saveSettings(updated);
  },

  applyTheme: (mode) => {
    applyThemeToDOM(mode);
  },
}));

// Listen for system theme changes when in "system" mode
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    const { settings } = useSettingsStore.getState();
    if (settings.themeMode === "system") {
      applyThemeToDOM("system");
    }
  });
}
