import { describe, it, expect, beforeEach } from "vitest";
import { setRoute } from "../router";

describe("router", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("sets hash for simple view", () => {
    setRoute("settings");
    expect(window.location.hash).toBe("#/settings");
  });

  it("sets hash with param", () => {
    setRoute("chat", "session-123");
    expect(window.location.hash).toBe("#/chat/session-123");
  });

  it("does not update hash if already set", () => {
    window.location.hash = "#/agents";
    setRoute("agents");
    expect(window.location.hash).toBe("#/agents");
  });
});
