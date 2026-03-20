import { randomUUID } from "node:crypto";
import type {
  ReminderRecurrence,
  ReminderRecord,
  ReminderSource,
  ReminderStatus,
} from "../../src/types/reminder.js";
import { ensureV2Db } from "./v2Db.js";

const VALID_STATUSES = new Set<ReminderStatus>([
  "pending",
  "delivered",
  "acknowledged",
  "canceled",
]);
const VALID_RECURRENCES = new Set<ReminderRecurrence>([
  "none",
  "daily",
  "weekly",
  "weekdays",
]);
const VALID_SOURCES = new Set<ReminderSource>(["manual", "agent", "workflow"]);
const IDLE_POLL_MS = 60_000;

type ReminderRow = Record<string, unknown>;

type ReminderTriggerListener = (reminder: ReminderRecord) => void | Promise<void>;

let schedulerActive = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let reminderListener: ReminderTriggerListener | null = null;
let refreshScheduled = false;
let processingDueReminders = false;

function clearSchedulerTimer(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeStatus(value: unknown): ReminderStatus {
  return VALID_STATUSES.has(String(value) as ReminderStatus)
    ? (String(value) as ReminderStatus)
    : "pending";
}

function normalizeRecurrence(value: unknown): ReminderRecurrence {
  return VALID_RECURRENCES.has(String(value) as ReminderRecurrence)
    ? (String(value) as ReminderRecurrence)
    : "none";
}

function normalizeSource(value: unknown): ReminderSource {
  return VALID_SOURCES.has(String(value) as ReminderSource)
    ? (String(value) as ReminderSource)
    : "manual";
}

function parseTriggerAt(value: unknown, fallback?: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed && typeof fallback === "number") {
      return fallback;
    }

    if (/^\d+$/.test(trimmed)) {
      return Math.max(0, Number.parseInt(trimmed, 10));
    }

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof fallback === "number") {
    return fallback;
  }

  throw new Error("Invalid reminder trigger time.");
}

function rowToReminder(row: ReminderRow): ReminderRecord {
  return {
    id: String(row.id),
    message: String(row.message ?? ""),
    triggerAt: Number(row.trigger_at ?? 0),
    recurring: normalizeRecurrence(row.recurring),
    status: normalizeStatus(row.status),
    projectContextId:
      typeof row.project_context_id === "string" ? row.project_context_id : undefined,
    sessionId: typeof row.session_id === "string" ? row.session_id : undefined,
    source: normalizeSource(row.source),
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    deliveredAt:
      typeof row.delivered_at === "number" ? row.delivered_at : undefined,
    acknowledgedAt:
      typeof row.acknowledged_at === "number" ? row.acknowledged_at : undefined,
    canceledAt:
      typeof row.canceled_at === "number" ? row.canceled_at : undefined,
  };
}

function computeNextRecurringTrigger(
  triggerAt: number,
  recurrence: ReminderRecurrence,
  from = Date.now(),
): number | null {
  if (recurrence === "none") {
    return null;
  }

  const next = new Date(triggerAt);
  if (Number.isNaN(next.getTime())) {
    return null;
  }

  while (next.getTime() <= from) {
    if (recurrence === "daily") {
      next.setDate(next.getDate() + 1);
      continue;
    }

    if (recurrence === "weekly") {
      next.setDate(next.getDate() + 7);
      continue;
    }

    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next.getTime();
}

async function insertReminderRecord(reminder: ReminderRecord): Promise<void> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO reminders (
        id, message, trigger_at, recurring, status, project_context_id, session_id, source,
        created_at, updated_at, delivered_at, acknowledged_at, canceled_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `,
  ).run(
    reminder.id,
    reminder.message,
    reminder.triggerAt,
    reminder.recurring,
    reminder.status,
    reminder.projectContextId ?? null,
    reminder.sessionId ?? null,
    reminder.source ?? "manual",
    reminder.createdAt,
    reminder.updatedAt,
    reminder.deliveredAt ?? null,
    reminder.acknowledgedAt ?? null,
    reminder.canceledAt ?? null,
  );
}

async function getReminderInternal(reminderId: string): Promise<ReminderRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminderId) as
    | ReminderRow
    | undefined;
  return row ? rowToReminder(row) : null;
}

async function scheduleRecurringFollowUp(reminder: ReminderRecord, deliveredAt: number): Promise<void> {
  const nextTriggerAt = computeNextRecurringTrigger(
    reminder.triggerAt,
    reminder.recurring,
    deliveredAt,
  );
  if (!nextTriggerAt) {
    return;
  }

  const nextReminder: ReminderRecord = {
    id: randomUUID(),
    message: reminder.message,
    triggerAt: nextTriggerAt,
    recurring: reminder.recurring,
    status: "pending",
    projectContextId: reminder.projectContextId,
    sessionId: reminder.sessionId,
    source: reminder.source ?? "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await insertReminderRecord(nextReminder);
}

async function markReminderDelivered(reminder: ReminderRecord, deliveredAt: number): Promise<ReminderRecord> {
  const deliveredReminder: ReminderRecord = {
    ...reminder,
    status: "delivered",
    deliveredAt,
    updatedAt: deliveredAt,
  };

  await insertReminderRecord(deliveredReminder);
  if (reminder.recurring !== "none") {
    await scheduleRecurringFollowUp(reminder, deliveredAt);
  }
  return deliveredReminder;
}

async function findNextPendingReminder(): Promise<ReminderRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare(
    `
      SELECT *
      FROM reminders
      WHERE status = 'pending'
      ORDER BY trigger_at ASC
      LIMIT 1
    `,
  ).get() as ReminderRow | undefined;

  return row ? rowToReminder(row) : null;
}

async function listDuePendingReminders(now = Date.now()): Promise<ReminderRecord[]> {
  const db = await ensureV2Db();
  const rows = db.prepare(
    `
      SELECT *
      FROM reminders
      WHERE status = 'pending'
        AND trigger_at <= ?1
      ORDER BY trigger_at ASC
    `,
  ).all(now) as ReminderRow[];

  return rows.map(rowToReminder);
}

async function rescheduleReminderLoop(): Promise<void> {
  clearSchedulerTimer();
  if (!schedulerActive) {
    return;
  }

  const nextReminder = await findNextPendingReminder();
  const waitMs = nextReminder
    ? Math.max(250, nextReminder.triggerAt - Date.now())
    : IDLE_POLL_MS;

  schedulerTimer = setTimeout(() => {
    void processDueReminders();
  }, waitMs);
}

async function processDueReminders(): Promise<void> {
  if (!schedulerActive || processingDueReminders) {
    return;
  }

  processingDueReminders = true;
  clearSchedulerTimer();

  try {
    const now = Date.now();
    const dueReminders = await listDuePendingReminders(now);

    for (const reminder of dueReminders) {
      const current = await getReminderInternal(reminder.id);
      if (!current || current.status !== "pending") {
        continue;
      }

      const deliveredReminder = await markReminderDelivered(current, Date.now());
      await reminderListener?.(deliveredReminder);
    }
  } finally {
    processingDueReminders = false;
    refreshScheduled = false;
    await rescheduleReminderLoop();
  }
}

export async function startReminderScheduler(listener: ReminderTriggerListener): Promise<void> {
  reminderListener = listener;
  schedulerActive = true;
  await rescheduleReminderLoop();
  const nextReminder = await findNextPendingReminder();
  if (nextReminder && nextReminder.triggerAt <= Date.now()) {
    void processDueReminders();
  }
}

export async function stopReminderScheduler(): Promise<void> {
  schedulerActive = false;
  reminderListener = null;
  refreshScheduled = false;
  clearSchedulerTimer();
}

export function refreshReminderScheduler(): void {
  if (!schedulerActive || refreshScheduled) {
    return;
  }

  refreshScheduled = true;
  clearSchedulerTimer();
  schedulerTimer = setTimeout(() => {
    void processDueReminders();
  }, 250);
}

export async function listReminders(params?: {
  status?: ReminderStatus;
  includeCanceled?: boolean;
  includeAcknowledged?: boolean;
  limit?: number;
}): Promise<ReminderRecord[]> {
  const db = await ensureV2Db();
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (params?.status) {
    conditions.push("status = ?");
    values.push(params.status);
  } else {
    if (!params?.includeCanceled) {
      conditions.push("status != ?");
      values.push("canceled");
    }
    if (!params?.includeAcknowledged) {
      conditions.push("status != ?");
      values.push("acknowledged");
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause =
    typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0
      ? `LIMIT ${Math.max(1, Math.floor(params.limit))}`
      : "";

  const rows = db.prepare(
    `
      SELECT *
      FROM reminders
      ${whereClause}
      ORDER BY
        CASE status
          WHEN 'pending' THEN 0
          WHEN 'delivered' THEN 1
          WHEN 'acknowledged' THEN 2
          ELSE 3
        END,
        trigger_at ASC,
        updated_at DESC
      ${limitClause}
    `,
  ).all(...values) as ReminderRow[];

  return rows.map(rowToReminder);
}

export async function getReminder(reminderId: string): Promise<ReminderRecord | null> {
  return await getReminderInternal(reminderId);
}

export async function createReminder(input: {
  message: string;
  triggerAt: number | string;
  recurring?: ReminderRecurrence;
  projectContextId?: string;
  sessionId?: string;
  source?: ReminderSource;
}): Promise<ReminderRecord> {
  const now = Date.now();
  const reminder: ReminderRecord = {
    id: randomUUID(),
    message: String(input.message ?? "").trim(),
    triggerAt: parseTriggerAt(input.triggerAt),
    recurring: normalizeRecurrence(input.recurring),
    status: "pending",
    projectContextId: cleanOptionalString(input.projectContextId),
    sessionId: cleanOptionalString(input.sessionId),
    source: normalizeSource(input.source),
    createdAt: now,
    updatedAt: now,
  };

  if (!reminder.message) {
    throw new Error("Reminder message is required.");
  }

  await insertReminderRecord(reminder);
  refreshReminderScheduler();
  return reminder;
}

export async function updateReminder(
  reminderId: string,
  patch: Partial<Pick<ReminderRecord, "message" | "triggerAt" | "recurring" | "projectContextId" | "source">>,
): Promise<ReminderRecord | null> {
  const existing = await getReminderInternal(reminderId);
  if (!existing) {
    return null;
  }

  const next: ReminderRecord = {
    ...existing,
    message:
      typeof patch.message === "string" ? patch.message.trim() || existing.message : existing.message,
    triggerAt:
      Object.prototype.hasOwnProperty.call(patch, "triggerAt")
        ? parseTriggerAt(patch.triggerAt, existing.triggerAt)
        : existing.triggerAt,
    recurring:
      Object.prototype.hasOwnProperty.call(patch, "recurring")
        ? normalizeRecurrence(patch.recurring)
        : existing.recurring,
    projectContextId:
      Object.prototype.hasOwnProperty.call(patch, "projectContextId")
        ? cleanOptionalString(patch.projectContextId)
        : existing.projectContextId,
    source:
      Object.prototype.hasOwnProperty.call(patch, "source")
        ? normalizeSource(patch.source)
        : existing.source ?? "manual",
    updatedAt: Date.now(),
  };

  await insertReminderRecord(next);
  refreshReminderScheduler();
  return next;
}

export async function acknowledgeReminder(reminderId: string): Promise<ReminderRecord | null> {
  const existing = await getReminderInternal(reminderId);
  if (!existing) {
    return null;
  }

  const acknowledgedAt = Date.now();
  const next: ReminderRecord = {
    ...existing,
    status: "acknowledged",
    acknowledgedAt,
    updatedAt: acknowledgedAt,
  };
  await insertReminderRecord(next);
  return next;
}

export async function cancelReminder(reminderId: string): Promise<ReminderRecord | null> {
  const existing = await getReminderInternal(reminderId);
  if (!existing) {
    return null;
  }

  const canceledAt = Date.now();
  const next: ReminderRecord = {
    ...existing,
    status: "canceled",
    canceledAt,
    updatedAt: canceledAt,
  };
  await insertReminderRecord(next);
  refreshReminderScheduler();
  return next;
}

export async function deleteReminder(reminderId: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM reminders WHERE id = ?").run(reminderId);
  if (result.changes > 0) {
    refreshReminderScheduler();
    return true;
  }
  return false;
}
