import type { BrowserContext, Page } from "playwright-core";
import type { BrowserTab, BrowserTargetId } from "../../src/types/browser.js";
import { DEFAULT_BROWSER_TARGET_ID } from "./browserContract.js";

export type BrowserTargetRegistry = {
  pagesByTargetId: Map<BrowserTargetId, Page>;
  targetIdByPage: WeakMap<Page, BrowserTargetId>;
  nextGeneratedTargetIndex: number;
};

function normalizeTargetId(value: unknown): BrowserTargetId | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nextGeneratedTargetId(registry: BrowserTargetRegistry): BrowserTargetId {
  while (true) {
    const candidate = `tab-${registry.nextGeneratedTargetIndex}`;
    registry.nextGeneratedTargetIndex += 1;
    if (!registry.pagesByTargetId.has(candidate)) {
      return candidate;
    }
  }
}

function isTargetPageUsable(page: Page | undefined): page is Page {
  return page !== undefined && !page.isClosed();
}

export function createBrowserTargetRegistry(): BrowserTargetRegistry {
  return {
    pagesByTargetId: new Map(),
    targetIdByPage: new WeakMap(),
    nextGeneratedTargetIndex: 1,
  };
}

export function pruneClosedBrowserTargets(
  registry: BrowserTargetRegistry,
): void {
  for (const [targetId, page] of registry.pagesByTargetId.entries()) {
    if (!isTargetPageUsable(page)) {
      registry.pagesByTargetId.delete(targetId);
    }
  }
}

export function registerBrowserTarget(params: {
  registry: BrowserTargetRegistry;
  page: Page;
  targetId?: BrowserTargetId;
}): BrowserTargetId {
  const existingTargetId = params.registry.targetIdByPage.get(params.page);
  if (existingTargetId) {
    params.registry.pagesByTargetId.set(existingTargetId, params.page);
    return existingTargetId;
  }

  const requestedTargetId = normalizeTargetId(params.targetId);
  const targetId = requestedTargetId ?? nextGeneratedTargetId(params.registry);
  params.registry.pagesByTargetId.set(targetId, params.page);
  params.registry.targetIdByPage.set(params.page, targetId);
  return targetId;
}

export function syncBrowserTargetsFromContext(params: {
  registry: BrowserTargetRegistry;
  context: BrowserContext;
}): BrowserTargetId[] {
  pruneClosedBrowserTargets(params.registry);
  const registered: BrowserTargetId[] = [];
  for (const page of params.context.pages()) {
    if (!isTargetPageUsable(page)) {
      continue;
    }
    if (params.registry.targetIdByPage.get(page)) {
      continue;
    }
    registered.push(
      registerBrowserTarget({
        registry: params.registry,
        page,
      }),
    );
  }
  return registered;
}

export function getBrowserTargetPage(
  registry: BrowserTargetRegistry,
  targetId?: BrowserTargetId,
): Page | null {
  pruneClosedBrowserTargets(registry);
  const normalizedTargetId = normalizeTargetId(targetId);
  if (normalizedTargetId) {
    return registry.pagesByTargetId.get(normalizedTargetId) ?? null;
  }

  return (
    registry.pagesByTargetId.get(DEFAULT_BROWSER_TARGET_ID) ??
    registry.pagesByTargetId.values().next().value ??
    null
  );
}

export function getBrowserTargetIdForPage(
  registry: BrowserTargetRegistry,
  page: Page,
): BrowserTargetId | null {
  return registry.targetIdByPage.get(page) ?? null;
}

export function invalidateBrowserTarget(params: {
  registry: BrowserTargetRegistry;
  targetId?: BrowserTargetId;
  page?: Page;
}): void {
  const normalizedTargetId = normalizeTargetId(params.targetId);
  if (normalizedTargetId) {
    const page = params.registry.pagesByTargetId.get(normalizedTargetId);
    if (page) {
      params.registry.targetIdByPage.delete(page);
    }
    params.registry.pagesByTargetId.delete(normalizedTargetId);
  }

  if (params.page) {
    const existingTargetId = params.registry.targetIdByPage.get(params.page);
    if (existingTargetId) {
      params.registry.pagesByTargetId.delete(existingTargetId);
    }
    params.registry.targetIdByPage.delete(params.page);
  }
}

export async function ensureBrowserTargetPage(params: {
  registry: BrowserTargetRegistry;
  context: BrowserContext;
  targetId?: BrowserTargetId;
  createIfMissing?: boolean;
}): Promise<{ page: Page; targetId: BrowserTargetId; created: boolean } | null> {
  syncBrowserTargetsFromContext(params);

  const normalizedTargetId = normalizeTargetId(params.targetId);
  const existingPage = getBrowserTargetPage(params.registry, normalizedTargetId ?? undefined);
  if (existingPage) {
    const existingTargetId =
      getBrowserTargetIdForPage(params.registry, existingPage) ??
      normalizedTargetId ??
      DEFAULT_BROWSER_TARGET_ID;
    return {
      page: existingPage,
      targetId: existingTargetId,
      created: false,
    };
  }

  if (normalizedTargetId && params.createIfMissing) {
    const page = await params.context.newPage();
    const targetId = registerBrowserTarget({
      registry: params.registry,
      page,
      targetId: normalizedTargetId,
    });
    return {
      page,
      targetId,
      created: true,
    };
  }

  if (!normalizedTargetId && params.createIfMissing) {
    const page = await params.context.newPage();
    const targetId = registerBrowserTarget({
      registry: params.registry,
      page,
      targetId: DEFAULT_BROWSER_TARGET_ID,
    });
    return {
      page,
      targetId,
      created: true,
    };
  }

  return null;
}

export async function listBrowserTargets(
  registry: BrowserTargetRegistry,
): Promise<BrowserTab[]> {
  pruneClosedBrowserTargets(registry);
  const tabs: BrowserTab[] = [];
  for (const [targetId, page] of registry.pagesByTargetId.entries()) {
    tabs.push({
      targetId,
      title: await page.title().catch(() => ""),
      url: page.url(),
    });
  }
  return tabs;
}
