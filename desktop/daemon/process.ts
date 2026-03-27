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

function pipeDaemonStderr(child: ChildProcess): void {
  if (!child.stderr) {
    return;
  }

  let buffer = "";
  child.stderr.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.error(`[daemon] ${trimmed}`);
      }
    }
  });
}

/**
 * Spawn the daemon child process and wait for its "ready" signal.
 * Returns the running child and the port it is listening on.
 */
function spawnDaemonChild(params: {
  daemonEntry: string;
  token: string;
  dataDir: string;
}): { child: ChildProcess; portPromise: Promise<number> } {
  const child = spawn(
    process.execPath,
    [params.daemonEntry, "--port", "0", "--token", params.token],
    {
      env: {
        ...process.env,
        CODEX_AGENT_DATA_DIR: params.dataDir,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  pipeDaemonStderr(child);

  const portPromise = new Promise<number>((resolve, reject) => {
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
      child.stdout!.off("data", onStdout);
      child.stderr!.off("data", onStderr);
      child.off("exit", onExit);
    };
    child.stdout!.on("data", onStdout);
    child.stderr!.on("data", onStderr);
    child.on("exit", onExit);
  });

  return { child, portPromise };
}

export async function startDaemonProcess(params: {
  distRoot: string;
  dataDir: string;
}): Promise<DaemonProcessHandle> {
  const token = randomUUID();
  const daemonEntry = path.join(params.distRoot, "desktop", "daemon", "cli.js");

  // --- First spawn ---
  let { child, portPromise } = spawnDaemonChild({ daemonEntry, token, dataDir: params.dataDir });
  const port = await portPromise;

  const client = new DaemonClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token,
  });

  const listeners = new Set<(event: DaemonEnvelope) => void>();
  let eventController = new AbortController();
  let stopped = false;

  // --- Event stream connection (auto-reconnects) ---
  function connectEventStream() {
    if (stopped) return;
    void client
      .subscribe(
        (event) => {
          for (const listener of listeners) {
            listener(event);
          }
        },
        eventController.signal,
      )
      .catch(() => {
        // Event stream disconnected — will be re-established after daemon restart.
      });
  }
  connectEventStream();

  // --- Auto-restart logic ---
  let restartInProgress = false;
  const MAX_RESTART_ATTEMPTS = 5;
  const RESTART_DELAY_MS = 1500;

  function watchChild() {
    child.on("exit", (code, signal) => {
      if (stopped) return; // Intentional stop, do nothing.

      console.warn(
        `[daemon-process] Daemon exited unexpectedly (code=${code}, signal=${signal}). Attempting restart…`,
      );

      void attemptRestart();
    });
  }
  watchChild();

  async function attemptRestart() {
    if (restartInProgress || stopped) return;
    restartInProgress = true;

    for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
      try {
        console.warn(`[daemon-process] Restart attempt ${attempt}/${MAX_RESTART_ATTEMPTS}…`);

        // Abort old event stream
        eventController.abort();
        eventController = new AbortController();

        // Wait a bit before respawning
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));

        const spawned = spawnDaemonChild({ daemonEntry, token, dataDir: params.dataDir });
        child = spawned.child;
        const newPort = await spawned.portPromise;

        // Update the client to point to the new port
        client.updateBaseUrl(`http://127.0.0.1:${newPort}`);

        // Re-establish event stream
        connectEventStream();

        // Watch this new child
        watchChild();

        console.warn(`[daemon-process] Daemon restarted successfully on port ${newPort}.`);
        restartInProgress = false;
        return;
      } catch (err) {
        console.error(`[daemon-process] Restart attempt ${attempt} failed:`, err);
        if (attempt === MAX_RESTART_ATTEMPTS) {
          console.error("[daemon-process] Max restart attempts reached. Daemon is unavailable.");
        }
      }
    }

    restartInProgress = false;
  }

  return {
    client,
    get child() {
      return child;
    },
    stop: async () => {
      stopped = true;
      eventController.abort();
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
