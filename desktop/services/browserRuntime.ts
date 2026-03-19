import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { BrowserSessionRecord } from "../../src/types/runtime.js";
import { browserProfileDir, browserTempDir } from "./v2Paths.js";
import {
  deleteBrowserSessionRecord,
  getBrowserSessionRecord,
  upsertBrowserSessionRecord,
} from "./v2SessionStore.js";
import type { NativeToolExecutionResult } from "./nativeTools.js";

export type BrowserRuntimeContext = {
  sessionId: string;
  signal?: AbortSignal;
};

type BrowserState = {
  sessionId: string;
  browserSessionId: string;
  profilePath: string;
  context: BrowserContext;
  page: Page;
};

type BrowserArtifactHint = {
  type: "screenshot" | "dom_snapshot" | "browser_log";
  label: string;
  contentText?: string;
  filePath?: string;
  memoryTitle?: string;
  memoryContent?: string;
};

const browserStates = new Map<string, BrowserState>();

function resolveBrowserExecutablePath(): string | null {
  const candidates = [
    process.env.CODEX_AGENT_BROWSER_PATH,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : "",
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : "",
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

async function saveBrowserSessionRecord(record: BrowserSessionRecord): Promise<BrowserSessionRecord> {
  return await upsertBrowserSessionRecord(record);
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
  const state: BrowserState = {
    sessionId,
    browserSessionId,
    profilePath,
    context,
    page,
  };
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
    return existing;
  }
  return await launchBrowserState(sessionId);
}

async function updateBrowserStatus(sessionId: string, patch: Partial<BrowserSessionRecord>): Promise<void> {
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

async function pageText(page: Page, selector?: string): Promise<string> {
  if (selector) {
    return (await page.locator(selector).innerText()).trim();
  }
  return (await page.locator("body").innerText()).trim();
}

async function pageSnapshotArtifacts(page: Page): Promise<BrowserArtifactHint[]> {
  const html = await page.content();
  const text = (await pageText(page)).slice(0, 12000);
  return [
    {
      type: "dom_snapshot",
      label: "DOM snapshot",
      contentText: html,
      memoryTitle: "Browser DOM snapshot",
      memoryContent: text,
    },
    {
      type: "browser_log",
      label: "Visible text snapshot",
      contentText: text,
      memoryTitle: "Browser visible text",
      memoryContent: text,
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

export async function getBrowserSessionStatus(sessionId: string): Promise<BrowserSessionRecord | null> {
  return await getBrowserSessionRecord(sessionId);
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
    | "browser_open"
    | "browser_snapshot"
    | "browser_click"
    | "browser_type"
    | "browser_wait"
    | "browser_screenshot"
    | "browser_extract_text"
    | "browser_close",
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<NativeToolExecutionResult> {
  if (toolName === "browser_close") {
    await resetBrowserSession(ctx.sessionId);
    return {
      content: "Browser session closed.",
      metadata: {
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

  const state = await getBrowserState(ctx.sessionId);
  const page = state.page;

  if (toolName === "browser_open") {
    const url = String(args.url ?? "").trim();
    if (!url) {
      throw new Error("browser_open requires a url.");
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await updateBrowserStatus(ctx.sessionId, {
      currentUrl: page.url(),
      status: "ready",
      lastError: undefined,
    });
    return {
      content: `Opened ${page.url()}`,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
        browserArtifacts: [
          {
            type: "browser_log",
            label: `Opened ${page.url()}`,
            contentText: `Opened ${page.url()}\nTitle: ${await page.title()}`,
          },
          ...(await pageSnapshotArtifacts(page)),
        ],
      },
    };
  }

  if (toolName === "browser_snapshot") {
    await updateBrowserStatus(ctx.sessionId, {
      currentUrl: page.url(),
      status: "ready",
      lastError: undefined,
    });
    return {
      content: `Snapshot captured for ${page.url()}`,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
        browserArtifacts: await pageSnapshotArtifacts(page),
      },
    };
  }

  if (toolName === "browser_click") {
    const selector = String(args.selector ?? "").trim();
    if (!selector) {
      throw new Error("browser_click requires a selector.");
    }
    await page.click(selector, { timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    await updateBrowserStatus(ctx.sessionId, {
      currentUrl: page.url(),
      status: "ready",
      lastError: undefined,
    });
    return {
      content: `Clicked ${selector} on ${page.url()}`,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
        browserArtifacts: [
          {
            type: "browser_log",
            label: `Clicked ${selector}`,
            contentText: `Clicked ${selector} on ${page.url()}`,
          },
        ],
      },
    };
  }

  if (toolName === "browser_type") {
    const selector = String(args.selector ?? "").trim();
    const text = String(args.text ?? "");
    if (!selector) {
      throw new Error("browser_type requires a selector.");
    }
    await page.locator(selector).fill(text);
    if (args.submit === true) {
      await page.locator(selector).press("Enter");
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    }
    await updateBrowserStatus(ctx.sessionId, {
      currentUrl: page.url(),
      status: "ready",
      lastError: undefined,
    });
    return {
      content: `Typed into ${selector} on ${page.url()}`,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
        browserArtifacts: [
          {
            type: "browser_log",
            label: `Typed into ${selector}`,
            contentText: `Typed ${text.length} chars into ${selector} on ${page.url()}`,
          },
        ],
      },
    };
  }

  if (toolName === "browser_wait") {
    const selector = typeof args.selector === "string" ? args.selector.trim() : "";
    const text = typeof args.text === "string" ? args.text : "";
    const timeMs = Number(args.timeMs ?? 0);
    if (selector) {
      await page.waitForSelector(selector, { timeout: 30_000 });
    } else if (text) {
      await page.waitForFunction(
        ({ expected }) => document.body?.innerText.includes(expected),
        { expected: text },
        { timeout: 30_000 },
      );
    } else {
      await page.waitForTimeout(Math.max(0, timeMs || 1_000));
    }
    await updateBrowserStatus(ctx.sessionId, {
      currentUrl: page.url(),
      status: "ready",
      lastError: undefined,
    });
    return {
      content: `Wait completed on ${page.url()}`,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
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

  if (toolName === "browser_screenshot") {
    const targetDir = browserTempDir(ctx.sessionId);
    await fsp.mkdir(targetDir, { recursive: true });
    const screenshotPath = path.join(targetDir, `${Date.now()}-${randomUUID()}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: args.fullPage === true,
      timeout: 15_000,
    });
    return {
      content: `Screenshot captured for ${page.url()}`,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
        browserArtifacts: [
          {
            type: "screenshot",
            label: `Screenshot ${hostnameLabel(page.url())}`,
            filePath: screenshotPath,
          },
        ],
      },
    };
  }

  if (toolName === "browser_extract_text") {
    const selector = typeof args.selector === "string" ? args.selector.trim() : undefined;
    const text = (await pageText(page, selector)).slice(0, 12000);
    await updateBrowserStatus(ctx.sessionId, {
      currentUrl: page.url(),
      status: "ready",
      lastError: undefined,
    });
    return {
      content: text,
      metadata: {
        browserSession: await getBrowserSessionRecord(ctx.sessionId),
        browserArtifacts: [
          {
            type: "browser_log",
            label: selector ? `Extracted text from ${selector}` : "Extracted page text",
            contentText: text,
            memoryTitle: selector ? `Browser text: ${selector}` : "Browser page text",
            memoryContent: text,
          },
        ],
      },
    };
  }

  throw new Error(`Unsupported browser tool "${toolName}".`);
}
