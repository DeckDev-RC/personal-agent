export type AgentMemoryPolicy = {
  enabled: boolean;
  maxResults: number;
  includeWorkspace: boolean;
  includeSessionHistory: boolean;
  autoIndexWorkspace: boolean;
};

export type AgentToolPolicy = {
  approvalMode: "safe" | "trusted";
  allowNetworkedTools: boolean;
  allowLongRunningTools: boolean;
  trustedToolNames?: string[];
  trustedMcpServerIds?: string[];
};

export type AgentAutomationPolicy = {
  allowScheduledWorkflows: boolean;
  maxConcurrentJobs: number;
  defaultJobTimeoutMs: number;
};

export type AgentConfig = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  skillIds: string[];
  mcpServerIds: string[];
  projectContextId?: string;
  defaultWorkspaceId?: string;
  memoryPolicy?: AgentMemoryPolicy;
  toolPolicy?: AgentToolPolicy;
  automationPolicy?: AgentAutomationPolicy;
  createdAt: number;
  updatedAt: number;
};

export type AgentSuggestionCategory =
  | "pm"
  | "communication"
  | "research"
  | "technical"
  | "generic";

export type AgentSuggestion = {
  agentId: string;
  agentName: string;
  score: number;
  confidence: "low" | "medium" | "high";
  category: AgentSuggestionCategory;
  matchedKeywords: string[];
};
