import type { DaemonEnvelope } from "../../src/types/daemon.js";

type DaemonClientOptions = {
  baseUrl: string;
  token: string;
};

export class DaemonClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: DaemonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
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
