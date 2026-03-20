export type McpServerConfig = {
  id: string;
  catalogId?: string;
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

export type McpCatalogField =
  | {
      id: string;
      label: string;
      kind: "env";
      key: string;
      placeholder?: string;
      helperText?: string;
      secret?: boolean;
      required?: boolean;
      defaultValue?: string;
    }
  | {
      id: string;
      label: string;
      kind: "arg";
      index: number;
      placeholder?: string;
      helperText?: string;
      secret?: boolean;
      required?: boolean;
      defaultValue?: string;
    }
  | {
      id: string;
      label: string;
      kind: "url" | "cwd";
      placeholder?: string;
      helperText?: string;
      secret?: boolean;
      required?: boolean;
      defaultValue?: string;
    };

export type McpCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  maintainer?: string;
  docsUrl?: string;
  packageName?: string;
  setupHint?: string;
  recommendedTools?: string[];
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  fields?: McpCatalogField[];
};
