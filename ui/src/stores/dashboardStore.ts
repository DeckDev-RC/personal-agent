import { create } from "zustand";
import type { McpServerConfig, McpServerStatus } from "../../../src/types/mcp.js";
import type { TaskRecord } from "../../../src/types/task.js";

const MANUAL_AGENDA_STORAGE_KEY = "codex-agent.dashboard.manual-agenda";

const api = () => (window as any).codexAgent;

export type DashboardManualAgendaItem = {
  id: string;
  title: string;
  timeLabel: string;
  done: boolean;
  createdAt: number;
};

export type DashboardSessionSummary = {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  messageCount: number;
  projectContextId?: string;
  lastRunStatus?: string;
};

export type DashboardWorkspaceFile = {
  relativePath: string;
  title: string;
  category: "meetings" | "drafts" | "research" | "tasks";
  updatedAt: number;
  preview: string;
  skillName?: string;
  projectContextId?: string;
};

function readManualAgenda(): DashboardManualAgendaItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MANUAL_AGENDA_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        id: String(item?.id ?? ""),
        title: String(item?.title ?? "").trim(),
        timeLabel: String(item?.timeLabel ?? "").trim(),
        done: Boolean(item?.done),
        createdAt: Number(item?.createdAt ?? Date.now()),
      }))
      .filter((item) => item.id && item.title);
  } catch {
    return [];
  }
}

function persistManualAgenda(items: DashboardManualAgendaItem[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(MANUAL_AGENDA_STORAGE_KEY, JSON.stringify(items));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeSessions(input: unknown): DashboardSessionSummary[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => ({
      id: String((item as any)?.sessionId ?? (item as any)?.id ?? ""),
      title: String((item as any)?.title ?? "").trim() || "Untitled session",
      updatedAt: Number((item as any)?.updatedAt ?? Date.now()),
      createdAt: Number((item as any)?.createdAt ?? Date.now()),
      messageCount: Number((item as any)?.messageCount ?? 0),
      projectContextId:
        typeof (item as any)?.projectContextId === "string"
          ? (item as any).projectContextId
          : undefined,
      lastRunStatus:
        typeof (item as any)?.lastRunStatus === "string"
          ? (item as any).lastRunStatus
          : undefined,
    }))
    .filter((item) => item.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8);
}

function normalizeFiles(input: unknown): DashboardWorkspaceFile[] {
  const files = Array.isArray((input as any)?.files) ? (input as any).files : [];
  return files
    .map((item: any) => ({
      relativePath: String(item?.relativePath ?? ""),
      title: String(item?.title ?? "").trim() || String(item?.relativePath ?? ""),
      category:
        item?.category === "meetings" ||
        item?.category === "research" ||
        item?.category === "tasks"
          ? item.category
          : "drafts",
      updatedAt: Number(item?.updatedAt ?? Date.now()),
      preview: String(item?.preview ?? "").trim(),
      skillName: typeof item?.skillName === "string" ? item.skillName : undefined,
      projectContextId:
        typeof item?.projectContextId === "string" ? item.projectContextId : undefined,
    }))
    .filter((item) => item.relativePath)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8);
}

function normalizeStatuses(input: unknown): McpServerStatus[] {
  return Array.isArray(input) ? (input as McpServerStatus[]) : [];
}

function normalizeServers(input: unknown): McpServerConfig[] {
  return Array.isArray(input) ? (input as McpServerConfig[]) : [];
}

type DashboardState = {
  loaded: boolean;
  loading: boolean;
  error?: string;
  tasks: TaskRecord[];
  sessions: DashboardSessionSummary[];
  files: DashboardWorkspaceFile[];
  mcpStatuses: McpServerStatus[];
  mcpServers: McpServerConfig[];
  manualAgenda: DashboardManualAgendaItem[];
  lastLoadedAt?: number;

  loadDashboard: () => Promise<void>;
  addManualAgendaItem: (title: string, timeLabel: string) => void;
  toggleManualAgendaItem: (id: string) => void;
  removeManualAgendaItem: (id: string) => void;
  getConnectedCatalogIds: () => string[];
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  loaded: false,
  loading: false,
  error: undefined,
  tasks: [],
  sessions: [],
  files: [],
  mcpStatuses: [],
  mcpServers: [],
  manualAgenda: readManualAgenda(),
  lastLoadedAt: undefined,

  loadDashboard: async () => {
    set({ loading: true, error: undefined });

    try {
      const [tasks, sessions, workspace, mcpStatuses, mcpServers] = await Promise.all([
        api().tasks.list({ includeDone: true }),
        api().sessions.list(),
        api().cowork.workspace(),
        api().mcp.statuses(),
        api().store.listMcpServers(),
      ]);

      set({
        loaded: true,
        loading: false,
        error: undefined,
        tasks: Array.isArray(tasks) ? (tasks as TaskRecord[]) : [],
        sessions: normalizeSessions(sessions),
        files: normalizeFiles(workspace),
        mcpStatuses: normalizeStatuses(mcpStatuses),
        mcpServers: normalizeServers(mcpServers),
        lastLoadedAt: Date.now(),
      });
    } catch (error) {
      set({
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  addManualAgendaItem: (title, timeLabel) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }

    const next = [
      ...get().manualAgenda,
      {
        id: generateId(),
        title: normalizedTitle,
        timeLabel: timeLabel.trim(),
        done: false,
        createdAt: Date.now(),
      },
    ];
    persistManualAgenda(next);
    set({ manualAgenda: next });
  },

  toggleManualAgendaItem: (id) => {
    const next = get().manualAgenda.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item,
    );
    persistManualAgenda(next);
    set({ manualAgenda: next });
  },

  removeManualAgendaItem: (id) => {
    const next = get().manualAgenda.filter((item) => item.id !== id);
    persistManualAgenda(next);
    set({ manualAgenda: next });
  },

  getConnectedCatalogIds: () => {
    const connectedIds = new Set(
      get()
        .mcpStatuses.filter((status) => status.connected)
        .map((status) => status.id),
    );

    return get()
      .mcpServers.filter((server) => connectedIds.has(server.id) && server.catalogId)
      .map((server) => String(server.catalogId));
  },
}));
