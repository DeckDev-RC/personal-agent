import { create } from "zustand";
import type { ProjectContext } from "../../../src/types/projectContext.js";

const ACTIVE_CONTEXT_STORAGE_KEY = "codex-agent.active-project-context";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readInitialActiveContextId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ACTIVE_CONTEXT_STORAGE_KEY) ?? "";
}

const api = () => (window as any).codexAgent;

type ContextState = {
  contexts: ProjectContext[];
  loaded: boolean;
  activeContextId: string;

  loadContexts: () => Promise<void>;
  createContext: (partial: Partial<ProjectContext>) => Promise<ProjectContext>;
  updateContext: (projectContext: ProjectContext) => Promise<void>;
  deleteContext: (id: string) => Promise<void>;
  setActiveContextId: (id: string) => void;
  getContext: (id?: string) => ProjectContext | undefined;
};

export const useContextStore = create<ContextState>((set, get) => ({
  contexts: [],
  loaded: false,
  activeContextId: readInitialActiveContextId(),

  loadContexts: async () => {
    const list = await api().store.listContexts();
    set({ contexts: list, loaded: true });
  },

  createContext: async (partial) => {
    const now = Date.now();
    const projectContext: ProjectContext = {
      id: partial.id ?? generateId(),
      name: partial.name?.trim() || "Novo Contexto",
      description: partial.description?.trim() || "",
      stakeholders: Array.isArray(partial.stakeholders) ? partial.stakeholders : [],
      decisions: Array.isArray(partial.decisions) ? partial.decisions : [],
      links: Array.isArray(partial.links) ? partial.links : [],
      notes: partial.notes?.trim() || "",
      createdAt: partial.createdAt ?? now,
      updatedAt: now,
    };
    await api().store.saveContext(projectContext);
    await get().loadContexts();
    return projectContext;
  },

  updateContext: async (projectContext) => {
    await api().store.saveContext({
      ...projectContext,
      updatedAt: Date.now(),
    });
    await get().loadContexts();
  },

  deleteContext: async (id) => {
    await api().store.deleteContext(id);
    if (get().activeContextId === id) {
      get().setActiveContextId("");
    }
    await get().loadContexts();
  },

  setActiveContextId: (id) => {
    if (typeof window !== "undefined") {
      if (id) {
        window.localStorage.setItem(ACTIVE_CONTEXT_STORAGE_KEY, id);
      } else {
        window.localStorage.removeItem(ACTIVE_CONTEXT_STORAGE_KEY);
      }
    }
    set({ activeContextId: id });
  },

  getContext: (id) => {
    if (!id) {
      return undefined;
    }
    return get().contexts.find((projectContext) => projectContext.id === id);
  },
}));
