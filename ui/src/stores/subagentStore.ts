import { create } from "zustand";
import type { SpawnSubagentInput, SubagentRecord } from "../../../src/types/subagent.js";

type SubagentState = {
  subagents: SubagentRecord[];
  loaded: boolean;
  loading: boolean;
  loadSubagents: (args?: { parentSessionId?: string; requestedBy?: "user" | "agent"; limit?: number }) => Promise<void>;
  spawnSubagent: (input: SpawnSubagentInput) => Promise<SubagentRecord>;
  cancelSubagent: (id: string) => Promise<void>;
};

const api = () => (window as any).codexAgent;

export const useSubagentStore = create<SubagentState>((set, get) => ({
  subagents: [],
  loaded: false,
  loading: false,

  loadSubagents: async (args) => {
    set({ loading: true });
    try {
      const subagents = await api().subagents.list(args);
      set({ subagents, loaded: true, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  spawnSubagent: async (input) => {
    const created = await api().subagents.spawn(input);
    await get().loadSubagents();
    return created;
  },

  cancelSubagent: async (id) => {
    await api().subagents.cancel(id);
    await get().loadSubagents();
  },
}));
