import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  chromium,
  type BrowserContext,
  type ConsoleMessage,
  type FrameLocator,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "playwright-core";
import type {
  BrowserActionResult,
  BrowserBatchActionRequest,
  BrowserConsoleLevel,
  BrowserFormField,
  BrowserImageType,
  BrowserRefMode,
  BrowserRoleRef,
  BrowserSnapshotRequest,
  BrowserSnapshotResult,
  BrowserSnapshotStats,
  BrowserScreenshotResult,
  BrowserTabsResult,
  BrowserTargetId,
} from "../../src/types/browser.js";
import type { BrowserSessionRecord } from "../../src/types/runtime.js";
import { browserProfileDir, browserTempDir } from "./v2Paths.js";
import {
  deleteBrowserSessionRecord,
  getBrowserSessionRecord,
  upsertBrowserSessionRecord,
} from "./v2SessionStore.js";
import type { NativeToolExecutionResult } from "./nativeTools.js";
import type { BrowserToolName } from "./browserTools.js";
import {
  buildBrowserActivityArtifactHints,
  buildBrowserFailureResult,
  type BrowserArtifactHint,
} from "./browserDiagnostics.js";
import {
  DEFAULT_BROWSER_TARGET_ID,
  normalizeBrowserActionRequest,
  normalizeBrowserProfile,
  normalizeBrowserSnapshotRequest,
  normalizeBrowserTabsRequest,
  resolveBrowserTargetId,
} from "./browserContract.js";
import {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationRedirectChainAllowed,
  assertBrowserNavigationResultAllowed,
  deriveAllowedBrowserDomainsFromConnection,
  type BrowserNavigationPolicyOptions,
} from "./browserNavigationGuard.js";
import {
  buildRoleSnapshotFromAccessibilitySnapshot,
  buildRoleSnapshotFromPageAiSnapshot,
  flattenAccessibilitySnapshot,
  type BrowserAccessibilitySnapshotNode,
} from "./browserSnapshot.js";
import {
  parseBrowserRoleRef,
  type BrowserRoleRefMap,
} from "./browserRoleRefs.js";
import {
  appendBrowserConsoleEntry,
  appendBrowserPageErrorEntry,
  clearBrowserRoleRefs,
  createBrowserSessionState,
  getStoredBrowserRoleRefs,
  readBrowserConsoleEntries,
  readBrowserPageErrorEntries,
  readBrowserRequestEntries,
  setBrowserSessionActiveTarget,
  snapshotBrowserTargetActivity,
  storeBrowserRoleRefs,
  upsertBrowserRequestEntry,
  type BrowserSessionState,
} from "./browserSessionState.js";
import {
  createBrowserTargetRegistry,
  ensureBrowserTargetPage,
  getBrowserTargetIdForPage,
  getBrowserTargetPage,
  invalidateBrowserTarget,
  listBrowserTargets,
  registerBrowserTarget,
  syncBrowserTargetsFromContext,
  type BrowserTargetRegistry,
} from "./browserTargetRegistry.js";
import { getConnection, resolveConnectionSessionId } from "./connectionManager.js";
import {
  isRetryableBrowserNavigateError,
  shouldRetryBrowserToolWithoutTarget,
  stripBrowserTargetId,
} from "./browserRuntimeRecovery.js";
import { takeBrowserLabeledScreenshot } from "./browserScreenshotLabels.js";

export type BrowserRuntimeContext = {
  sessionId?: string;
  connectionId?: string;
  signal?: AbortSignal;
};

type BrowserState = {
  sessionId: string;
  browserSessionId: string;
  profilePath: string;
  context: BrowserContext;
  sessionState: BrowserSessionState;
  targetRegistry: BrowserTargetRegistry;
};

export type BrowserActionEvent = {
  sessionId: string;
  action: BrowserToolName;
  args: Record<string, unknown>;
  currentUrl?: string;
  timestamp: number;
};

const browserStates = new Map<string, BrowserState>();
const browserActionListeners = new Set<(event: BrowserActionEvent) => void>();
const observedBrowserContexts = new WeakSet<BrowserContext>();
const observedBrowserPages = new WeakSet<Page>();
const observedBrowserRequests = new WeakMap<
  Page,
  {
    requestIds: WeakMap<Request, string>;
    nextRequestId: number;
  }
>();
const MAX_BROWSER_BATCH_ACTIONS = 100;
const MAX_BROWSER_BATCH_DEPTH = 5;

export function resolveBrowserContextSessionId(
  ctx: BrowserRuntimeContext,
): string {
  const connectionId =
    typeof ctx.connectionId === "string" ? ctx.connectionId.trim() : "";
  if (connectionId) {
    return resolveConnectionSessionId(connectionId);
  }

  const sessionId = typeof ctx.sessionId === "string" ? ctx.sessionId.trim() : "";
  if (sessionId) {
    return sessionId;
  }

  throw new Error("Browser tools require either sessionId or connectionId.");
}

function resolveBrowserExecutablePath(): string | null {
  const candidates = [
    process.env.CODEX_AGENT_BROWSER_PATH,
    process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"],
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : "",
    process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"],
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function saveBrowserSessionRecord(
  record: BrowserSessionRecord,
): Promise<BrowserSessionRecord> {
  return await upsertBrowserSessionRecord(record);
}

function normalizeBrowserConsoleLevel(value: string): BrowserConsoleLevel {
  switch (value) {
    case "debug":
    case "error":
    case "info":
    case "log":
    case "warning":
      return value;
    default:
      return "log";
  }
}

function getObservedRequestState(page: Page): {
  requestIds: WeakMap<Request, string>;
  nextRequestId: number;
} {
  const existing = observedBrowserRequests.get(page);
  if (existing) {
    return existing;
  }

  const created = {
    requestIds: new WeakMap<Request, string>(),
    nextRequestId: 0,
  };
  observedBrowserRequests.set(page, created);
  return created;
}

function resolveObservedTargetId(
  state: BrowserState,
  page: Page,
): BrowserTargetId {
  return (
    getBrowserTargetIdForPage(state.targetRegistry, page) ??
    registerBrowserTarget({
      registry: state.targetRegistry,
      page,
    })
  );
}

function recordObservedRequest(params: {
  state: BrowserState;
  page: Page;
  request: Request;
  status?: number;
  ok?: boolean;
  failureText?: string;
}): void {
  const targetId = resolveObservedTargetId(params.state, params.page);
  const requestState = getObservedRequestState(params.page);
  let requestId = requestState.requestIds.get(params.request);
  if (!requestId) {
    requestState.nextRequestId += 1;
    requestId = `r${requestState.nextRequestId}`;
    requestState.requestIds.set(params.request, requestId);
  }

  upsertBrowserRequestEntry({
    state: params.state.sessionState,
    targetId,
    requestId,
    entry: {
      url: params.request.url(),
      method: params.request.method(),
      resourceType: params.request.resourceType(),
      status: params.status,
      ok: params.ok,
      failureText: params.failureText,
      timestamp: Date.now(),
    },
  });
}

function observeBrowserPage(state: BrowserState, page: Page): void {
  resolveObservedTargetId(state, page);
  if (observedBrowserPages.has(page)) {
    return;
  }

  observedBrowserPages.add(page);
  getObservedRequestState(page);

  page.on("console", (message: ConsoleMessage) => {
    const location = message.location();
    appendBrowserConsoleEntry({
      state: state.sessionState,
      targetId: resolveObservedTargetId(state, page),
      entry: {
        level: normalizeBrowserConsoleLevel(message.type()),
        text: message.text(),
        location:
          location.url ||
          typeof location.lineNumber === "number" ||
          typeof location.columnNumber === "number"
            ? {
                url: location.url,
                lineNumber: location.lineNumber,
                columnNumber: location.columnNumber,
              }
            : undefined,
        timestamp: Date.now(),
      },
    });
  });

  page.on("pageerror", (error: Error) => {
    appendBrowserPageErrorEntry({
      state: state.sessionState,
      targetId: resolveObservedTargetId(state, page),
      entry: {
        message: error?.message ? String(error.message) : String(error),
        stack: error?.stack ? String(error.stack) : undefined,
        timestamp: Date.now(),
      },
    });
  });

  page.on("request", (request: Request) => {
    recordObservedRequest({
      state,
      page,
      request,
    });
  });

  page.on("response", (response: Response) => {
    recordObservedRequest({
      state,
      page,
      request: response.request(),
      status: response.status(),
      ok: response.ok(),
    });
  });

  page.on("requestfailed", (request: Request) => {
    recordObservedRequest({
      state,
      page,
      request,
      ok: false,
      failureText: request.failure()?.errorText,
    });
  });

  page.on("close", () => {
    observedBrowserPages.delete(page);
    observedBrowserRequests.delete(page);
  });
}

function observeBrowserContext(state: BrowserState): void {
  if (observedBrowserContexts.has(state.context)) {
    return;
  }

  observedBrowserContexts.add(state.context);
  for (const page of state.context.pages()) {
    observeBrowserPage(state, page);
  }
  state.context.on("page", (page) => {
    registerBrowserTarget({
      registry: state.targetRegistry,
      page,
    });
    observeBrowserPage(state, page);
  });
}

async function launchBrowserState(sessionId: string): Promise<BrowserState> {
  const executablePath = resolveBrowserExecutablePath();
  if (!executablePath) {
    throw new Error("No local Chromium-compatible browser executable was found.");
  }

  const profilePath = browserProfileDir(sessionId);
  await fsp.mkdir(profilePath, { recursive: true });
  await fsp.mkdir(browserTempDir(sessionId), { recursive: true });

  const existing = await getBrowserSessionRecord(sessionId);
  const browserSessionId = existing?.browserSessionId ?? randomUUID();
  await saveBrowserSessionRecord({
    browserSessionId,
    sessionId,
    profilePath,
    currentUrl: existing?.currentUrl,
    status: "launching",
    lastActivityAt: Date.now(),
  });

  const context = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const targetRegistry = createBrowserTargetRegistry();
  registerBrowserTarget({
    registry: targetRegistry,
    page,
    targetId: DEFAULT_BROWSER_TARGET_ID,
  });
  syncBrowserTargetsFromContext({
    registry: targetRegistry,
    context,
  });
  const state: BrowserState = {
    sessionId,
    browserSessionId,
    profilePath,
    context,
    sessionState: createBrowserSessionState(),
    targetRegistry,
  };
  observeBrowserContext(state);
  browserStates.set(sessionId, state);
  await saveBrowserSessionRecord({
    browserSessionId,
    sessionId,
    profilePath,
    currentUrl: page.url() || existing?.currentUrl,
    status: "ready",
    lastActivityAt: Date.now(),
  });
  return state;
}

async function getBrowserState(sessionId: string): Promise<BrowserState> {
  const existing = browserStates.get(sessionId);
  if (existing) {
    observeBrowserContext(existing);
    syncBrowserTargetsFromContext({
      registry: existing.targetRegistry,
      context: existing.context,
    });
    return existing;
  }
  return await launchBrowserState(sessionId);
}

async function relaunchBrowserState(sessionId: string): Promise<BrowserState> {
  const existing = browserStates.get(sessionId);
  if (existing) {
    browserStates.delete(sessionId);
    try {
      await existing.context.close();
    } catch {
      // Best-effort teardown before re-launching.
    }
  }
  return await launchBrowserState(sessionId);
}

function countAttachedBrowserPages(state: BrowserState): number {
  return state.context
    .pages()
    .filter((page) => !page.isClosed()).length;
}

function sliceRecentEntries<T>(entries: T[], limit?: number): T[] {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return entries;
  }

  return entries.slice(-Math.max(1, Math.floor(limit)));
}

async function resolveBrowserPage(params: {
  state: BrowserState;
  targetId?: BrowserTargetId;
  createIfMissing?: boolean;
}): Promise<{ page: Page; targetId: BrowserTargetId }> {
  const resolved = await ensureBrowserTargetPage({
    registry: params.state.targetRegistry,
    context: params.state.context,
    targetId: params.targetId,
    createIfMissing: params.createIfMissing,
  });

  if (!resolved) {
    const requestedTargetId = resolveBrowserTargetId(params.targetId);
    throw new Error(
      `Browser target "${requestedTargetId}" is not available. Open it first with browser_open using the same targetId.`,
    );
  }

  observeBrowserPage(params.state, resolved.page);
  setBrowserSessionActiveTarget(params.state.sessionState, resolved.targetId);
  return {
    page: resolved.page,
    targetId: resolved.targetId,
  };
}

function getCurrentBrowserUrl(state: BrowserState): string | undefined {
  const page = getBrowserTargetPage(
    state.targetRegistry,
    state.sessionState.activeTargetId,
  );
  return page?.url();
}

async function updateBrowserStatus(
  sessionId: string,
  patch: Partial<BrowserSessionRecord>,
): Promise<void> {
  const current = await getBrowserSessionRecord(sessionId);
  if (!current) {
    return;
  }
  await saveBrowserSessionRecord({
    ...current,
    ...patch,
    lastActivityAt: Date.now(),
  });
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? "Unknown browser error.");
}

function normalizeOptionalSelector(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalFrame(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function resolveBrowserNavigationPolicy(
  connectionId?: string,
): Promise<BrowserNavigationPolicyOptions> {
  const normalizedConnectionId =
    typeof connectionId === "string" ? connectionId.trim() : "";
  if (!normalizedConnectionId) {
    return {};
  }

  const connection = await getConnection(normalizedConnectionId).catch(
    () => null,
  );
  return {
    allowedDomains: deriveAllowedBrowserDomainsFromConnection(connection),
  };
}

function storeRoleRefsForTarget(params: {
  state: BrowserState;
  targetId: BrowserTargetId;
  refs: BrowserRoleRefMap;
  mode: BrowserRefMode;
  frame?: string;
  url?: string;
}): void {
  storeBrowserRoleRefs({
    state: params.state.sessionState,
    targetId: params.targetId,
    refs: params.refs,
    mode: params.mode,
    frame: normalizeOptionalFrame(params.frame),
    url:
      typeof params.url === "string" && params.url.trim()
        ? params.url
        : undefined,
  });
}

function clearRoleRefsForTarget(
  state: BrowserState,
  targetId: BrowserTargetId,
): void {
  clearBrowserRoleRefs(state.sessionState, targetId);
}

function resolvePageScope(
  page: Page,
  frame?: string,
): Page | FrameLocator {
  const normalizedFrame = normalizeOptionalFrame(frame);
  return normalizedFrame ? page.frameLocator(normalizedFrame) : page;
}

function resolveSelectorLocator(
  page: Page,
  selector: string,
  frame?: string,
): Locator {
  const scope = resolvePageScope(page, frame) as {
    locator: (value: string) => Locator;
  };
  return scope.locator(selector);
}

async function resolveSnapshotRootHandle(
  page: Page,
  selector?: string,
  frame?: string,
): Promise<Awaited<ReturnType<Locator["elementHandle"]>> | null> {
  const normalizedSelector = normalizeOptionalSelector(selector);
  const normalizedFrame = normalizeOptionalFrame(frame);
  if (!normalizedSelector && !normalizedFrame) {
    return null;
  }

  return await resolveSelectorLocator(
    page,
    normalizedSelector ?? ":root",
    normalizedFrame,
  ).elementHandle();
}

function resolveRoleLocator(
  page: Page,
  refInfo: BrowserRoleRef,
  frame?: string,
): Locator {
  const scope = resolvePageScope(page, frame) as {
    getByRole: (
      role: never,
      options?: { name?: string; exact?: boolean },
    ) => Locator;
  };
  const locator = refInfo.name
    ? scope.getByRole(refInfo.role as never, {
        name: refInfo.name,
        exact: true,
      })
    : scope.getByRole(refInfo.role as never);
  return typeof refInfo.nth === "number" ? locator.nth(refInfo.nth) : locator;
}

function resolveLocatorInput(params: {
  state: BrowserState;
  page: Page;
  selector?: string;
  ref?: string;
  frame?: string;
  targetId?: BrowserTargetId;
  toolName: BrowserToolName;
}): {
  locator: Locator;
  selector?: string;
  ref?: string;
  frame?: string;
  label: string;
} {
  const selector = normalizeOptionalSelector(params.selector);
  const frame = normalizeOptionalFrame(params.frame);
  if (selector) {
    return {
      locator: resolveSelectorLocator(params.page, selector, frame),
      selector,
      frame,
      label: selector,
    };
  }

  const rawRef = typeof params.ref === "string" ? params.ref : "";
  const ref = parseBrowserRoleRef(rawRef);
  if (!ref) {
    throw new Error(`${params.toolName} requires a selector or ref.`);
  }

  const targetId = resolveBrowserTargetId(params.targetId);
  const stored = getStoredBrowserRoleRefs(params.state.sessionState, targetId);
  if (!stored) {
    throw new Error(
      `No stored browser refs for target "${targetId}". Run browser_snapshot with snapshotFormat="role" first.`,
    );
  }

  if (stored.url && params.page.url() && stored.url !== params.page.url()) {
    throw new Error(
      `Stored browser refs were captured for ${stored.url}. Run a new browser_snapshot before reusing ref "${ref}".`,
    );
  }

  const effectiveFrame = frame ?? stored.frame;
  if (stored.mode === "aria") {
    return {
      locator: resolveSelectorLocator(
        params.page,
        `aria-ref=${ref}`,
        effectiveFrame,
      ),
      ref,
      frame: effectiveFrame,
      label: ref,
    };
  }

  const refInfo = stored.refs[ref];
  if (!refInfo) {
    throw new Error(
      `Unknown browser ref "${ref}" for target "${targetId}". Run a new browser_snapshot to refresh refs.`,
    );
  }

  return {
    locator: resolveRoleLocator(params.page, refInfo, effectiveFrame),
    ref,
    frame: effectiveFrame,
    label: ref,
  };
}

async function allocateBrowserImagePath(
  sessionId: string,
  imageType: BrowserImageType,
): Promise<string> {
  const targetDir = browserTempDir(sessionId);
  await fsp.mkdir(targetDir, { recursive: true });
  const fileExtension = imageType === "jpeg" ? "jpg" : "png";
  return path.join(
    targetDir,
    `${Date.now()}-${randomUUID()}.${fileExtension}`,
  );
}

async function buildLabelRefsForPage(params: {
  state: BrowserState;
  page: Page;
  targetId: BrowserTargetId;
  currentUrl: string;
  selector?: string;
  frame?: string;
  timeoutMs?: number;
}): Promise<BrowserRoleRefMap> {
  const normalizedSelector = normalizeOptionalSelector(params.selector);
  const normalizedFrame = normalizeOptionalFrame(params.frame);

  if (!normalizedSelector && !normalizedFrame) {
    try {
      const built = await buildRoleSnapshotFromPageAiSnapshot(
        params.page as Parameters<typeof buildRoleSnapshotFromPageAiSnapshot>[0],
        {
          timeoutMs: params.timeoutMs,
        },
      );
      storeRoleRefsForTarget({
        state: params.state,
        targetId: params.targetId,
        refs: built.refs,
        mode: "aria",
        url: params.currentUrl,
      });
      return built.refs;
    } catch {
      // Fall back to accessibility snapshots when Playwright AI snapshots are unavailable.
    }
  }

  const rootHandle = await resolveSnapshotRootHandle(
    params.page,
    normalizedSelector,
    normalizedFrame,
  );
  if ((normalizedSelector || normalizedFrame) && !rootHandle) {
    const scopeDescription = normalizedSelector
      ? `selector "${normalizedSelector}"`
      : `frame "${normalizedFrame}"`;
    throw new Error(
      `browser_snapshot could not resolve ${scopeDescription} for labeled screenshot refs.`,
    );
  }

  try {
    const accessibility = (
      params.page as Page & {
        accessibility?: {
          snapshot: (options?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).accessibility;
    if (!accessibility?.snapshot) {
      throw new Error(
        "This Playwright runtime does not expose page accessibility snapshots.",
      );
    }

    const rawSnapshot =
      (await accessibility.snapshot({
        interestingOnly: false,
        ...(rootHandle ? { root: rootHandle } : {}),
      })) as BrowserAccessibilitySnapshotNode | null;
    const built = buildRoleSnapshotFromAccessibilitySnapshot(rawSnapshot);

    storeRoleRefsForTarget({
      state: params.state,
      targetId: params.targetId,
      refs: built.refs,
      mode: "role",
      frame: normalizedFrame,
      url: params.currentUrl,
    });

    return built.refs;
  } finally {
    await rootHandle?.dispose().catch(() => undefined);
  }
}

async function captureLabeledScreenshot(params: {
  state: BrowserState;
  page: Page;
  targetId: BrowserTargetId;
  sessionId: string;
  selector?: string;
  frame?: string;
  timeoutMs?: number;
  fullPage?: boolean;
  imageType: BrowserImageType;
  target?: {
    locator: Locator;
  } | null;
  refs?: BrowserRoleRefMap;
}): Promise<{
  filePath: string;
  labels: number;
  skipped: number;
}> {
  const filePath = await allocateBrowserImagePath(params.sessionId, params.imageType);
  const refMap =
    params.refs && Object.keys(params.refs).length > 0
      ? params.refs
      : await buildLabelRefsForPage({
          state: params.state,
          page: params.page,
          targetId: params.targetId,
          currentUrl: params.page.url(),
          selector: params.selector,
          frame: params.frame,
          timeoutMs: params.timeoutMs,
        });
  const refs = Object.keys(refMap);

  if (!refs.length) {
    if (params.target) {
      await params.target.locator.screenshot({
        path: filePath,
        timeout: params.timeoutMs,
        type: params.imageType,
      });
    } else {
      await params.page.screenshot({
        path: filePath,
        fullPage: params.fullPage === true,
        timeout: params.timeoutMs,
        type: params.imageType,
      });
    }

    return {
      filePath,
      labels: 0,
      skipped: 0,
    };
  }

  const result = await takeBrowserLabeledScreenshot({
    page: params.page,
    target: params.target?.locator ?? null,
    outputPath: filePath,
    refs,
    resolveRef: (ref) =>
      resolveLocatorInput({
        state: params.state,
        page: params.page,
        ref,
        frame: params.frame,
        targetId: params.targetId,
        toolName: "browser_screenshot",
      }).locator,
    fullPage: params.fullPage,
    timeoutMs: params.timeoutMs,
    type: params.imageType,
  });

  return {
    filePath,
    labels: result.labels,
    skipped: result.skipped,
  };
}

function resolveBrowserToolNameForBatchKind(
  kind: BrowserBatchActionRequest["kind"],
): BrowserToolName {
  switch (kind) {
    case "click":
      return "browser_click";
    case "hover":
      return "browser_hover";
    case "type":
      return "browser_type";
    case "drag":
      return "browser_drag";
    case "select":
      return "browser_select";
    case "fill":
      return "browser_fill";
    case "wait":
      return "browser_wait";
    case "evaluate":
      return "browser_evaluate";
    case "close":
      return "browser_close";
    case "batch":
      return "browser_batch";
  }
}

function clampBrowserTimeout(
  value: number | undefined,
  fallback: number,
  max = 120_000,
): number {
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : fallback;
  return Math.max(250, Math.min(max, normalized));
}

async function awaitAbortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) {
    return await promise;
  }
  if (signal.aborted) {
    throw signal.reason ?? new Error("Browser action aborted.");
  }

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(signal.reason ?? new Error("Browser action aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } catch (error) {
    void promise.catch(() => undefined);
    throw error;
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

async function evaluateBrowserFunction(params: {
  page: Page;
  locator?: Locator;
  fn: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const fnText = String(params.fn ?? "").trim();
  if (!fnText) {
    throw new Error("browser_evaluate requires a non-empty fn.");
  }

  const timeoutMs = clampBrowserTimeout(params.timeoutMs, 20_000);
  const evaluator = new Function(
    ...(params.locator ? ["el", "args"] : ["args"]),
    `
      "use strict";
      var args = arguments[arguments.length - 1];
      var fnBody = args.fnBody;
      var timeoutMs = args.timeoutMs;
      try {
        var candidate = eval("(" + fnBody + ")");
        var result = typeof candidate === "function"
          ? ${params.locator ? "candidate(el)" : "candidate()"}
          : candidate;
        if (result && typeof result.then === "function") {
          return Promise.race([
            result,
            new Promise(function(_, reject) {
              setTimeout(function() {
                reject(new Error("evaluate timed out after " + timeoutMs + "ms"));
              }, timeoutMs);
            })
          ]);
        }
        return result;
      } catch (err) {
        throw new Error("Invalid evaluate function: " + (err && err.message ? err.message : String(err)));
      }
    `,
  ) as
    | ((args: { fnBody: string; timeoutMs: number }) => unknown)
    | ((el: Element, args: { fnBody: string; timeoutMs: number }) => unknown);

  const evaluation = params.locator
    ? params.locator.evaluate(
        evaluator as (
          el: Element,
          args: { fnBody: string; timeoutMs: number },
        ) => unknown,
        {
          fnBody: fnText,
          timeoutMs,
        },
      )
    : params.page.evaluate(
        evaluator as (args: { fnBody: string; timeoutMs: number }) => unknown,
        {
          fnBody: fnText,
          timeoutMs,
        },
      );

  return await awaitAbortable(evaluation, params.signal);
}

function browserBatchActionArgs(params: {
  action: BrowserBatchActionRequest;
  fallbackTargetId?: BrowserTargetId;
  fallbackFrame?: string;
  fallbackTimeoutMs?: number;
}): Record<string, unknown> {
  const args = { ...params.action } as Record<string, unknown>;
  delete args.kind;

  if (args.targetId === undefined && params.fallbackTargetId) {
    args.targetId = params.fallbackTargetId;
  }
  if (args.frame === undefined && params.fallbackFrame) {
    args.frame = params.fallbackFrame;
  }
  if (args.timeoutMs === undefined && params.fallbackTimeoutMs !== undefined) {
    args.timeoutMs = params.fallbackTimeoutMs;
  }

  return args;
}

async function executeBrowserBatchActions(params: {
  actions: BrowserBatchActionRequest[];
  resolvedSessionId: string;
  ctx: BrowserRuntimeContext;
  fallbackTargetId?: BrowserTargetId;
  fallbackFrame?: string;
  fallbackTimeoutMs?: number;
  stopOnError?: boolean;
  depth?: number;
}): Promise<Array<{ ok: boolean; error?: string }>> {
  const depth = params.depth ?? 0;
  if (depth > MAX_BROWSER_BATCH_DEPTH) {
    throw new Error(
      `browser_batch nesting depth exceeds maximum of ${MAX_BROWSER_BATCH_DEPTH}.`,
    );
  }
  if (params.actions.length > MAX_BROWSER_BATCH_ACTIONS) {
    throw new Error(
      `browser_batch exceeds maximum of ${MAX_BROWSER_BATCH_ACTIONS} actions.`,
    );
  }

  const results: Array<{ ok: boolean; error?: string }> = [];
  for (const action of params.actions) {
    if (action.kind === "batch") {
      try {
        const nestedResults = await executeBrowserBatchActions({
          actions: action.actions,
          resolvedSessionId: params.resolvedSessionId,
          ctx: params.ctx,
          fallbackTargetId:
            action.targetId ?? params.fallbackTargetId,
          fallbackFrame: action.frame ?? params.fallbackFrame,
          fallbackTimeoutMs:
            action.timeoutMs ?? params.fallbackTimeoutMs,
          stopOnError: action.stopOnError,
          depth: depth + 1,
        });
        const failedNested = nestedResults.find((entry) => entry.ok === false);
        results.push(
          failedNested
            ? { ok: false, error: failedNested.error }
            : { ok: true },
        );
      } catch (error) {
        results.push({
          ok: false,
          error: normalizeErrorMessage(error),
        });
      }
    } else {
      const toolName = resolveBrowserToolNameForBatchKind(action.kind);
      const result = await executeBrowserTool(
        toolName,
        browserBatchActionArgs({
          action,
          fallbackTargetId: params.fallbackTargetId,
          fallbackFrame: params.fallbackFrame,
          fallbackTimeoutMs: params.fallbackTimeoutMs,
        }),
        params.ctx,
      );

      results.push(
        result.isError
          ? {
              ok: false,
              error: result.content || `browser_batch action "${action.kind}" failed.`,
            }
          : { ok: true },
      );
    }

    if (
      results.at(-1)?.ok === false &&
      (params.stopOnError ?? true)
    ) {
      break;
    }
  }

  return results;
}

async function pageText(
  page: Page,
  selector?: string,
  frame?: string,
): Promise<string> {
  const normalizedSelector = normalizeOptionalSelector(selector);
  if (normalizedSelector) {
    return (await resolveSelectorLocator(page, normalizedSelector, frame).innerText()).trim();
  }

  if (normalizeOptionalFrame(frame)) {
    return (await resolveSelectorLocator(page, "body", frame).innerText()).trim();
  }

  return (await page.locator("body").innerText()).trim();
}

async function pageHtml(
  page: Page,
  selector?: string,
  frame?: string,
): Promise<string> {
  const normalizedSelector = normalizeOptionalSelector(selector);
  if (normalizedSelector) {
    return await resolveSelectorLocator(page, normalizedSelector, frame).evaluate(
      (element) => (element as HTMLElement).outerHTML,
    );
  }

  if (normalizeOptionalFrame(frame)) {
    return await resolveSelectorLocator(page, "html", frame).evaluate(
      (element) => (element as HTMLElement).outerHTML,
    );
  }

  return await page.content();
}

function normalizeBrowserInputPaths(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" && entry.trim() ? path.resolve(entry.trim()) : "",
      )
      .filter(Boolean)
      .filter((entry) => fs.existsSync(entry));
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry))
      .filter((entry) => fs.existsSync(entry));
  }

  return [];
}

function truncateText(value: string, maxChars?: number): {
  text: string;
  truncated: boolean;
} {
  if (!maxChars || value.length <= maxChars) {
    return {
      text: value,
      truncated: false,
    };
  }

  return {
    text: value.slice(0, maxChars),
    truncated: true,
  };
}

function buildSnapshotStats(snapshot: string): BrowserSnapshotStats {
  return {
    lines: snapshot ? snapshot.split(/\r?\n/).length : 0,
    chars: snapshot.length,
    refs: 0,
    interactive: 0,
  };
}

async function buildAiSnapshot(params: {
  page: Page;
  request: BrowserSnapshotRequest;
  currentUrl: string;
}): Promise<BrowserSnapshotResult> {
  const html = await pageHtml(
    params.page,
    params.request.selector,
    params.request.frame,
  );
  const rawText = await pageText(
    params.page,
    params.request.selector,
    params.request.frame,
  );
  const capped = truncateText(rawText, params.request.maxChars ?? 12_000);
  const targetId = resolveBrowserTargetId(params.request.targetId);
  const profile = normalizeBrowserProfile(params.request.profile);

  return {
    ok: true,
    format: "ai",
    targetId,
    profile,
    url: params.currentUrl,
    selector: params.request.selector,
    frame: params.request.frame,
    snapshot: capped.text,
    html,
    truncated: capped.truncated,
    stats: buildSnapshotStats(capped.text),
    labels: params.request.labels,
  };
}

async function buildAriaSnapshot(params: {
  page: Page;
  request: BrowserSnapshotRequest;
  currentUrl: string;
}): Promise<BrowserSnapshotResult> {
  const targetId = resolveBrowserTargetId(params.request.targetId);
  const profile = normalizeBrowserProfile(params.request.profile);
  const rootHandle = await resolveSnapshotRootHandle(
    params.page,
    params.request.selector,
    params.request.frame,
  );

  if ((params.request.selector || params.request.frame) && !rootHandle) {
    const scopeDescription = params.request.selector
      ? `selector "${params.request.selector}"`
      : `frame "${params.request.frame}"`;
    throw new Error(
      `browser_snapshot could not resolve ${scopeDescription} for aria snapshot.`,
    );
  }

  try {
    const accessibility = (
      params.page as Page & {
        accessibility?: {
          snapshot: (options?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).accessibility;
    if (!accessibility?.snapshot) {
      throw new Error(
        "This Playwright runtime does not expose page accessibility snapshots.",
      );
    }

    const rawSnapshot =
      (await accessibility.snapshot({
        interestingOnly: false,
        ...(rootHandle ? { root: rootHandle } : {}),
      })) as BrowserAccessibilitySnapshotNode | null;
    const nodes = flattenAccessibilitySnapshot(rawSnapshot);

    return {
      ok: true,
      format: "aria",
      targetId,
      profile,
      url: params.currentUrl,
      selector: params.request.selector,
      frame: params.request.frame,
      labels: params.request.labels,
      nodes,
    };
  } finally {
    await rootHandle?.dispose().catch(() => undefined);
  }
}

async function buildRoleSnapshot(params: {
  state: BrowserState;
  page: Page;
  request: BrowserSnapshotRequest;
  currentUrl: string;
}): Promise<BrowserSnapshotResult> {
  const targetId = resolveBrowserTargetId(params.request.targetId);
  const profile = normalizeBrowserProfile(params.request.profile);
  const refsMode = params.request.refs ?? "role";

  if (refsMode === "aria") {
    if (params.request.selector || params.request.frame) {
      throw new Error(
        "refs=aria does not support selector/frame snapshots yet.",
      );
    }

    const built = await buildRoleSnapshotFromPageAiSnapshot(
      params.page as Parameters<typeof buildRoleSnapshotFromPageAiSnapshot>[0],
      {
        timeoutMs: params.request.timeoutMs,
      },
    );

    storeRoleRefsForTarget({
      state: params.state,
      targetId,
      refs: built.refs,
      mode: "aria",
      url: params.currentUrl,
    });

    return {
      ok: true,
      format: "role",
      targetId,
      profile,
      url: params.currentUrl,
      selector: params.request.selector,
      frame: params.request.frame,
      snapshot: built.snapshot,
      refs: built.refs,
      stats: built.stats,
      labels: params.request.labels,
    };
  }

  const rootHandle = await resolveSnapshotRootHandle(
    params.page,
    params.request.selector,
    params.request.frame,
  );

  if ((params.request.selector || params.request.frame) && !rootHandle) {
    const scopeDescription = params.request.selector
      ? `selector "${params.request.selector}"`
      : `frame "${params.request.frame}"`;
    throw new Error(
      `browser_snapshot could not resolve ${scopeDescription} for role snapshot.`,
    );
  }

  try {
    const accessibility = (
      params.page as Page & {
        accessibility?: {
          snapshot: (options?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).accessibility;
    if (!accessibility?.snapshot) {
      throw new Error(
        "This Playwright runtime does not expose page accessibility snapshots.",
      );
    }

    const rawSnapshot =
      (await accessibility.snapshot({
        interestingOnly: false,
        ...(rootHandle ? { root: rootHandle } : {}),
      })) as BrowserAccessibilitySnapshotNode | null;
    const built = buildRoleSnapshotFromAccessibilitySnapshot(rawSnapshot);

    storeRoleRefsForTarget({
      state: params.state,
      targetId,
      refs: built.refs,
      mode: "role",
      frame: params.request.frame,
      url: params.currentUrl,
    });

    return {
      ok: true,
      format: "role",
      targetId,
      profile,
      url: params.currentUrl,
      selector: params.request.selector,
      frame: params.request.frame,
      snapshot: built.snapshot,
      refs: built.refs,
      stats: built.stats,
      labels: params.request.labels,
    };
  } finally {
    await rootHandle?.dispose().catch(() => undefined);
  }
}

async function pageSnapshotArtifacts(params: {
  page: Page;
  selector?: string;
  frame?: string;
  snapshotLabel: string;
  snapshotText: string;
  memoryTitle?: string;
  memoryContent?: string;
  imagePath?: string;
}): Promise<BrowserArtifactHint[]> {
  const html = await pageHtml(params.page, params.selector, params.frame);
  return [
    ...(params.imagePath
      ? [
          {
            type: "screenshot" as const,
            label: `Snapshot labels ${hostnameLabel(params.page.url())}`,
            filePath: params.imagePath,
          },
        ]
      : []),
    {
      type: "dom_snapshot",
      label: "DOM snapshot",
      contentText: html,
      memoryTitle: "Browser DOM snapshot",
      memoryContent: params.memoryContent,
    },
    {
      type: "browser_log",
      label: params.snapshotLabel,
      contentText: params.snapshotText,
      memoryTitle: params.memoryTitle,
      memoryContent: params.memoryContent,
    },
  ];
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname || "page";
  } catch {
    return "page";
  }
}

function emitBrowserAction(event: BrowserActionEvent): void {
  for (const listener of browserActionListeners) {
    try {
      listener(event);
    } catch {
      // Event subscribers should not block browser execution.
    }
  }
}

export async function getBrowserSessionStatus(
  sessionId: string,
): Promise<BrowserSessionRecord | null> {
  return await getBrowserSessionRecord(sessionId);
}

export function subscribeBrowserActionEvents(
  listener: (event: BrowserActionEvent) => void,
): () => void {
  browserActionListeners.add(listener);
  return () => {
    browserActionListeners.delete(listener);
  };
}

export async function resetBrowserSession(sessionId: string): Promise<void> {
  const state = browserStates.get(sessionId);
  if (state) {
    await state.context.close();
    browserStates.delete(sessionId);
  }
  await deleteBrowserSessionRecord(sessionId);
  await fsp.rm(browserProfileDir(sessionId), { recursive: true, force: true });
  await fsp.rm(browserTempDir(sessionId), { recursive: true, force: true });
}

export async function closeAllBrowserSessions(): Promise<void> {
  const states = Array.from(browserStates.values());
  browserStates.clear();
  for (const state of states) {
    try {
      await state.context.close();
    } catch {
      // Best-effort cleanup.
    }
  }
}

export async function executeBrowserTool(
  toolName:
    | "browser_tabs"
    | "browser_open"
    | "browser_snapshot"
    | "browser_console_messages"
    | "browser_page_errors"
    | "browser_network_requests"
    | "browser_click"
    | "browser_hover"
    | "browser_type"
    | "browser_drag"
    | "browser_select"
    | "browser_fill"
    | "browser_wait"
    | "browser_evaluate"
    | "browser_batch"
    | "browser_set_input_files"
    | "browser_handle_dialog"
    | "browser_screenshot"
    | "browser_extract_text"
    | "browser_close",
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<NativeToolExecutionResult> {
  const resolvedSessionId = resolveBrowserContextSessionId({
    ...ctx,
    connectionId:
      typeof args.connectionId === "string" ? args.connectionId : ctx.connectionId,
  });

  if (toolName === "browser_close") {
    const request = normalizeBrowserActionRequest("close", args);
    await resetBrowserSession(resolvedSessionId);
    emitBrowserAction({
      sessionId: resolvedSessionId,
      action: toolName,
      args,
      timestamp: Date.now(),
    });
    return {
      content: "Browser session closed.",
      metadata: {
        browserAction: {
          ok: true,
          kind: "close",
          targetId: resolveBrowserTargetId(request.targetId),
          profile: request.profile,
          frame: request.frame,
        } satisfies BrowserActionResult,
        browserArtifacts: [
          {
            type: "browser_log",
            label: "Browser session closed",
            contentText: "Browser session closed.",
          },
        ],
      },
    };
  }

  let state = await getBrowserState(resolvedSessionId);
  let activePage: Page | undefined;
  let activeTargetId: BrowserTargetId | undefined;

  try {
    if (toolName === "browser_tabs") {
      const request = normalizeBrowserTabsRequest(args);
      syncBrowserTargetsFromContext({
        registry: state.targetRegistry,
        context: state.context,
      });
      const tabs = await listBrowserTargets(state.targetRegistry);
      const currentUrl = getCurrentBrowserUrl(state);
      const browserTabs: BrowserTabsResult = {
        ok: true,
        profile: request.profile,
        tabs,
      };
      const content =
        tabs.length > 0
          ? tabs
              .map(
                (tab) =>
                  `- ${tab.targetId}: ${tab.title || "(untitled)"}${tab.url ? ` (${tab.url})` : ""}`,
              )
              .join("\n")
          : "No browser tabs are open.";

      await updateBrowserStatus(resolvedSessionId, {
        currentUrl,
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl,
        timestamp: Date.now(),
      });
      return {
        content,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserTabs,
          browserArtifacts: [
            {
              type: "browser_log",
              label: "Browser tabs",
              contentText: content,
            },
          ],
        },
      };
    }

    if (toolName === "browser_open") {
      const request = normalizeBrowserActionRequest("open", args);
      if (!request.url) {
        throw new Error("browser_open requires a url.");
      }
      const navigationPolicy = await resolveBrowserNavigationPolicy(
        request.connectionId,
      );
      await assertBrowserNavigationAllowed({
        url: request.url,
        ...navigationPolicy,
      });

      let runtimeState = state;
      let resolved = await resolveBrowserPage({
        state: runtimeState,
        targetId: request.targetId,
        createIfMissing: true,
      });
      let { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      clearRoleRefsForTarget(runtimeState, targetId);

      const navigate = async (): Promise<Response | null> =>
        await page.goto(request.url, {
          waitUntil: "domcontentloaded",
          timeout: request.timeoutMs ?? 30_000,
        });

      let response: Response | null;
      try {
        response = await navigate();
      } catch (error) {
        if (!isRetryableBrowserNavigateError(error)) {
          throw error;
        }

        invalidateBrowserTarget({
          registry: runtimeState.targetRegistry,
          targetId,
          page,
        });
        await page.close().catch(() => undefined);

        try {
          resolved = await resolveBrowserPage({
            state: runtimeState,
            targetId: request.targetId,
            createIfMissing: true,
          });
          page = resolved.page;
          targetId = resolved.targetId;
          activePage = page;
          activeTargetId = targetId;
          clearRoleRefsForTarget(runtimeState, targetId);
          response = await navigate();
        } catch (retryError) {
          if (!isRetryableBrowserNavigateError(retryError)) {
            throw retryError;
          }
          runtimeState = await relaunchBrowserState(resolvedSessionId);
          state = runtimeState;
          resolved = await resolveBrowserPage({
            state: runtimeState,
            targetId: request.targetId,
            createIfMissing: true,
          });
          page = resolved.page;
          targetId = resolved.targetId;
          activePage = page;
          activeTargetId = targetId;
          clearRoleRefsForTarget(runtimeState, targetId);
          response = await navigate();
        }
      }

      await assertBrowserNavigationRedirectChainAllowed({
        request: response?.request() ?? null,
        ...navigationPolicy,
      });
      await assertBrowserNavigationResultAllowed({
        url: page.url(),
        ...navigationPolicy,
      });
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Opened ${page.url()}\nTitle: ${await page.title()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "open",
            targetId,
            profile: request.profile,
            url: page.url(),
            frame: request.frame,
            result: {
              title: await page.title(),
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Opened ${page.url()}`,
              contentText: `Opened ${page.url()}\nTitle: ${await page.title()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_snapshot") {
      const request = normalizeBrowserSnapshotRequest(args);
      const format = request.snapshotFormat ?? "ai";
      if (request.refs && format !== "role") {
        throw new Error(
          'Stable refs are currently available via snapshotFormat="role" with refs="role" or refs="aria".',
        );
      }
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const snapshotRequest = {
        ...request,
        targetId,
      };
      const snapshot =
        format === "aria"
          ? await buildAriaSnapshot({
              page,
              request: snapshotRequest,
              currentUrl: page.url(),
            })
          : format === "role"
            ? await buildRoleSnapshot({
                state,
                page,
                request: snapshotRequest,
                currentUrl: page.url(),
              })
          : await buildAiSnapshot({
              page,
              request: snapshotRequest,
                currentUrl: page.url(),
              });
      let labeledSnapshot:
        | {
            filePath: string;
            labels: number;
            skipped: number;
          }
        | undefined;
      if (request.labels === true) {
        labeledSnapshot = await captureLabeledScreenshot({
          state,
          page,
          targetId,
          sessionId: resolvedSessionId,
          selector: snapshotRequest.selector,
          frame: snapshotRequest.frame,
          timeoutMs: snapshotRequest.timeoutMs,
          imageType: "png",
          refs: "refs" in snapshot ? snapshot.refs : undefined,
        });
      }
      const snapshotWithLabels =
        labeledSnapshot && snapshot.format !== "aria"
          ? {
              ...snapshot,
              imagePath: labeledSnapshot.filePath,
              imageType: "png" as const,
              labelsCount: labeledSnapshot.labels,
              labelsSkipped: labeledSnapshot.skipped,
            }
          : labeledSnapshot && snapshot.format === "aria"
            ? {
                ...snapshot,
                imagePath: labeledSnapshot.filePath,
                imageType: "png" as const,
                labelsCount: labeledSnapshot.labels,
                labelsSkipped: labeledSnapshot.skipped,
              }
            : snapshot;
      const snapshotText =
        snapshotWithLabels.format === "aria"
          ? JSON.stringify(
              {
                format: snapshotWithLabels.format,
                targetId: snapshotWithLabels.targetId,
                url: snapshotWithLabels.url,
                nodes: snapshotWithLabels.nodes,
              },
              null,
              2,
            )
          : snapshotWithLabels.snapshot;

      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: snapshotText,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserSnapshot: snapshotWithLabels,
          browserArtifacts: await pageSnapshotArtifacts({
            page,
            selector: snapshotRequest.selector,
            frame: snapshotRequest.frame,
            snapshotLabel:
              snapshotWithLabels.format === "ai"
                ? "Visible text snapshot"
                : snapshotWithLabels.format === "role"
                  ? "Role snapshot"
                  : "ARIA snapshot",
            snapshotText,
            memoryTitle:
              snapshotWithLabels.format === "ai"
                ? "Browser visible text"
                : snapshotWithLabels.format === "role"
                  ? "Browser role snapshot"
                  : "Browser aria snapshot",
            memoryContent:
              snapshotWithLabels.format === "ai" || snapshotWithLabels.format === "role"
                ? snapshotWithLabels.snapshot
                : undefined,
            imagePath: snapshotWithLabels.imagePath,
          }),
        },
      };
    }

    if (toolName === "browser_console_messages") {
      const request = normalizeBrowserActionRequest("console_messages", args);
      const targetId = resolveBrowserTargetId(request.targetId);
      const entries = sliceRecentEntries(
        readBrowserConsoleEntries({
          state: state.sessionState,
          targetId,
          minLevel: request.minLevel,
          clear: request.clear,
        }),
        request.limit,
      );
      const content = entries.length
        ? JSON.stringify(entries, null, 2)
        : "No browser console messages for the selected target.";

      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: getCurrentBrowserUrl(state),
        timestamp: Date.now(),
      });
      return {
        content,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "console_messages",
            targetId,
            profile: request.profile,
            url: getCurrentBrowserUrl(state),
            result: {
              count: entries.length,
              minLevel: request.minLevel,
              cleared: request.clear === true,
            },
          } satisfies BrowserActionResult,
          browserConsoleEntries: entries,
          browserArtifacts: entries.length
            ? [
                {
                  type: "browser_log",
                  label: `Browser console (${targetId})`,
                  contentText: content,
                  memoryTitle: `Browser console (${targetId})`,
                  memoryContent: content,
                },
              ]
            : [],
        },
      };
    }

    if (toolName === "browser_page_errors") {
      const request = normalizeBrowserActionRequest("page_errors", args);
      const targetId = resolveBrowserTargetId(request.targetId);
      const entries = sliceRecentEntries(
        readBrowserPageErrorEntries({
          state: state.sessionState,
          targetId,
          clear: request.clear,
        }),
        request.limit,
      );
      const content = entries.length
        ? JSON.stringify(entries, null, 2)
        : "No browser page errors for the selected target.";

      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: getCurrentBrowserUrl(state),
        timestamp: Date.now(),
      });
      return {
        content,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "page_errors",
            targetId,
            profile: request.profile,
            url: getCurrentBrowserUrl(state),
            result: {
              count: entries.length,
              cleared: request.clear === true,
            },
          } satisfies BrowserActionResult,
          browserPageErrorEntries: entries,
          browserArtifacts: entries.length
            ? [
                {
                  type: "browser_log",
                  label: `Browser page errors (${targetId})`,
                  contentText: content,
                  memoryTitle: `Browser page errors (${targetId})`,
                  memoryContent: content,
                },
              ]
            : [],
        },
      };
    }

    if (toolName === "browser_network_requests") {
      const request = normalizeBrowserActionRequest("network_requests", args);
      const targetId = resolveBrowserTargetId(request.targetId);
      const entries = sliceRecentEntries(
        readBrowserRequestEntries({
          state: state.sessionState,
          targetId,
          filter: request.filter,
          clear: request.clear,
        }),
        request.limit,
      );
      const content = entries.length
        ? JSON.stringify(entries, null, 2)
        : "No browser network requests for the selected target.";

      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: getCurrentBrowserUrl(state),
        timestamp: Date.now(),
      });
      return {
        content,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "network_requests",
            targetId,
            profile: request.profile,
            url: getCurrentBrowserUrl(state),
            result: {
              count: entries.length,
              filter: request.filter,
              cleared: request.clear === true,
            },
          } satisfies BrowserActionResult,
          browserRequestEntries: entries,
          browserArtifacts: entries.length
            ? [
                {
                  type: "browser_log",
                  label: `Browser network requests (${targetId})`,
                  contentText: content,
                  memoryTitle: `Browser network requests (${targetId})`,
                  memoryContent: content,
                },
              ]
            : [],
        },
      };
    }

    if (toolName === "browser_click") {
      const request = normalizeBrowserActionRequest("click", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target = resolveLocatorInput({
        state,
        page,
        selector: request.selector,
        ref: request.ref,
        frame: request.frame,
        targetId,
        toolName,
      });
      await target.locator.click({
        timeout: request.timeoutMs ?? 15_000,
        ...(request.button ? { button: request.button as "left" | "right" | "middle" } : {}),
        ...(request.modifiers ? { modifiers: request.modifiers as Array<"Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift"> } : {}),
        ...(typeof request.delayMs === "number" ? { delay: request.delayMs } : {}),
        ...(request.doubleClick ? { clickCount: 2 } : {}),
      });
      await page
        .waitForLoadState("domcontentloaded", {
          timeout: Math.min(request.timeoutMs ?? 15_000, 10_000),
        })
        .catch(() => undefined);
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Clicked ${target.label} on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "click",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target.selector,
            ref: target.ref,
            frame: target.frame,
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Clicked ${target.label}`,
              contentText: `Clicked ${target.label} on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_hover") {
      const request = normalizeBrowserActionRequest("hover", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target = resolveLocatorInput({
        state,
        page,
        selector: request.selector,
        ref: request.ref,
        frame: request.frame,
        targetId,
        toolName,
      });
      await target.locator.hover({
        timeout: request.timeoutMs ?? 15_000,
      });
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Hovered ${target.label} on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "hover",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target.selector,
            ref: target.ref,
            frame: target.frame,
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Hovered ${target.label}`,
              contentText: `Hovered ${target.label} on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_type") {
      const request = normalizeBrowserActionRequest("type", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target = resolveLocatorInput({
        state,
        page,
        selector: request.selector,
        ref: request.ref,
        frame: request.frame,
        targetId,
        toolName,
      });
      await target.locator.fill(request.text, {
        timeout: request.timeoutMs ?? 15_000,
      });
      if (request.submit === true) {
        await target.locator.press("Enter");
        await page
          .waitForLoadState("domcontentloaded", {
            timeout: Math.min(request.timeoutMs ?? 15_000, 10_000),
          })
          .catch(() => undefined);
      }
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Typed into ${target.label} on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "type",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target.selector,
            ref: target.ref,
            frame: target.frame,
            result: {
              submitted: request.submit === true,
              textLength: request.text.length,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Typed into ${target.label}`,
              contentText: `Typed ${request.text.length} chars into ${target.label} on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_drag") {
      const request = normalizeBrowserActionRequest("drag", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const startTarget = resolveLocatorInput({
        state,
        page,
        selector: request.startSelector,
        ref: request.startRef,
        frame: request.frame,
        targetId,
        toolName,
      });
      const endTarget = resolveLocatorInput({
        state,
        page,
        selector: request.endSelector,
        ref: request.endRef,
        frame: request.frame,
        targetId,
        toolName,
      });
      await startTarget.locator.dragTo(endTarget.locator, {
        timeout: request.timeoutMs ?? 15_000,
      });
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Dragged ${startTarget.label} to ${endTarget.label} on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "drag",
            targetId,
            profile: request.profile,
            url: page.url(),
            frame: request.frame,
            result: {
              start: startTarget.label,
              end: endTarget.label,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Dragged ${startTarget.label} -> ${endTarget.label}`,
              contentText: `Dragged ${startTarget.label} to ${endTarget.label} on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_select") {
      const request = normalizeBrowserActionRequest("select", args);
      if (!request.values.length) {
        throw new Error("browser_select requires one or more values.");
      }
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target = resolveLocatorInput({
        state,
        page,
        selector: request.selector,
        ref: request.ref,
        frame: request.frame,
        targetId,
        toolName,
      });
      await target.locator.selectOption(request.values, {
        timeout: request.timeoutMs ?? 15_000,
      });
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Selected ${request.values.join(", ")} in ${target.label} on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "select",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target.selector,
            ref: target.ref,
            frame: target.frame,
            result: {
              values: request.values,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Selected option(s) in ${target.label}`,
              contentText: `Selected ${request.values.join(", ")} in ${target.label} on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_fill") {
      const request = normalizeBrowserActionRequest("fill", args);
      if (!request.fields.length) {
        throw new Error("browser_fill requires one or more fields.");
      }
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const timeoutMs = request.timeoutMs ?? 20_000;
      const touchedFields: string[] = [];

      for (const field of request.fields as BrowserFormField[]) {
        const target = resolveLocatorInput({
          state,
          page,
          selector: field.selector,
          ref: field.ref,
          frame: request.frame,
          targetId,
          toolName,
        });
        const fieldType = (field.type ?? "").trim().toLowerCase();
        const rawValue = field.value;
        if (fieldType === "checkbox" || fieldType === "radio") {
          const checked =
            rawValue === true ||
            rawValue === 1 ||
            rawValue === "1" ||
            rawValue === "true";
          await target.locator.setChecked(checked, {
            timeout: timeoutMs,
          });
        } else {
          await target.locator.fill(
            rawValue == null ? "" : String(rawValue),
            {
              timeout: timeoutMs,
            },
          );
        }
        touchedFields.push(target.label);
      }

      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Filled ${touchedFields.length} field(s) on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "fill",
            targetId,
            profile: request.profile,
            url: page.url(),
            frame: request.frame,
            result: {
              fields: touchedFields,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: "Filled form fields",
              contentText: `Filled ${touchedFields.length} field(s) on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_wait") {
      const request = normalizeBrowserActionRequest("wait", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const timeoutMs = request.timeoutMs ?? 30_000;

      if (request.selector) {
        await page.waitForSelector(request.selector, { timeout: timeoutMs });
      } else if (request.text) {
        await page.waitForFunction(
          ({ expected }) => document.body?.innerText.includes(expected),
          { expected: request.text },
          { timeout: timeoutMs },
        );
      } else if (request.textGone) {
        await page.waitForFunction(
          ({ expected }) => !document.body?.innerText.includes(expected),
          { expected: request.textGone },
          { timeout: timeoutMs },
        );
      } else if (request.url) {
        await page.waitForURL(request.url, { timeout: timeoutMs });
      } else if (request.loadState) {
        await page.waitForLoadState(request.loadState, { timeout: timeoutMs });
      } else {
        await page.waitForTimeout(Math.max(0, request.timeMs || 1_000));
      }

      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Wait completed on ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "wait",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: request.selector,
            ref: request.ref,
            frame: request.frame,
            result: {
              text: request.text,
              textGone: request.textGone,
              loadState: request.loadState,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: "Wait completed",
              contentText: `Wait completed on ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_evaluate") {
      const request = normalizeBrowserActionRequest("evaluate", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target =
        request.selector || request.ref
          ? resolveLocatorInput({
              state,
              page,
              selector: request.selector,
              ref: request.ref,
              frame: request.frame,
              targetId,
              toolName,
            })
          : null;
      const evaluation = await evaluateBrowserFunction({
        page,
        locator: target?.locator,
        fn: request.fn,
        timeoutMs: request.timeoutMs,
        signal: ctx.signal,
      });
      const content =
        evaluation === undefined
          ? "undefined"
          : typeof evaluation === "string"
            ? evaluation
            : JSON.stringify(evaluation, null, 2) ?? String(evaluation);
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "evaluate",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target?.selector,
            ref: target?.ref,
            frame: target?.frame ?? request.frame,
            result: evaluation,
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: target
                ? `Evaluated script for ${target.label}`
                : "Evaluated page script",
              contentText: content,
              memoryTitle: target
                ? `Browser evaluate: ${target.label}`
                : "Browser evaluate",
              memoryContent: content,
            },
          ],
        },
      };
    }

    if (toolName === "browser_batch") {
      const request = normalizeBrowserActionRequest("batch", args);
      if (!request.actions.length) {
        throw new Error("browser_batch requires one or more actions.");
      }
      activeTargetId = resolveBrowserTargetId(request.targetId);
      activePage =
        getBrowserTargetPage(state.targetRegistry, activeTargetId) ?? undefined;
      const results = await executeBrowserBatchActions({
        actions: request.actions,
        resolvedSessionId,
        ctx: {
          ...ctx,
          sessionId: resolvedSessionId,
          connectionId:
            typeof args.connectionId === "string"
              ? args.connectionId
              : ctx.connectionId,
        },
        fallbackTargetId: request.targetId,
        fallbackFrame: request.frame,
        fallbackTimeoutMs: request.timeoutMs,
        stopOnError: request.stopOnError,
      });
      const currentUrl = getCurrentBrowserUrl(state);
      const content = JSON.stringify({ results }, null, 2);
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl,
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl,
        timestamp: Date.now(),
      });
      return {
        content,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "batch",
            targetId: activeTargetId,
            profile: request.profile,
            url: currentUrl,
            frame: request.frame,
            result: {
              results,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: "Browser batch results",
              contentText: content,
              memoryTitle: "Browser batch results",
              memoryContent: content,
            },
          ],
        },
      };
    }

    if (toolName === "browser_set_input_files") {
      const request = normalizeBrowserActionRequest("set_input_files", args);
      const paths = normalizeBrowserInputPaths(request.paths);
      if (!paths.length) {
        throw new Error(
          "browser_set_input_files requires one or more existing file paths.",
        );
      }
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target = resolveLocatorInput({
        state,
        page,
        selector: request.selector,
        ref: request.ref,
        frame: request.frame,
        targetId,
        toolName,
      });
      await target.locator.setInputFiles(paths, {
        timeout: request.timeoutMs ?? 20_000,
      });
      await target.locator
        .evaluate((element) => {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        })
        .catch(() => undefined);
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Set ${paths.length} file(s) on ${target.label} at ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "set_input_files",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target.selector,
            ref: target.ref,
            frame: target.frame,
            result: {
              paths,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: `Set input files for ${target.label}`,
              contentText: `Set ${paths.length} file(s) on ${target.label} at ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_handle_dialog") {
      const request = normalizeBrowserActionRequest("handle_dialog", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const timeoutMs = request.timeoutMs ?? 20_000;
      void page
        .waitForEvent("dialog", { timeout: timeoutMs })
        .then(async (dialog) => {
          if (request.accept) {
            await dialog.accept(request.promptText);
          } else {
            await dialog.dismiss();
          }
        })
        .catch(() => undefined);
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `${request.accept ? "Armed accept" : "Armed dismiss"} dialog handler for ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "handle_dialog",
            targetId,
            profile: request.profile,
            url: page.url(),
            result: {
              accept: request.accept,
              promptText: request.promptText,
              timeoutMs,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: "Browser dialog handler armed",
              contentText: `${request.accept ? "Armed accept" : "Armed dismiss"} dialog handler for ${page.url()}`,
            },
          ],
        },
      };
    }

    if (toolName === "browser_screenshot") {
      const request = normalizeBrowserActionRequest("screenshot", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const imageType = request.type ?? "png";

      const target =
        request.selector || request.ref
          ? resolveLocatorInput({
              state,
              page,
              selector: request.selector,
              ref: request.ref,
              frame: request.frame,
              targetId,
              toolName,
            })
          : null;

      const screenshotCapture =
        request.labels === true
          ? await captureLabeledScreenshot({
              state,
              page,
              targetId,
              sessionId: resolvedSessionId,
              selector: request.selector,
              frame: request.frame,
              timeoutMs: request.timeoutMs ?? 15_000,
              fullPage: request.fullPage,
              imageType,
              target,
            })
          : {
              filePath: await allocateBrowserImagePath(
                resolvedSessionId,
                imageType,
              ),
              labels: 0,
              skipped: 0,
            };

      if (request.labels !== true) {
        if (target) {
          await target.locator.screenshot({
            path: screenshotCapture.filePath,
            timeout: request.timeoutMs ?? 15_000,
            type: imageType,
          });
        } else {
          await page.screenshot({
            path: screenshotCapture.filePath,
            fullPage: request.fullPage === true,
            timeout: request.timeoutMs ?? 15_000,
            type: imageType,
          });
        }
      }

      const browserScreenshot: BrowserScreenshotResult = {
        ok: true,
        targetId,
        profile: request.profile,
        url: page.url(),
        selector: target?.selector,
        frame: target?.frame ?? request.frame,
        labels: request.labels,
        labelsCount: request.labels === true ? screenshotCapture.labels : undefined,
        labelsSkipped: request.labels === true ? screenshotCapture.skipped : undefined,
        fullPage: request.fullPage,
        filePath: screenshotCapture.filePath,
        imageType,
      };

      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: `Screenshot captured for ${page.url()}`,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserScreenshot,
          browserArtifacts: [
            {
              type: "screenshot",
              label: `Screenshot ${hostnameLabel(page.url())}`,
              filePath: screenshotCapture.filePath,
            },
          ],
        },
      };
    }

    if (toolName === "browser_extract_text") {
      const request = normalizeBrowserActionRequest("extract_text", args);
      const resolved = await resolveBrowserPage({
        state,
        targetId: request.targetId,
      });
      const { page, targetId } = resolved;
      activePage = page;
      activeTargetId = targetId;
      const target =
        request.selector || request.ref
          ? resolveLocatorInput({
              state,
              page,
              selector: request.selector,
              ref: request.ref,
              frame: request.frame,
              targetId,
              toolName,
            })
          : null;
      const text = (
        target
          ? await target.locator.innerText()
          : await pageText(page, undefined, request.frame)
      )
        .trim()
        .slice(0, 12_000);
      await updateBrowserStatus(resolvedSessionId, {
        currentUrl: page.url(),
        status: "ready",
        lastError: undefined,
      });
      emitBrowserAction({
        sessionId: resolvedSessionId,
        action: toolName,
        args,
        currentUrl: page.url(),
        timestamp: Date.now(),
      });
      return {
        content: text,
        metadata: {
          browserSession: await getBrowserSessionRecord(resolvedSessionId),
          browserAction: {
            ok: true,
            kind: "extract_text",
            targetId,
            profile: request.profile,
            url: page.url(),
            selector: target?.selector,
            ref: target?.ref,
            frame: target?.frame ?? request.frame,
            result: {
              chars: text.length,
            },
          } satisfies BrowserActionResult,
          browserArtifacts: [
            {
              type: "browser_log",
              label: target
                ? `Extracted text from ${target.label}`
                : "Extracted page text",
              contentText: text,
              memoryTitle: target
                ? `Browser text: ${target.label}`
                : "Browser page text",
              memoryContent: text,
            },
          ],
        },
      };
    }

    throw new Error(`Unsupported browser tool "${toolName}".`);
  } catch (error) {
    if (
      shouldRetryBrowserToolWithoutTarget({
        toolName,
        args,
        error,
        attachedPageCount: countAttachedBrowserPages(state),
      })
    ) {
      return await executeBrowserTool(
        toolName,
        stripBrowserTargetId(args),
        {
          ...ctx,
          sessionId: resolvedSessionId,
          connectionId:
            typeof args.connectionId === "string"
              ? args.connectionId
              : ctx.connectionId,
        },
      );
    }

    const currentUrl = activePage?.url() || getCurrentBrowserUrl(state);
    const failedTargetId = activeTargetId ?? resolveBrowserTargetId(args.targetId);
    const browserActivity = snapshotBrowserTargetActivity(
      state.sessionState,
      failedTargetId,
    );
    await updateBrowserStatus(resolvedSessionId, {
      currentUrl,
      status: "error",
      lastError: normalizeErrorMessage(error),
    }).catch(() => undefined);
    const result = await buildBrowserFailureResult({
      error,
      toolName,
      page: activePage,
      currentUrl,
      targetId: failedTargetId,
      profile: normalizeBrowserProfile(args.profile),
      selector: typeof args.selector === "string" ? args.selector : undefined,
      ref: typeof args.ref === "string" ? args.ref : undefined,
      frame: typeof args.frame === "string" ? args.frame : undefined,
      targetDir: browserTempDir(resolvedSessionId),
    });
    const existingArtifacts = Array.isArray(result.metadata?.browserArtifacts)
      ? (result.metadata?.browserArtifacts as BrowserArtifactHint[])
      : [];
    return {
      ...result,
      metadata: {
        ...(result.metadata ?? {}),
        browserActivity,
        browserArtifacts: [
          ...existingArtifacts,
          ...buildBrowserActivityArtifactHints({
            toolName,
            targetId: failedTargetId,
            activity: browserActivity,
          }),
        ],
        browserSession: await getBrowserSessionRecord(resolvedSessionId),
      },
    };
  }
}
