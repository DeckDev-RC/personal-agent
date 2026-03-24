import { create } from "zustand";

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
  memoryPolicy?: {
    enabled: boolean;
    maxResults: number;
    includeWorkspace: boolean;
    includeSessionHistory: boolean;
    autoIndexWorkspace: boolean;
  };
  toolPolicy?: {
    approvalMode: "safe" | "trusted";
    allowNetworkedTools: boolean;
    allowLongRunningTools: boolean;
    trustedToolNames?: string[];
    trustedMcpServerIds?: string[];
  };
  automationPolicy?: {
    allowScheduledWorkflows: boolean;
    maxConcurrentJobs: number;
    defaultJobTimeoutMs: number;
  };
  createdAt: number;
  updatedAt: number;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const DEFAULT_AGENT: AgentConfig = {
  id: "__default__",
  name: "Assistente Pessoal",
  description: "Assistente pessoal versátil para tarefas do dia a dia.",
  systemPrompt: `Você é um assistente pessoal altamente capaz e versátil. Seu objetivo é ajudar o usuário com qualquer tarefa de forma eficiente, clara e proativa.

Diretrizes:
- Responda sempre no idioma em que o usuário escrever
- Seja direto e conciso, mas completo quando necessário
- Para código, use markdown com syntax highlighting
- Para tarefas complexas, divida em passos claros
- Sugira melhorias e alternativas quando relevante
- Se não souber algo, diga honestamente
- Use formatação markdown para melhor legibilidade`,
  model: "",
  skillIds: [],
  mcpServerIds: [],
  memoryPolicy: {
    enabled: true,
    maxResults: 6,
    includeWorkspace: true,
    includeSessionHistory: true,
    autoIndexWorkspace: true,
  },
  toolPolicy: {
    approvalMode: "safe",
    allowNetworkedTools: true,
    allowLongRunningTools: true,
    trustedToolNames: [],
    trustedMcpServerIds: [],
  },
  automationPolicy: {
    allowScheduledWorkflows: true,
    maxConcurrentJobs: 2,
    defaultJobTimeoutMs: 30000,
  },
  createdAt: 0,
  updatedAt: 0,
};

type AgentState = {
  agents: AgentConfig[];
  loaded: boolean;

  loadAgents: () => Promise<void>;
  createAgent: (partial: Partial<AgentConfig>) => Promise<AgentConfig>;
  updateAgent: (agent: AgentConfig) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  getAgent: (id: string) => AgentConfig | undefined;
  getAllWithDefault: () => AgentConfig[];
};

const api = () => (window as any).codexAgent;

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loaded: false,

  loadAgents: async () => {
    const list = await api().store.listAgents();
    set({ agents: list, loaded: true });
  },

  createAgent: async (partial) => {
    const now = Date.now();
    const agent: AgentConfig = {
      id: generateId(),
      name: partial.name ?? "Novo Agente",
      description: partial.description ?? "",
      systemPrompt: partial.systemPrompt ?? DEFAULT_AGENT.systemPrompt,
      model: partial.model?.trim() ?? "",
      skillIds: partial.skillIds ?? [],
      mcpServerIds: partial.mcpServerIds ?? [],
      projectContextId: partial.projectContextId,
      defaultWorkspaceId: partial.defaultWorkspaceId,
      memoryPolicy: partial.memoryPolicy ?? DEFAULT_AGENT.memoryPolicy,
      toolPolicy: partial.toolPolicy ?? DEFAULT_AGENT.toolPolicy,
      automationPolicy: partial.automationPolicy ?? DEFAULT_AGENT.automationPolicy,
      createdAt: now,
      updatedAt: now,
    };
    await api().store.saveAgent(agent);
    await get().loadAgents();
    return agent;
  },

  updateAgent: async (agent) => {
    const updated = { ...agent, updatedAt: Date.now() };
    await api().store.saveAgent(updated);
    await get().loadAgents();
  },

  deleteAgent: async (id) => {
    await api().store.deleteAgent(id);
    await get().loadAgents();
  },

  getAgent: (id) => {
    if (id === "__default__") return DEFAULT_AGENT;
    return get().agents.find((a) => a.id === id);
  },

  getAllWithDefault: () => {
    return [DEFAULT_AGENT, ...get().agents];
  },
}));
