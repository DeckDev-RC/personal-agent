import { create } from "zustand";

export type McpServerConfig = {
  id: string;
  name: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  enabled: boolean;
  createdAt: number;
};

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
};

export type McpServerStatus = {
  id: string;
  connected: boolean;
  error?: string;
  toolCount: number;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type McpState = {
  servers: McpServerConfig[];
  statuses: McpServerStatus[];
  loaded: boolean;

  loadServers: () => Promise<void>;
  createServer: (partial: Partial<McpServerConfig>) => Promise<McpServerConfig>;
  updateServer: (server: McpServerConfig) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  connectServer: (config: McpServerConfig) => Promise<{ ok: boolean; error?: string }>;
  disconnectServer: (id: string) => Promise<void>;
  refreshStatuses: () => Promise<void>;
  getTools: (id: string) => Promise<McpTool[]>;
  getAllTools: () => Promise<McpTool[]>;
};

const api = () => (window as any).codexAgent;

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  statuses: [],
  loaded: false,

  loadServers: async () => {
    const list = await api().store.listMcpServers();
    set({ servers: list, loaded: true });
    // Also refresh statuses
    await get().refreshStatuses();
  },

  createServer: async (partial) => {
    const server: McpServerConfig = {
      id: generateId(),
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
}));
