import type {
  BrowserActionRequest,
  BrowserBatchActionRequest,
  BrowserFormField,
  BrowserProfileId,
  BrowserRefMode,
  BrowserSnapshotFormat,
  BrowserSnapshotRequest,
  BrowserTabsRequest,
  BrowserTargetId,
} from "../../src/types/browser.js";

export const DEFAULT_BROWSER_TARGET_ID: BrowserTargetId = "main";

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith("[")) {
      try {
        return normalizeStringArray(JSON.parse(trimmed));
      } catch {
        return undefined;
      }
    }

    const normalized = trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" && entry.trim() ? entry.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function asObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeBrowserFieldValue(
  value: unknown,
): string | number | boolean | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

function normalizeBrowserFormFields(value: unknown): BrowserFormField[] | undefined {
  let parsed = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const normalized = parsed
    .map((entry) => asObjectRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      selector: normalizeBrowserSelector(entry.selector),
      ref: normalizeOptionalString(entry.ref),
      type: normalizeOptionalString(entry.type),
      value: normalizeBrowserFieldValue(entry.value),
    }))
    .filter((entry) => entry.selector || entry.ref);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBrowserBatchActionRecord(
  value: unknown,
): BrowserBatchActionRequest | undefined {
  const record = asObjectRecord(value);
  const kind = typeof record?.kind === "string" ? record.kind : undefined;
  if (!record || !kind) {
    return undefined;
  }

  switch (kind) {
    case "click":
    case "hover":
    case "type":
    case "drag":
    case "select":
    case "fill":
    case "wait":
    case "evaluate":
    case "batch":
    case "close":
      return normalizeBrowserActionRequest(
        kind,
        record,
      ) as BrowserBatchActionRequest;
    default:
      return undefined;
  }
}

function normalizeBrowserBatchActions(
  value: unknown,
): BrowserBatchActionRequest[] | undefined {
  let parsed = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const normalized = parsed
    .map((entry) => normalizeBrowserBatchActionRecord(entry))
    .filter(
      (entry): entry is BrowserBatchActionRequest => Boolean(entry),
    );

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeBrowserProfile(value: unknown): BrowserProfileId | undefined {
  return normalizeOptionalString(value);
}

export function normalizeBrowserTargetId(value: unknown): BrowserTargetId | undefined {
  return normalizeOptionalString(value);
}

export function resolveBrowserTargetId(value: unknown): BrowserTargetId {
  return normalizeBrowserTargetId(value) ?? DEFAULT_BROWSER_TARGET_ID;
}

export function normalizeBrowserSelector(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

export function normalizeBrowserFrame(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

export function normalizeBrowserSnapshotFormat(
  value: unknown,
): BrowserSnapshotFormat | undefined {
  return value === "ai" || value === "aria" || value === "role"
    ? value
    : undefined;
}

export function normalizeBrowserRefMode(value: unknown): BrowserRefMode | undefined {
  return value === "role" || value === "aria" ? value : undefined;
}

export function normalizeBrowserSnapshotRequest(
  args: Record<string, unknown>,
): BrowserSnapshotRequest {
  return {
    connectionId: normalizeOptionalString(args.connectionId),
    profile: normalizeBrowserProfile(args.profile),
    targetId: normalizeBrowserTargetId(args.targetId),
    selector: normalizeBrowserSelector(args.selector),
    ref: normalizeOptionalString(args.ref),
    frame: normalizeBrowserFrame(args.frame),
    timeoutMs: normalizeFiniteNumber(args.timeoutMs),
    snapshotFormat: normalizeBrowserSnapshotFormat(args.snapshotFormat),
    refs: normalizeBrowserRefMode(args.refs),
    labels: typeof args.labels === "boolean" ? args.labels : undefined,
    limit: normalizeFiniteNumber(args.limit),
    maxChars: normalizeFiniteNumber(args.maxChars),
  };
}

export function normalizeBrowserTabsRequest(
  args: Record<string, unknown>,
): BrowserTabsRequest {
  return {
    connectionId: normalizeOptionalString(args.connectionId),
    profile: normalizeBrowserProfile(args.profile),
  };
}

export function normalizeBrowserActionRequest<
  TKind extends BrowserActionRequest["kind"],
>(
  kind: TKind,
  args: Record<string, unknown>,
): Extract<BrowserActionRequest, { kind: TKind }>;
export function normalizeBrowserActionRequest(
  kind: BrowserActionRequest["kind"],
  args: Record<string, unknown>,
): BrowserActionRequest {
  const base = {
    connectionId: normalizeOptionalString(args.connectionId),
    profile: normalizeBrowserProfile(args.profile),
    targetId: normalizeBrowserTargetId(args.targetId),
    selector: normalizeBrowserSelector(args.selector),
    ref: normalizeOptionalString(args.ref),
    frame: normalizeBrowserFrame(args.frame),
    timeoutMs: normalizeFiniteNumber(args.timeoutMs),
  };

  switch (kind) {
    case "open":
      return {
        ...base,
        kind,
        url: String(args.url ?? "").trim(),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "click":
      return {
        ...base,
        kind,
        button: normalizeOptionalString(args.button),
        doubleClick: args.doubleClick === true,
        modifiers: normalizeStringArray(args.modifiers),
        delayMs: normalizeFiniteNumber(args.delayMs),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "hover":
      return {
        ...base,
        kind,
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "type":
      return {
        ...base,
        kind,
        text: String(args.text ?? ""),
        submit: args.submit === true,
        slowly: args.slowly === true,
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "drag":
      return {
        ...base,
        kind,
        startSelector: normalizeBrowserSelector(args.startSelector),
        startRef: normalizeOptionalString(args.startRef),
        endSelector: normalizeBrowserSelector(args.endSelector),
        endRef: normalizeOptionalString(args.endRef),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "select":
      return {
        ...base,
        kind,
        values: normalizeStringArray(args.values) ?? [],
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "fill":
      return {
        ...base,
        kind,
        fields: normalizeBrowserFormFields(args.fields) ?? [],
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "wait":
      return {
        ...base,
        kind,
        timeMs: normalizeFiniteNumber(args.timeMs),
        text: normalizeOptionalString(args.text),
        textGone: normalizeOptionalString(args.textGone),
        url: normalizeOptionalString(args.url),
        loadState:
          args.loadState === "load" ||
          args.loadState === "domcontentloaded" ||
          args.loadState === "networkidle"
            ? args.loadState
            : undefined,
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "evaluate":
      return {
        ...base,
        kind,
        fn: String(args.fn ?? ""),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "batch":
      return {
        ...base,
        kind,
        actions: normalizeBrowserBatchActions(args.actions) ?? [],
        stopOnError:
          typeof args.stopOnError === "boolean" ? args.stopOnError : undefined,
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "set_input_files":
      return {
        ...base,
        kind,
        paths: normalizeStringArray(args.paths) ?? [],
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "handle_dialog":
      return {
        ...base,
        kind,
        accept: args.accept === true,
        promptText: normalizeOptionalString(args.promptText),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "extract_text":
      return {
        ...base,
        kind,
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "screenshot":
      return {
        ...base,
        kind,
        fullPage: args.fullPage === true,
        labels: args.labels === true,
        type: args.type === "jpeg" ? "jpeg" : "png",
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "console_messages":
      return {
        ...base,
        kind,
        minLevel:
          args.minLevel === "debug" ||
          args.minLevel === "info" ||
          args.minLevel === "log" ||
          args.minLevel === "warning" ||
          args.minLevel === "error"
            ? args.minLevel
            : undefined,
        clear: args.clear === true,
        limit: normalizeFiniteNumber(args.limit),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "page_errors":
      return {
        ...base,
        kind,
        clear: args.clear === true,
        limit: normalizeFiniteNumber(args.limit),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "network_requests":
      return {
        ...base,
        kind,
        filter: normalizeOptionalString(args.filter),
        clear: args.clear === true,
        limit: normalizeFiniteNumber(args.limit),
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
    case "close":
      return {
        ...base,
        kind,
      } as Extract<BrowserActionRequest, { kind: typeof kind }>;
  }
}
