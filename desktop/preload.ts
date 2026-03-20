import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { contextBridge, ipcRenderer } = electron;

type StreamChatArgs = {
  sessionId?: string;
  title?: string;
  agentId?: string;
  projectContextId?: string;
  model?: string;
  modelRef?: string;
  systemPrompt: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "tool";
    content: string;
    timestamp: number;
    model?: string;
    thinkingContent?: string;
      toolCallId?: string;
      toolName?: string;
    }>;
  mcpServerIds?: string[];
  attachments?: Array<{
    artifactId: string;
    sessionId: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    extractedTextAvailable: boolean;
  }>;
};

function onIpc(channel: string, cb: (...args: any[]) => void): () => void {
  const handler = (_event: any, ...args: any[]) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("codexAgent", {
  // Auth
  login: () => ipcRenderer.invoke("codex:login"),
  checkAuth: () => ipcRenderer.invoke("codex:checkAuth"),
  logout: () => ipcRenderer.invoke("codex:logout"),
  auth: {
    list: () => ipcRenderer.invoke("auth:list"),
    login: (provider?: string) => ipcRenderer.invoke("auth:login", provider),
    save: (args: { provider: string; apiKey?: string; owner?: string; baseUrl?: string }) =>
      ipcRenderer.invoke("auth:save", args),
    delete: (provider: string) => ipcRenderer.invoke("auth:delete", provider),
  },
  getRuntimeStatus: () => ipcRenderer.invoke("codex:runtimeStatus"),
  sendOAuthPromptResponse: (value: string) => ipcRenderer.send("oauthPromptResponse", value),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  closeWindow: () => ipcRenderer.send("window:close"),

  // Legacy single-turn chat
  chat: (args: { model?: string; modelRef?: string; message: string }) => ipcRenderer.invoke("codex:chat", args),

  // Streaming chat
  startChat: (args: StreamChatArgs) => ipcRenderer.invoke("codex:chat:stream", args),
  abortChat: () => ipcRenderer.send("codex:chat:abort"),
  onChatDelta: (cb: (delta: string) => void) => onIpc("codex:chat:delta", cb),
  onChatThinking: (cb: (delta: string) => void) => onIpc("codex:chat:thinking", cb),
  onChatToolCall: (cb: (data: any) => void) => onIpc("codex:chat:toolcall", cb),
  onChatToolResult: (cb: (data: any) => void) => onIpc("codex:chat:toolresult", cb),
  onChatDone: (cb: (result: { text: string; stopReason: string }) => void) =>
    onIpc("codex:chat:done", cb),
  onChatError: (cb: (message: string) => void) => onIpc("codex:chat:error", cb),
  onRunEvent: (cb: (event: any) => void) => onIpc("runs:event", cb),

  // Workflow execution
  runWorkflow: (workflowId: string) => ipcRenderer.invoke("workflow:run", workflowId),
  abortWorkflow: () => ipcRenderer.send("workflow:abort"),
  onWorkflowProgress: (cb: (payload: any) => void) => onIpc("workflow:progress", cb),
  onWorkflowDone: (cb: (payload: any) => void) => onIpc("workflow:done", cb),
  onWorkflowError: (cb: (payload: any) => void) => onIpc("workflow:error", cb),

  // OAuth events
  onProgress: (cb: (msg: string) => void) => onIpc("codexProgress", cb),
  onOAuthPrompt: (cb: (payload: { message: string; placeholder?: string }) => void) =>
    onIpc("oauthPromptRequest", cb),

  // Store: Conversations
  store: {
    listConversations: () => ipcRenderer.invoke("store:conversations:list"),
    getConversation: (id: string) => ipcRenderer.invoke("store:conversations:get", id),
    saveConversation: (conv: any) => ipcRenderer.invoke("store:conversations:save", conv),
    deleteConversation: (id: string) => ipcRenderer.invoke("store:conversations:delete", id),

    // Agents
    listAgents: () => ipcRenderer.invoke("store:agents:list"),
    getAgent: (id: string) => ipcRenderer.invoke("store:agents:get", id),
    saveAgent: (agent: any) => ipcRenderer.invoke("store:agents:save", agent),
    deleteAgent: (id: string) => ipcRenderer.invoke("store:agents:delete", id),

    // Skills
    listSkills: () => ipcRenderer.invoke("store:skills:list"),
    getSkill: (id: string) => ipcRenderer.invoke("store:skills:get", id),
    saveSkill: (skill: any) => ipcRenderer.invoke("store:skills:save", skill),
    deleteSkill: (id: string) => ipcRenderer.invoke("store:skills:delete", id),
    importSkills: () => ipcRenderer.invoke("store:skills:import"),
    exportSkills: (skillIds?: string[]) => ipcRenderer.invoke("store:skills:export", skillIds),

    // Workflows
    listWorkflows: () => ipcRenderer.invoke("store:workflows:list"),
    getWorkflow: (id: string) => ipcRenderer.invoke("store:workflows:get", id),
    saveWorkflow: (workflow: any) => ipcRenderer.invoke("store:workflows:save", workflow),
    deleteWorkflow: (id: string) => ipcRenderer.invoke("store:workflows:delete", id),

    // Project contexts
    listContexts: () => ipcRenderer.invoke("store:contexts:list"),
    getContext: (id: string) => ipcRenderer.invoke("store:contexts:get", id),
    saveContext: (projectContext: any) => ipcRenderer.invoke("store:contexts:save", projectContext),
    deleteContext: (id: string) => ipcRenderer.invoke("store:contexts:delete", id),

    // MCP Servers
    listMcpServers: () => ipcRenderer.invoke("store:mcp:list"),
    getMcpServer: (id: string) => ipcRenderer.invoke("store:mcp:get", id),
    saveMcpServer: (server: any) => ipcRenderer.invoke("store:mcp:save", server),
    deleteMcpServer: (id: string) => ipcRenderer.invoke("store:mcp:delete", id),

    // Settings
    getSettings: () => ipcRenderer.invoke("store:settings:get"),
    saveSettings: (settings: any) => ipcRenderer.invoke("store:settings:save", settings),
  },

  agents: {
    suggest: (args: { prompt: string; currentAgentId?: string }) => ipcRenderer.invoke("agents:suggest", args),
  },

  // MCP runtime
  mcp: {
    connect: (config: any) => ipcRenderer.invoke("mcp:connect", config),
    disconnect: (id: string) => ipcRenderer.invoke("mcp:disconnect", id),
    status: (id: string) => ipcRenderer.invoke("mcp:status", id),
    statuses: () => ipcRenderer.invoke("mcp:statuses"),
    catalog: () => ipcRenderer.invoke("mcp:catalog"),
    tools: (id: string) => ipcRenderer.invoke("mcp:tools", id),
    allTools: () => ipcRenderer.invoke("mcp:allTools"),
    callTool: (serverId: string, toolName: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke("mcp:callTool", { serverId, toolName, args }),
  },

  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    create: (args: { title?: string; model?: string; modelRef?: string; systemPrompt: string; agentId?: string; projectContextId?: string; sessionId?: string }) =>
      ipcRenderer.invoke("sessions:create", args),
    get: (sessionId: string) => ipcRenderer.invoke("sessions:get", sessionId),
    patch: (sessionId: string, patch: any) => ipcRenderer.invoke("sessions:patch", sessionId, patch),
    delete: (sessionId: string) => ipcRenderer.invoke("sessions:delete", sessionId),
  },

  tasks: {
    list: (args?: { status?: string; projectContextId?: string; includeDone?: boolean }) => ipcRenderer.invoke("tasks:list", args),
    get: (taskId: string) => ipcRenderer.invoke("tasks:get", taskId),
    create: (task: any) => ipcRenderer.invoke("tasks:create", task),
    update: (taskId: string, patch: any) => ipcRenderer.invoke("tasks:update", taskId, patch),
    complete: (taskId: string) => ipcRenderer.invoke("tasks:complete", taskId),
    delete: (taskId: string) => ipcRenderer.invoke("tasks:delete", taskId),
  },

  reminders: {
    list: (args?: { status?: string; includeCanceled?: boolean; includeAcknowledged?: boolean; limit?: number }) =>
      ipcRenderer.invoke("reminders:list", args),
    get: (reminderId: string) => ipcRenderer.invoke("reminders:get", reminderId),
    create: (reminder: any) => ipcRenderer.invoke("reminders:create", reminder),
    update: (reminderId: string, patch: any) => ipcRenderer.invoke("reminders:update", reminderId, patch),
    acknowledge: (reminderId: string) => ipcRenderer.invoke("reminders:acknowledge", reminderId),
    cancel: (reminderId: string) => ipcRenderer.invoke("reminders:cancel", reminderId),
    delete: (reminderId: string) => ipcRenderer.invoke("reminders:delete", reminderId),
  },

  notifications: {
    onEvent: (cb: (event: any) => void) => onIpc("notifications:event", cb),
  },

  runs: {
    start: (args: any) => ipcRenderer.invoke("runs:start", args),
    approve: (args: any) => ipcRenderer.invoke("runs:approve", args),
    abort: (runId: string) => ipcRenderer.invoke("runs:abort", runId),
  },

  workspaces: {
    setRoot: (args: { sessionId: string; rootPath: string }) => ipcRenderer.invoke("workspaces:setRoot", args),
    get: (sessionId: string) => ipcRenderer.invoke("workspaces:get", sessionId),
    reindex: (sessionId: string) => ipcRenderer.invoke("workspaces:reindex", sessionId),
    status: (sessionId: string) => ipcRenderer.invoke("workspaces:status", sessionId),
  },

  cowork: {
    workspace: () => ipcRenderer.invoke("cowork:workspace"),
    file: (relativePath: string) => ipcRenderer.invoke("cowork:file", relativePath),
  },

  documents: {
    listTemplates: () => ipcRenderer.invoke("documents:listTemplates"),
    render: (args: { templateId: string; values?: Record<string, string> }) =>
      ipcRenderer.invoke("documents:render", args),
    export: (args: {
      templateId: string;
      values?: Record<string, string>;
      format: "markdown" | "html" | "pdf";
    }) => ipcRenderer.invoke("documents:export", args),
  },

  browser: {
    status: (sessionId: string) => ipcRenderer.invoke("browser:status", sessionId),
    invoke: (args: Record<string, unknown>) => ipcRenderer.invoke("browser:invoke", args),
    reset: (sessionId: string) => ipcRenderer.invoke("browser:reset", sessionId),
  },

  memory: {
    search: (args: { sessionId?: string; query: string; limit?: number }) => ipcRenderer.invoke("memory:search", args),
    status: (sessionId: string) => ipcRenderer.invoke("memory:status", sessionId),
  },

  jobs: {
    list: (args?: { scopeType?: string; scopeId?: string }) => ipcRenderer.invoke("jobs:list", args),
    get: (jobId: string) => ipcRenderer.invoke("jobs:get", jobId),
  },

  artifacts: {
    list: (args?: { sessionId?: string; runId?: string }) => ipcRenderer.invoke("artifacts:list", args),
    get: (artifactId: string) => ipcRenderer.invoke("artifacts:get", artifactId),
  },

  attachments: {
    upload: (args: { sessionId: string; fileName: string; mimeType: string; bytesBase64: string }) =>
      ipcRenderer.invoke("attachments:upload", args),
    get: (artifactId: string) => ipcRenderer.invoke("attachments:get", artifactId),
  },

  tools: {
    history: (args?: { sessionId?: string; runId?: string }) => ipcRenderer.invoke("tools:history", args),
    approvals: (sessionId?: string) => ipcRenderer.invoke("tools:approvals", sessionId),
    list: (args?: { mcpServerIds?: string[]; sessionId?: string }) => ipcRenderer.invoke("tools:list", args),
    invoke: (args: { toolName: string; args: Record<string, unknown>; sessionId?: string; mcpServerIds?: string[] }) =>
      ipcRenderer.invoke("tools:invoke", args),
  },

  capabilities: {
    list: (args?: { mcpServerIds?: string[]; sessionId?: string }) => ipcRenderer.invoke("capabilities:list", args),
  },
});
