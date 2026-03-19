import { create } from "zustand";

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  model?: string;
  thinkingContent?: string;
  toolCallId?: string;
  toolName?: string;
  phase?: string;
  kind?: string;
};

export type Conversation = {
  id: string;
  title: string;
  agentId?: string;
  model: string;
  systemPrompt: string;
  workspaceId?: string;
  workspaceRoot?: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  lastRunId?: string;
  lastRunStatus?: string;
  lastRunPhase?: string;
  uiMode?: "simple" | "agentic";
};

export type ConversationSummary = {
  id: string;
  title: string;
  agentId?: string;
  model: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  workspaceRoot?: string;
  lastRunId?: string;
  lastRunStatus?: string;
  lastRunPhase?: string;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const api = () => (window as any).codexAgent;

type ChatState = {
  conversations: ConversationSummary[];
  activeConversation: Conversation | null;
  streaming: boolean;
  streamingText: string;
  thinkingText: string;
  activeRunId?: string;
  activePhase?: string;
  uiMode: "simple" | "agentic";
  showInternalPhases: boolean;
  collapsedInspectorSections: string[];

  loadConversations: () => Promise<void>;
  createConversation: (model: string, systemPrompt: string, agentId?: string) => Conversation;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  patchActiveConversation: (patch: Partial<Conversation>) => void;

  addUserMessage: (content: string) => void;
  addToolMessage: (params: {
    toolCallId: string;
    toolName: string;
    content: string;
    phase?: string;
  }) => void;
  startStreaming: (runId?: string, mode?: "simple" | "agentic") => void;
  appendDelta: (delta: string) => void;
  appendThinking: (delta: string) => void;
  setActivePhase: (phase?: string) => void;
  setUiMode: (mode: "simple" | "agentic") => void;
  setShowInternalPhases: (value: boolean) => void;
  toggleInspectorSection: (section: string) => void;
  resetInspectorSections: (next?: string[]) => void;
  attachRemoteSession: (sessionId: string) => void;
  finishStreaming: () => void;
  errorStreaming: (error: string) => void;
  abortStreaming: () => void;
};

const DEFAULT_COLLAPSED_SECTIONS = ["approvals", "tools", "artifacts", "timing"];

function toSummary(item: any): ConversationSummary {
  return {
    id: item.sessionId ?? item.id,
    title: item.title,
    agentId: item.agentId,
    model: item.model,
    messageCount: item.messageCount ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    workspaceRoot: item.workspaceRoot,
    lastRunId: item.lastRunId,
    lastRunStatus: item.lastRunStatus,
    lastRunPhase: item.lastRunPhase,
  };
}

function toConversation(payload: any): Conversation {
  const session = payload.session ?? payload;
  const messages = payload.messages ?? session.messages ?? [];
  const hasAgenticSignals = messages.some(
    (message: any) =>
      message.role === "system" ||
      message.phase === "plan" ||
      message.phase === "review" ||
      message.phase === "repair" ||
      message.kind === "assistant-toolcall",
  );
  return {
    id: session.sessionId ?? session.id,
    title: session.title,
    agentId: session.agentId,
    model: session.model,
    systemPrompt: session.systemPrompt,
    workspaceId: session.workspaceId,
    workspaceRoot: session.workspaceRoot,
    messages: messages.map((message: any) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      model: message.model,
      thinkingContent: message.thinkingContent,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      phase: message.phase,
      kind: message.kind,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastRunId: session.lastRunId,
    lastRunStatus: session.lastRunStatus,
    lastRunPhase: session.lastRunPhase,
    uiMode: hasAgenticSignals ? "agentic" : "simple",
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  streaming: false,
  streamingText: "",
  thinkingText: "",
  activeRunId: undefined,
  activePhase: undefined,
  uiMode: "simple",
  showInternalPhases: false,
  collapsedInspectorSections: [...DEFAULT_COLLAPSED_SECTIONS],

  loadConversations: async () => {
    const list = await api().sessions.list();
    set({ conversations: (list ?? []).map(toSummary) });
  },

  createConversation: (model, systemPrompt, agentId) => {
    const conversation: Conversation = {
      id: `draft-${generateId()}`,
      title: "New session",
      agentId,
      model,
      systemPrompt,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      uiMode: "simple",
    };
    set({
      activeConversation: conversation,
      activeRunId: undefined,
      activePhase: undefined,
      uiMode: "simple",
      showInternalPhases: false,
      collapsedInspectorSections: [...DEFAULT_COLLAPSED_SECTIONS],
    });
    return conversation;
  },

  selectConversation: async (id) => {
    const payload = await api().sessions.get(id);
    if (payload) {
      const conversation = toConversation(payload);
      set({
        activeConversation: conversation,
        activeRunId: undefined,
        activePhase: undefined,
        uiMode: conversation.uiMode ?? "simple",
        showInternalPhases: false,
        collapsedInspectorSections: [...DEFAULT_COLLAPSED_SECTIONS],
      });
    }
  },

  deleteConversation: async (id) => {
    if (!id.startsWith("draft-")) {
      await api().sessions.delete(id);
    }
    const active = get().activeConversation;
    if (active?.id === id) {
      set({ activeConversation: null });
    }
    await get().loadConversations();
  },

  renameConversation: async (id, title) => {
    if (id.startsWith("draft-")) {
      const active = get().activeConversation;
      if (active?.id === id) {
        set({ activeConversation: { ...active, title } });
      }
      return;
    }
    await api().sessions.patch(id, { title });
    if (get().activeConversation?.id === id) {
      await get().selectConversation(id);
    }
    await get().loadConversations();
  },

  patchActiveConversation: (patch) => {
    const current = get().activeConversation;
    if (!current) return;
    set({ activeConversation: { ...current, ...patch } });
  },

  addUserMessage: (content) => {
    const current = get().activeConversation;
    if (!current) return;
    const next: Conversation = {
      ...current,
      title: current.messages.length === 0 ? content.slice(0, 60) : current.title,
      updatedAt: Date.now(),
      messages: [
        ...current.messages,
        {
          id: generateId(),
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ],
    };
    set({ activeConversation: next });
  },

  addToolMessage: ({ toolCallId, toolName, content, phase }) => {
    const current = get().activeConversation;
    if (!current) return;
    set({
      activeConversation: {
        ...current,
        updatedAt: Date.now(),
        messages: [
          ...current.messages,
          {
            id: generateId(),
            role: "tool",
            content,
            timestamp: Date.now(),
            toolCallId,
            toolName,
            phase,
          },
        ],
      },
    });
  },

  startStreaming: (runId, mode) => {
    set((state) => ({
      streaming: true,
      streamingText: "",
      thinkingText: "",
      activeRunId: runId,
      uiMode: mode ?? state.uiMode,
      activePhase: (mode ?? state.uiMode) === "agentic" ? "plan" : undefined,
    }));
  },

  appendDelta: (delta) => set((state) => ({ streamingText: state.streamingText + delta })),
  appendThinking: (delta) => set((state) => ({ thinkingText: state.thinkingText + delta })),
  setActivePhase: (phase) => set({ activePhase: phase }),
  setUiMode: (mode) => set({ uiMode: mode }),
  setShowInternalPhases: (value) => set({ showInternalPhases: value }),
  toggleInspectorSection: (section) =>
    set((state) => ({
      collapsedInspectorSections: state.collapsedInspectorSections.includes(section)
        ? state.collapsedInspectorSections.filter((item) => item !== section)
        : [...state.collapsedInspectorSections, section],
    })),
  resetInspectorSections: (next) =>
    set({ collapsedInspectorSections: next ? [...next] : [...DEFAULT_COLLAPSED_SECTIONS] }),

  attachRemoteSession: (sessionId) => {
    const current = get().activeConversation;
    if (!current) return;
    set({ activeConversation: { ...current, id: sessionId } });
  },

  finishStreaming: () => {
    set((state) => ({
      streaming: false,
      streamingText: "",
      thinkingText: "",
      activePhase: state.uiMode === "agentic" ? "complete" : undefined,
      activeRunId: undefined,
    }));
  },

  errorStreaming: (error) => {
    const current = get().activeConversation;
    if (!current) {
      set({ streaming: false, streamingText: "", thinkingText: "", activeRunId: undefined });
      return;
    }
    set({
      activeConversation: {
        ...current,
        updatedAt: Date.now(),
        messages: [
          ...current.messages,
          {
            id: generateId(),
            role: "assistant",
            content: `Erro: ${error}`,
            timestamp: Date.now(),
          },
        ],
      },
      streaming: false,
      streamingText: "",
      thinkingText: "",
      activeRunId: undefined,
      activePhase: undefined,
    });
  },

  abortStreaming: () => {
    const runId = get().activeRunId;
    if (runId) {
      void api().runs.abort(runId);
    } else {
      api().abortChat();
    }
    set({ streaming: false, streamingText: "", thinkingText: "", activeRunId: undefined, activePhase: undefined });
  },
}));
