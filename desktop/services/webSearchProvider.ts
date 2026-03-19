import type { WebSearchResult } from "../../src/types/runtime.js";
import { getSettingsV2 } from "./v2EntityStore.js";

function normalizeResult(item: Record<string, unknown>): WebSearchResult {
  return {
    title: String(item.title ?? item.name ?? item.url ?? "Untitled"),
    url: String(item.url ?? item.link ?? ""),
    snippet: String(item.snippet ?? item.text ?? item.description ?? ""),
    sourceName:
      typeof item.sourceName === "string"
        ? item.sourceName
        : typeof item.source === "string"
          ? item.source
          : undefined,
  };
}

export async function runWebSearch(params: {
  query: string;
  maxResults?: number;
}): Promise<WebSearchResult[]> {
  const settings = await getSettingsV2();
  const endpoint = settings.webSearch.endpoint.trim();
  if (!endpoint) {
    throw new Error("Web search endpoint is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.webSearch.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.webSearch.apiKey.trim()
          ? {
              Authorization: `Bearer ${settings.webSearch.apiKey.trim()}`,
            }
          : {}),
      },
      body: JSON.stringify({
        query: params.query,
        maxResults: params.maxResults ?? settings.webSearch.maxResults,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Web search provider failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    const results = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)
        ? (payload as { results: unknown[] }).results
        : [];

    return results
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map(normalizeResult)
      .filter((item) => item.url.trim().length > 0)
      .slice(0, params.maxResults ?? settings.webSearch.maxResults);
  } finally {
    clearTimeout(timeout);
  }
}
