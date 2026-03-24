import { describe, expect, it } from "vitest";
import { getStatusBarConnectionLabel } from "../components/layout/statusBarAuth";

describe("statusBarAuth", () => {
  it("maps OAuth status to connected labels", () => {
    expect(
      getStatusBarConnectionLabel({
        provider: "openai-codex",
        displayName: "OpenAI Codex",
        authKind: "oauth",
        configured: true,
        authenticated: true,
      }),
    ).toEqual({
      labelKey: "statusBar.oauthConnected",
      fallback: "OAuth conectado",
    });
  });

  it("maps local runtime status to runtime labels", () => {
    expect(
      getStatusBarConnectionLabel({
        provider: "ollama",
        displayName: "Ollama",
        authKind: "local",
        configured: true,
        authenticated: true,
      }),
    ).toEqual({
      labelKey: "statusBar.localReady",
      fallback: "Runtime local pronto",
    });
  });
});
