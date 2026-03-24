import {
  isBrowserTargetUnavailableError,
  isRetryableBrowserNavigateError,
  shouldRetryBrowserToolWithoutTarget,
  stripBrowserTargetId,
} from "../services/browserRuntimeRecovery.js";

describe("browserRuntimeRecovery", () => {
  it("detects stale browser target errors", () => {
    expect(
      isBrowserTargetUnavailableError(
        new Error('Browser target "tab-7" is not available.'),
      ),
    ).toBe(true);
  });

  it("detects retryable navigation runtime errors", () => {
    expect(
      isRetryableBrowserNavigateError(
        new Error("Navigation failed because frame has been detached."),
      ),
    ).toBe(true);
    expect(
      isRetryableBrowserNavigateError(
        new Error("Target page, context or browser has been closed"),
      ),
    ).toBe(true);
  });

  it("allows safe stale-target retries only for read-only tools when one page remains", () => {
    expect(
      shouldRetryBrowserToolWithoutTarget({
        toolName: "browser_snapshot",
        args: { targetId: "tab-1" },
        error: new Error('Browser target "tab-1" is not available.'),
        attachedPageCount: 1,
      }),
    ).toBe(true);

    expect(
      shouldRetryBrowserToolWithoutTarget({
        toolName: "browser_click",
        args: { targetId: "tab-1" },
        error: new Error('Browser target "tab-1" is not available.'),
        attachedPageCount: 1,
      }),
    ).toBe(false);
  });

  it("strips targetId when retrying after stale target recovery", () => {
    expect(
      stripBrowserTargetId({
        targetId: "tab-2",
        selector: "main",
      }),
    ).toEqual({
      selector: "main",
    });
  });
});
