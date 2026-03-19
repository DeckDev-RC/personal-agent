import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSettingsStore } from "../stores/settingsStore";

// Override the mock from setup.ts with spies we can track
const mockStore = (window as any).codexAgent.store;

describe("settingsStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStore.getSettings = vi.fn().mockResolvedValue({});
    mockStore.saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      settings: {
        provider: "openai-codex",
        defaultModelRef: "openai-codex/gpt-5.4",
        fastModelRef: "openai-codex/gpt-5.4-mini",
        reviewModelRef: "openai-codex/gpt-5.4",
        defaultModel: "openai-codex/gpt-5.4",
        fastModel: "openai-codex/gpt-5.4-mini",
        reviewModel: "openai-codex/gpt-5.4",
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
      },
      loaded: false,
    });
  });

  it("has correct default settings", () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.provider).toBe("openai-codex");
    expect(settings.defaultModelRef).toBe("openai-codex/gpt-5.4");
    expect(settings.defaultModel).toBe("openai-codex/gpt-5.4");
    expect(settings.language).toBe("pt-BR");
    expect(settings.themeMode).toBe("dark");
    expect(settings.reasoningEffort).toBe("medium");
    expect(settings.contextWindow).toBe(128000);
    expect(settings.maxOutputTokens).toBe(4096);
  });

  it("loads settings from API", async () => {
    mockStore.getSettings.mockResolvedValueOnce({ defaultModelRef: "openai-codex/gpt-5.4-mini", language: "en" });
    await useSettingsStore.getState().loadSettings();
    const { settings, loaded } = useSettingsStore.getState();
    expect(loaded).toBe(true);
    expect(settings.defaultModelRef).toBe("openai-codex/gpt-5.4-mini");
    expect(settings.language).toBe("en");
    expect(settings.provider).toBe("openai-codex");
  });

  it("updates settings and saves to API", async () => {
    await useSettingsStore.getState().updateSettings({ defaultModelRef: "openai-codex/gpt-5-nano" });
    const { settings } = useSettingsStore.getState();
    expect(settings.defaultModelRef).toBe("openai-codex/gpt-5-nano");
    expect(mockStore.saveSettings).toHaveBeenCalledTimes(1);
    expect(mockStore.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultModelRef: "openai-codex/gpt-5-nano" }),
    );
  });

  it("supports provider change", async () => {
    await useSettingsStore.getState().updateSettings({ provider: "anthropic" });
    expect(useSettingsStore.getState().settings.provider).toBe("anthropic");
    expect(useSettingsStore.getState().settings.defaultModelRef).toBe("anthropic/gpt-5.4");
  });

  it("supports all language codes", async () => {
    for (const lang of ["pt-BR", "en", "es", "de", "zh-CN", "zh-TW"] as const) {
      await useSettingsStore.getState().updateSettings({ language: lang });
      expect(useSettingsStore.getState().settings.language).toBe(lang);
    }
  });
});
