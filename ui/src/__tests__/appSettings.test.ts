import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  sanitizeFallbackProviders,
} from "../../../src/settings/appSettings.js";

describe("appSettings", () => {
  it("deduplicates fallback providers and removes the active provider", () => {
    expect(
      sanitizeFallbackProviders("ollama", ["openai-codex", "ollama", "openai-codex", "anthropic"]),
    ).toEqual(["openai-codex", "anthropic"]);
  });

  it("normalizes provider-specific model refs consistently", () => {
    const settings = normalizeAppSettings({
      provider: "anthropic",
      defaultModelRef: "claude-sonnet-4-6",
      fallbackProviders: ["anthropic", "ollama"],
    });

    expect(settings.provider).toBe("anthropic");
    expect(settings.defaultModelRef).toBe("anthropic/claude-sonnet-4-6");
    expect(settings.fastModelRef).toBe("anthropic/claude-sonnet-4-6");
    expect(settings.fallbackProviders).toEqual(["ollama"]);
  });

  it("defaults approval mode to manual", () => {
    expect(DEFAULT_APP_SETTINGS.approvalMode).toBe("manual");
    expect(normalizeAppSettings({}).approvalMode).toBe("manual");
  });
});
