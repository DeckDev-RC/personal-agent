import { create } from "zustand";
import {
  getDefaultModelRef,
  type CanonicalProviderName,
} from "../../../src/types/model.js";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
  type ThemeMode,
} from "../../../src/settings/appSettings.js";

export type ProviderName = CanonicalProviderName;

type SettingsState = {
  settings: AppSettings;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  applyTheme: (mode: ThemeMode) => void;
};

const api = () => (window as any).codexAgent;

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return mode;
}

function applyThemeToDOM(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  if (resolved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  loaded: false,

  loadSettings: async () => {
    try {
      const s = await api().store.getSettings();
      const settings = normalizeAppSettings(s);
      set({ settings, loaded: true });
      applyThemeToDOM(settings.themeMode);
    } catch {
      set({ loaded: true });
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const nextPartial: Partial<AppSettings> = { ...partial };

    if (partial.provider && partial.provider !== current.provider && partial.defaultModelRef === undefined) {
      const nextModelRef = getDefaultModelRef(partial.provider);
      nextPartial.defaultModelRef = nextModelRef;
      nextPartial.fastModelRef = partial.fastModelRef ?? nextModelRef;
      nextPartial.reviewModelRef = partial.reviewModelRef ?? nextModelRef;
      nextPartial.defaultModel = nextModelRef;
      nextPartial.fastModel = nextModelRef;
      nextPartial.reviewModel = nextModelRef;
    }

    const updated = normalizeAppSettings({ ...current, ...nextPartial });
    set({ settings: updated });
    if (partial.themeMode !== undefined) {
      applyThemeToDOM(partial.themeMode);
    }
    await api().store.saveSettings(updated);
  },

  applyTheme: (mode) => {
    applyThemeToDOM(mode);
  },
}));

// Listen for system theme changes when in "system" mode
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    const { settings } = useSettingsStore.getState();
    if (settings.themeMode === "system") {
      applyThemeToDOM("system");
    }
  });
}
