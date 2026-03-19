import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { DaemonEnvelope } from "../../src/types/daemon.js";
import { DaemonClient } from "./client.js";

export type DaemonProcessHandle = {
  client: DaemonClient;
  child: ChildProcess;
  stop: () => Promise<void>;
  subscribe: (listener: (event: DaemonEnvelope) => void) => () => void;
};

export async function startDaemonProcess(params: {
  distRoot: string;
  dataDir: string;
}): Promise<DaemonProcessHandle> {
  const token = randomUUID();
  const daemonEntry = path.join(params.distRoot, "desktop", "daemon", "cli.js");
  const child = spawn(process.execPath, [daemonEntry, "--port", "0", "--token", token], {
    env: {
      ...process.env,
      CODEX_AGENT_DATA_DIR: params.dataDir,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await new Promise<number>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const line = stdout.split(/\r?\n/).find(Boolean);
      if (!line) {
        return;
      }
      try {
        const payload = JSON.parse(line) as { type?: string; port?: number };
        if (payload.type === "ready" && payload.port) {
          cleanup();
          resolve(payload.port);
        }
      } catch {
        // Wait for the full line.
      }
    };
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    };
    const onExit = () => {
      cleanup();
      reject(new Error(stderr.trim() || "Daemon exited before becoming ready."));
    };
    const cleanup = () => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
  });

  const client = new DaemonClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token,
  });

  const listeners = new Set<(event: DaemonEnvelope) => void>();
  const controller = new AbortController();
  void client.subscribe((event) => {
    for (const listener of listeners) {
      listener(event);
    }
  }, controller.signal).catch(() => {
    // Electron will surface connection failures through existing runtime paths.
  });

  return {
    client,
    child,
    stop: async () => {
      controller.abort();
      child.kill();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
