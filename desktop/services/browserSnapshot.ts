import type {
  BrowserSnapshotAriaNode,
  BrowserSnapshotStats,
} from "../../src/types/browser.js";
import type {
  BrowserRoleRefMap,
  BrowserRoleSnapshotOptions,
} from "./browserRoleRefs.js";
import {
  buildRoleSnapshotFromAiText,
  buildRoleSnapshotFromAriaText,
  getBrowserRoleSnapshotStats,
} from "./browserRoleRefs.js";

export type BrowserAccessibilitySnapshotNode = {
  role?: string;
  name?: string;
  value?: string | number | boolean;
  description?: string;
  children?: BrowserAccessibilitySnapshotNode[];
};

export type BrowserAiSnapshotOptions = {
  timeout?: number;
  track?: string;
};

export type BrowserAiSnapshotResult = {
  full?: string;
  incremental?: string;
};

export type BrowserPageWithAiSnapshot = {
  _snapshotForAI?: (
    options?: BrowserAiSnapshotOptions,
  ) => Promise<BrowserAiSnapshotResult>;
};

function escapeSnapshotText(value: string): string {
  return value.replace(/"/g, "'");
}

function stringifyNodeSuffix(node: BrowserAccessibilitySnapshotNode): string {
  const suffixParts: string[] = [];
  if (
    typeof node.value === "string" ||
    typeof node.value === "number" ||
    typeof node.value === "boolean"
  ) {
    const value = String(node.value).trim();
    if (value) {
      suffixParts.push(` [value="${escapeSnapshotText(value)}"]`);
    }
  }
  if (typeof node.description === "string" && node.description.trim()) {
    suffixParts.push(
      ` [description="${escapeSnapshotText(node.description.trim())}"]`,
    );
  }
  return suffixParts.join("");
}

function appendAccessibilityLines(
  node: BrowserAccessibilitySnapshotNode | null,
  lines: string[],
  depth: number,
): void {
  if (!node) {
    return;
  }

  const role =
    typeof node.role === "string" && node.role.trim()
      ? node.role.trim().replace(/[^\w]/g, "")
      : "unknown";
  const name =
    typeof node.name === "string" && node.name.trim()
      ? node.name.trim()
      : undefined;

  let line = `${"  ".repeat(depth)}- ${role}`;
  if (name) {
    line += ` "${escapeSnapshotText(name)}"`;
  }
  line += stringifyNodeSuffix(node);
  lines.push(line);

  for (const child of node.children ?? []) {
    appendAccessibilityLines(child, lines, depth + 1);
  }
}

export function accessibilitySnapshotToAriaText(
  node: BrowserAccessibilitySnapshotNode | null,
): string {
  if (!node) {
    return "(empty)";
  }

  const lines: string[] = [];
  appendAccessibilityLines(node, lines, 0);
  return lines.join("\n") || "(empty)";
}

export function flattenAccessibilitySnapshot(
  node: BrowserAccessibilitySnapshotNode | null,
  depth = 0,
  nodes: BrowserSnapshotAriaNode[] = [],
): BrowserSnapshotAriaNode[] {
  if (!node) {
    return nodes;
  }

  const role = typeof node.role === "string" ? node.role : "unknown";
  const ref = `e${nodes.length + 1}`;
  nodes.push({
    ref,
    role,
    name: typeof node.name === "string" ? node.name : "",
    value:
      typeof node.value === "string" || typeof node.value === "number"
        ? String(node.value)
        : undefined,
    description:
      typeof node.description === "string" ? node.description : undefined,
    depth,
  });

  for (const child of node.children ?? []) {
    flattenAccessibilitySnapshot(child, depth + 1, nodes);
  }

  return nodes;
}

export function buildRoleSnapshotFromAccessibilitySnapshot(
  node: BrowserAccessibilitySnapshotNode | null,
  options: BrowserRoleSnapshotOptions = {},
): {
  snapshot: string;
  refs: BrowserRoleRefMap;
  stats: BrowserSnapshotStats;
  ariaText: string;
} {
  const ariaText = accessibilitySnapshotToAriaText(node);
  const built = buildRoleSnapshotFromAriaText(ariaText, options);
  return {
    snapshot: built.snapshot,
    refs: built.refs,
    stats: getBrowserRoleSnapshotStats(built.snapshot, built.refs),
    ariaText,
  };
}

export async function buildRoleSnapshotFromPageAiSnapshot(
  page: BrowserPageWithAiSnapshot,
  options: {
    timeoutMs?: number;
    snapshotOptions?: BrowserRoleSnapshotOptions;
  } = {},
): Promise<{
  snapshot: string;
  refs: BrowserRoleRefMap;
  stats: BrowserSnapshotStats;
  rawSnapshot: string;
}> {
  if (!page._snapshotForAI) {
    throw new Error(
      "Playwright _snapshotForAI is not available. Upgrade playwright-core.",
    );
  }

  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)
      ? Math.floor(options.timeoutMs)
      : 5_000;
  const result = await page._snapshotForAI({
    timeout: Math.max(500, Math.min(60_000, timeoutMs)),
    track: "response",
  });
  const rawSnapshot = String(result?.full ?? "");
  const built = buildRoleSnapshotFromAiText(
    rawSnapshot,
    options.snapshotOptions,
  );

  return {
    snapshot: built.snapshot,
    refs: built.refs,
    stats: getBrowserRoleSnapshotStats(built.snapshot, built.refs),
    rawSnapshot,
  };
}
