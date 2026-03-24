import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  BrowserImageType,
  BrowserProfileId,
  BrowserTargetId,
} from "../../src/types/browser.js";
import type { NativeToolExecutionResult } from "./nativeTools.js";
import type { BrowserTargetActivity } from "./browserSessionState.js";

export type BrowserArtifactHint = {
  type: "screenshot" | "dom_snapshot" | "browser_log";
  label: string;
  contentText?: string;
  filePath?: string;
  memoryTitle?: string;
  memoryContent?: string;
};

type BrowserDiagnosticsPageLike = {
  url(): string;
  content(): Promise<string>;
  screenshot(options: {
    path: string;
    fullPage?: boolean;
    timeout?: number;
    type?: BrowserImageType;
  }): Promise<unknown>;
  locator(selector: string): {
    innerText(): Promise<string>;
  };
};

type BuildBrowserFailureResultParams = {
  error: unknown;
  toolName: string;
  page?: BrowserDiagnosticsPageLike;
  currentUrl?: string;
  targetId: BrowserTargetId;
  profile?: BrowserProfileId;
  selector?: string;
  ref?: string;
  frame?: string;
  targetDir?: string;
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? "Unknown browser error.");
}

function truncateText(value: string, maxChars = 4_000): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

async function captureFailureScreenshot(params: {
  page?: BrowserDiagnosticsPageLike;
  targetDir?: string;
}): Promise<string | undefined> {
  if (!params.page || !params.targetDir) {
    return undefined;
  }

  await fsp.mkdir(params.targetDir, { recursive: true });
  const screenshotPath = path.join(
    params.targetDir,
    `${Date.now()}-${randomUUID()}-browser-error.png`,
  );

  await params.page.screenshot({
    path: screenshotPath,
    fullPage: true,
    timeout: 5_000,
    type: "png",
  });
  return screenshotPath;
}

async function captureDomSnapshot(
  page?: BrowserDiagnosticsPageLike,
): Promise<string | undefined> {
  if (!page) {
    return undefined;
  }

  return await page.content();
}

async function captureVisibleText(
  page?: BrowserDiagnosticsPageLike,
): Promise<string | undefined> {
  if (!page) {
    return undefined;
  }

  const text = (await page.locator("body").innerText()).trim();
  return text || undefined;
}

function buildFailureContent(params: {
  toolName: string;
  message: string;
  currentUrl?: string;
  selector?: string;
  ref?: string;
  frame?: string;
  visibleText?: string;
}): string {
  const lines = [
    `Browser action "${params.toolName}" failed: ${params.message}`,
    params.currentUrl ? `URL: ${params.currentUrl}` : undefined,
    params.selector ? `Selector: ${params.selector}` : undefined,
    params.ref ? `Ref: ${params.ref}` : undefined,
    params.frame ? `Frame: ${params.frame}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const visibleText = normalizeOptionalString(params.visibleText);
  if (visibleText) {
    lines.push("");
    lines.push("Visible text snapshot:");
    lines.push(truncateText(visibleText, 2_000));
  }

  return lines.join("\n");
}

function formatBrowserTimestamp(value: number): string {
  return Number.isFinite(value)
    ? new Date(value).toISOString()
    : "unknown-time";
}

function formatBrowserConsoleActivity(
  activity: BrowserTargetActivity,
  maxEntries: number,
): string | undefined {
  if (!activity.console.length) {
    return undefined;
  }

  return activity.console
    .slice(-maxEntries)
    .map((entry) => {
      const location =
        entry.location &&
        (entry.location.url ||
          typeof entry.location.lineNumber === "number" ||
          typeof entry.location.columnNumber === "number")
          ? ` (${[
              entry.location.url,
              typeof entry.location.lineNumber === "number"
                ? entry.location.lineNumber
                : undefined,
              typeof entry.location.columnNumber === "number"
                ? entry.location.columnNumber
                : undefined,
            ]
              .filter((value) => value !== undefined && value !== "")
              .join(":")})`
          : "";
      return `[${formatBrowserTimestamp(entry.timestamp)}] [${entry.level}] ${entry.text}${location}`;
    })
    .join("\n");
}

function formatBrowserPageErrors(
  activity: BrowserTargetActivity,
  maxEntries: number,
): string | undefined {
  if (!activity.errors.length) {
    return undefined;
  }

  return activity.errors
    .slice(-maxEntries)
    .map((entry) =>
      [
        `[${formatBrowserTimestamp(entry.timestamp)}] ${entry.message}`,
        entry.stack ? truncateText(entry.stack, 1_500) : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function formatBrowserRequests(
  activity: BrowserTargetActivity,
  maxEntries: number,
): string | undefined {
  if (!activity.requests.length) {
    return undefined;
  }

  return activity.requests
    .slice(-maxEntries)
    .map((entry) => {
      const status =
        typeof entry.status === "number"
          ? ` -> ${entry.status}${entry.ok === false ? " (not ok)" : ""}`
          : entry.failureText
            ? ` -> failed (${entry.failureText})`
            : entry.ok === false
              ? " -> failed"
              : "";
      const resourceType = entry.resourceType ? ` [${entry.resourceType}]` : "";
      const requestId = entry.id ? ` (${entry.id})` : "";
      return `[${formatBrowserTimestamp(entry.timestamp)}] ${entry.method} ${entry.url}${resourceType}${requestId}${status}`;
    })
    .join("\n");
}

export function buildBrowserActivityArtifactHints(params: {
  toolName: string;
  targetId: BrowserTargetId;
  activity?: BrowserTargetActivity;
  maxEntries?: number;
}): BrowserArtifactHint[] {
  const activity = params.activity;
  if (!activity) {
    return [];
  }

  const maxEntries =
    typeof params.maxEntries === "number" && Number.isFinite(params.maxEntries)
      ? Math.max(1, Math.floor(params.maxEntries))
      : 20;
  const artifacts: BrowserArtifactHint[] = [];
  const suffix = `(${params.targetId})`;

  const consoleText = formatBrowserConsoleActivity(activity, maxEntries);
  if (consoleText) {
    artifacts.push({
      type: "browser_log",
      label: `Browser console ${suffix}`,
      contentText: consoleText,
      memoryTitle: `Browser console ${suffix}`,
      memoryContent: consoleText,
    });
  }

  const errorText = formatBrowserPageErrors(activity, maxEntries);
  if (errorText) {
    artifacts.push({
      type: "browser_log",
      label: `Browser page errors ${suffix}`,
      contentText: errorText,
      memoryTitle: `Browser page errors ${suffix}`,
      memoryContent: errorText,
    });
  }

  const requestText = formatBrowserRequests(activity, maxEntries);
  if (requestText) {
    artifacts.push({
      type: "browser_log",
      label: `Browser network activity ${suffix}`,
      contentText: requestText,
      memoryTitle: `Browser network activity ${suffix}`,
      memoryContent: requestText,
    });
  }

  return artifacts;
}

export async function buildBrowserFailureResult(
  params: BuildBrowserFailureResultParams,
): Promise<NativeToolExecutionResult> {
  const message = normalizeErrorMessage(params.error);
  const currentUrl =
    normalizeOptionalString(params.currentUrl) ??
    normalizeOptionalString(params.page?.url());

  let screenshotPath: string | undefined;
  let domSnapshot: string | undefined;
  let visibleText: string | undefined;

  try {
    screenshotPath = await captureFailureScreenshot({
      page: params.page,
      targetDir: params.targetDir,
    });
  } catch {
    screenshotPath = undefined;
  }

  try {
    domSnapshot = await captureDomSnapshot(params.page);
  } catch {
    domSnapshot = undefined;
  }

  try {
    visibleText = await captureVisibleText(params.page);
  } catch {
    visibleText = undefined;
  }

  const content = buildFailureContent({
    toolName: params.toolName,
    message,
    currentUrl,
    selector: params.selector,
    ref: params.ref,
    frame: params.frame,
    visibleText,
  });

  const browserArtifacts: BrowserArtifactHint[] = [];
  if (screenshotPath) {
    browserArtifacts.push({
      type: "screenshot",
      label: `Browser failure screenshot: ${params.toolName}`,
      filePath: screenshotPath,
    });
  }
  if (domSnapshot) {
    browserArtifacts.push({
      type: "dom_snapshot",
      label: `Browser failure DOM: ${params.toolName}`,
      contentText: domSnapshot,
    });
  }
  browserArtifacts.push({
    type: "browser_log",
    label: `Browser failure log: ${params.toolName}`,
    contentText: content,
    memoryTitle: `Browser failure: ${params.toolName}`,
    memoryContent: content,
  });

  return {
    content,
    isError: true,
    metadata: {
      browserError: {
        toolName: params.toolName,
        message,
        url: currentUrl,
        targetId: params.targetId,
        profile: params.profile,
        selector: params.selector,
        ref: params.ref,
        frame: params.frame,
      },
      browserArtifacts,
    },
  };
}
