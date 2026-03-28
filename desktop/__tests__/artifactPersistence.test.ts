import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAttachmentPayload, saveAttachment } from "../services/attachmentService.js";
import { ensureV2Db, resetV2DbForTests } from "../services/v2Db.js";
import {
  createRunRecord,
  createSessionRecord,
  getArtifactRecord,
  listArtifactRecords,
  saveCheckpointRecord,
  saveRunArtifactRecord,
} from "../services/v2SessionStore.js";

describe("artifact persistence", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-artifacts-"));
    process.env.CODEX_AGENT_DATA_DIR = tempDir;
    resetV2DbForTests();
  });

  afterEach(async () => {
    resetV2DbForTests();
    delete process.env.CODEX_AGENT_DATA_DIR;
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("migrates existing artifacts to allow nullable run_id without losing rows", async () => {
    const dbFile = path.join(tempDir, "app.db");
    const db = new DatabaseSync(dbFile);

    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE runs (
        run_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE TABLE artifacts (
        artifact_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        file_path TEXT,
        content_text TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE CASCADE
      );
    `);

    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '2')").run();
    db.prepare(
      `
        INSERT INTO sessions (session_id, title, model, system_prompt, created_at, updated_at, message_count)
        VALUES ('session-1', 'Session', 'openai-codex/gpt-5.4', '', 1, 1, 0)
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO runs (run_id, session_id, task_type, phase, status, prompt, attempt, created_at, updated_at)
        VALUES ('run-1', 'session-1', 'chat_simple', 'execute', 'completed', 'Prompt', 0, 1, 1)
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO artifacts (artifact_id, session_id, run_id, type, label, file_path, content_text, metadata_json, created_at)
        VALUES ('artifact-1', 'session-1', 'run-1', 'report', 'Report', NULL, 'body', '{}', 1)
      `,
    ).run();
    db.close();

    const migratedDb = await ensureV2Db();
    const columns = migratedDb.prepare("PRAGMA table_info(artifacts)").all() as Array<Record<string, unknown>>;
    const runIdColumn = columns.find((column) => String(column.name) === "run_id");
    const artifactRow = migratedDb.prepare("SELECT session_id, run_id, label FROM artifacts WHERE artifact_id = ?").get(
      "artifact-1",
    ) as Record<string, unknown> | undefined;
    const schemaVersion = migratedDb.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | Record<string, unknown>
      | undefined;

    expect(runIdColumn).toBeDefined();
    expect(Number(runIdColumn?.notnull ?? 1)).toBe(0);
    expect(artifactRow).toMatchObject({
      session_id: "session-1",
      run_id: "run-1",
      label: "Report",
    });
    expect(Number(schemaVersion?.value)).toBeGreaterThanOrEqual(3);
  });

  it("stores uploaded attachments and previews as session-scoped artifacts", async () => {
    const session = await createSessionRecord({
      title: "Attachments",
      model: "openai-codex/gpt-5.4",
      systemPrompt: "",
    });

    const attachment = await saveAttachment({
      sessionId: session.sessionId,
      fileName: "ledger.txt",
      mimeType: "text/plain",
      bytesBase64: Buffer.from("credit 120\ndebit 80", "utf8").toString("base64"),
    });

    const storedArtifact = await getArtifactRecord(attachment.artifactId);
    const payload = await getAttachmentPayload(attachment.artifactId);
    const artifacts = await listArtifactRecords({ sessionId: session.sessionId });
    const previewArtifact = artifacts.find((artifact) => artifact.type === "preview");

    expect(storedArtifact?.runId).toBeUndefined();
    expect(storedArtifact?.type).toBe("attachment");
    expect(attachment.extractedTextAvailable).toBe(true);
    expect(payload).not.toBeNull();
    expect(Buffer.from(payload!.bytesBase64, "base64").toString("utf8")).toBe("credit 120\ndebit 80");
    expect(previewArtifact).toBeDefined();
    expect(previewArtifact?.runId).toBeUndefined();
    expect(previewArtifact?.filePath).toContain("session-assets");
  });

  it("keeps run-scoped artifacts filterable while session-scoped checkpoints stay out of run queries", async () => {
    const session = await createSessionRecord({
      title: "Mixed artifacts",
      model: "openai-codex/gpt-5.4",
      systemPrompt: "",
    });
    const run = await createRunRecord({
      runId: "run-main",
      sessionId: session.sessionId,
      taskType: "chat_simple",
      phase: "execute",
      status: "running",
      prompt: "Analyze",
      attempt: 0,
    });

    const runArtifact = await saveRunArtifactRecord({
      sessionId: session.sessionId,
      runId: run.runId,
      artifact: {
        artifactId: "run-artifact",
        type: "report",
        label: "Run report",
        contentText: "report body",
      },
    });
    const checkpoint = await saveCheckpointRecord({
      sessionId: session.sessionId,
      summary: "checkpoint summary",
      decisions: [],
      relevantFiles: [],
      pendingApprovals: [],
    });

    const allSessionArtifacts = await listArtifactRecords({ sessionId: session.sessionId });
    const runArtifacts = await listArtifactRecords({ runId: run.runId });
    const checkpointArtifact = await getArtifactRecord(checkpoint.checkpointId);

    expect(allSessionArtifacts.map((artifact) => artifact.artifactId)).toEqual(
      expect.arrayContaining([runArtifact.artifactId, checkpoint.checkpointId]),
    );
    expect(runArtifacts.map((artifact) => artifact.artifactId)).toContain(runArtifact.artifactId);
    expect(runArtifacts.map((artifact) => artifact.artifactId)).not.toContain(checkpoint.checkpointId);
    expect(checkpointArtifact?.runId).toBeUndefined();
    expect(checkpointArtifact?.filePath).toContain("session-assets");
  });
});
