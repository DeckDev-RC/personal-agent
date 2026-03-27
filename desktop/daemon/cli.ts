import { CodexAgentDaemon } from "./server.js";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1];
  }
  return undefined;
}

const port = Number(readArg("--port") ?? 0);
const token = readArg("--token");

if (!token) {
  throw new Error("Missing --token for daemon startup.");
}

const daemon = new CodexAgentDaemon(token);
const actualPort = await daemon.listen(port);
process.stdout.write(`${JSON.stringify({ type: "ready", port: actualPort })}\n`);

process.on("uncaughtException", (error) => {
  console.error("[daemon-cli] Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[daemon-cli] Unhandled rejection", reason);
  process.exit(1);
});

process.on("SIGINT", () => {
  void daemon.close().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void daemon.close().finally(() => process.exit(0));
});
