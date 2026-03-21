import "@testing-library/jest-dom/vitest";

// Mock window.matchMedia for theme system in settingsStore
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock codexAgent API
(window as any).codexAgent = {
  auth: {
    list: async () => ({
      ok: true,
      activeProvider: "openai-codex",
      providers: [
        {
          provider: "openai-codex",
          displayName: "OpenAI Codex",
          authKind: "oauth",
          configured: false,
          authenticated: false,
        },
      ],
    }),
    login: async () => ({ ok: true }),
    save: async () => ({ ok: true }),
    delete: async () => ({ ok: true }),
  },
  store: {
    getSettings: async () => ({}),
    saveSettings: async () => {},
  },
  proactive: {
    suggestions: async () => [],
  },
  logout: async () => ({ ok: true }),
  minimizeWindow: () => {},
  closeWindow: () => {},
};
