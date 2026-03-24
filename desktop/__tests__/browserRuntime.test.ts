import { resolveBrowserContextSessionId } from "../services/browserRuntime.js";

describe("browserRuntime", () => {
  it("uses the explicit session id when provided", () => {
    expect(resolveBrowserContextSessionId({ sessionId: "session-123" })).toBe(
      "session-123",
    );
  });

  it("maps connection id to a persistent browser session id", () => {
    expect(resolveBrowserContextSessionId({ connectionId: "conn-1" })).toBe(
      "connection:conn-1",
    );
  });

  it("prioritizes connection id over session id", () => {
    expect(
      resolveBrowserContextSessionId({
        sessionId: "session-123",
        connectionId: "conn-1",
      }),
    ).toBe("connection:conn-1");
  });

  it("throws when neither session id nor connection id is available", () => {
    expect(() => resolveBrowserContextSessionId({})).toThrow(
      /sessionid or connectionid/i,
    );
  });
});
