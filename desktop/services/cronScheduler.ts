import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ensureV2Db } from "./v2Db.js";

export type CronActionType = "workflow" | "skill" | "send_draft" | "http_fetch" | "custom_prompt";

export type CronJob = {
  id: string;
  name: string;
  cronExpr: string;
  actionType: CronActionType;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

function rowToJob(row: Record<string, unknown>): CronJob {
  return {
    id: String(row.id),
    name: String(row.name),
    cronExpr: String(row.cron_expr),
    actionType: String(row.action_type) as CronActionType,
    actionConfig: typeof row.action_config_json === "string" ? JSON.parse(row.action_config_json) : {},
    enabled: row.enabled === 1,
    lastRun: typeof row.last_run === "number" ? row.last_run : undefined,
    nextRun: typeof row.next_run === "number" ? row.next_run : undefined,
    runCount: Number(row.run_count ?? 0),
    lastError: typeof row.last_error === "string" ? row.last_error : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

function parseCronExpr(expr: string): { minutes: number[]; hours: number[]; daysOfMonth: number[]; months: number[]; daysOfWeek: number[] } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expr}`);

  function parseField(field: string, min: number, max: number): number[] {
    if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const values: number[] = [];
    for (const part of field.split(",")) {
      const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
      if (stepMatch) {
        let [rangeMin, rangeMax] = stepMatch[1] === "*" ? [min, max] : stepMatch[1].split("-").map(Number);
        const step = Number(stepMatch[2]);
        for (let i = rangeMin; i <= rangeMax; i += step) values.push(i);
      } else if (part.includes("-")) {
        const [a, b] = part.split("-").map(Number);
        for (let i = a; i <= b; i++) values.push(i);
      } else {
        values.push(Number(part));
      }
    }
    return values.filter(v => v >= min && v <= max);
  }

  return {
    minutes: parseField(parts[0], 0, 59),
    hours: parseField(parts[1], 0, 23),
    daysOfMonth: parseField(parts[2], 1, 31),
    months: parseField(parts[3], 1, 12),
    daysOfWeek: parseField(parts[4], 0, 6),
  };
}

function getNextRun(cronExpr: string, after: number = Date.now()): number {
  const parsed = parseCronExpr(cronExpr);
  const date = new Date(after + 60000); // Start from next minute
  date.setSeconds(0, 0);

  for (let i = 0; i < 525960; i++) { // Max ~1 year of minutes
    if (
      parsed.minutes.includes(date.getMinutes()) &&
      parsed.hours.includes(date.getHours()) &&
      parsed.daysOfMonth.includes(date.getDate()) &&
      parsed.months.includes(date.getMonth() + 1) &&
      parsed.daysOfWeek.includes(date.getDay())
    ) {
      return date.getTime();
    }
    date.setTime(date.getTime() + 60000);
  }
  return after + 86400000; // Fallback: 24h
}

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let jobExecutor: ((job: CronJob) => Promise<void>) | null = null;

export function setJobExecutor(
  executor: ((job: CronJob) => Promise<void>) | null,
): void {
  jobExecutor = executor;
}

async function scheduleNextRun(job: CronJob): Promise<void> {
  clearJobTimer(job.id);
  if (!job.enabled) return;

  const nextRun = getNextRun(job.cronExpr);
  const delay = Math.max(nextRun - Date.now(), 1000);

  const db = await ensureV2Db();
  db.prepare("UPDATE cron_jobs SET next_run = ?, updated_at = ? WHERE id = ?").run(nextRun, Date.now(), job.id);

  activeTimers.set(job.id, setTimeout(async () => {
    const now = Date.now();
    try {
      if (jobExecutor) await jobExecutor(job);
      db.prepare("UPDATE cron_jobs SET last_run = ?, run_count = run_count + 1, last_error = NULL, updated_at = ? WHERE id = ?")
        .run(now, now, job.id);
    } catch (err: any) {
      db.prepare("UPDATE cron_jobs SET last_run = ?, run_count = run_count + 1, last_error = ?, updated_at = ? WHERE id = ?")
        .run(now, String(err?.message ?? err), now, job.id);
    }
    // Refresh from DB and schedule next
    const refreshed = await getJob(job.id);
    if (refreshed && refreshed.enabled) await scheduleNextRun(refreshed);
  }, delay));
}

function clearJobTimer(id: string): void {
  const timer = activeTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(id);
  }
}

// CRUD operations

export async function listJobs(): Promise<CronJob[]> {
  const db = await ensureV2Db();
  const rows = db.prepare("SELECT * FROM cron_jobs ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(rowToJob);
}

export async function getJob(id: string): Promise<CronJob | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM cron_jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export async function createJob(partial: Partial<CronJob> & { name: string; cronExpr: string; actionType: CronActionType; actionConfig: Record<string, unknown> }): Promise<CronJob> {
  const db = await ensureV2Db();
  const now = Date.now();
  const nextRun = getNextRun(partial.cronExpr);
  const job: CronJob = {
    id: partial.id ?? randomUUID(),
    name: partial.name,
    cronExpr: partial.cronExpr,
    actionType: partial.actionType,
    actionConfig: partial.actionConfig,
    enabled: partial.enabled ?? true,
    nextRun,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    "INSERT INTO cron_jobs (id, name, cron_expr, action_type, action_config_json, enabled, next_run, run_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(job.id, job.name, job.cronExpr, job.actionType, JSON.stringify(job.actionConfig), job.enabled ? 1 : 0, job.nextRun ?? null, 0, job.createdAt, job.updatedAt);

  if (job.enabled) await scheduleNextRun(job);
  return job;
}

export async function updateJob(id: string, patch: Partial<CronJob>): Promise<CronJob | null> {
  const existing = await getJob(id);
  if (!existing) return null;
  const now = Date.now();
  const updated: CronJob = {
    ...existing,
    name: patch.name ?? existing.name,
    cronExpr: patch.cronExpr ?? existing.cronExpr,
    actionType: patch.actionType ?? existing.actionType,
    actionConfig: patch.actionConfig ?? existing.actionConfig,
    enabled: patch.enabled ?? existing.enabled,
    updatedAt: now,
  };
  updated.nextRun = getNextRun(updated.cronExpr);

  const db = await ensureV2Db();
  db.prepare(
    "UPDATE cron_jobs SET name = ?, cron_expr = ?, action_type = ?, action_config_json = ?, enabled = ?, next_run = ?, updated_at = ? WHERE id = ?"
  ).run(updated.name, updated.cronExpr, updated.actionType, JSON.stringify(updated.actionConfig), updated.enabled ? 1 : 0, updated.nextRun, updated.updatedAt, id);

  await scheduleNextRun(updated);
  return updated;
}

export async function deleteJob(id: string): Promise<boolean> {
  clearJobTimer(id);
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM cron_jobs WHERE id = ?").run(id);
  return (result as any).changes > 0;
}

export async function toggleJob(id: string, enabled: boolean): Promise<CronJob | null> {
  return updateJob(id, { enabled });
}

export async function initScheduler(): Promise<void> {
  const jobs = await listJobs();
  for (const job of jobs) {
    if (job.enabled) await scheduleNextRun(job);
  }
}

export function stopScheduler(): void {
  for (const [id] of activeTimers) {
    clearJobTimer(id);
  }
}
