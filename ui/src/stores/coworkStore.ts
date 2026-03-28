import { create } from "zustand";
import type {
  CoworkTab,
  CoworkSnapshot,
  DailyBriefing,
  CoworkProject,
  CoworkMeeting,
  CoworkMilestone,
  CoworkProjectStatus,
  CoworkMeetingStatus,
} from "../../../src/types/cowork.js";

const api = () => (window as any).codexAgent;

type CoworkState = {
  loaded: boolean;
  loading: boolean;
  error?: string;
  activeTab: CoworkTab;

  snapshot: CoworkSnapshot | null;
  briefing: DailyBriefing | null;
  projects: CoworkProject[];
  meetings: CoworkMeeting[];

  // Focus mode
  focusActive: boolean;
  focusTaskId?: string;
  focusStartedAt?: number;

  // Actions
  setActiveTab: (tab: CoworkTab) => void;
  loadSnapshot: () => Promise<void>;
  loadBriefing: () => Promise<void>;

  // Projects
  loadProjects: () => Promise<void>;
  createProject: (name: string, projectContextId: string) => Promise<CoworkProject>;
  updateProject: (id: string, patch: Partial<{ name: string; status: CoworkProjectStatus; milestones: CoworkMilestone[] }>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Meetings
  loadMeetings: () => Promise<void>;
  createMeeting: (data: { title: string; scheduledAt: number; duration?: number; participants?: string[]; projectContextId?: string }) => Promise<CoworkMeeting>;
  updateMeeting: (id: string, patch: Partial<{ title: string; scheduledAt: number; duration: number; participants: string[]; status: CoworkMeetingStatus }>) => Promise<void>;
  completeMeeting: (id: string) => Promise<void>;
  deleteMeeting: (id: string) => Promise<void>;
  extractActions: (id: string, text: string) => Promise<string[]>;

  // Focus
  enterFocus: (taskId?: string) => void;
  exitFocus: () => void;
};

export const useCoworkStore = create<CoworkState>((set, get) => ({
  loaded: false,
  loading: false,
  error: undefined,
  activeTab: "dashboard",

  snapshot: null,
  briefing: null,
  projects: [],
  meetings: [],

  focusActive: false,
  focusTaskId: undefined,
  focusStartedAt: undefined,

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadSnapshot: async () => {
    set({ loading: true, error: undefined });
    try {
      const snapshot = await api().cowork.snapshot();
      set({ snapshot, loaded: true, loading: false });
    } catch (err: any) {
      set({ error: err?.message ?? "Failed to load snapshot", loading: false });
    }
  },

  loadBriefing: async () => {
    try {
      const briefing = await api().cowork.briefing();
      set({ briefing });
    } catch {
      // silently fail
    }
  },

  loadProjects: async () => {
    try {
      const projects = await api().cowork.projects.list();
      set({ projects });
    } catch {
      // silently fail
    }
  },

  createProject: async (name, projectContextId) => {
    const project = await api().cowork.projects.create({ name, projectContextId });
    await get().loadProjects();
    return project;
  },

  updateProject: async (id, patch) => {
    await api().cowork.projects.update(id, patch);
    await get().loadProjects();
  },

  deleteProject: async (id) => {
    await api().cowork.projects.delete(id);
    await get().loadProjects();
  },

  loadMeetings: async () => {
    try {
      const meetings = await api().cowork.meetings.list();
      set({ meetings });
    } catch {
      // silently fail
    }
  },

  createMeeting: async (data) => {
    const meeting = await api().cowork.meetings.create(data);
    await get().loadMeetings();
    return meeting;
  },

  updateMeeting: async (id, patch) => {
    await api().cowork.meetings.update(id, patch);
    await get().loadMeetings();
  },

  completeMeeting: async (id) => {
    await api().cowork.meetings.complete(id);
    await get().loadMeetings();
  },

  deleteMeeting: async (id) => {
    await api().cowork.meetings.delete(id);
    await get().loadMeetings();
  },

  extractActions: async (id, text) => {
    const result = await api().cowork.meetings.extractActions(id, text);
    await get().loadMeetings();
    return result?.taskIds ?? [];
  },

  enterFocus: (taskId) => set({ focusActive: true, focusTaskId: taskId, focusStartedAt: Date.now() }),
  exitFocus: () => set({ focusActive: false, focusTaskId: undefined, focusStartedAt: undefined }),
}));
