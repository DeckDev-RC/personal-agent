import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import {
  deleteStoredOpenAICodexCreds,
  loginAndStoreOpenAICodexOAuth,
  type OpenAICodexOAuthUIHandlers,
} from "../src/auth/openaiCodexOAuth.js";
import type { Skill } from "../src/types/skill.js";
import type { DaemonEnvelope } from "../src/types/daemon.js";
import { startDaemonProcess, type DaemonProcessHandle } from "./daemon/process.js";
import { resolveDataRoot } from "./services/dataRoot.js";
import { notifyReminderTriggered, setNotificationWindow } from "./services/notificationManager.js";
import {
  deleteProviderAuth,
  getProviderAuthStatus,
  listProviderAuthStatuses,
  saveProviderAuthInput,
} from "./services/providerAuthStore.js";
import { runSingleTurnText } from "./services/runtimeCore.js";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;

let mainWindow: Electron.BrowserWindow | null = null;

let pendingOAuthPromptResolve: ((value: string) => void) | null = null;
let pendingOAuthPromptReject: ((err: Error) => void) | null = null;

let currentChatRunId: string | null = null;
let daemon: DaemonProcessHandle | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache dir setup
const userDataCacheDir = path.join(app.getPath("userData"), "electron-cache");
try {
  fs.mkdirSync(userDataCacheDir, { recursive: true });
} catch {}
app.commandLine.appendSwitch("disk-cache-dir", userDataCacheDir);
app.commandLine.appendSwitch("disable-gpu");

// --- OAuth UI handlers ---

function promptForRedirectViaUI(prompt: { message: string; placeholder?: string }): Promise<string> {
  if (!mainWindow) throw new Error("Janela não inicializada.");
  if (pendingOAuthPromptResolve) throw new Error("Já existe uma solicitação de prompt pendente.");

  mainWindow.webContents.send("oauthPromptRequest", {
    message: prompt.message,
    placeholder: prompt.placeholder,
  });

  return new Promise((resolve, reject) => {
    pendingOAuthPromptResolve = resolve;
    pendingOAuthPromptReject = reject;
  });
}

function emitRuntimeEvent(event: any) {
  mainWindow?.webContents.send("runs:event", event);

  if (event.type === "text_delta") {
    mainWindow?.webContents.send("codex:chat:delta", event.delta);
  } else if (event.type === "thinking_delta") {
    mainWindow?.webContents.send("codex:chat:thinking", event.delta);
  } else if (event.type === "toolcall") {
    mainWindow?.webContents.send("codex:chat:toolcall", event);
  } else if (event.type === "toolresult") {
    mainWindow?.webContents.send("codex:chat:toolresult", event);
  } else if (event.type === "done") {
    if (currentChatRunId === event.runId) {
      currentChatRunId = null;
    }
    mainWindow?.webContents.send("codex:chat:done", {
      text: event.text,
      stopReason: event.success ? "completed" : "failed",
      review: event.review,
      runId: event.runId,
      sessionId: event.sessionId,
    });
  } else if (event.type === "error") {
    if (currentChatRunId === event.runId) {
      currentChatRunId = null;
    }
    mainWindow?.webContents.send("codex:chat:error", event.message);
  }
}

function handleDaemonEvent(envelope: DaemonEnvelope) {
  switch (envelope.event) {
    case "run.delta": {
      const payload = envelope.data as { runId: string; sessionId: string; phase?: string; stream: "text" | "thinking"; delta: string };
      if (payload.phase) {
        emitRuntimeEvent({
          type: "phase",
          runId: payload.runId,
          sessionId: payload.sessionId,
          phase: payload.phase,
        });
      }
      if (payload.stream === "text") {
        mainWindow?.webContents.send("codex:chat:delta", payload.delta);
      } else {
        mainWindow?.webContents.send("codex:chat:thinking", payload.delta);
      }
      break;
    }
    case "run.tool_call":
      emitRuntimeEvent({ ...(envelope.data as object), type: "toolcall" });
      break;
    case "run.tool_result":
      emitRuntimeEvent({ ...(envelope.data as object), type: "toolresult" });
      break;
    case "run.approval_required":
      emitRuntimeEvent({ ...(envelope.data as object), type: "approval_required" });
      break;
    case "run.artifact_created":
      emitRuntimeEvent({ ...(envelope.data as object), type: "artifact" });
      break;
    case "run.completed": {
      const payload = envelope.data as { runId: string; sessionId: string; text: string; review: string; success: boolean };
      if (currentChatRunId === payload.runId) {
        currentChatRunId = null;
      }
      emitRuntimeEvent({ ...payload, type: "done" });
      break;
    }
    case "run.failed": {
      const payload = envelope.data as { runId: string; sessionId: string; message: string };
      if (currentChatRunId === payload.runId) {
        currentChatRunId = null;
      }
      emitRuntimeEvent({ ...payload, type: "error" });
      break;
    }
    case "job.updated":
      emitRuntimeEvent({ type: "job_updated", ...(envelope.data as object) });
      break;
    case "reminder.triggered":
      notifyReminderTriggered((envelope.data as any).reminder);
      break;
    default:
      break;
  }
}

function daemonClient() {
  if (!daemon) {
    throw new Error("Daemon not initialized.");
  }
  return daemon.client;
}

// --- IPC Handlers: Auth ---

async function handleLogin() {
  const ui: OpenAICodexOAuthUIHandlers = {
    openUrl: (url: string) => {
      shell.openExternal(url);
    },
    promptForRedirect: promptForRedirectViaUI,
    onProgress: (msg: string) => {
      mainWindow?.webContents.send("codexProgress", msg);
    },
  };

  const result = await loginAndStoreOpenAICodexOAuth({ verbose: false, ui });
  return { ok: true, email: result.email };
}

async function handleCheckAuth() {
  const settings = await daemonClient().get<any>("/settings");
  const active = await getProviderAuthStatus(settings?.provider ?? settings?.defaultModelRef);
  return {
    ok: true,
    authenticated: active.authenticated,
    email: active.owner,
    activeProvider: active.provider,
    providers: await listProviderAuthStatuses(),
  };
}

async function handleListAuth() {
  const settings = await daemonClient().get<any>("/settings");
  const active = await getProviderAuthStatus(settings?.provider ?? settings?.defaultModelRef);
  return {
    ok: true,
    activeProvider: active.provider,
    providers: await listProviderAuthStatuses(),
  };
}

async function handleSaveAuth(args: { provider: string; apiKey?: string; owner?: string; baseUrl?: string }) {
  const status = await saveProviderAuthInput(args);
  return { ok: true, status };
}

async function handleDeleteAuth(provider: string) {
  if (provider === "openai-codex" || provider === "openai") {
    await deleteStoredOpenAICodexCreds();
    return { ok: true, status: await getProviderAuthStatus("openai-codex") };
  }

  const status = await deleteProviderAuth(provider);
  return { ok: true, status };
}

// --- IPC Handlers: Chat (legacy single-turn) ---

async function handleChat(params: { model?: string; modelRef?: string; message: string }) {
  const { message } = params;
  const settings = await daemonClient().get<any>("/settings");
  const result = await runSingleTurnText({
    modelRef: params.modelRef ?? params.model ?? settings.defaultModelRef ?? settings.defaultModel,
    systemPrompt: settings.globalSystemPrompt || "You are a helpful AI assistant.",
    input: message,
    maxOutputTokens: settings.maxOutputTokens,
  });
  return { ok: true, text: result.text, stopReason: result.stopReason };
}

// --- IPC Handlers: Streaming Chat ---

async function handleStreamChat(
  _event: Electron.IpcMainInvokeEvent,
  params: {
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
  },
) {
  if (currentChatRunId) {
    void daemonClient().post(`/runs/${currentChatRunId}/abort`);
  }

  try {
    const prompt = [...params.messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    if (!prompt?.trim()) {
      throw new Error("No user prompt available to start the run.");
    }

    const result = await daemonClient().post<any>("/runs/start", {
      sessionId: params.sessionId,
      title: params.title,
      agentId: params.agentId,
      projectContextId: params.projectContextId,
      modelRef: params.modelRef ?? params.model,
      systemPrompt: params.systemPrompt,
      mcpServerIds: params.mcpServerIds,
      prompt,
      attachments: params.attachments ?? [],
    });
    currentChatRunId = result.runId;
    return { ok: true, ...result };
  } catch (err: any) {
    mainWindow?.webContents.send("codex:chat:error", err?.message ?? String(err));
    return { ok: false, error: err?.message ?? String(err) };
  }
}

function handleAbortChat() {
  if (currentChatRunId) {
    void daemonClient().post(`/runs/${currentChatRunId}/abort`);
    currentChatRunId = null;
  }
}

async function handleLogout() {
  await deleteStoredOpenAICodexCreds();
  return { ok: true, status: await getProviderAuthStatus("openai-codex") };
}

async function handleRunWorkflow(
  _event: Electron.IpcMainInvokeEvent,
  workflowId: string,
) {
  try {
    const settings = await daemonClient().get<any>("/settings");
    const result = await daemonClient().post<any>("/workflow/run", {
      workflowId,
      modelRef: settings.defaultModelRef ?? settings.defaultModel,
      systemPrompt: settings.globalSystemPrompt || "You are a helpful AI assistant.",
    });
    mainWindow?.webContents.send("workflow:done", { workflowId, ...result });
    return { ok: true, result };
  } catch (err: any) {
    mainWindow?.webContents.send("workflow:error", {
      workflowId,
      message: err?.message ?? String(err),
    });
    return {
      ok: false,
      error: err?.message ?? String(err),
    };
  }
}

function handleAbortWorkflow() {
  if (currentChatRunId) {
    void daemonClient().post(`/runs/${currentChatRunId}/abort`);
  }
}

function handleWindowMinimize() {
  mainWindow?.minimize();
}

function handleWindowClose() {
  mainWindow?.close();
}

async function handleImportSkills() {
  if (!mainWindow) {
    return { ok: false, error: "Janela principal nao disponivel." };
  }

  const result = (await dialog.showOpenDialog(mainWindow, {
    title: "Importar skills",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  })) as any;

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  const raw = fs.readFileSync(result.filePaths[0], "utf8");
  const parsed = JSON.parse(raw) as Skill[] | { skills?: Skill[] };
  const skills = Array.isArray(parsed) ? parsed : parsed.skills ?? [];
  const now = Date.now();

  for (const item of skills) {
    const skill: Skill = {
      ...item,
      id: item.id || `${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: item.name ?? "Imported Skill",
      description: item.description ?? "",
      content: item.content ?? "",
      type: item.type === "tool" ? "tool" : "prompt",
      tags: Array.isArray(item.tags) ? item.tags : [],
      createdAt: item.createdAt ?? now,
      updatedAt: now,
    };
    await daemonClient().post("/entities/skills", skill);
  }

  return { ok: true, imported: skills.length };
}

async function handleExportSkills(skillIds?: string[]) {
  if (!mainWindow) {
    return { ok: false, error: "Janela principal nao disponivel." };
  }

  const allSkills = await daemonClient().get<Skill[]>("/entities/skills");
  const skills = skillIds?.length
    ? allSkills.filter((skill) => skillIds.includes(skill.id))
    : allSkills;

  const result = (await dialog.showSaveDialog(mainWindow, {
    title: "Exportar skills",
    defaultPath: "skills-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  })) as any;

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  fs.writeFileSync(result.filePath, JSON.stringify(skills, null, 2), "utf8");
  return { ok: true, exported: skills.length, filePath: result.filePath };
}

// --- Register IPC ---

function registerIpcHandlers() {
  // Auth
  ipcMain.handle("codex:login", () => handleLogin());
  ipcMain.handle("codex:checkAuth", () => handleCheckAuth());
  ipcMain.handle("codex:logout", () => handleLogout());
  ipcMain.handle("auth:list", () => handleListAuth());
  ipcMain.handle("auth:login", (_event, provider?: string) => {
    if (!provider || provider === "openai-codex" || provider === "openai") {
      return handleLogin();
    }
    throw new Error(`Interactive login is not supported for provider: ${provider}`);
  });
  ipcMain.handle("auth:save", (_event, args: { provider: string; apiKey?: string; owner?: string; baseUrl?: string }) =>
    handleSaveAuth(args),
  );
  ipcMain.handle("auth:delete", (_event, provider: string) => handleDeleteAuth(provider));
  ipcMain.handle("codex:chat", (_event, args: { model?: string; modelRef?: string; message: string }) =>
    handleChat(args),
  );
  ipcMain.handle("codex:runtimeStatus", async () => {
    const result = await daemonClient().get<any>("/runtime/status");
    return result.runtime;
  });

  // Streaming chat
  ipcMain.handle("codex:chat:stream", handleStreamChat);
  ipcMain.on("codex:chat:abort", () => handleAbortChat());

  // Window controls
  ipcMain.on("window:minimize", () => handleWindowMinimize());
  ipcMain.on("window:close", () => handleWindowClose());

  // Window controls
  ipcMain.on("window:minimize", () => handleWindowMinimize());
  ipcMain.on("window:close", () => handleWindowClose());

  // Workflows
  ipcMain.handle("workflow:run", handleRunWorkflow);
  ipcMain.on("workflow:abort", () => handleAbortWorkflow());

  // Legacy conversation aliases -> sessions v2
  ipcMain.handle("store:conversations:list", async () => {
    const sessions = await daemonClient().get<any[]>("/sessions");
    return sessions.map((session) => ({
      id: session.sessionId,
      title: session.title,
      agentId: session.agentId,
      model: session.model,
      messageCount: session.messageCount,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  });
  ipcMain.handle("store:conversations:get", async (_e, id: string) => {
    const payload = await daemonClient().get<any>(`/sessions/${id}`);
    if (!payload?.session) return null;
    return {
      id: payload.session.sessionId,
      title: payload.session.title,
      agentId: payload.session.agentId,
      model: payload.session.model,
      systemPrompt: payload.session.systemPrompt,
      createdAt: payload.session.createdAt,
      updatedAt: payload.session.updatedAt,
      messages: payload.messages,
    };
  });
  ipcMain.handle("store:conversations:save", async (_e, conv: any) => {
    const existing = conv?.id ? await daemonClient().get<any>(`/sessions/${conv.id}`) : null;
    const session = existing?.session
      ? await daemonClient().patch<any>(`/sessions/${conv.id}`, {
          title: conv?.title ?? existing.session.title,
          model: conv?.model ?? existing.session.model,
          systemPrompt: conv?.systemPrompt ?? existing.session.systemPrompt,
          agentId: conv?.agentId ?? existing.session.agentId,
        })
      : await daemonClient().post<any>("/sessions", {
          sessionId: conv?.id,
          title: conv?.title,
          model: conv?.model ?? "gpt-5.4",
          systemPrompt: conv?.systemPrompt ?? "",
          agentId: conv?.agentId,
        });
    return { ok: true, sessionId: session.sessionId };
  });
  ipcMain.handle("store:conversations:delete", (_e, id: string) => daemonClient().delete(`/sessions/${id}`));

  // Store: Agents
  ipcMain.handle("store:agents:list", () => daemonClient().get("/entities/agents"));
  ipcMain.handle("store:agents:get", (_e, id: string) => daemonClient().get(`/entities/agents/${id}`));
  ipcMain.handle("store:agents:save", (_e, agent: any) => daemonClient().post("/entities/agents", agent));
  ipcMain.handle("store:agents:delete", (_e, id: string) => daemonClient().delete(`/entities/agents/${id}`));

  // Store: Skills
  ipcMain.handle("store:skills:list", () => daemonClient().get("/entities/skills"));
  ipcMain.handle("store:skills:get", (_e, id: string) => daemonClient().get(`/entities/skills/${id}`));
  ipcMain.handle("store:skills:save", (_e, skill: any) => daemonClient().post("/entities/skills", skill));
  ipcMain.handle("store:skills:delete", (_e, id: string) => daemonClient().delete(`/entities/skills/${id}`));
  ipcMain.handle("store:skills:import", () => handleImportSkills());
  ipcMain.handle("store:skills:export", (_e, skillIds?: string[]) => handleExportSkills(skillIds));

  // Store: Workflows
  ipcMain.handle("store:workflows:list", () => daemonClient().get("/entities/workflows"));
  ipcMain.handle("store:workflows:get", (_e, id: string) => daemonClient().get(`/entities/workflows/${id}`));
  ipcMain.handle("store:workflows:save", (_e, workflow: any) => daemonClient().post("/entities/workflows", workflow));
  ipcMain.handle("store:workflows:delete", (_e, id: string) => daemonClient().delete(`/entities/workflows/${id}`));

  // Store: Project Contexts
  ipcMain.handle("store:contexts:list", () => daemonClient().get("/entities/contexts"));
  ipcMain.handle("store:contexts:get", (_e, id: string) => daemonClient().get(`/entities/contexts/${id}`));
  ipcMain.handle("store:contexts:save", (_e, projectContext: any) => daemonClient().post("/entities/contexts", projectContext));
  ipcMain.handle("store:contexts:delete", (_e, id: string) => daemonClient().delete(`/entities/contexts/${id}`));

  // Store: MCP Servers
  ipcMain.handle("store:mcp:list", () => daemonClient().get("/entities/mcp"));
  ipcMain.handle("store:mcp:get", (_e, id: string) => daemonClient().get(`/entities/mcp/${id}`));
  ipcMain.handle("store:mcp:save", (_e, server: any) => daemonClient().post("/entities/mcp", server));
  ipcMain.handle("store:mcp:delete", (_e, id: string) => daemonClient().delete(`/entities/mcp/${id}`));

  // MCP runtime
  ipcMain.handle("mcp:connect", async (_e, config: any) => daemonClient().post("/mcp/connect", config));
  ipcMain.handle("mcp:disconnect", async (_e, id: string) => daemonClient().post("/mcp/disconnect", { id }));
  ipcMain.handle("mcp:status", (_e, id: string) => daemonClient().get(`/mcp/status/${id}`));
  ipcMain.handle("mcp:statuses", () => daemonClient().get("/mcp/statuses"));
  ipcMain.handle("mcp:catalog", () => daemonClient().get("/mcp/catalog"));
  ipcMain.handle("mcp:tools", (_e, id: string) => daemonClient().get(`/mcp/tools/${id}`));
  ipcMain.handle("mcp:allTools", () => daemonClient().get("/mcp/tools"));
  ipcMain.handle("mcp:callTool", async (_e, args: { serverId: string; toolName: string; args: Record<string, unknown> }) => {
    return daemonClient().post("/mcp/call", args);
  });

  // Store: Settings
  ipcMain.handle("store:settings:get", () => daemonClient().get("/settings"));
  ipcMain.handle("store:settings:save", (_e, settings: any) => daemonClient().post("/settings", settings));

  // Sessions v2
  ipcMain.handle("sessions:list", () => daemonClient().get("/sessions"));
  ipcMain.handle("sessions:create", (_e, args: { title?: string; model?: string; modelRef?: string; systemPrompt: string; agentId?: string; projectContextId?: string; sessionId?: string }) =>
    daemonClient().post("/sessions", args),
  );
  ipcMain.handle("sessions:get", (_e, sessionId: string) => daemonClient().get(`/sessions/${sessionId}`));
  ipcMain.handle("sessions:patch", (_e, sessionId: string, patch: any) => daemonClient().patch(`/sessions/${sessionId}`, patch));
  ipcMain.handle("sessions:delete", (_e, sessionId: string) => daemonClient().delete(`/sessions/${sessionId}`));

  // Tasks
  ipcMain.handle("tasks:list", (_e, args?: { status?: string; projectContextId?: string; includeDone?: boolean }) => {
    const query = new URLSearchParams();
    if (args?.status) query.set("status", args.status);
    if (args?.projectContextId) query.set("projectContextId", args.projectContextId);
    if (typeof args?.includeDone === "boolean") query.set("includeDone", String(args.includeDone));
    return daemonClient().get(`/tasks${query.toString() ? `?${query.toString()}` : ""}`);
  });
  ipcMain.handle("tasks:get", (_e, taskId: string) => daemonClient().get(`/tasks/${taskId}`));
  ipcMain.handle("tasks:create", (_e, task: any) => daemonClient().post("/tasks", task));
  ipcMain.handle("tasks:update", (_e, taskId: string, patch: any) => daemonClient().patch(`/tasks/${taskId}`, patch));
  ipcMain.handle("tasks:complete", (_e, taskId: string) => daemonClient().patch(`/tasks/${taskId}`, { action: "complete" }));
  ipcMain.handle("tasks:delete", (_e, taskId: string) => daemonClient().delete(`/tasks/${taskId}`));

  // Reminders
  ipcMain.handle("reminders:list", (_e, args?: { status?: string; includeCanceled?: boolean; includeAcknowledged?: boolean; limit?: number }) => {
    const query = new URLSearchParams();
    if (args?.status) query.set("status", args.status);
    if (typeof args?.includeCanceled === "boolean") query.set("includeCanceled", String(args.includeCanceled));
    if (typeof args?.includeAcknowledged === "boolean") query.set("includeAcknowledged", String(args.includeAcknowledged));
    if (typeof args?.limit === "number") query.set("limit", String(args.limit));
    return daemonClient().get(`/reminders${query.toString() ? `?${query.toString()}` : ""}`);
  });
  ipcMain.handle("reminders:get", (_e, reminderId: string) => daemonClient().get(`/reminders/${reminderId}`));
  ipcMain.handle("reminders:create", (_e, reminder: any) => daemonClient().post("/reminders", reminder));
  ipcMain.handle("reminders:update", (_e, reminderId: string, patch: any) => daemonClient().patch(`/reminders/${reminderId}`, patch));
  ipcMain.handle("reminders:acknowledge", (_e, reminderId: string) => daemonClient().patch(`/reminders/${reminderId}`, { action: "acknowledge" }));
  ipcMain.handle("reminders:cancel", (_e, reminderId: string) => daemonClient().patch(`/reminders/${reminderId}`, { action: "cancel" }));
  ipcMain.handle("reminders:delete", (_e, reminderId: string) => daemonClient().delete(`/reminders/${reminderId}`));

  // Runs v2
  ipcMain.handle("runs:start", async (_e, args: any) => {
    const result = await daemonClient().post<any>("/runs/start", {
      sessionId: args.sessionId,
      title: args.title,
      agentId: args.agentId,
      projectContextId: args.projectContextId,
      modelRef: args.modelRef ?? args.model,
      systemPrompt: args.systemPrompt,
      prompt: args.prompt,
      mcpServerIds: args.mcpServerIds ?? [],
      attachments: args.attachments ?? [],
    });
    currentChatRunId = result.runId;
    return result;
  });
  ipcMain.handle("runs:approve", (_e, args: { runId: string; approvalId: string; approved: boolean; note?: string }) =>
    daemonClient().post("/runs/approve", args),
  );
  ipcMain.handle("runs:abort", (_e, runId: string) => daemonClient().post(`/runs/${runId}/abort`));

  // Workspaces v2
  ipcMain.handle("workspaces:setRoot", async (_e, args: { sessionId: string; rootPath: string }) => {
    return daemonClient().post("/workspaces/root", args);
  });
  ipcMain.handle("workspaces:get", (_e, sessionId: string) => daemonClient().get(`/workspaces/${sessionId}`));
  ipcMain.handle("workspaces:reindex", (_e, sessionId: string) => daemonClient().post("/workspaces/reindex", { sessionId }));
  ipcMain.handle("workspaces:status", (_e, sessionId: string) => daemonClient().get(`/workspaces/${sessionId}`));
  ipcMain.handle("cowork:workspace", () => daemonClient().get("/cowork/workspace"));
  ipcMain.handle("cowork:file", (_e, relativePath: string) =>
    daemonClient().get(`/cowork/file?path=${encodeURIComponent(relativePath)}`),
  );
  ipcMain.handle("browser:status", (_e, sessionId: string) => daemonClient().get(`/browser/status/${sessionId}`));
  ipcMain.handle("browser:invoke", (_e, args: Record<string, unknown>) => daemonClient().post("/browser/invoke", args));
  ipcMain.handle("browser:reset", (_e, sessionId: string) => daemonClient().post("/browser/reset", { sessionId }));

  ipcMain.handle("memory:search", (_e, args: { sessionId?: string; query: string; limit?: number }) => {
    const query = new URLSearchParams();
    query.set("query", args.query);
    if (args.sessionId) query.set("sessionId", args.sessionId);
    if (args.limit) query.set("limit", String(args.limit));
    return daemonClient().get(`/memory/search?${query.toString()}`);
  });
  ipcMain.handle("memory:status", (_e, sessionId: string) => daemonClient().get(`/memory/status/${sessionId}`));
  ipcMain.handle("jobs:list", (_e, args?: { scopeType?: string; scopeId?: string }) => {
    const query = new URLSearchParams();
    if (args?.scopeType) query.set("scopeType", args.scopeType);
    if (args?.scopeId) query.set("scopeId", args.scopeId);
    return daemonClient().get(`/jobs${query.toString() ? `?${query.toString()}` : ""}`);
  });
  ipcMain.handle("jobs:get", (_e, jobId: string) => daemonClient().get(`/jobs/${jobId}`));

  // Artifacts and approvals
  ipcMain.handle("artifacts:list", (_e, args?: { sessionId?: string; runId?: string }) => {
    const query = new URLSearchParams();
    if (args?.sessionId) query.set("sessionId", args.sessionId);
    if (args?.runId) query.set("runId", args.runId);
    return daemonClient().get(`/artifacts${query.toString() ? `?${query.toString()}` : ""}`);
  });
  ipcMain.handle("artifacts:get", (_e, artifactId: string) => daemonClient().get(`/artifacts/${artifactId}`));
  ipcMain.handle("attachments:upload", (_e, args: { sessionId: string; fileName: string; mimeType: string; bytesBase64: string }) =>
    daemonClient().post("/attachments/upload", args),
  );
  ipcMain.handle("attachments:get", (_e, artifactId: string) => daemonClient().get(`/attachments/${artifactId}`));
  ipcMain.handle("tools:history", (_e, args?: { sessionId?: string; runId?: string }) => {
    const query = new URLSearchParams();
    if (args?.sessionId) query.set("sessionId", args.sessionId);
    if (args?.runId) query.set("runId", args.runId);
    return daemonClient().get(`/tools/history${query.toString() ? `?${query.toString()}` : ""}`);
  });
  ipcMain.handle("tools:approvals", (_e, sessionId?: string) =>
    daemonClient().get(`/approvals${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`),
  );
  ipcMain.handle("tools:list", (_e, args?: { mcpServerIds?: string[]; sessionId?: string }) => {
    const query = new URLSearchParams();
    for (const id of args?.mcpServerIds ?? []) {
      query.append("mcpServerId", id);
    }
    if (args?.sessionId) {
      query.set("sessionId", args.sessionId);
    }
    return daemonClient().get(`/tools/list${query.toString() ? `?${query.toString()}` : ""}`);
  });
  ipcMain.handle("tools:invoke", (_e, args: { toolName: string; args: Record<string, unknown>; sessionId?: string; mcpServerIds?: string[] }) =>
    daemonClient().post("/tools/invoke", args),
  );
  ipcMain.handle("capabilities:list", (_e, args?: { mcpServerIds?: string[]; sessionId?: string }) => {
    const query = new URLSearchParams();
    for (const id of args?.mcpServerIds ?? []) {
      query.append("mcpServerId", id);
    }
    if (args?.sessionId) {
      query.set("sessionId", args.sessionId);
    }
    return daemonClient().get(`/capabilities/list${query.toString() ? `?${query.toString()}` : ""}`);
  });

  // OAuth prompt response
  ipcMain.on("oauthPromptResponse", (_event, value: unknown) => {
    if (!pendingOAuthPromptResolve) return;
    const str = typeof value === "string" ? value : String(value ?? "");
    pendingOAuthPromptResolve(str);
    pendingOAuthPromptResolve = null;
    pendingOAuthPromptReject = null;
  });
}

// --- Window ---

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = win;
  setNotificationWindow(win);

  const indexHtml = path.join(process.cwd(), "ui-dist", "index.html");
  win.loadFile(indexHtml);

  win.on("closed", () => {
    setNotificationWindow(null);
    mainWindow = null;
  });
}

// --- App lifecycle ---

app.whenReady().then(async () => {
  daemon = await startDaemonProcess({
    distRoot: path.resolve(__dirname, ".."),
    dataDir: resolveDataRoot(),
  });
  daemon.subscribe(handleDaemonEvent);
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await daemon?.stop();
});
