import { create } from "zustand";
import type { McpCatalogEntry, McpCatalogField, McpServerConfig, McpServerStatus, McpTool } from "../../../src/types/mcp.js";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

function applyCatalogFieldValue(
  server: McpServerConfig,
  field: McpCatalogField,
  value: string,
): void {
  if (field.kind === "env") {
    server.env = {
      ...(server.env ?? {}),
      [field.key]: value,
    };
    return;
  }

  if (field.kind === "arg") {
    const args = [...(server.args ?? [])];
    while (args.length <= field.index) {
      args.push("");
    }
    args[field.index] = value;
    server.args = args;
    return;
  }

  if (field.kind === "url") {
    server.url = value;
    return;
  }

  server.cwd = value;
}

function readCatalogFieldValue(server: McpServerConfig | undefined, field: McpCatalogField): string {
  if (!server) {
    return field.defaultValue ?? "";
  }

  if (field.kind === "env") {
    return server.env?.[field.key] ?? field.defaultValue ?? "";
  }

  if (field.kind === "arg") {
    return server.args?.[field.index] ?? field.defaultValue ?? "";
  }

  if (field.kind === "url") {
    return server.url ?? field.defaultValue ?? "";
  }

  return server.cwd ?? field.defaultValue ?? "";
}

function buildCatalogServer(
  entry: McpCatalogEntry,
  fieldValues: Record<string, string>,
  existing?: McpServerConfig,
): McpServerConfig {
  const now = Date.now();
  const server: McpServerConfig = {
    id: existing?.id ?? generateId(),
    catalogId: entry.id,
    name: existing?.name ?? entry.name,
    type: entry.type,
    command: entry.command,
    args: [...(entry.args ?? [])],
    env: { ...(entry.env ?? {}) },
    cwd: entry.cwd,
    url: entry.url,
    enabled: true,
    createdAt: existing?.createdAt ?? now,
  };

  for (const field of entry.fields ?? []) {
    const value = fieldValues[field.id] ?? readCatalogFieldValue(existing, field);
    applyCatalogFieldValue(server, field, value.trim());
  }

  return server;
}

type CatalogInstallResult = {
  ok: boolean;
  server?: McpServerConfig;
  error?: string;
};

type McpState = {
  servers: McpServerConfig[];
  statuses: McpServerStatus[];
  catalog: McpCatalogEntry[];
  loaded: boolean;
  catalogLoaded: boolean;

  loadServers: () => Promise<void>;
  loadCatalog: () => Promise<void>;
  createServer: (partial: Partial<McpServerConfig>) => Promise<McpServerConfig>;
  updateServer: (server: McpServerConfig) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  connectServer: (config: McpServerConfig) => Promise<{ ok: boolean; error?: string }>;
  disconnectServer: (id: string) => Promise<void>;
  refreshStatuses: () => Promise<void>;
  getTools: (id: string) => Promise<McpTool[]>;
  getAllTools: () => Promise<McpTool[]>;
  installCatalogServer: (catalogId: string, fieldValues?: Record<string, string>) => Promise<CatalogInstallResult>;
  findServerForCatalog: (catalogId: string) => McpServerConfig | undefined;
};

const api = () => (window as any).codexAgent;

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  statuses: [],
  catalog: [],
  loaded: false,
  catalogLoaded: false,

  loadServers: async () => {
    const list = await api().store.listMcpServers();
    set({ servers: list, loaded: true });
    await get().refreshStatuses();
    if (!get().catalogLoaded) {
      await get().loadCatalog();
    }
  },

  loadCatalog: async () => {
    const catalog = await api().mcp.catalog();
    set({ catalog, catalogLoaded: true });
  },

  createServer: async (partial) => {
    const server: McpServerConfig = {
      id: generateId(),
      catalogId: partial.catalogId,
      name: partial.name ?? "Novo Servidor",
      type: partial.type ?? "stdio",
      command: partial.command,
      args: partial.args ?? [],
      env: partial.env ?? {},
      cwd: partial.cwd,
      url: partial.url,
      enabled: partial.enabled ?? true,
      createdAt: Date.now(),
    };
    await api().store.saveMcpServer(server);
    if (server.enabled) {
      await api().mcp.connect(server);
    }
    await get().loadServers();
    return server;
  },

  updateServer: async (server) => {
    await api().store.saveMcpServer(server);
    if (!server.enabled) {
      await api().mcp.disconnect(server.id);
    }
    await get().loadServers();
  },

  deleteServer: async (id) => {
    await api().mcp.disconnect(id);
    await api().store.deleteMcpServer(id);
    await get().loadServers();
  },

  connectServer: async (config) => {
    const result = await api().mcp.connect(config);
    await get().refreshStatuses();
    return result;
  },

  disconnectServer: async (id) => {
    await api().mcp.disconnect(id);
    await get().refreshStatuses();
  },

  refreshStatuses: async () => {
    const statuses = await api().mcp.statuses();
    set({ statuses });
  },

  getTools: async (id) => {
    return api().mcp.tools(id);
  },

  getAllTools: async () => {
    return api().mcp.allTools();
  },

  installCatalogServer: async (catalogId, fieldValues = {}) => {
    const entry = get().catalog.find((item) => item.id === catalogId);
    if (!entry) {
      return { ok: false, error: "Catalog template not found." };
    }
    const existing = get().findServerForCatalog(catalogId);

    for (const field of entry.fields ?? []) {
      const value = fieldValues[field.id] ?? readCatalogFieldValue(existing, field);
      if (field.required && isBlank(value)) {
        return { ok: false, error: `Missing required field: ${field.label}` };
      }
    }

    const server = buildCatalogServer(entry, fieldValues, existing);
    await api().store.saveMcpServer(server);

    const result = server.enabled ? await api().mcp.connect(server) : { ok: true };
    await get().loadServers();

    return {
      ok: result.ok,
      error: result.error,
      server,
    };
  },

  findServerForCatalog: (catalogId) => {
    return get().servers.find((server) => server.catalogId === catalogId);
  },
}));
