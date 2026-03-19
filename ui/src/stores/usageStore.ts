import { create } from "zustand";

const api = () => (window as any).codexAgent;

export type UsageStats = {
  totalConversations: number;
  totalMessages: number;
  estimatedTokens: number;
  estimatedCost: number;
  byModel: { model: string; messages: number; tokens: number }[];
  recentActivity: {
    id: string;
    title: string;
    messageCount: number;
    updatedAt: number;
    model: string;
  }[];
};

const MODEL_COST_PER_1K: Record<string, number> = {
  "gpt-5.4": 0.005,
  "gpt-5.4-mini": 0.001,
};
const DEFAULT_COST_PER_1K = 0.003;

function estimateTokens(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return wordCount * 4;
}

function getCostPer1K(model: string): number {
  const key = model.includes("/") ? model.split("/").slice(-1)[0] : model;
  return MODEL_COST_PER_1K[key] ?? DEFAULT_COST_PER_1K;
}

type UsageState = {
  stats: UsageStats;
  loading: boolean;
  error: string | null;
  loadUsage: () => Promise<void>;
};

const emptyStats: UsageStats = {
  totalConversations: 0,
  totalMessages: 0,
  estimatedTokens: 0,
  estimatedCost: 0,
  byModel: [],
  recentActivity: [],
};

export const useUsageStore = create<UsageState>((set) => ({
  stats: emptyStats,
  loading: false,
  error: null,

  loadUsage: async () => {
    set({ loading: true, error: null });
    try {
      const list: any[] = (await api().sessions.list()) ?? [];

      let totalMessages = 0;
      let totalTokens = 0;
      let totalCost = 0;

      const modelMap = new Map<string, { messages: number; tokens: number }>();

      for (const session of list) {
        const model: string = session.model ?? "unknown";
        const msgCount: number = session.messageCount ?? 0;
        totalMessages += msgCount;

        // Estimate tokens from message count (rough: ~40 tokens per message average)
        // If individual messages are available we could be more precise,
        // but the list endpoint only gives summaries.
        const sessionTokens = msgCount * 40;
        totalTokens += sessionTokens;

        const costPer1K = getCostPer1K(model);
        totalCost += (sessionTokens / 1000) * costPer1K;

        const existing = modelMap.get(model);
        if (existing) {
          existing.messages += msgCount;
          existing.tokens += sessionTokens;
        } else {
          modelMap.set(model, { messages: msgCount, tokens: sessionTokens });
        }
      }

      const byModel = Array.from(modelMap.entries())
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.messages - a.messages);

      const recentActivity = [...list]
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 20)
        .map((s) => ({
          id: s.sessionId ?? s.id,
          title: s.title ?? "Untitled",
          messageCount: s.messageCount ?? 0,
          updatedAt: s.updatedAt ?? s.createdAt ?? 0,
          model: s.model ?? "unknown",
        }));

      set({
        stats: {
          totalConversations: list.length,
          totalMessages,
          estimatedTokens: totalTokens,
          estimatedCost: totalCost,
          byModel,
          recentActivity,
        },
        loading: false,
      });
    } catch (err: any) {
      set({ error: err?.message ?? "Failed to load usage data", loading: false });
    }
  },
}));
