import { create } from "zustand";
import {
  splitModelRef,
  type CanonicalProviderName,
  type ProviderAuthStatus,
} from "../../../src/types/model.js";

type AuthState = {
  activeProvider: CanonicalProviderName;
  statuses: ProviderAuthStatus[];
  authenticated: boolean;
  email?: string;
  checking: boolean;
  loginBusy: boolean;

  checkAuth: (providerHint?: string) => Promise<void>;
  login: (provider?: string) => Promise<void>;
  logout: (provider?: string) => Promise<void>;
  saveProviderAuth: (args: { provider: string; apiKey?: string; owner?: string; baseUrl?: string }) => Promise<void>;
  deleteProviderAuth: (provider: string) => Promise<void>;
  getProviderStatus: (provider?: string) => ProviderAuthStatus | undefined;
};

const api = () => (window as any).codexAgent;

function resolveProviderHint(providerHint?: string): CanonicalProviderName {
  if (!providerHint) {
    return "openai-codex";
  }
  if (providerHint.includes("/")) {
    return splitModelRef(providerHint).provider;
  }
  return splitModelRef(undefined, providerHint).provider;
}

function selectActiveStatus(statuses: ProviderAuthStatus[], providerHint?: string): ProviderAuthStatus | undefined {
  const provider = resolveProviderHint(providerHint);
  return statuses.find((status) => status.provider === provider);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  activeProvider: "openai-codex",
  statuses: [],
  authenticated: false,
  email: undefined,
  checking: true,
  loginBusy: false,

  checkAuth: async (providerHint) => {
    set({ checking: true });
    try {
      const result = await api().auth.list();
      const statuses = (result?.providers ?? []) as ProviderAuthStatus[];
      const active = selectActiveStatus(statuses, providerHint ?? result?.activeProvider);
      set({
        statuses,
        activeProvider: active?.provider ?? resolveProviderHint(providerHint ?? result?.activeProvider),
        authenticated: Boolean(active?.authenticated),
        email: active?.owner,
        checking: false,
      });
    } catch {
      set({ authenticated: false, checking: false });
    }
  },

  login: async (provider) => {
    set({ loginBusy: true });
    try {
      const target = provider ?? get().activeProvider;
      const result = await api().auth.login(target);
      if (result?.ok) {
        await get().checkAuth(target);
      }
    } finally {
      set({ loginBusy: false });
    }
  },

  logout: async (provider) => {
    const target = provider ?? get().activeProvider;
    if (target === "openai-codex") {
      await api().logout();
    } else {
      await api().auth.delete(target);
    }
    await get().checkAuth(target);
  },

  saveProviderAuth: async (args) => {
    await api().auth.save(args);
    await get().checkAuth(args.provider);
  },

  deleteProviderAuth: async (provider) => {
    await api().auth.delete(provider);
    await get().checkAuth(provider);
  },

  getProviderStatus: (provider) => {
    const target = resolveProviderHint(provider ?? get().activeProvider);
    return get().statuses.find((status) => status.provider === target);
  },
}));
