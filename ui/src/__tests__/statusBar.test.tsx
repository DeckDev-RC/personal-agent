import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../i18n";
import StatusBar from "../components/layout/StatusBar";
import { useChatStore } from "../stores/chatStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { useSettingsStore } from "../stores/settingsStore";

const mockStore = (window as any).codexAgent.store;

describe("StatusBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStore.saveSettings = vi.fn().mockResolvedValue(undefined);
    (window as any).codexAgent.getRuntimeStatus = vi.fn().mockResolvedValue({
      activeProvider: "openai-codex",
      activeModelRef: "openai-codex/gpt-5.4",
      authenticated: true,
      modelContextWindow: 128000,
      maxOutputTokens: 4096,
      mcpConnectedCount: 0,
      mcpEnabledCount: 0,
      usageWindows: [],
      providerStatuses: [
        {
          provider: "openai-codex",
          displayName: "OpenAI Codex",
          authKind: "oauth",
          configured: true,
          authenticated: true,
        },
      ],
    });

    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        approvalMode: "manual",
      },
      loaded: true,
    });
    useRuntimeStore.setState({
      status: {
        activeProvider: "openai-codex",
        activeModelRef: "openai-codex/gpt-5.4",
        authenticated: true,
        modelContextWindow: 128000,
        maxOutputTokens: 4096,
        mcpConnectedCount: 0,
        mcpEnabledCount: 0,
        usageWindows: [],
        providerStatuses: [
          {
            provider: "openai-codex",
            displayName: "OpenAI Codex",
            authKind: "oauth",
            configured: true,
            authenticated: true,
          },
        ],
      },
      loading: false,
    });
    useChatStore.setState({
      ...useChatStore.getState(),
      activeConversation: null,
      streamingText: "",
    });
  });

  it("toggles quick approval mode from the status bar", async () => {
    render(<StatusBar />);

    fireEvent.click(screen.getByRole("button", { name: /manual/i }));

    await waitFor(() => {
      expect(useSettingsStore.getState().settings.approvalMode).toBe("free");
    });

    expect(mockStore.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalMode: "free",
      }),
    );
    expect(screen.getByRole("button", { name: /livre/i })).toBeInTheDocument();
  });
});
