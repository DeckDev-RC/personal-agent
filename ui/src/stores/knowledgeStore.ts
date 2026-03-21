import { create } from "zustand";
import type {
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeSyncStatus,
} from "../../../src/types/knowledge.js";

const api = () => (window as any).codexAgent;

type KnowledgeState = {
  query: string;
  results: KnowledgeSearchResult[];
  status: KnowledgeSyncStatus | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
  syncKnowledge: () => Promise<void>;
  search: (params: KnowledgeSearchQuery) => Promise<void>;
  clear: () => void;
};

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  query: "",
  results: [],
  status: null,
  loading: false,
  syncing: false,
  error: null,

  refreshStatus: async () => {
    try {
      const status = await api().knowledge.status();
      set({ status, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  syncKnowledge: async () => {
    set({ syncing: true, error: null });
    try {
      const status = await api().knowledge.sync();
      set({ status, syncing: false });
    } catch (error) {
      set({
        syncing: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  search: async (params) => {
    set({ loading: true, error: null, query: params.query });
    try {
      const response = await api().knowledge.search(params);
      set({
        query: response.query,
        results: response.results,
        status: response.status,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clear: () => {
    set({ query: "", results: [], error: null });
  },
}));
