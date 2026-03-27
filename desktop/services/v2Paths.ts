import path from "node:path";
import { resolveDataRoot } from "./dataRoot.js";

export function dataDir(): string {
  return resolveDataRoot();
}

export function sessionsDir(): string {
  return path.join(dataDir(), "sessions");
}

export function sessionDir(sessionId: string): string {
  return path.join(sessionsDir(), sessionId);
}

export function transcriptPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "transcript.jsonl");
}

export function artifactsDir(sessionId: string, runId: string): string {
  return path.join(sessionDir(sessionId), "artifacts", runId);
}

export function sessionArtifactsDir(sessionId: string): string {
  return path.join(sessionDir(sessionId), "artifacts", "session-assets");
}

export function browserProfileDir(sessionId: string): string {
  return path.join(sessionDir(sessionId), "browser-profile");
}

export function browserTempDir(sessionId: string): string {
  return path.join(sessionDir(sessionId), "browser-temp");
}

export function attachmentsDir(sessionId: string): string {
  return path.join(sessionDir(sessionId), "attachments");
}

export function dbPath(): string {
  return path.join(dataDir(), "app.db");
}

export function legacyConversationsDir(): string {
  return path.join(dataDir(), "conversations");
}

export function legacyCollectionPath(
  name: "agents" | "skills" | "workflows" | "mcp-servers",
): string {
  return path.join(dataDir(), `${name}.json`);
}
