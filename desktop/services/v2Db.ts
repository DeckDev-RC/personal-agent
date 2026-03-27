import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "../../src/types/agent.js";
import type { Conversation } from "../../src/types/conversation.js";
import type { McpServerConfig } from "../../src/types/mcp.js";
import type { Skill } from "../../src/types/skill.js";
import type { Workflow } from "../../src/types/workflow.js";
import { legacyCollectionPath, legacyConversationsDir, sessionsDir, dbPath, sessionDir } from "./v2Paths.js";
import { ensureDir, readJsonFile, writeTextFile } from "./v2Fs.js";

let database: DatabaseSync | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
const CURRENT_SCHEMA_VERSION = 3;

function getDbInternal(): DatabaseSync {
  if (!database) {
    database = new DatabaseSync(dbPath());
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec("PRAGMA synchronous = NORMAL;");
  }
  return database;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(kind, id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      agent_id TEXT,
      project_context_id TEXT,
      model TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      workspace_id TEXT,
      workspace_root TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      last_run_id TEXT,
      last_run_status TEXT,
      last_run_phase TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      thinking_content TEXT,
      model TEXT,
      timestamp INTEGER NOT NULL,
      tool_call_id TEXT,
      tool_name TEXT,
      phase TEXT,
      kind TEXT,
      metadata_json TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workflow_id TEXT,
      task_type TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      plan_text TEXT,
      review_text TEXT,
      attempt INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      error TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      tool_call_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      source TEXT NOT NULL,
      server_id TEXT,
      server_name TEXT,
      status TEXT NOT NULL,
      args_json TEXT NOT NULL,
      result_text TEXT,
      is_error INTEGER NOT NULL DEFAULT 0,
      approval_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL,
      request_json TEXT NOT NULL,
      resolution_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      file_path TEXT,
      content_text TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      status TEXT NOT NULL,
      last_job_id TEXT,
      indexed_at INTEGER,
      file_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT,
      result_summary TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      project_context_id TEXT,
      due_date TEXT,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      trigger_at INTEGER NOT NULL,
      recurring TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'pending',
      project_context_id TEXT,
      session_id TEXT,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      delivered_at INTEGER,
      acknowledged_at INTEGER,
      canceled_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS browser_sessions (
      browser_session_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      profile_path TEXT NOT NULL,
      current_url TEXT,
      status TEXT NOT NULL,
      last_activity_at INTEGER NOT NULL,
      last_error TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_chunks (
      chunk_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS workspace_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      workspace_id UNINDEXED,
      path,
      content
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS message_chunks_fts USING fts5(
      message_id UNINDEXED,
      session_id UNINDEXED,
      content
    );

    CREATE TABLE IF NOT EXISTS memory_sources (
      source_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      session_id TEXT,
      run_id TEXT,
      workspace_id TEXT,
      path TEXT,
      title TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_chunks (
      chunk_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      session_id TEXT,
      run_id TEXT,
      workspace_id TEXT,
      path TEXT,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(source_id) REFERENCES memory_sources(source_id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      source_id UNINDEXED,
      session_id UNINDEXED,
      run_id UNINDEXED,
      workspace_id UNINDEXED,
      path,
      content
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      mcp_server_id TEXT,
      project_context_id TEXT,
      session_id TEXT,
      attachments_json TEXT,
      sent_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      comment TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expr TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_config_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run INTEGER,
      next_run INTEGER,
      run_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      manifest_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'installed',
      error TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subagents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      parent_session_id TEXT,
      parent_run_id TEXT,
      session_id TEXT,
      run_id TEXT,
      agent_id TEXT,
      project_context_id TEXT,
      model_ref TEXT NOT NULL,
      phase TEXT,
      result_text TEXT,
      review_text TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE SET NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE SET NULL
    );
  `);
}

function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | Record<string, unknown>
    | undefined;
  const value = Number(row?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function setSchemaVersion(db: DatabaseSync, version: number): void {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(version));
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  if (rows.some((row) => String(row.name) === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ensureSchemaUpgrades(db: DatabaseSync) {
  ensureColumn(db, "sessions", "project_context_id", "TEXT");
}

function ensureArtifactsAllowNullRunId(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(artifacts)").all() as Array<Record<string, unknown>>;
  const runIdColumn = columns.find((column) => String(column.name) === "run_id");

  if (!runIdColumn || Number(runIdColumn.notnull ?? 0) === 0) {
    return;
  }

  db.exec(`
    ALTER TABLE artifacts RENAME TO artifacts_old;

    CREATE TABLE artifacts (
      artifact_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      file_path TEXT,
      content_text TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    INSERT INTO artifacts (
      artifact_id, session_id, run_id, type, label, file_path, content_text, metadata_json, created_at
    )
    SELECT
      artifact_id, session_id, run_id, type, label, file_path, content_text, metadata_json, created_at
    FROM artifacts_old;

    DROP TABLE artifacts_old;
  `);
}

async function migrateEntityCollection<T extends { id: string; updatedAt?: number }>(
  kind: "agents" | "skills" | "workflows" | "mcp_servers" | "project_contexts",
  legacyName: "agents" | "skills" | "workflows" | "mcp-servers",
) {
  const items = await readJsonFile<T[]>(legacyCollectionPath(legacyName), []);
  if (items.length === 0) {
    return;
  }

  const db = getDbInternal();
  const stmt = db.prepare(
    `
      INSERT OR REPLACE INTO entities (kind, id, payload_json, updated_at)
      VALUES (?1, ?2, ?3, ?4)
    `,
  );

  for (const item of items) {
    stmt.run(kind, item.id, JSON.stringify(item), Number(item.updatedAt ?? Date.now()));
  }
}

async function migrateConversations() {
  const dir = legacyConversationsDir();
  await ensureDir(dir);
  const files = await fs.readdir(dir);
  const db = getDbInternal();

  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (
      session_id, title, agent_id, model, system_prompt, created_at, updated_at, message_count
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `);
  const messageCountStmt = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE session_id = ?");
  const insertMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (
      id, session_id, run_id, role, content, thinking_content, model, timestamp, tool_call_id, tool_name,
      phase, kind, metadata_json
    ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, '{}')
  `);
  const insertMessageFts = db.prepare(`
    INSERT INTO message_chunks_fts (message_id, session_id, content)
    VALUES (?1, ?2, ?3)
  `);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const conversation = await readJsonFile<Conversation | null>(path.join(dir, file), null);
    if (!conversation) continue;

    insertSession.run(
      conversation.id,
      conversation.title,
      conversation.agentId ?? null,
      conversation.model,
      conversation.systemPrompt,
      conversation.createdAt,
      conversation.updatedAt,
      conversation.messages.length,
    );

    const existing = messageCountStmt.get(conversation.id) as Record<string, unknown> | undefined;
    if (Number(existing?.count ?? 0) > 0) {
      continue;
    }

    await ensureDir(sessionDir(conversation.id));
    await writeTextFile(path.join(sessionDir(conversation.id), "transcript.jsonl"), "");

    for (const message of conversation.messages) {
      insertMessage.run(
        message.id,
        conversation.id,
        message.role,
        message.content,
        message.thinkingContent ?? null,
        message.model ?? null,
        message.timestamp,
        message.toolCallId ?? null,
        message.toolName ?? null,
      );
      insertMessageFts.run(message.id, conversation.id, `${message.role} ${message.content}`);
      await fs.appendFile(
        path.join(sessionDir(conversation.id), "transcript.jsonl"),
        JSON.stringify({
          id: message.id,
          sessionId: conversation.id,
          role: message.role,
          content: message.content,
          thinkingContent: message.thinkingContent,
          model: message.model,
          timestamp: message.timestamp,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
        }) + "\n",
        "utf8",
      );
    }
  }
}

async function runMigration() {
  const db = getDbInternal();
  let version = getSchemaVersion(db);

  if (version < 2) {
    await migrateEntityCollection<AgentConfig>("agents", "agents");
    await migrateEntityCollection<Skill>("skills", "skills");
    await migrateEntityCollection<Workflow>("workflows", "workflows");
    await migrateEntityCollection<McpServerConfig>("mcp_servers", "mcp-servers");
    await migrateConversations();
    version = 2;
    setSchemaVersion(db, version);
  }

  if (version < 3) {
    ensureArtifactsAllowNullRunId(db);
    version = 3;
    setSchemaVersion(db, version);
  }

  if (version < CURRENT_SCHEMA_VERSION) {
    setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
  }
}

export async function ensureV2Db(): Promise<DatabaseSync> {
  if (initialized) {
    return getDbInternal();
  }
  if (initPromise) {
    await initPromise;
    return getDbInternal();
  }

  initPromise = (async () => {
    await ensureDir(path.dirname(dbPath()));
    await ensureDir(sessionsDir());
    const db = getDbInternal();
    initSchema(db);
    ensureSchemaUpgrades(db);
    await runMigration();
    initialized = true;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }

  return getDbInternal();
}

export function getV2Db(): DatabaseSync {
  return getDbInternal();
}

export function resetV2DbForTests(): void {
  try {
    if (database && "close" in database && typeof database.close === "function") {
      database.close();
    }
  } catch {
    // Best-effort cleanup for tests.
  }

  database = null;
  initialized = false;
  initPromise = null;
}
