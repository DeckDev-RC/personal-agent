import type { BrowserToolName } from "./browserTools.js";

const STALE_TARGET_SAFE_TOOLS = new Set<BrowserToolName>([
  "browser_snapshot",
  "browser_hover",
  "browser_wait",
  "browser_screenshot",
  "browser_extract_text",
]);

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().toLowerCase();
  }
  return String(error ?? "").trim().toLowerCase();
}

export function isBrowserTargetUnavailableError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return (
    message.includes("browser target") &&
    message.includes("is not available")
  );
}

export function isRetryableBrowserNavigateError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return (
    message.includes("frame has been detached") ||
    message.includes("target page, context or browser has been closed") ||
    message.includes("page has been closed") ||
    message.includes("browser has been closed")
  );
}

export function shouldRetryBrowserToolWithoutTarget(params: {
  toolName: BrowserToolName;
  args: Record<string, unknown>;
  error: unknown;
  attachedPageCount: number;
}): boolean {
  const hasTargetId =
    typeof params.args.targetId === "string" && params.args.targetId.trim().length > 0;
  return (
    hasTargetId &&
    params.attachedPageCount === 1 &&
    STALE_TARGET_SAFE_TOOLS.has(params.toolName) &&
    isBrowserTargetUnavailableError(params.error)
  );
}

export function stripBrowserTargetId(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...args };
  delete next.targetId;
  return next;
}
