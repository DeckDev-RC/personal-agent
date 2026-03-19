import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../stores/authStore";

const mockAuth = (window as any).codexAgent.auth;

describe("authStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.list = vi.fn().mockResolvedValue({
      ok: true,
      activeProvider: "openai-codex",
      providers: [
        {
          provider: "openai-codex",
          displayName: "OpenAI Codex",
          authKind: "oauth",
          configured: true,
          authenticated: true,
          owner: "user@example.com",
        },
        {
          provider: "anthropic",
          displayName: "Anthropic Claude",
          authKind: "apiKey",
          configured: false,
          authenticated: false,
        },
      ],
    });
    mockAuth.login = vi.fn().mockResolvedValue({ ok: true });
    mockAuth.save = vi.fn().mockResolvedValue({ ok: true });
    mockAuth.delete = vi.fn().mockResolvedValue({ ok: true });
  });

  it("selects the active provider from a model ref", async () => {
    await useAuthStore.getState().checkAuth("anthropic/claude-sonnet-4-6");
    expect(useAuthStore.getState().activeProvider).toBe("anthropic");
    expect(useAuthStore.getState().authenticated).toBe(false);
  });

  it("exposes provider status helpers", async () => {
    await useAuthStore.getState().checkAuth("openai-codex/gpt-5.4");
    expect(useAuthStore.getState().getProviderStatus("openai-codex")?.owner).toBe("user@example.com");
  });
});
