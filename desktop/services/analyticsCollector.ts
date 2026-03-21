import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AnalyticsEvent, AnalyticsEventType, WeeklyReportData } from "../../src/types/analytics.js";
import { ensureV2Db } from "./v2Db.js";

function rowToEvent(row: Record<string, unknown>): AnalyticsEvent {
  return {
    id: String(row.id),
    eventType: String(row.event_type) as AnalyticsEventType,
    metadata: typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : {},
    timestamp: Number(row.timestamp ?? Date.now()),
  };
}

export async function trackEvent(eventType: AnalyticsEventType, metadata: Record<string, unknown> = {}): Promise<AnalyticsEvent> {
  const db = await ensureV2Db();
  const event: AnalyticsEvent = {
    id: randomUUID(),
    eventType,
    metadata,
    timestamp: Date.now(),
  };
  db.prepare("INSERT INTO analytics_events (id, event_type, metadata_json, timestamp) VALUES (?, ?, ?, ?)").run(
    event.id, event.eventType, JSON.stringify(event.metadata), event.timestamp,
  );
  return event;
}

export async function listEvents(opts?: {
  eventType?: AnalyticsEventType;
  since?: number;
  until?: number;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const db = await ensureV2Db();
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (opts?.eventType) {
    clauses.push("event_type = ?");
    params.push(opts.eventType);
  }
  if (opts?.since) {
    clauses.push("timestamp >= ?");
    params.push(opts.since);
  }
  if (opts?.until) {
    clauses.push("timestamp <= ?");
    params.push(opts.until);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 500;
  const rows = db.prepare(`SELECT * FROM analytics_events ${where} ORDER BY timestamp DESC LIMIT ?`).all(...params, limit) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

export async function getWeeklyReport(weekStartMs?: number): Promise<WeeklyReportData> {
  const now = Date.now();
  const todayDate = new Date(now);
  const dayOfWeek = todayDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = weekStartMs ?? new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + mondayOffset).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

  const events = await listEvents({ since: weekStart, until: weekEnd, limit: 10000 });

  const skillsUsed: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  let tasksCompleted = 0;
  let documentsGenerated = 0;
  let totalSessions = 0;
  let totalToolCalls = 0;
  let draftsSent = 0;

  for (const event of events) {
    typeCounts[event.eventType] = (typeCounts[event.eventType] ?? 0) + 1;
    switch (event.eventType) {
      case "task_completed":
        tasksCompleted++;
        break;
      case "document_generated":
        documentsGenerated++;
        break;
      case "skill_used": {
        const name = String(event.metadata.skillName ?? "unknown");
        skillsUsed[name] = (skillsUsed[name] ?? 0) + 1;
        break;
      }
      case "chat_session":
        totalSessions++;
        break;
      case "mcp_tool_call":
        totalToolCalls++;
        break;
      case "draft_sent":
        draftsSent++;
        break;
    }
  }

  const topActivities = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    weekStart,
    weekEnd,
    tasksCompleted,
    documentsGenerated,
    skillsUsed,
    totalSessions,
    totalToolCalls,
    draftsSent,
    topActivities,
  };
}
