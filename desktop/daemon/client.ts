import type { DaemonEnvelope } from "../../src/types/daemon.js";

type DaemonClientOptions = {
  baseUrl: string;
  token: string;
};

/** Error codes that indicate the daemon is unreachable and a retry may help. */
const RETRIABLE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as any)?.code ?? (error as any)?.cause?.code;
  if (code && RETRIABLE_CODES.has(code)) return true;
  // Node fetch wraps the underlying error in `cause`
  const cause = (error as any)?.cause;
  if (cause instanceof Error) {
    const causeCode = (cause as any)?.code;
    if (causeCode && RETRIABLE_CODES.has(causeCode)) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DaemonClient {
  private baseUrl: string;
  private readonly token: string;

  /** Max retry attempts for transient connection errors. */
  private readonly maxRetries = 4;

  /** Initial delay between retries (doubles per attempt). */
  private readonly baseDelayMs = 300;

  constructor(options: DaemonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
  }

  /** Allow the process manager to update the URL when the daemon restarts on a new port. */
  updateBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
          },
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetriableError(error) && attempt < this.maxRetries) {
          const delay = this.baseDelayMs * 2 ** attempt;
          console.warn(
            `[daemon-client] ${path} attempt ${attempt + 1}/${this.maxRetries + 1} failed (${(lastError as any)?.cause?.code ?? lastError.message}), retrying in ${delay}ms…`,
          );
          await sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    // Unreachable, but TypeScript needs it.
    throw lastError!;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  /**
   * Quick health check — resolves true when the daemon is reachable, false otherwise.
   * Uses a short timeout so it won't block callers for too long.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${this.baseUrl}/connectivity`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async subscribe(onEvent: (event: DaemonEnvelope) => void, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${this.baseUrl}/events`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to connect event stream: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const dataLine = rawEvent
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (dataLine) {
          onEvent(JSON.parse(dataLine.slice(6)) as DaemonEnvelope);
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  }
}
