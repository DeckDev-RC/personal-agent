import type { BrowserContext } from "playwright-core";
import type { BrowserToolName } from "./browserTools.js";

const STALE_TARGET_SAFE_TOOLS = new Set<BrowserToolName>([
  "browser_snapshot",
  "browser_hover",
  "browser_wait",
  "browser_screenshot",
  "browser_extract_text",
  "browser_click",
  "browser_type",
  "browser_select",
  "browser_fill",
]);

const RETRYABLE_ACTION_TOOLS = new Set<BrowserToolName>([
  "browser_click",
  "browser_type",
  "browser_hover",
  "browser_fill",
  "browser_select",
  "browser_drag",
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

export function isBrowserClosedError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return (
    message.includes("browser has been closed") ||
    message.includes("browser.newcontext: target closed") ||
    message.includes("connection refused") ||
    message.includes("websocket error") ||
    message.includes("protocol error") ||
    message.includes("cdp session closed")
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

export function isRetryableBrowserActionError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return (
    isRetryableBrowserNavigateError(error) ||
    message.includes("execution context was destroyed") ||
    message.includes("target closed") ||
    message.includes("session closed") ||
    message.includes("object is not available")
  );
}

export function isRetryableActionTool(toolName: BrowserToolName): boolean {
  return RETRYABLE_ACTION_TOOLS.has(toolName);
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

export async function forceDisconnectBrowser(params: {
  context: BrowserContext | null;
}): Promise<void> {
  if (!params.context) return;
  try {
    params.context.removeAllListeners();
    for (const page of params.context.pages()) {
      page.removeAllListeners();
    }
    await Promise.race([
      params.context.close(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Best-effort: swallow errors during force disconnect
  }
}
