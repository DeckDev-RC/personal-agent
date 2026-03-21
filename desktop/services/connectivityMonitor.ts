import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { normalizeProviderName } from "../../src/types/model.js";
import { getProviderAuthStatus } from "./providerAuthStore.js";
import { getSettingsV2 } from "./v2EntityStore.js";

type ConnectivityState = {
  online: boolean;
  lastCheckAt: number;
};

type ConnectivityProbe =
  | { kind: "dns"; host: string }
  | { kind: "http"; url: string };

let state: ConnectivityState = { online: true, lastCheckAt: Date.now() };
let intervalId: NodeJS.Timeout | null = null;
const listeners = new Set<(online: boolean) => void>();

async function resolveProbe(): Promise<ConnectivityProbe> {
  const settings = await getSettingsV2().catch(() => null);
  const provider = normalizeProviderName(settings?.provider ?? settings?.defaultModelRef);

  if (provider === "anthropic") {
    return { kind: "dns", host: "api.anthropic.com" };
  }

  if (provider === "ollama") {
    const status = await getProviderAuthStatus("ollama").catch(() => null);
    const baseUrl = (status?.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
    return { kind: "http", url: `${baseUrl}/api/tags` };
  }

  return { kind: "dns", host: "chatgpt.com" };
}

async function probeDns(host: string): Promise<boolean> {
  try {
    await lookup(host);
    return true;
  } catch {
    return false;
  }
}

async function probeHttp(url: string): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(
      target,
      {
        method: "GET",
        timeout: 5000,
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;
        res.resume();
        resolve(statusCode < 500);
      },
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function checkConnectivity(): Promise<boolean> {
  const probe = await resolveProbe();
  if (probe.kind === "dns") {
    return await probeDns(probe.host);
  }
  return await probeHttp(probe.url);
}

export function getConnectivityState(): ConnectivityState {
  return { ...state };
}

export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function startConnectivityMonitor(intervalMs = 30_000): void {
  if (intervalId) {
    return;
  }

  let checking = false;
  const run = async () => {
    if (checking) {
      return;
    }

    checking = true;
    try {
      const online = await checkConnectivity();
      if (online !== state.online) {
        state = { online, lastCheckAt: Date.now() };
        for (const cb of listeners) {
          cb(online);
        }
      } else {
        state.lastCheckAt = Date.now();
      }
    } finally {
      checking = false;
    }
  };

  void run();
  intervalId = setInterval(() => {
    void run();
  }, intervalMs);
}

export function stopConnectivityMonitor(): void {
  if (!intervalId) {
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
}
