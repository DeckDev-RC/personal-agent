import { randomUUID } from "node:crypto";
import type {
  CoworkProject,
  CoworkProjectStatus,
  CoworkMeeting,
  CoworkMeetingStatus,
  CoworkMeetingSource,
  CoworkMilestone,
  CoworkSnapshot,
  DailyBriefing,
  CalendarEvent,
} from "../../src/types/cowork.js";
import { ensureV2Db } from "./v2Db.js";
import { listTasks, createTask } from "./taskManager.js";
import { listDrafts } from "./communicationHub.js";
import { listCoworkWorkspaceFiles } from "./coworkWorkspace.js";

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

const VALID_PROJECT_STATUSES = new Set<CoworkProjectStatus>(["active", "paused", "completed"]);
const VALID_MEETING_STATUSES = new Set<CoworkMeetingStatus>(["upcoming", "in_progress", "completed"]);
const VALID_MEETING_SOURCES = new Set<CoworkMeetingSource>(["manual", "calendar_mcp"]);

function safeJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToProject(row: Record<string, unknown>): CoworkProject {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    projectContextId: String(row.project_context_id ?? ""),
    status: VALID_PROJECT_STATUSES.has(String(row.status) as CoworkProjectStatus)
      ? (String(row.status) as CoworkProjectStatus)
      : "active",
    milestones: safeJsonArray<CoworkMilestone>(row.milestones_json),
    openTaskCount: 0,
    overdueTaskCount: 0,
    nextDeadline: undefined,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

function rowToMeeting(row: Record<string, unknown>): CoworkMeeting {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    scheduledAt: Number(row.scheduled_at ?? 0),
    duration: Number(row.duration ?? 3600000),
    participants: safeJsonArray<string>(row.participants_json),
    projectContextId: typeof row.project_context_id === "string" ? row.project_context_id : undefined,
    prepSessionId: typeof row.prep_session_id === "string" ? row.prep_session_id : undefined,
    notesSessionId: typeof row.notes_session_id === "string" ? row.notes_session_id : undefined,
    actionItemTaskIds: safeJsonArray<string>(row.action_item_task_ids_json),
    followUpDraftIds: safeJsonArray<string>(row.follow_up_draft_ids_json),
    status: VALID_MEETING_STATUSES.has(String(row.status) as CoworkMeetingStatus)
      ? (String(row.status) as CoworkMeetingStatus)
      : "upcoming",
    source: VALID_MEETING_SOURCES.has(String(row.source) as CoworkMeetingSource)
      ? (String(row.source) as CoworkMeetingSource)
      : "manual",
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

export async function listProjects(opts?: { status?: CoworkProjectStatus }): Promise<CoworkProject[]> {
  const db = await ensureV2Db();
  const conditions: string[] = [];
  const values: string[] = [];

  if (opts?.status) {
    conditions.push("status = ?");
    values.push(opts.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM cowork_projects ${where} ORDER BY updated_at DESC`).all(...values) as Record<string, unknown>[];
  const projects = rows.map(rowToProject);

  // Enrich with task counts
  for (const project of projects) {
    const tasks = await listTasks({ projectContextId: project.projectContextId });
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    project.openTaskCount = tasks.filter((t) => t.status !== "done").length;
    project.overdueTaskCount = tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr,
    ).length;

    const upcoming = tasks
      .filter((t) => t.status !== "done" && t.dueDate)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    project.nextDeadline = upcoming[0]?.dueDate;
  }

  return projects;
}

export async function getProject(id: string): Promise<CoworkProject | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM cowork_projects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export async function createProject(data: { name: string; projectContextId: string; status?: CoworkProjectStatus }): Promise<CoworkProject> {
  const db = await ensureV2Db();
  const now = Date.now();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO cowork_projects (id, name, project_context_id, status, milestones_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.projectContextId, data.status ?? "active", "[]", now, now);

  return (await getProject(id))!;
}

export async function updateProject(id: string, patch: Partial<{ name: string; status: CoworkProjectStatus; milestones: CoworkMilestone[] }>): Promise<CoworkProject | null> {
  const existing = await getProject(id);
  if (!existing) return null;

  const db = await ensureV2Db();
  const now = Date.now();

  db.prepare(`
    UPDATE cowork_projects SET name = ?, status = ?, milestones_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    patch.name ?? existing.name,
    patch.status ?? existing.status,
    JSON.stringify(patch.milestones ?? existing.milestones),
    now,
    id,
  );

  return await getProject(id);
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM cowork_projects WHERE id = ?").run(id);
  return (result as any).changes > 0;
}

// ---------------------------------------------------------------------------
// Meetings CRUD
// ---------------------------------------------------------------------------

export async function listMeetings(opts?: { status?: CoworkMeetingStatus }): Promise<CoworkMeeting[]> {
  const db = await ensureV2Db();
  const conditions: string[] = [];
  const values: string[] = [];

  if (opts?.status) {
    conditions.push("status = ?");
    values.push(opts.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM cowork_meetings ${where} ORDER BY scheduled_at ASC`).all(...values) as Record<string, unknown>[];
  return rows.map(rowToMeeting);
}

export async function getMeeting(id: string): Promise<CoworkMeeting | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM cowork_meetings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToMeeting(row) : null;
}

export async function createMeeting(data: {
  title: string;
  scheduledAt: number;
  duration?: number;
  participants?: string[];
  projectContextId?: string;
  source?: CoworkMeetingSource;
}): Promise<CoworkMeeting> {
  const db = await ensureV2Db();
  const now = Date.now();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO cowork_meetings (
      id, title, scheduled_at, duration, participants_json, project_context_id,
      prep_session_id, notes_session_id, action_item_task_ids_json, follow_up_draft_ids_json,
      status, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.title, data.scheduledAt, data.duration ?? 3600000,
    JSON.stringify(data.participants ?? []), data.projectContextId ?? null,
    null, null, "[]", "[]",
    "upcoming", data.source ?? "manual", now, now,
  );

  return (await getMeeting(id))!;
}

export async function updateMeeting(
  id: string,
  patch: Partial<{
    title: string;
    scheduledAt: number;
    duration: number;
    participants: string[];
    projectContextId: string;
    prepSessionId: string;
    notesSessionId: string;
    actionItemTaskIds: string[];
    followUpDraftIds: string[];
    status: CoworkMeetingStatus;
  }>,
): Promise<CoworkMeeting | null> {
  const existing = await getMeeting(id);
  if (!existing) return null;

  const db = await ensureV2Db();
  const now = Date.now();

  db.prepare(`
    UPDATE cowork_meetings SET
      title = ?, scheduled_at = ?, duration = ?, participants_json = ?,
      project_context_id = ?, prep_session_id = ?, notes_session_id = ?,
      action_item_task_ids_json = ?, follow_up_draft_ids_json = ?,
      status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    patch.title ?? existing.title,
    patch.scheduledAt ?? existing.scheduledAt,
    patch.duration ?? existing.duration,
    JSON.stringify(patch.participants ?? existing.participants),
    patch.projectContextId ?? existing.projectContextId ?? null,
    patch.prepSessionId ?? existing.prepSessionId ?? null,
    patch.notesSessionId ?? existing.notesSessionId ?? null,
    JSON.stringify(patch.actionItemTaskIds ?? existing.actionItemTaskIds),
    JSON.stringify(patch.followUpDraftIds ?? existing.followUpDraftIds),
    patch.status ?? existing.status,
    now,
    id,
  );

  return await getMeeting(id);
}

export async function completeMeeting(id: string): Promise<CoworkMeeting | null> {
  return await updateMeeting(id, { status: "completed" });
}

export async function deleteMeeting(id: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM cowork_meetings WHERE id = ?").run(id);
  return (result as any).changes > 0;
}

// ---------------------------------------------------------------------------
// Action item extraction
// ---------------------------------------------------------------------------

const ACTION_ITEM_PATTERN = /[-*]\s*\[?\s*\]?\s*(.+)/g;

export async function extractActionItems(meetingId: string, text: string): Promise<string[]> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return [];

  const lines = text.split(/\r?\n/);
  const taskIds: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[-*]\s*\[?\s*\]?\s*(.+)/);
    if (match && match[1]) {
      const title = match[1].trim();
      if (title.length > 2) {
        const task = await createTask({
          title,
          status: "today",
          priority: "medium",
          projectContextId: meeting.projectContextId,
          source: "cowork-meeting",
        });
        taskIds.push(task.id);
      }
    }
  }

  if (taskIds.length > 0) {
    await updateMeeting(meetingId, {
      actionItemTaskIds: [...meeting.actionItemTaskIds, ...taskIds],
    });
  }

  return taskIds;
}

// ---------------------------------------------------------------------------
// Snapshot & Briefing
// ---------------------------------------------------------------------------

export async function getCoworkSnapshot(): Promise<CoworkSnapshot> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [allTasks, pendingDrafts, projects, meetings, workspace] = await Promise.all([
    listTasks(),
    listDrafts({ status: "draft" }),
    listProjects({ status: "active" }),
    listMeetings({ status: "upcoming" }),
    listCoworkWorkspaceFiles(),
  ]);

  const tasksOverdue = allTasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr,
  ).length;
  const tasksDueToday = allTasks.filter(
    (t) => t.status !== "done" && t.dueDate === todayStr,
  ).length;
  const tasksInProgress = allTasks.filter((t) => t.status === "in_progress").length;

  const recentFiles = workspace.files.slice(0, 5).map((f) => ({
    title: f.title,
    category: f.category,
    updatedAt: f.updatedAt,
  }));

  return {
    tasksOverdue,
    tasksDueToday,
    tasksInProgress,
    pendingDrafts: pendingDrafts.length,
    upcomingMeetingsCount: meetings.length,
    activeProjectsCount: projects.length,
    upcomingMeetings: meetings.slice(0, 5),
    activeProjects: projects.slice(0, 5),
    recentFiles,
  };
}

export async function getDailyBriefing(): Promise<DailyBriefing> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [allTasks, pendingDrafts, meetings, workspace] = await Promise.all([
    listTasks(),
    listDrafts({ status: "draft" }),
    listMeetings({ status: "upcoming" }),
    listCoworkWorkspaceFiles(),
  ]);

  const tasksOverdue = allTasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr,
  ).length;
  const tasksDueToday = allTasks.filter(
    (t) => t.status !== "done" && t.dueDate === todayStr,
  ).length;
  const tasksInProgress = allTasks.filter((t) => t.status === "in_progress").length;

  const todayMeetings = meetings.filter(
    (m) => m.scheduledAt >= now && m.scheduledAt <= endOfDay.getTime(),
  );

  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 12) greeting = "Bom dia!";
  else if (hour < 18) greeting = "Boa tarde!";
  else greeting = "Boa noite!";

  const recentFiles = workspace.files.slice(0, 5).map((f) => ({
    title: f.title,
    category: f.category,
    updatedAt: f.updatedAt,
  }));

  return {
    date: todayStr,
    greeting,
    tasksOverdue,
    tasksDueToday,
    tasksInProgress,
    upcomingMeetings: todayMeetings,
    pendingDrafts: pendingDrafts.length,
    recentFiles,
    calendarEvents: [],
  };
}
