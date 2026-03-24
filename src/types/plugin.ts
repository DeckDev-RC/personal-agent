export type PluginStatus = "installed" | "active" | "disabled" | "error";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  license?: string;
  minAppVersion?: string;
  mcpServers?: Array<{
    id: string;
    name: string;
    transport: "stdio" | "sse" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  }>;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    type: "prompt" | "workflow";
    prompt?: string;
    tags?: string[];
  }>;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  uiPanels?: Array<{
    id: string;
    name: string;
    route: string;
    icon?: string;
  }>;
  tags?: string[];
};

export type PluginRecord = {
  id: string;
  manifest: PluginManifest;
  status: PluginStatus;
  installedAt: number;
  updatedAt: number;
  error?: string;
};

export type PluginRegistryEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  downloadUrl: string;
  tags: string[];
  downloads: number;
  rating: number;
};
