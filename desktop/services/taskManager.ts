import { randomUUID } from "node:crypto";
import type { TaskPriority, TaskRecord, TaskStatus } from "../../src/types/task.js";
import { ensureV2Db } from "./v2Db.js";

const VALID_STATUSES = new Set<TaskStatus>(["backlog", "today", "in_progress", "done"]);
const VALID_PRIORITIES = new Set<TaskPriority>(["low", "medium", "high"]);

function rowToTask(row: Record<string, unknown>): TaskRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: VALID_STATUSES.has(String(row.status) as TaskStatus)
      ? (String(row.status) as TaskStatus)
      : "backlog",
    priority: VALID_PRIORITIES.has(String(row.priority) as TaskPriority)
      ? (String(row.priority) as TaskPriority)
      : "medium",
    projectContextId: typeof row.project_context_id === "string" ? row.project_context_id : undefined,
    dueDate: typeof row.due_date === "string" ? row.due_date : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    completedAt: typeof row.completed_at === "number" ? row.completed_at : undefined,
  };
}

function normalizeStatus(status: unknown): TaskStatus {
  return VALID_STATUSES.has(String(status) as TaskStatus)
    ? (String(status) as TaskStatus)
    : "backlog";
}

function normalizePriority(priority: unknown): TaskPriority {
  return VALID_PRIORITIES.has(String(priority) as TaskPriority)
    ? (String(priority) as TaskPriority)
    : "medium";
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeTask(
  partial: Partial<TaskRecord>,
  existing?: TaskRecord,
): TaskRecord {
  const now = Date.now();
  const nextStatus = normalizeStatus(partial.status ?? existing?.status);
  const createdAt = existing?.createdAt ?? Number(partial.createdAt ?? now);
  const completedAt =
    nextStatus === "done"
      ? existing?.completedAt ?? Number(partial.completedAt ?? now)
      : undefined;

  return {
    id: partial.id ?? existing?.id ?? randomUUID(),
    title:
      (hasOwn(partial, "title") ? cleanOptionalString(partial.title) : undefined) ??
      existing?.title ??
      "Nova tarefa",
    description:
      hasOwn(partial, "description") && typeof partial.description === "string"
        ? partial.description.trim()
        : existing?.description ?? "",
    status: nextStatus,
    priority: normalizePriority(partial.priority ?? existing?.priority),
    projectContextId: hasOwn(partial, "projectContextId")
      ? cleanOptionalString(partial.projectContextId)
      : existing?.projectContextId,
    dueDate: hasOwn(partial, "dueDate")
      ? cleanOptionalString(partial.dueDate)
      : existing?.dueDate,
    source: hasOwn(partial, "source")
      ? cleanOptionalString(partial.source)
      : existing?.source ?? "manual",
    createdAt,
    updatedAt: now,
    completedAt,
  };
}

async function saveTaskRecord(task: TaskRecord): Promise<TaskRecord> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO tasks (
        id, title, description, status, priority, project_context_id, due_date, source,
        created_at, updated_at, completed_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    `,
  ).run(
    task.id,
    task.title,
    task.description,
    task.status,
    task.priority,
    task.projectContextId ?? null,
    task.dueDate ?? null,
    task.source ?? null,
    task.createdAt,
    task.updatedAt,
    task.completedAt ?? null,
  );
  return task;
}

export async function listTasks(params?: {
  status?: TaskStatus;
  projectContextId?: string;
  includeDone?: boolean;
}): Promise<TaskRecord[]> {
  const db = await ensureV2Db();
  const conditions: string[] = [];
  const values: string[] = [];

  if (params?.status) {
    conditions.push("status = ?");
    values.push(params.status);
  } else if (!params?.includeDone) {
    conditions.push("status != ?");
    values.push("done");
  }

  if (params?.projectContextId) {
    conditions.push("project_context_id = ?");
    values.push(params.projectContextId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(
    `
      SELECT *
      FROM tasks
      ${whereClause}
      ORDER BY
        CASE status
          WHEN 'today' THEN 0
          WHEN 'in_progress' THEN 1
          WHEN 'backlog' THEN 2
          ELSE 3
        END,
        CASE priority
          WHEN 'high' THEN 0
          WHEN 'medium' THEN 1
          ELSE 2
        END,
        CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END,
        due_date ASC,
        updated_at DESC
    `,
  ).all(...values) as Array<Record<string, unknown>>;

  return rows.map(rowToTask);
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToTask(row) : null;
}

export async function createTask(task: Partial<TaskRecord>): Promise<TaskRecord> {
  const normalized = normalizeTask(task);
  return await saveTaskRecord(normalized);
}

export async function updateTask(taskId: string, patch: Partial<TaskRecord>): Promise<TaskRecord | null> {
  const existing = await getTask(taskId);
  if (!existing) {
    return null;
  }
  const normalized = normalizeTask({ ...patch, id: taskId }, existing);
  return await saveTaskRecord(normalized);
}

export async function completeTask(taskId: string): Promise<TaskRecord | null> {
  return await updateTask(taskId, { status: "done", completedAt: Date.now() });
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
  return result.changes > 0;
}
