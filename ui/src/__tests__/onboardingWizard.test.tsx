import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../i18n";
import OnboardingWizard from "../components/onboarding/OnboardingWizard";
import { useAuthStore } from "../stores/authStore";
import { useContextStore } from "../stores/contextStore";
import { useSettingsStore } from "../stores/settingsStore";

const mockStore = (window as any).codexAgent.store;
const mockAuth = (window as any).codexAgent.auth;

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStore.getSettings = vi.fn().mockResolvedValue({});
    mockStore.saveSettings = vi.fn().mockResolvedValue(undefined);
    mockAuth.login = vi.fn().mockResolvedValue({ ok: true });
    mockAuth.save = vi.fn().mockResolvedValue({ ok: true });
    mockAuth.list = vi.fn().mockResolvedValue({
      ok: true,
      activeProvider: "openai-codex",
      providers: [
        {
          provider: "openai-codex",
          displayName: "OpenAI Codex",
          authKind: "oauth",
          configured: false,
          authenticated: false,
        },
        {
          provider: "anthropic",
          displayName: "Anthropic Claude",
          authKind: "apiKey",
          configured: true,
          authenticated: true,
          owner: "claude-user@example.com",
        },
      ],
    });

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
        proactivity: {
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
        },
      },
      loaded: true,
    });
    useAuthStore.setState({
      activeProvider: "openai-codex",
      statuses: [],
      authenticated: false,
      email: undefined,
      checking: false,
      loginBusy: false,
    });
    useContextStore.setState({
      contexts: [],
      loaded: true,
      activeContextId: "",
    });
  });

  it("persists the provider selection and finishes onboarding with synced stores", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /come/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
    fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
      target: { value: "sk-ant-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /pro/i }));

    await waitFor(() => {
      expect(mockAuth.save).toHaveBeenCalledWith({
        provider: "anthropic",
        apiKey: "sk-ant-test",
      });
    });

    expect(useSettingsStore.getState().settings.provider).toBe("anthropic");
    expect(useSettingsStore.getState().settings.defaultModelRef).toBe("anthropic/claude-sonnet-4-6");
    expect(useAuthStore.getState().activeProvider).toBe("anthropic");

    fireEvent.click(screen.getByRole("button", { name: /pular/i }));
    fireEvent.click(screen.getByRole("button", { name: /pular/i }));
    fireEvent.click(screen.getByRole("button", { name: /usar/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    expect(useSettingsStore.getState().settings.onboardingCompleted).toBe(true);
    expect(mockStore.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        defaultModelRef: "anthropic/claude-sonnet-4-6",
      }),
    );
    expect(mockStore.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
      }),
    );
  });
});
