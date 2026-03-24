import type { Connection } from "../../src/types/connection.js";

const NETWORK_NAVIGATION_PROTOCOLS = new Set(["http:", "https:"]);
const SAFE_NON_NETWORK_URLS = new Set(["about:blank"]);

export class InvalidBrowserNavigationUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBrowserNavigationUrlError";
  }
}

export type BrowserNavigationPolicyOptions = {
  allowedDomains?: string[];
};

export type BrowserNavigationRequestLike = {
  url(): string;
  redirectedFrom(): BrowserNavigationRequestLike | null;
};

function isAllowedNonNetworkNavigationUrl(parsed: URL): boolean {
  return SAFE_NON_NETWORK_URLS.has(parsed.href);
}

function normalizeDomainEntry(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const candidate =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    const normalized = trimmed
      .replace(/^\*\./, "")
      .replace(/^\.+|\.+$/g, "");
    return normalized || null;
  }
}

export function normalizeBrowserAllowedDomains(
  domains: string[] | undefined,
): string[] {
  if (!Array.isArray(domains)) {
    return [];
  }

  const unique = new Set<string>();
  for (const domain of domains) {
    if (typeof domain !== "string") {
      continue;
    }
    const normalized = normalizeDomainEntry(domain);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function isHostnameAllowed(hostname: string, allowedDomains: string[]): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return allowedDomains.some(
    (allowedDomain) =>
      normalized === allowedDomain || normalized.endsWith(`.${allowedDomain}`),
  );
}

export function deriveAllowedBrowserDomainsFromConnection(
  connection: Partial<Connection> | null | undefined,
): string[] {
  const candidates: string[] = [];

  if (typeof connection?.loginUrl === "string") {
    candidates.push(connection.loginUrl);
  }
  if (typeof connection?.targetSite === "string") {
    candidates.push(connection.targetSite);
  }

  return normalizeBrowserAllowedDomains(candidates);
}

function ensureHostnameAllowed(parsed: URL, allowedDomains: string[]): void {
  if (
    allowedDomains.length > 0 &&
    !isHostnameAllowed(parsed.hostname, allowedDomains)
  ) {
    throw new InvalidBrowserNavigationUrlError(
      `Navigation blocked: "${parsed.hostname}" is outside the allowed domains policy.`,
    );
  }
}

export async function assertBrowserNavigationAllowed(
  opts: {
    url: string;
  } & BrowserNavigationPolicyOptions,
): Promise<void> {
  const rawUrl = String(opts.url ?? "").trim();
  if (!rawUrl) {
    throw new InvalidBrowserNavigationUrlError("url is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InvalidBrowserNavigationUrlError(`Invalid URL: ${rawUrl}`);
  }

  if (!NETWORK_NAVIGATION_PROTOCOLS.has(parsed.protocol)) {
    if (isAllowedNonNetworkNavigationUrl(parsed)) {
      return;
    }
    throw new InvalidBrowserNavigationUrlError(
      `Navigation blocked: unsupported protocol "${parsed.protocol}"`,
    );
  }

  ensureHostnameAllowed(
    parsed,
    normalizeBrowserAllowedDomains(opts.allowedDomains),
  );
}

export async function assertBrowserNavigationResultAllowed(
  opts: {
    url: string;
  } & BrowserNavigationPolicyOptions,
): Promise<void> {
  const rawUrl = String(opts.url ?? "").trim();
  if (!rawUrl) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }

  if (
    NETWORK_NAVIGATION_PROTOCOLS.has(parsed.protocol) ||
    isAllowedNonNetworkNavigationUrl(parsed)
  ) {
    await assertBrowserNavigationAllowed(opts);
  }
}

export async function assertBrowserNavigationRedirectChainAllowed(
  opts: {
    request?: BrowserNavigationRequestLike | null;
  } & BrowserNavigationPolicyOptions,
): Promise<void> {
  const chain: string[] = [];
  let current = opts.request ?? null;
  while (current) {
    chain.push(current.url());
    current = current.redirectedFrom();
  }

  for (const url of [...chain].reverse()) {
    await assertBrowserNavigationAllowed({
      url,
      allowedDomains: opts.allowedDomains,
    });
  }
}
