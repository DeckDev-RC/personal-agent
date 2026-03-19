import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

let cachedElectronUserData: string | null | undefined;

function resolveElectronUserData(): string | null {
  if (cachedElectronUserData !== undefined) {
    return cachedElectronUserData;
  }

  try {
    const require = createRequire(import.meta.url);
    const electron = require("electron") as typeof import("electron");
    const app = electron.app;
    cachedElectronUserData = app ? app.getPath("userData") : null;
  } catch {
    cachedElectronUserData = null;
  }

  return cachedElectronUserData;
}

export function resolveDataRoot(): string {
  if (process.env.CODEX_AGENT_DATA_DIR?.trim()) {
    return process.env.CODEX_AGENT_DATA_DIR.trim();
  }

  const electronUserData = resolveElectronUserData();
  if (electronUserData) {
    return path.join(electronUserData, "codex-agent-data");
  }

  if (process.env.APPDATA?.trim()) {
    return path.join(process.env.APPDATA.trim(), "codex-agent-data");
  }

  return path.join(os.homedir(), ".codex-agent-data");
}
