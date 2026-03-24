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
    cancelLogin: async () => ({ ok: true }),
    save: async () => ({ ok: true }),
    test: async () => ({ ok: true }),
    delete: async () => ({ ok: true }),
  },
  getRuntimeStatus: async () => ({
    activeProvider: "openai-codex",
    activeModelRef: "openai-codex/gpt-5.4",
    authenticated: false,
    modelContextWindow: 128000,
    maxOutputTokens: 4096,
    mcpConnectedCount: 0,
    mcpEnabledCount: 0,
    usageWindows: [],
    providerStatuses: [],
  }),
  onOAuthPrompt: () => () => {},
  onOAuthPromptDismissed: () => () => {},
  onProgress: () => () => {},
  sendOAuthPromptResponse: () => {},
  store: {
    getSettings: async () => ({}),
    saveSettings: async () => {},
    listAutomationPackages: async () => [],
  },
  automation: {
    inspectPackage: async () => null,
    validatePackage: async () => null,
    activatePackage: async () => null,
    deactivatePackage: async () => null,
  },
  connectivity: {
    status: async () => ({ online: true }),
  },
  proactive: {
    suggestions: async () => [],
  },
  cron: {
    list: async () => [],
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({ ok: true }),
    toggle: async () => ({}),
  },
  logout: async () => ({ ok: true }),
  minimizeWindow: () => {},
  toggleMaximizeWindow: () => {},
  closeWindow: () => {},
};
