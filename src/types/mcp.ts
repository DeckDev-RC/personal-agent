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
