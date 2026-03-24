import type { BrowserRoleRef, BrowserSnapshotStats } from "../../src/types/browser.js";
import {
  CONTENT_ROLES,
  INTERACTIVE_ROLES,
  STRUCTURAL_ROLES,
} from "./browserSnapshotRoles.js";

export type BrowserRoleRefMap = Record<string, BrowserRoleRef>;

export type BrowserRoleSnapshotOptions = {
  interactive?: boolean;
  maxDepth?: number;
  compact?: boolean;
};

export function getBrowserRoleSnapshotStats(
  snapshot: string,
  refs: BrowserRoleRefMap,
): BrowserSnapshotStats {
  const interactive = Object.values(refs).filter((ref) =>
    INTERACTIVE_ROLES.has(ref.role),
  ).length;
  return {
    lines: snapshot ? snapshot.split(/\r?\n/).length : 0,
    chars: snapshot.length,
    refs: Object.keys(refs).length,
    interactive,
  };
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

function matchSnapshotLine(
  line: string,
  options: BrowserRoleSnapshotOptions,
): { roleRaw: string; role: string; name?: string; suffix: string } | null {
  const depth = getIndentLevel(line);
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return null;
  }

  const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
  if (!match) {
    return null;
  }

  const [, , roleRaw, name, suffix] = match;
  if (roleRaw.startsWith("/")) {
    return null;
  }

  const role = roleRaw.toLowerCase();
  return {
    roleRaw,
    role,
    ...(name ? { name } : {}),
    suffix,
  };
}

type RoleNameTracker = {
  counts: Map<string, number>;
  refsByKey: Map<string, string[]>;
  getKey: (role: string, name?: string) => string;
  getNextIndex: (role: string, name?: string) => number;
  trackRef: (role: string, name: string | undefined, ref: string) => void;
  getDuplicateKeys: () => Set<string>;
};

function createRoleNameTracker(): RoleNameTracker {
  const counts = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  return {
    counts,
    refsByKey,
    getKey(role: string, name?: string) {
      return `${role}:${name ?? ""}`;
    },
    getNextIndex(role: string, name?: string) {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role: string, name: string | undefined, ref: string) {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys() {
      const duplicateKeys = new Set<string>();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) {
          duplicateKeys.add(key);
        }
      }
      return duplicateKeys;
    },
  };
}

function removeNthFromNonDuplicates(
  refs: BrowserRoleRefMap,
  tracker: RoleNameTracker,
): void {
  const duplicates = tracker.getDuplicateKeys();
  for (const [refId, ref] of Object.entries(refs)) {
    const key = tracker.getKey(ref.role, ref.name);
    if (!duplicates.has(key)) {
      delete refs[refId]?.nth;
    }
  }
}

function compactTree(tree: string): string {
  const lines = tree.split(/\r?\n/);
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("[ref=")) {
      result.push(line);
      continue;
    }
    if (line.includes(":") && !line.trimEnd().endsWith(":")) {
      result.push(line);
      continue;
    }

    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;
    for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
      const childIndent = getIndentLevel(lines[childIndex] ?? "");
      if (childIndent <= currentIndent) {
        break;
      }
      if (lines[childIndex]?.includes("[ref=")) {
        hasRelevantChildren = true;
        break;
      }
    }

    if (hasRelevantChildren) {
      result.push(line);
    }
  }

  return result.join("\n");
}

function processLine(
  line: string,
  refs: BrowserRoleRefMap,
  options: BrowserRoleSnapshotOptions,
  tracker: RoleNameTracker,
  nextRef: () => string,
): string | null {
  const depth = getIndentLevel(line);
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return null;
  }

  const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
  if (!match) {
    return options.interactive ? null : line;
  }

  const [, prefix, roleRaw, name, suffix] = match;
  if (roleRaw.startsWith("/")) {
    return options.interactive ? null : line;
  }

  const role = roleRaw.toLowerCase();
  const isInteractive = INTERACTIVE_ROLES.has(role);
  const isContent = CONTENT_ROLES.has(role);
  const isStructural = STRUCTURAL_ROLES.has(role);

  if (options.interactive && !isInteractive) {
    return null;
  }
  if (options.compact && isStructural && !name) {
    return null;
  }

  const shouldHaveRef = isInteractive || (isContent && name);
  if (!shouldHaveRef) {
    return line;
  }

  const refId = nextRef();
  const nth = tracker.getNextIndex(role, name);
  tracker.trackRef(role, name, refId);
  refs[refId] = {
    role,
    name,
    nth,
  };

  let enhanced = `${prefix}${roleRaw}`;
  if (name) {
    enhanced += ` "${name}"`;
  }
  enhanced += ` [ref=${refId}]`;
  if (nth > 0) {
    enhanced += ` [nth=${nth}]`;
  }
  if (suffix) {
    enhanced += suffix;
  }
  return enhanced;
}

type InteractiveSnapshotLine = NonNullable<ReturnType<typeof matchSnapshotLine>>;

function buildInteractiveSnapshotLines(params: {
  lines: string[];
  options: BrowserRoleSnapshotOptions;
  resolveRef: (
    parsed: InteractiveSnapshotLine,
  ) => { ref: string; nth?: number } | null;
  recordRef: (
    parsed: InteractiveSnapshotLine,
    ref: string,
    nth?: number,
  ) => void;
  includeSuffix: (suffix: string) => boolean;
}): string[] {
  const result: string[] = [];
  for (const line of params.lines) {
    const parsed = matchSnapshotLine(line, params.options);
    if (!parsed || !INTERACTIVE_ROLES.has(parsed.role)) {
      continue;
    }

    const resolved = params.resolveRef(parsed);
    if (!resolved?.ref) {
      continue;
    }

    params.recordRef(parsed, resolved.ref, resolved.nth);

    let enhanced = `- ${parsed.roleRaw}`;
    if (parsed.name) {
      enhanced += ` "${parsed.name}"`;
    }
    enhanced += ` [ref=${resolved.ref}]`;
    if ((resolved.nth ?? 0) > 0) {
      enhanced += ` [nth=${resolved.nth}]`;
    }
    if (params.includeSuffix(parsed.suffix)) {
      enhanced += parsed.suffix;
    }
    result.push(enhanced);
  }
  return result;
}

export function parseBrowserRoleRef(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith("@")
    ? trimmed.slice(1)
    : trimmed.startsWith("ref=")
      ? trimmed.slice(4)
      : trimmed;

  return /^e\d+$/i.test(normalized) ? normalized.toLowerCase() : null;
}

export function buildRoleSnapshotFromAriaText(
  ariaSnapshot: string,
  options: BrowserRoleSnapshotOptions = {},
): { snapshot: string; refs: BrowserRoleRefMap } {
  const lines = String(ariaSnapshot ?? "").split(/\r?\n/);
  const refs: BrowserRoleRefMap = {};
  const tracker = createRoleNameTracker();

  let refCounter = 0;
  const nextRef = () => {
    refCounter += 1;
    return `e${refCounter}`;
  };

  if (options.interactive) {
    const snapshotLines = buildInteractiveSnapshotLines({
      lines,
      options,
      resolveRef: ({ role, name }) => {
        const ref = nextRef();
        const nth = tracker.getNextIndex(role, name);
        tracker.trackRef(role, name, ref);
        return { ref, nth };
      },
      recordRef: ({ role, name }, ref, nth) => {
        refs[ref] = {
          role,
          name,
          nth,
        };
      },
      includeSuffix: (suffix) => suffix.includes("["),
    });

    removeNthFromNonDuplicates(refs, tracker);

    return {
      snapshot: snapshotLines.join("\n") || "(no interactive elements)",
      refs,
    };
  }

  const result: string[] = [];
  for (const line of lines) {
    const processed = processLine(line, refs, options, tracker, nextRef);
    if (processed !== null) {
      result.push(processed);
    }
  }

  removeNthFromNonDuplicates(refs, tracker);

  const tree = result.join("\n") || "(empty)";
  return {
    snapshot: options.compact ? compactTree(tree) : tree,
    refs,
  };
}

function parseAiSnapshotRef(suffix: string): string | null {
  const match = suffix.match(/\[ref=(e\d+)\]/i);
  return match ? match[1].toLowerCase() : null;
}

export function buildRoleSnapshotFromAiText(
  aiSnapshot: string,
  options: BrowserRoleSnapshotOptions = {},
): { snapshot: string; refs: BrowserRoleRefMap } {
  const lines = String(aiSnapshot ?? "").split(/\r?\n/);
  const refs: BrowserRoleRefMap = {};

  if (options.interactive) {
    const snapshotLines = buildInteractiveSnapshotLines({
      lines,
      options,
      resolveRef: ({ suffix }) => {
        const ref = parseAiSnapshotRef(suffix);
        return ref ? { ref } : null;
      },
      recordRef: ({ role, name }, ref) => {
        refs[ref] = {
          role,
          ...(name ? { name } : {}),
        };
      },
      includeSuffix: () => true,
    });

    return {
      snapshot: snapshotLines.join("\n") || "(no interactive elements)",
      refs,
    };
  }

  const result: string[] = [];
  for (const line of lines) {
    const depth = getIndentLevel(line);
    if (options.maxDepth !== undefined && depth > options.maxDepth) {
      continue;
    }

    const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) {
      result.push(line);
      continue;
    }

    const [, , roleRaw, name, suffix] = match;
    if (roleRaw.startsWith("/")) {
      result.push(line);
      continue;
    }

    const role = roleRaw.toLowerCase();
    const isStructural = STRUCTURAL_ROLES.has(role);
    if (options.compact && isStructural && !name) {
      continue;
    }

    const ref = parseAiSnapshotRef(suffix);
    if (ref) {
      refs[ref] = {
        role,
        ...(name ? { name } : {}),
      };
    }

    result.push(line);
  }

  const tree = result.join("\n") || "(empty)";
  return {
    snapshot: options.compact ? compactTree(tree) : tree,
    refs,
  };
}
