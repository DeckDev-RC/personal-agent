import { create } from "zustand";
import type { ProviderAuthStatus } from "../../../src/types/model.js";

export type UsageWindowStatus = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetAt?: number;
};

export type RuntimeStatus = {
  activeProvider: string;
  activeModelRef: string;
  authenticated: boolean;
  email?: string;
  tokenExpiresAt?: number;
  modelContextWindow: number;
  maxOutputTokens: number;
  mcpConnectedCount: number;
  mcpEnabledCount: number;
  usagePlan?: string;
  usageWindows: UsageWindowStatus[];
  usageError?: string;
  providerStatuses: ProviderAuthStatus[];
};

const api = () => (window as any).codexAgent;

type RuntimeState = {
  status: RuntimeStatus | null;
  loading: boolean;
  refreshStatus: () => Promise<void>;
};

export const useRuntimeStore = create<RuntimeState>((set) => ({
  status: null,
  loading: false,

  refreshStatus: async () => {
    set({ loading: true });
    try {
      const status = await api().getRuntimeStatus();
      set({ status, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
