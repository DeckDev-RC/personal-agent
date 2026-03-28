import type {
  BrowserConsoleEntry,
  BrowserConsoleLevel,
  BrowserPageErrorEntry,
  BrowserRequestEntry,
  BrowserRefMode,
  BrowserTargetId,
} from "../../src/types/browser.js";
import { DEFAULT_BROWSER_TARGET_ID } from "./browserContract.js";
import type { BrowserRoleRefMap } from "./browserRoleRefs.js";

export type StoredBrowserRoleRefs = {
  refs: BrowserRoleRefMap;
  mode: BrowserRefMode;
  frame?: string;
  url?: string;
  createdAt: number;
};

export type BrowserTargetActivity = {
  console: BrowserConsoleEntry[];
  errors: BrowserPageErrorEntry[];
  requests: BrowserRequestEntry[];
};

export type BrowserSessionState = {
  activeTargetId: BrowserTargetId;
  roleRefsByTarget: Map<BrowserTargetId, StoredBrowserRoleRefs>;
  activityByTarget: Map<BrowserTargetId, BrowserTargetActivity>;
};

const BROWSER_CONSOLE_LIMIT = 500;
const BROWSER_ERROR_LIMIT = 200;
const BROWSER_REQUEST_LIMIT = 500;

function normalizeTargetId(value: unknown): BrowserTargetId | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function createBrowserSessionState(
  defaultTargetId: BrowserTargetId = DEFAULT_BROWSER_TARGET_ID,
): BrowserSessionState {
  return {
    activeTargetId: normalizeTargetId(defaultTargetId) ?? DEFAULT_BROWSER_TARGET_ID,
    roleRefsByTarget: new Map(),
    activityByTarget: new Map(),
  };
}

export function resolveBrowserSessionTargetId(
  state: BrowserSessionState,
  requestedTargetId?: BrowserTargetId,
): BrowserTargetId {
  return normalizeTargetId(requestedTargetId) ?? state.activeTargetId;
}

export function setBrowserSessionActiveTarget(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): BrowserTargetId {
  state.activeTargetId =
    normalizeTargetId(targetId) ?? DEFAULT_BROWSER_TARGET_ID;
  return state.activeTargetId;
}

export function storeBrowserRoleRefs(params: {
  state: BrowserSessionState;
  targetId: BrowserTargetId;
  refs: BrowserRoleRefMap;
  mode: BrowserRefMode;
  frame?: string;
  url?: string;
}): void {
  params.state.roleRefsByTarget.set(params.targetId, {
    refs: { ...params.refs },
    mode: params.mode,
    frame: params.frame,
    url: params.url,
    createdAt: Date.now(),
  });
}

export function getStoredBrowserRoleRefs(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): StoredBrowserRoleRefs | undefined {
  return state.roleRefsByTarget.get(
    resolveBrowserSessionTargetId(state, targetId),
  );
}

export function clearBrowserRoleRefs(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): void {
  state.roleRefsByTarget.delete(resolveBrowserSessionTargetId(state, targetId));
}

function appendCappedEntry<T>(
  entries: T[],
  entry: T,
  maxEntries = BROWSER_CONSOLE_LIMIT,
): void {
  entries.push(entry);
  if (entries.length > maxEntries) {
    entries.splice(0, entries.length - maxEntries);
  }
}

function getOrCreateBrowserTargetActivity(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): BrowserTargetActivity {
  const resolvedTargetId = resolveBrowserSessionTargetId(state, targetId);
  const existing = state.activityByTarget.get(resolvedTargetId);
  if (existing) {
    return existing;
  }

  const created: BrowserTargetActivity = {
    console: [],
    errors: [],
    requests: [],
  };
  state.activityByTarget.set(resolvedTargetId, created);
  return created;
}

export function getBrowserTargetActivity(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): BrowserTargetActivity | undefined {
  return state.activityByTarget.get(resolveBrowserSessionTargetId(state, targetId));
}

export function clearBrowserTargetActivity(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): void {
  state.activityByTarget.delete(resolveBrowserSessionTargetId(state, targetId));
}

export function snapshotBrowserTargetActivity(
  state: BrowserSessionState,
  targetId?: BrowserTargetId,
): BrowserTargetActivity | undefined {
  const activity = getBrowserTargetActivity(state, targetId);
  if (!activity) {
    return undefined;
  }

  return {
    console: activity.console.map((entry) => ({
      ...entry,
      ...(entry.location ? { location: { ...entry.location } } : {}),
    })),
    errors: activity.errors.map((entry) => ({ ...entry })),
    requests: activity.requests.map((entry) => ({ ...entry })),
  };
}

function consolePriority(level: BrowserConsoleLevel): number {
  switch (level) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "debug":
      return 0;
    case "info":
    case "log":
    default:
      return 1;
  }
}

export function readBrowserConsoleEntries(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  minLevel?: BrowserConsoleLevel;
  clear?: boolean;
}): BrowserConsoleEntry[] {
  const activity = getBrowserTargetActivity(params.state, params.targetId);
  if (!activity) {
    return [];
  }

  const minPriority =
    typeof params.minLevel === "string"
      ? consolePriority(params.minLevel)
      : undefined;
  const entries = activity.console
    .filter((entry) =>
      minPriority === undefined
        ? true
        : consolePriority(entry.level) >= minPriority,
    )
    .map((entry) => ({
      ...entry,
      ...(entry.location ? { location: { ...entry.location } } : {}),
    }));

  if (params.clear) {
    activity.console = [];
  }

  return entries;
}

export function readBrowserPageErrorEntries(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  clear?: boolean;
}): BrowserPageErrorEntry[] {
  const activity = getBrowserTargetActivity(params.state, params.targetId);
  if (!activity) {
    return [];
  }

  const entries = activity.errors.map((entry) => ({ ...entry }));
  if (params.clear) {
    activity.errors = [];
  }

  return entries;
}

export function readBrowserRequestEntries(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  filter?: string;
  clear?: boolean;
}): BrowserRequestEntry[] {
  const activity = getBrowserTargetActivity(params.state, params.targetId);
  if (!activity) {
    return [];
  }

  const filter = typeof params.filter === "string" ? params.filter.trim() : "";
  const entries = activity.requests
    .filter((entry) => (filter ? entry.url.includes(filter) : true))
    .map((entry) => ({ ...entry }));

  if (params.clear) {
    activity.requests = [];
  }

  return entries;
}

export function appendBrowserConsoleEntry(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  entry: BrowserConsoleEntry;
  maxEntries?: number;
}): void {
  appendCappedEntry(
    getOrCreateBrowserTargetActivity(params.state, params.targetId).console,
    params.entry,
    params.maxEntries ?? BROWSER_CONSOLE_LIMIT,
  );
}

export function appendBrowserPageErrorEntry(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  entry: BrowserPageErrorEntry;
  maxEntries?: number;
}): void {
  appendCappedEntry(
    getOrCreateBrowserTargetActivity(params.state, params.targetId).errors,
    params.entry,
    params.maxEntries ?? BROWSER_ERROR_LIMIT,
  );
}

export function appendBrowserRequestEntry(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  entry: BrowserRequestEntry;
  maxEntries?: number;
}): void {
  appendCappedEntry(
    getOrCreateBrowserTargetActivity(params.state, params.targetId).requests,
    params.entry,
    params.maxEntries ?? BROWSER_REQUEST_LIMIT,
  );
}

export function upsertBrowserRequestEntry(params: {
  state: BrowserSessionState;
  targetId?: BrowserTargetId;
  requestId: string;
  entry: Omit<BrowserRequestEntry, "id">;
  maxEntries?: number;
}): void {
  const activity = getOrCreateBrowserTargetActivity(params.state, params.targetId);
  const requestId = params.requestId.trim();
  if (!requestId) {
    appendCappedEntry(
      activity.requests,
      params.entry,
      params.maxEntries ?? BROWSER_REQUEST_LIMIT,
    );
    return;
  }

  const nextEntry: BrowserRequestEntry = {
    id: requestId,
    ...params.entry,
  };
  const existingIndex = activity.requests.findIndex(
    (entry) => entry.id === requestId,
  );

  if (existingIndex >= 0) {
    activity.requests[existingIndex] = {
      ...activity.requests[existingIndex],
      ...nextEntry,
    };
    return;
  }

  appendCappedEntry(
    activity.requests,
    nextEntry,
    params.maxEntries ?? BROWSER_REQUEST_LIMIT,
  );
}

export function cleanupBrowserTarget(
  state: BrowserSessionState,
  targetId: BrowserTargetId,
): void {
  state.roleRefsByTarget.delete(targetId);
  state.activityByTarget.delete(targetId);
}
