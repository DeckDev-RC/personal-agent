import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { DaemonEnvelope, DaemonHealthStatus } from "../../src/types/daemon.js";
import type { AutomationPackage } from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { Workflow } from "../../src/types/workflow.js";
import type { JobRecord } from "../../src/types/runtime.js";
import type { AgentConfig, AgentSuggestion } from "../../src/types/agent.js";
import type { McpServerConfig } from "../../src/types/mcp.js";
import type { ProactiveSuggestionQuery } from "../../src/types/proactive.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import type { ReminderRecord } from "../../src/types/reminder.js";
import type { Skill } from "../../src/types/skill.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { KnowledgeSearchQuery } from "../../src/types/knowledge.js";
import type { DraftRecord } from "../../src/types/communication.js";
import type { AnalyticsEventType } from "../../src/types/analytics.js";
import type { FeedbackRating } from "../../src/types/persona.js";
import { computeNextWorkflowScheduleRunAt, normalizeWorkflowSchedule, validateWorkflowSchedule } from "../../src/workflowSchedule.js";
import type { V2AppSettings } from "../services/v2EntityStore.js";
import { enqueueScopedJob } from "../services/jobQueue.js";
import * as mcp from "../services/mcpManager.js";
import { getAttachmentPayload, saveAttachment } from "../services/attachmentService.js";
import {
  abortRun,
  resolveRunApproval,
  startPromptRun,
  startWorkflowRun,
} from "../services/runtimeExecutor.js";
import { getRuntimeStatus } from "../services/runtimeStatus.js";
import { RECOMMENDED_MCP_CATALOG } from "../services/coworkDefaults.js";
import { searchProjectContextMemory } from "../services/projectContext.js";
import {
  closeAllBrowserSessions,
  getBrowserSessionStatus,
  resetBrowserSession,
} from "../services/browserRuntime.js";
import { listCapabilityDescriptors } from "../services/capabilityRegistry.js";
import { buildRegisteredTools } from "../services/toolRegistry.js";
import { getEffectiveToolRiskDecision, startDirectToolInvocation } from "../services/toolExecutionService.js";
import { reindexWorkspace, setWorkspaceRootForSession } from "../services/workspaceIndex.js";
import { listCoworkWorkspaceFiles, readCoworkWorkspaceFile } from "../services/coworkWorkspace.js";
import {
  acknowledgeReminder,
  cancelReminder,
  createReminder,
  deleteReminder,
  getReminder,
  listReminders,
  startReminderScheduler,
  stopReminderScheduler,
  updateReminder,
} from "../services/reminderScheduler.js";
import { suggestAgentForPrompt } from "../services/agentRouter.js";
import { getProactiveSuggestions } from "../services/proactiveEngine.js";
import { getKnowledgeStatus, searchKnowledgeBase, syncKnowledgeBase } from "../services/knowledgeBase.js";
import {
  activateAutomationPackage,
  deactivateAutomationPackage,
  inspectAutomationPackageState,
  validateAutomationPackageState,
} from "../services/automationActivation.js";
import {
  deleteWebRecipe,
  executeWebRecipe,
  getWebRecipe,
  listActiveWebRecipeRecordings,
  listWebRecipes,
  saveWebRecipe,
  startWebRecipeRecording,
  stopWebRecipeRecording,
} from "../services/webRecipes.js";
import { completeTask, createTask, deleteTask, getTask, listTasks, updateTask } from "../services/taskManager.js";
import { createDraft, deleteDraft, getDraft, listDrafts, sendDraft, updateDraft } from "../services/communicationHub.js";
import { listUnifiedInbox } from "../services/inboxAggregator.js";
import { getWeeklyReport, listEvents, trackEvent } from "../services/analyticsCollector.js";
import { buildPersonaInstructions, deleteFeedback, getFeedbackStats, getPersonaConfig, listFeedback, savePersonaConfig, submitFeedback } from "../services/personaManager.js";
import { exportData, getSyncConfig, importFromPath, syncToPath, updateSyncConfig } from "../services/syncManager.js";
import {
  getConnectivityState,
  startConnectivityMonitor,
  stopConnectivityMonitor,
} from "../services/connectivityMonitor.js";
import {
  createJob as createCronJob,
  deleteJob as deleteCronJob,
  getJob as getCronJob,
  initScheduler as initCronScheduler,
  listJobs as listCronJobs,
  setJobExecutor,
  stopScheduler as stopCronScheduler,
  toggleJob as toggleCronJob,
  updateJob as updateCronJob,
  type CronJob,
} from "../services/cronScheduler.js";
import {
  activatePlugin,
  deactivatePlugin,
  installPlugin,
  listPlugins,
  uninstallPlugin,
} from "../services/pluginLoader.js";
import type { PluginManifest } from "../../src/types/plugin.js";
import {
  bindSubagentExecutor,
  getSubagent,
  listSubagents,
  markSubagentAborted,
  spawnSubagent,
} from "../services/subagentManager.js";
import {
  deleteAutomationPackageV2,
  deleteAgentV2,
  deleteConnectionV2,
  deleteMcpServerV2,
  deleteProjectContextV2,
  deleteSkillV2,
  deleteWorkflowV2,
  getAutomationPackageV2,
  getAgentV2,
  getConnectionV2,
  getMcpServerV2,
  getProjectContextV2,
  getSettingsV2,
  getSkillV2,
  getWorkflowV2,
  listAutomationPackagesV2,
  listAgentsV2,
  listConnectionsV2,
  listMcpServersV2,
  listProjectContextsV2,
  listSkillsV2,
  listWorkflowsV2,
  saveAutomationPackageV2,
  saveAgentV2,
  saveConnectionV2,
  saveMcpServerV2,
  saveProjectContextV2,
  saveSettingsV2,
  saveSkillV2,
  saveWorkflowV2,
} from "../services/v2EntityStore.js";
import {
  createSessionRecord,
  deleteSessionRecord,
  getArtifactRecord,
  getJobRecord,
  getSessionRecord,
  getWorkspaceRecordBySession,
  listApprovalRecords,
  listArtifactRecords,
  listJobRecords,
  listMessagesForSession,
  listRunRecords,
  listSessionRecords,
  listMemorySourceRecords,
  listToolHistoryRecords,
  patchSessionRecord,
  searchMemoryRecords,
} from "../services/v2SessionStore.js";
import { publishDaemonEvent, publishJobUpdate, publishRuntimeEvent, subscribeDaemonEvents } from "./state.js";

bindSubagentExecutor(async (params) => {
  publishDaemonEvent({
    event: "run.queued",
    data: {
      runId: randomUUID(),
      sessionId: params.parentSessionId ?? "pending",
    },
  });

  const result = await startPromptRun({
    title: params.title,
    agentId: params.agentId,
    projectContextId: params.projectContextId,
    modelRef: params.modelRef,
    systemPrompt: params.systemPrompt,
    prompt: params.prompt,
    mcpServerIds: params.mcpServerIds,
    onEvent: (event) => {
      params.onEvent(event);
      publishRuntimeEvent(event);
    },
  });

  publishDaemonEvent({
    event: "run.started",
    data: {
      runId: result.runId,
      sessionId: result.sessionId,
    },
  });

  return result;
});

type ScheduledWorkflow = {
  workflowId: string;
  timer: NodeJS.Timeout;
};

function parsePathname(url: string | undefined): string[] {
  const pathname = new URL(url ?? "/", "http://127.0.0.1").pathname;
  return pathname.split("/").filter(Boolean);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendInternalError(res: ServerResponse, error: unknown): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (res.headersSent || res.writableEnded) {
    res.destroy();
    return;
  }
  sendJson(res, 500, { ok: false, error: normalized.message || "Internal daemon error." });
}

function sendNotFound(res: ServerResponse): void {
  sendJson(res, 404, { ok: false, error: "Not found" });
}

function normalizeWebRecipePayload(payload: Partial<WebRecipe>): WebRecipe {
  const now = Date.now();
  return {
    id: String(payload.id ?? randomUUID()),
    name: payload.name?.trim() || "Nova web recipe",
    description: payload.description?.trim() || "",
    steps: Array.isArray(payload.steps)
      ? payload.steps.map((step, index) => ({
          id: String(step.id ?? `${now}-${index}`),
          label: step.label?.trim() || "Step",
          action: step.action ?? "browser_open",
          args:
            step.args && typeof step.args === "object"
              ? Object.fromEntries(
                  Object.entries(step.args).map(([key, value]) => [
                    key,
                    typeof value === "boolean" || typeof value === "number" || typeof value === "string"
                      ? value
                      : String(value ?? ""),
                  ]),
                )
              : {},
        }))
      : [],
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
      : [],
    createdAt: Number(payload.createdAt ?? now),
    updatedAt: Number(payload.updatedAt ?? now),
    lastRunAt: typeof payload.lastRunAt === "number" ? payload.lastRunAt : undefined,
  };
}

function computeNextRunAt(params: {
  workflow: Workflow;
  from?: number;
  retryAttempt?: number;
}): number {
  return computeNextWorkflowScheduleRunAt({
    schedule: params.workflow.schedule!,
    from: params.from,
    retryAttempt: params.retryAttempt,
  });
}

export class CodexAgentDaemon {
  private readonly startedAt = Date.now();
  private readonly token: string;
  private readonly server: Server;
  private readonly scheduledWorkflows = new Map<string, ScheduledWorkflow>();

  constructor(token: string) {
    this.token = token;
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res).catch((error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[daemon] ${req.method ?? "GET"} ${req.url ?? "/"} failed`,
          normalized,
        );
        sendInternalError(res, normalized);
      });
    });
  }

  async listen(port: number): Promise<number> {
    await mcp.connectEnabledServers(await listMcpServersV2());
    await this.refreshWorkflowSchedules();
    startConnectivityMonitor();
    await startReminderScheduler((reminder: ReminderRecord) => {
      publishDaemonEvent({
        event: "reminder.triggered",
        data: { reminder },
      });
    });
    setJobExecutor(async (job) => {
      await this.runCronJob(job);
    });
    await initCronScheduler();
    await new Promise<void>((resolve) => this.server.listen(port, "127.0.0.1", resolve));
    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    for (const scheduled of this.scheduledWorkflows.values()) {
      clearInterval(scheduled.timer);
    }
    this.scheduledWorkflows.clear();
    await stopReminderScheduler();
    setJobExecutor(null);
    stopCronScheduler();
    stopConnectivityMonitor();
    await closeAllBrowserSessions();
    await mcp.disconnectAll();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    return auth === `Bearer ${this.token}`;
  }

  private async refreshWorkflowSchedules(): Promise<void> {
    for (const scheduled of this.scheduledWorkflows.values()) {
      clearTimeout(scheduled.timer);
    }
    this.scheduledWorkflows.clear();

    const workflows = await listWorkflowsV2();
    for (const workflow of workflows) {
      const schedule = normalizeWorkflowSchedule(workflow.schedule);
      if (!schedule?.enabled) {
        continue;
      }
      const nextRunAt =
        typeof schedule.nextRunAt === "number" && schedule.nextRunAt > Date.now()
          ? schedule.nextRunAt
          : computeNextRunAt({
              workflow: {
                ...workflow,
                schedule,
              },
            });
      await this.scheduleWorkflow(
        {
          ...workflow,
          schedule,
        },
        nextRunAt <= Date.now() ? Date.now() + 1_000 : nextRunAt,
      );
    }
  }

  private async scheduleWorkflow(workflow: Workflow, nextRunAt: number): Promise<void> {
    const existing = this.scheduledWorkflows.get(workflow.id);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const updatedWorkflow: Workflow = {
      ...workflow,
      schedule: {
        ...workflow.schedule!,
        nextRunAt,
      },
      updatedAt: Date.now(),
    };
    await saveWorkflowV2(updatedWorkflow);
    const delay = Math.max(250, nextRunAt - Date.now());
    const timer = setTimeout(() => {
      void this.runScheduledWorkflow(updatedWorkflow);
    }, delay);
    this.scheduledWorkflows.set(workflow.id, {
      workflowId: workflow.id,
      timer,
    });
  }

  private async runScheduledWorkflow(workflow: Workflow): Promise<void> {
    this.scheduledWorkflows.delete(workflow.id);
    const settings = await getSettingsV2();
    const job = await enqueueScopedJob({
      kind: "workflow_run",
      scopeType: "system",
      scopeId: workflow.id,
      payload: { workflowId: workflow.id, trigger: "scheduled" },
      onUpdate: publishJobUpdate,
      run: async () => {
        const result = await startWorkflowRun({
          workflow,
          modelRef: settings.defaultModelRef,
          systemPrompt: settings.globalSystemPrompt || "You are a helpful AI assistant.",
          onEvent: publishRuntimeEvent,
        });
        return `Scheduled workflow session ${result.sessionId}`;
      },
    });
    publishDaemonEvent({ event: "run.queued", data: { runId: job.jobId, sessionId: workflow.id, jobId: job.jobId } });
    const jobs = await listJobRecords("system", workflow.id);
    let recentScheduledFailures = 0;
    for (const entry of jobs) {
      if (entry.kind !== "workflow_run" || entry.payload?.trigger !== "scheduled") {
        continue;
      }
      if (entry.status === "failed") {
        recentScheduledFailures += 1;
        continue;
      }
      if (entry.status === "completed") {
        break;
      }
    }
    const refreshed = await getWorkflowV2(workflow.id);
    if (!refreshed?.schedule?.enabled) {
      return;
    }
    const nextRunAt =
      recentScheduledFailures > 0 && refreshed.schedule.retryOnFailure
        ? computeNextRunAt({
            workflow: refreshed,
            retryAttempt: Math.min(recentScheduledFailures, refreshed.schedule.maxRetries ?? 0),
          })
        : computeNextRunAt({ workflow: refreshed });
    await saveWorkflowV2({
      ...refreshed,
      schedule: {
        ...refreshed.schedule,
        lastRunAt: Date.now(),
        nextRunAt,
      },
      updatedAt: Date.now(),
    });
    await this.scheduleWorkflow(
      {
        ...refreshed,
        schedule: {
          ...refreshed.schedule,
          lastRunAt: Date.now(),
          nextRunAt,
        },
      },
      nextRunAt,
    );
  }

  private async runCronJob(job: CronJob): Promise<void> {
    if (job.actionType !== "workflow") {
      throw new Error(`Cron action "${job.actionType}" is not executable yet.`);
    }

    const workflowId =
      typeof job.actionConfig.workflowId === "string"
        ? job.actionConfig.workflowId.trim()
        : "";
    if (!workflowId) {
      throw new Error(`Cron job ${job.id} is missing actionConfig.workflowId.`);
    }

    const workflow = await getWorkflowV2(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const settings = await getSettingsV2();
    await startWorkflowRun({
      workflow,
      modelRef: settings.defaultModelRef,
      systemPrompt:
        settings.globalSystemPrompt || "You are a helpful AI assistant.",
      trigger: "cron",
      onEvent: publishRuntimeEvent,
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathParts = parsePathname(req.url);

    if (method === "GET" && url.pathname === "/health") {
      const status: DaemonHealthStatus = {
        ok: true,
        pid: process.pid,
        startedAt: this.startedAt,
      };
      sendJson(res, 200, status);
      return;
    }

    if (method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const send = (event: DaemonEnvelope) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      const unsubscribe = subscribeDaemonEvents(send);
      res.write(`data: ${JSON.stringify({ event: "job.updated", data: { daemonReady: true } })}\n\n`);
      req.on("close", unsubscribe);
      return;
    }

    if (method === "GET" && url.pathname === "/runtime/status") {
      const statuses = mcp.getAllStatuses();
      const enabled = await listMcpServersV2();
      sendJson(res, 200, {
        mcpStatuses: statuses,
        runtime: await getRuntimeStatus({
          enabledMcpCount: enabled.filter((item) => item.enabled).length,
        }),
      });
      return;
    }

    if (method === "GET" && pathParts[0] === "entities") {
      const kind = pathParts[1];
      const id = pathParts[2];
      const listMap = {
        agents: listAgentsV2,
        skills: listSkillsV2,
        workflows: listWorkflowsV2,
        mcp: listMcpServersV2,
        contexts: listProjectContextsV2,
        automation_packages: listAutomationPackagesV2,
        connections: listConnectionsV2,
      } as const;
      const getMap = {
        agents: getAgentV2,
        skills: getSkillV2,
        workflows: getWorkflowV2,
        mcp: getMcpServerV2,
        contexts: getProjectContextV2,
        automation_packages: getAutomationPackageV2,
        connections: getConnectionV2,
      } as const;
      if (kind in listMap) {
        sendJson(res, 200, id ? await getMap[kind as keyof typeof getMap](id) : await listMap[kind as keyof typeof listMap]());
        return;
      }
    }

    if (method === "POST" && pathParts[0] === "entities") {
      const kind = pathParts[1];
      const body = await readJson<any>(req);
      if (kind === "agents") {
        await saveAgentV2(body as AgentConfig);
      } else if (kind === "skills") {
        await saveSkillV2(body as Skill);
      } else if (kind === "workflows") {
        const workflow = body as Workflow;
        const schedule = normalizeWorkflowSchedule(workflow.schedule);
        const validation = validateWorkflowSchedule(schedule);
        if (!validation.valid) {
          sendJson(res, 400, { ok: false, error: validation.error ?? "Invalid workflow schedule." });
          return;
        }
        await saveWorkflowV2({
          ...workflow,
          schedule: schedule
            ? {
                ...schedule,
                nextRunAt: undefined,
              }
            : undefined,
        });
        await this.refreshWorkflowSchedules();
      } else if (kind === "mcp") {
        await saveMcpServerV2(body as McpServerConfig);
      } else if (kind === "contexts") {
        await saveProjectContextV2(body as ProjectContext);
      } else if (kind === "automation_packages") {
        await saveAutomationPackageV2(body as AutomationPackage);
      } else if (kind === "connections") {
        await saveConnectionV2(body as Connection);
      } else {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "DELETE" && pathParts[0] === "entities" && pathParts[2]) {
      const kind = pathParts[1];
      const id = pathParts[2];
      if (kind === "agents") {
        await deleteAgentV2(id);
      } else if (kind === "skills") {
        await deleteSkillV2(id);
      } else if (kind === "workflows") {
        await deleteWorkflowV2(id);
        await this.refreshWorkflowSchedules();
      } else if (kind === "mcp") {
        await deleteMcpServerV2(id);
      } else if (kind === "contexts") {
        await deleteProjectContextV2(id);
      } else if (kind === "automation_packages") {
        await deleteAutomationPackageV2(id);
      } else if (kind === "connections") {
        await deleteConnectionV2(id);
      } else {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (
      pathParts[0] === "automation" &&
      pathParts[1] === "packages" &&
      pathParts[2]
    ) {
      const packageId = pathParts[2];

      if (method === "GET" && pathParts[3] === "inspect") {
        try {
          sendJson(res, 200, await inspectAutomationPackageState(packageId));
        } catch (error) {
          sendJson(res, 404, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathParts[3] === "validate") {
        try {
          sendJson(res, 200, await validateAutomationPackageState(packageId));
        } catch (error) {
          sendJson(res, 404, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathParts[3] === "activate") {
        try {
          sendJson(res, 200, await activateAutomationPackage(packageId));
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathParts[3] === "deactivate") {
        try {
          sendJson(res, 200, await deactivateAutomationPackage(packageId));
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
    }

    if (url.pathname === "/agents/suggest" && method === "POST") {
      const body = await readJson<{ prompt: string; currentAgentId?: string }>(req);
      const suggestion: AgentSuggestion | null = await suggestAgentForPrompt({
        prompt: body.prompt ?? "",
        currentAgentId: body.currentAgentId,
      });
      sendJson(res, 200, suggestion);
      return;
    }

    if (url.pathname === "/proactive/suggestions" && method === "POST") {
      sendJson(res, 200, await getProactiveSuggestions(await readJson<ProactiveSuggestionQuery>(req)));
      return;
    }

    if (url.pathname === "/settings") {
      if (method === "GET") {
        sendJson(res, 200, await getSettingsV2());
        return;
      }
      if (method === "POST") {
        const body = await readJson<V2AppSettings>(req);
        await saveSettingsV2(body);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (url.pathname === "/sessions" && method === "GET") {
      sendJson(res, 200, await listSessionRecords());
      return;
    }

    if (url.pathname === "/sessions" && method === "POST") {
      const body = await readJson<{
        title?: string;
        model?: string;
        modelRef?: string;
        systemPrompt: string;
        agentId?: string;
        projectContextId?: string;
        sessionId?: string;
      }>(req);
      sendJson(
        res,
        200,
        await createSessionRecord({
          ...body,
          model: body.modelRef ?? body.model ?? (await getSettingsV2()).defaultModelRef,
        }),
      );
      return;
    }

    if (pathParts[0] === "sessions" && pathParts[1]) {
      const sessionId = pathParts[1];
      if (method === "GET") {
        const session = await getSessionRecord(sessionId);
        sendJson(res, 200, session ? { session, messages: await listMessagesForSession(sessionId) } : null);
        return;
      }
      if (method === "PATCH") {
        sendJson(res, 200, await patchSessionRecord(sessionId, await readJson(req)));
        return;
      }
      if (method === "DELETE") {
        await deleteSessionRecord(sessionId);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (url.pathname === "/runs" && method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      sendJson(res, 200, await listRunRecords(sessionId));
      return;
    }

    if (url.pathname === "/runs/start" && method === "POST") {
      const body = await readJson<{
        sessionId?: string;
        title?: string;
        agentId?: string;
        projectContextId?: string;
        model?: string;
        modelRef?: string;
        systemPrompt: string;
        prompt: string;
        mcpServerIds?: string[];
        attachments?: Array<{
          artifactId: string;
          sessionId: string;
          fileName: string;
          mimeType: string;
          byteSize: number;
          extractedTextAvailable: boolean;
        }>;
      }>(req);
      publishDaemonEvent({
        event: "run.queued",
        data: {
          runId: randomUUID(),
          sessionId: body.sessionId ?? "pending",
        },
      });
      const result = await startPromptRun({
        ...body,
        modelRef: body.modelRef ?? body.model ?? (await getSettingsV2()).defaultModelRef,
        onEvent: publishRuntimeEvent,
      });
      publishDaemonEvent({
        event: "run.started",
        data: {
          runId: result.runId,
          sessionId: result.sessionId,
        },
      });
      sendJson(res, 200, result);
      return;
    }

    if (pathParts[0] === "runs" && pathParts[2] === "abort" && method === "POST") {
      sendJson(res, 200, { ok: abortRun(pathParts[1]) });
      return;
    }

    if (url.pathname === "/runs/approve" && method === "POST") {
      sendJson(res, 200, {
        ok: await resolveRunApproval(await readJson(req)),
      });
      return;
    }

    if (url.pathname === "/subagents" && method === "GET") {
      sendJson(res, 200, await listSubagents({
        status: (url.searchParams.get("status") as any) ?? undefined,
        parentSessionId: url.searchParams.get("parentSessionId") ?? undefined,
        requestedBy: (url.searchParams.get("requestedBy") as any) ?? undefined,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      }));
      return;
    }

    if (url.pathname === "/subagents/spawn" && method === "POST") {
      sendJson(res, 200, await spawnSubagent(await readJson(req)));
      return;
    }

    if (pathParts[0] === "subagents" && pathParts[1]) {
      const subagentId = pathParts[1];
      if (method === "GET" && !pathParts[2]) {
        const subagent = await getSubagent(subagentId);
        if (!subagent) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, subagent);
        return;
      }

      if (method === "POST" && pathParts[2] === "cancel") {
        const subagent = await getSubagent(subagentId);
        if (!subagent) {
          sendNotFound(res);
          return;
        }
        if (subagent.runId) {
          abortRun(subagent.runId);
        }
        sendJson(res, 200, await markSubagentAborted(subagentId));
        return;
      }
    }

    if (url.pathname === "/approvals" && method === "GET") {
      sendJson(res, 200, await listApprovalRecords(url.searchParams.get("sessionId") ?? undefined));
      return;
    }

    if (url.pathname === "/artifacts" && method === "GET") {
      sendJson(res, 200, await listArtifactRecords({
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        runId: url.searchParams.get("runId") ?? undefined,
      }));
      return;
    }

    if (pathParts[0] === "attachments" && pathParts[1] && method === "GET") {
      const attachment = await getAttachmentPayload(pathParts[1]);
      if (!attachment) {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, attachment);
      return;
    }

    if (url.pathname === "/attachments/upload" && method === "POST") {
      const body = await readJson<{
        sessionId: string;
        fileName: string;
        mimeType: string;
        bytesBase64: string;
      }>(req);
      sendJson(
        res,
        200,
        await saveAttachment(body),
      );
      return;
    }

    if (pathParts[0] === "artifacts" && pathParts[1] && method === "GET") {
      sendJson(res, 200, await getArtifactRecord(pathParts[1]));
      return;
    }

    if (url.pathname === "/tools/history" && method === "GET") {
      sendJson(res, 200, await listToolHistoryRecords({
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        runId: url.searchParams.get("runId") ?? undefined,
      }));
      return;
    }

    if (url.pathname === "/tools/list" && method === "GET") {
      const mcpServerIds = url.searchParams.getAll("mcpServerId");
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      const tools = buildRegisteredTools(mcpServerIds);
      const entries = await Promise.all(
        tools.map(async (tool) => {
          const effectiveRisk = sessionId
            ? await getEffectiveToolRiskDecision({
                tool,
                args: {},
                sessionId,
              })
            : null;
          return {
            publicName: tool.publicName,
            actualName: tool.actualName,
            source: tool.source,
            serverId: tool.serverId,
            serverName: tool.serverName,
            metadata: tool.metadata,
            description: tool.tool.description,
            requiresApprovalNow: effectiveRisk?.requiresApprovalNow ?? tool.metadata.capabilities.includes("requires_approval"),
            effectiveRiskMode: effectiveRisk?.mode ?? null,
          };
        }),
      );
      sendJson(
        res,
        200,
        entries,
      );
      return;
    }

    if (url.pathname === "/capabilities/list" && method === "GET") {
      const mcpServerIds = url.searchParams.getAll("mcpServerId");
      sendJson(res, 200, listCapabilityDescriptors(buildRegisteredTools(mcpServerIds)));
      return;
    }

    if (url.pathname === "/tools/invoke" && method === "POST") {
      const body = await readJson<{
        toolName: string;
        args: Record<string, unknown>;
        sessionId?: string;
        mcpServerIds?: string[];
      }>(req);
      const tools = buildRegisteredTools(body.mcpServerIds ?? []);
      const tool = tools.find((item) => item.publicName === body.toolName);
      if (!tool) {
        sendJson(res, 404, { ok: false, error: "Tool not found." });
        return;
      }
      sendJson(
        res,
        200,
        await startDirectToolInvocation({
          sessionId: body.sessionId,
          tool,
          args: body.args,
          onEvent: (event) => publishRuntimeEvent(event as any),
        }),
      );
      return;
    }

    if (pathParts[0] === "workspaces" && pathParts[1] && method === "GET") {
      sendJson(res, 200, await getWorkspaceRecordBySession(pathParts[1]));
      return;
    }

    if (url.pathname === "/workspaces/root" && method === "POST") {
      const body = await readJson<{ sessionId: string; rootPath: string }>(req);
      await setWorkspaceRootForSession(body.sessionId, body.rootPath);
      sendJson(res, 200, await getWorkspaceRecordBySession(body.sessionId));
      return;
    }

    if (url.pathname === "/workspaces/reindex" && method === "POST") {
      const body = await readJson<{ sessionId: string }>(req);
      const workspace = await getWorkspaceRecordBySession(body.sessionId);
      if (!workspace) {
        sendJson(res, 404, { ok: false, error: "Workspace not configured." });
        return;
      }
      const job = await enqueueScopedJob({
        kind: "workspace_reindex",
        scopeType: "workspace",
        scopeId: workspace.workspaceId,
        payload: { sessionId: body.sessionId, workspaceId: workspace.workspaceId },
        onUpdate: async (nextJob) => {
          publishJobUpdate(nextJob);
          await patchSessionRecord(body.sessionId, {
            workspaceId: workspace.workspaceId,
            workspaceRoot: workspace.rootPath,
          });
        },
        run: async (nextJob) => {
          await reindexWorkspace(body.sessionId);
          return `Workspace ${workspace.rootPath} indexed`;
        },
      });
      sendJson(res, 200, job);
      return;
    }

    if (url.pathname === "/cowork/workspace" && method === "GET") {
      sendJson(res, 200, await listCoworkWorkspaceFiles());
      return;
    }

    if (url.pathname === "/cowork/file" && method === "GET") {
      const relativePath = url.searchParams.get("path") ?? "";
      if (!relativePath.trim()) {
        sendJson(res, 400, { ok: false, error: "Missing cowork workspace path." });
        return;
      }
      sendJson(res, 200, await readCoworkWorkspaceFile(relativePath));
      return;
    }

    if (url.pathname === "/memory/search" && method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      const query = url.searchParams.get("query") ?? "";
      const workspace = sessionId ? await getWorkspaceRecordBySession(sessionId) : null;
      sendJson(res, 200, {
        query,
        results: await searchMemoryRecords({
          query,
          sessionId,
          workspaceId: workspace?.workspaceId,
          limit: Number(url.searchParams.get("limit") ?? 8),
        }),
      });
      return;
    }

    if (url.pathname === "/knowledge/status" && method === "GET") {
      sendJson(res, 200, await getKnowledgeStatus());
      return;
    }

    if (url.pathname === "/knowledge/sync" && method === "POST") {
      sendJson(res, 200, await syncKnowledgeBase());
      return;
    }

    if (url.pathname === "/knowledge/search" && method === "POST") {
      sendJson(res, 200, await searchKnowledgeBase(await readJson<KnowledgeSearchQuery>(req)));
      return;
    }

    if (pathParts[0] === "browser" && pathParts[1] === "status" && pathParts[2] && method === "GET") {
      sendJson(res, 200, {
        browserSession: await getBrowserSessionStatus(pathParts[2]),
      });
      return;
    }

    if (url.pathname === "/browser/invoke" && method === "POST") {
      const body = await readJson<{
        sessionId: string;
        action:
          | "browser_tabs"
          | "browser_open"
          | "browser_snapshot"
          | "browser_console_messages"
          | "browser_page_errors"
          | "browser_network_requests"
          | "browser_click"
          | "browser_hover"
          | "browser_type"
          | "browser_drag"
          | "browser_select"
          | "browser_fill"
          | "browser_wait"
          | "browser_evaluate"
          | "browser_batch"
          | "browser_set_input_files"
          | "browser_handle_dialog"
          | "browser_screenshot"
          | "browser_extract_text"
          | "browser_close";
      } & Record<string, unknown>>(req);
      const tool = buildRegisteredTools([]).find((entry) => entry.publicName === body.action && entry.source === "browser");
      if (!tool) {
        sendJson(res, 404, { ok: false, error: "Browser action not found." });
        return;
      }
      sendJson(
        res,
        200,
        await startDirectToolInvocation({
          sessionId: body.sessionId,
          tool,
          args: body,
          onEvent: (event) => publishRuntimeEvent(event as any),
        }),
      );
      return;
    }

    if (url.pathname === "/browser/reset" && method === "POST") {
      const body = await readJson<{ sessionId: string }>(req);
      await resetBrowserSession(body.sessionId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathParts[0] === "memory" && pathParts[1] === "status" && pathParts[2] && method === "GET") {
      const sessionId = pathParts[2];
      const workspace = await getWorkspaceRecordBySession(sessionId);
      const sources = await listMemorySourceRecords(sessionId);
      sendJson(res, 200, {
        workspace,
        jobs: await listJobRecords("workspace", workspace?.workspaceId ?? sessionId),
        sourceCount: sources.length,
        recentSources: sources.slice(0, 6),
      });
      return;
    }

    if (url.pathname === "/jobs" && method === "GET") {
      const scopeType = url.searchParams.get("scopeType");
      sendJson(res, 200, await listJobRecords(
        (scopeType as JobRecord["scopeType"] | null) ?? undefined,
        url.searchParams.get("scopeId") ?? undefined,
      ));
      return;
    }

    if (url.pathname === "/recipes" && method === "GET") {
      sendJson(res, 200, await listWebRecipes());
      return;
    }

    if (url.pathname === "/recipes" && method === "POST") {
      sendJson(res, 200, await saveWebRecipe(normalizeWebRecipePayload(await readJson(req))));
      return;
    }

    if (url.pathname === "/recipes/recordings" && method === "GET") {
      sendJson(res, 200, listActiveWebRecipeRecordings());
      return;
    }

    if (url.pathname === "/recipes/recordings/start" && method === "POST") {
      const body = await readJson<{ sessionId?: string; recipeId?: string }>(req);
      sendJson(res, 200, await startWebRecipeRecording(body));
      return;
    }

    if (url.pathname === "/recipes/recordings/stop" && method === "POST") {
      const body = await readJson<{
        recordingId: string;
        persist?: boolean;
        name?: string;
        description?: string;
        tags?: string[];
      }>(req);
      sendJson(res, 200, await stopWebRecipeRecording(body));
      return;
    }

    if (pathParts[0] === "recipes" && pathParts[1]) {
      const recipeId = pathParts[1];
      if (method === "GET" && !pathParts[2]) {
        const recipe = await getWebRecipe(recipeId);
        if (!recipe) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, recipe);
        return;
      }

      if (method === "DELETE" && !pathParts[2]) {
        await deleteWebRecipe(recipeId);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === "POST" && pathParts[2] === "run") {
        const body = await readJson<{ sessionId?: string }>(req);
        try {
          sendJson(
            res,
            200,
            await executeWebRecipe({
              recipeId,
              sessionId: body.sessionId,
            }),
          );
        } catch (error) {
          sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
    }

    if (url.pathname === "/tasks" && method === "GET") {
      const status = url.searchParams.get("status") ?? undefined;
      const projectContextId = url.searchParams.get("projectContextId") ?? undefined;
      const includeDone = url.searchParams.get("includeDone") === "true";
      sendJson(
        res,
        200,
        await listTasks({
          status: status as any,
          projectContextId,
          includeDone,
        }),
      );
      return;
    }

    if (url.pathname === "/tasks" && method === "POST") {
      sendJson(res, 200, await createTask(await readJson(req)));
      return;
    }

    if (pathParts[0] === "tasks" && pathParts[1]) {
      const taskId = pathParts[1];
      if (method === "GET") {
        const task = await getTask(taskId);
        if (!task) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, task);
        return;
      }
      if (method === "PATCH") {
        const body = await readJson<any>(req);
        const task =
          body?.action === "complete"
            ? await completeTask(taskId)
            : await updateTask(taskId, body);
        if (!task) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, task);
        return;
      }
      if (method === "DELETE") {
        const deleted = await deleteTask(taskId);
        if (!deleted) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (url.pathname === "/reminders" && method === "GET") {
      const status = url.searchParams.get("status") ?? undefined;
      const includeCanceled = url.searchParams.get("includeCanceled") === "true";
      const includeAcknowledged = url.searchParams.get("includeAcknowledged") === "true";
      const limitRaw = url.searchParams.get("limit");
      sendJson(
        res,
        200,
        await listReminders({
          status: status as any,
          includeCanceled,
          includeAcknowledged,
          limit: limitRaw ? Number(limitRaw) : undefined,
        }),
      );
      return;
    }

    if (url.pathname === "/reminders" && method === "POST") {
      sendJson(res, 200, await createReminder(await readJson(req)));
      return;
    }

    if (pathParts[0] === "reminders" && pathParts[1]) {
      const reminderId = pathParts[1];
      if (method === "GET") {
        const reminder = await getReminder(reminderId);
        if (!reminder) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, reminder);
        return;
      }
      if (method === "PATCH") {
        const body = await readJson<any>(req);
        const reminder =
          body?.action === "acknowledge"
            ? await acknowledgeReminder(reminderId)
            : body?.action === "cancel"
              ? await cancelReminder(reminderId)
              : await updateReminder(reminderId, body);
        if (!reminder) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, reminder);
        return;
      }
      if (method === "DELETE") {
        const deleted = await deleteReminder(reminderId);
        if (!deleted) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (pathParts[0] === "jobs" && pathParts[1] && method === "GET") {
      sendJson(res, 200, await getJobRecord(pathParts[1]));
      return;
    }

    if (url.pathname === "/workflow/run" && method === "POST") {
      const body = await readJson<{ workflowId: string; model?: string; modelRef?: string; systemPrompt: string }>(req);
      const workflow = await getWorkflowV2(body.workflowId);
      if (!workflow) {
        sendJson(res, 404, { ok: false, error: "Workflow not found." });
        return;
      }
      const result = await startWorkflowRun({
        workflow,
        modelRef: body.modelRef ?? body.model ?? (await getSettingsV2()).defaultModelRef,
        systemPrompt: body.systemPrompt,
        onEvent: publishRuntimeEvent,
      });
      sendJson(res, 200, result);
      return;
    }

    if (url.pathname === "/mcp/connect" && method === "POST") {
      const body = await readJson<McpServerConfig>(req);
      try {
        await mcp.connectServer(body);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (url.pathname === "/mcp/disconnect" && method === "POST") {
      const body = await readJson<{ id: string }>(req);
      await mcp.disconnectServer(body.id);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/mcp/statuses" && method === "GET") {
      sendJson(res, 200, mcp.getAllStatuses());
      return;
    }

    if (url.pathname === "/mcp/catalog" && method === "GET") {
      sendJson(res, 200, RECOMMENDED_MCP_CATALOG);
      return;
    }

    if (pathParts[0] === "contexts" && pathParts[1] && pathParts[2] === "search" && method === "GET") {
      const query = url.searchParams.get("query") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? "8");
      sendJson(
        res,
        200,
        await searchProjectContextMemory({
          projectContextId: pathParts[1],
          query,
          limit,
        }),
      );
      return;
    }

    if (pathParts[0] === "mcp" && pathParts[1] === "status" && pathParts[2] && method === "GET") {
      sendJson(res, 200, mcp.getServerStatus(pathParts[2]));
      return;
    }

    if (url.pathname === "/mcp/tools" && method === "GET") {
      sendJson(res, 200, mcp.getAllTools());
      return;
    }

    if (pathParts[0] === "mcp" && pathParts[1] === "tools" && pathParts[2] && method === "GET") {
      sendJson(res, 200, mcp.getToolsForServer(pathParts[2]));
      return;
    }

    if (url.pathname === "/mcp/call" && method === "POST") {
      const body = await readJson<{ serverId: string; toolName: string; args: Record<string, unknown> }>(req);
      sendJson(res, 200, await mcp.callTool(body.serverId, body.toolName, body.args));
      return;
    }

    // --- Drafts (Communication Hub) ---
    if (url.pathname === "/inbox" && method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "0");
      const channel = url.searchParams.get("channel") ?? undefined;
      const query = url.searchParams.get("query") ?? undefined;
      sendJson(
        res,
        200,
        await listUnifiedInbox({
          limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
          onlyUnread: url.searchParams.get("onlyUnread") === "true",
          query,
          channel: channel ? (channel as any) : undefined,
        }),
      );
      return;
    }

    if (url.pathname === "/drafts" && method === "GET") {
      const status = url.searchParams.get("status") as any ?? undefined;
      const type = url.searchParams.get("type") as any ?? undefined;
      const projectContextId = url.searchParams.get("projectContextId") ?? undefined;
      sendJson(res, 200, await listDrafts({ status, type, projectContextId }));
      return;
    }
    if (url.pathname === "/drafts" && method === "POST") {
      sendJson(res, 200, await createDraft(await readJson(req)));
      return;
    }
    if (pathParts[0] === "drafts" && pathParts[1]) {
      const draftId = pathParts[1];
      if (pathParts[2] === "send" && method === "POST") {
        const result = await sendDraft(draftId);
        if (!result) { sendNotFound(res); return; }
        sendJson(res, 200, result);
        return;
      }
      if (method === "GET") {
        const draft = await getDraft(draftId);
        if (!draft) { sendNotFound(res); return; }
        sendJson(res, 200, draft);
        return;
      }
      if (method === "PATCH") {
        const draft = await updateDraft(draftId, await readJson(req));
        if (!draft) { sendNotFound(res); return; }
        sendJson(res, 200, draft);
        return;
      }
      if (method === "DELETE") {
        const deleted = await deleteDraft(draftId);
        if (!deleted) { sendNotFound(res); return; }
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    // --- Analytics ---
    if (url.pathname === "/analytics/events" && method === "GET") {
      const eventType = url.searchParams.get("eventType") as AnalyticsEventType | undefined ?? undefined;
      const since = url.searchParams.get("since") ? Number(url.searchParams.get("since")) : undefined;
      const until = url.searchParams.get("until") ? Number(url.searchParams.get("until")) : undefined;
      const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
      sendJson(res, 200, await listEvents({ eventType, since, until, limit }));
      return;
    }
    if (url.pathname === "/analytics/events" && method === "POST") {
      const body = await readJson<{ eventType: AnalyticsEventType; metadata?: Record<string, unknown> }>(req);
      sendJson(res, 200, await trackEvent(body.eventType, body.metadata));
      return;
    }
    if (url.pathname === "/analytics/weekly" && method === "GET") {
      const weekStart = url.searchParams.get("weekStart") ? Number(url.searchParams.get("weekStart")) : undefined;
      sendJson(res, 200, await getWeeklyReport(weekStart));
      return;
    }

    // --- Feedback & Persona ---
    if (url.pathname === "/feedback" && method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      const rating = url.searchParams.get("rating") as FeedbackRating | undefined ?? undefined;
      const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
      sendJson(res, 200, await listFeedback({ sessionId, rating, limit }));
      return;
    }
    if (url.pathname === "/feedback" && method === "POST") {
      sendJson(res, 200, await submitFeedback(await readJson(req)));
      return;
    }
    if (url.pathname === "/feedback/stats" && method === "GET") {
      sendJson(res, 200, await getFeedbackStats());
      return;
    }
    if (pathParts[0] === "feedback" && pathParts[1] && method === "DELETE") {
      const deleted = await deleteFeedback(pathParts[1]);
      if (!deleted) { sendNotFound(res); return; }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/persona" && method === "GET") {
      sendJson(res, 200, await getPersonaConfig());
      return;
    }
    if (url.pathname === "/persona" && method === "POST") {
      sendJson(res, 200, await savePersonaConfig(await readJson(req)));
      return;
    }

    // --- Sync ---
    if (url.pathname === "/sync/config" && method === "GET") {
      sendJson(res, 200, getSyncConfig());
      return;
    }
    if (url.pathname === "/sync/config" && method === "POST") {
      sendJson(res, 200, updateSyncConfig(await readJson(req)));
      return;
    }
    if (url.pathname === "/sync/export" && method === "POST") {
      sendJson(res, 200, await syncToPath());
      return;
    }
    if (url.pathname === "/sync/import" && method === "POST") {
      sendJson(res, 200, await importFromPath());
      return;
    }

    // --- Connectivity ---
    if (url.pathname === "/connectivity" && method === "GET") {
      sendJson(res, 200, getConnectivityState());
      return;
    }

    // --- Cron / Scheduled Tasks ---
    if (url.pathname === "/cron" && method === "GET") {
      sendJson(res, 200, await listCronJobs());
      return;
    }

    if (url.pathname === "/cron" && method === "POST") {
      sendJson(res, 200, await createCronJob(await readJson(req)));
      return;
    }

    if (pathParts[0] === "cron" && pathParts[1]) {
      const cronId = pathParts[1];
      if (method === "GET" && !pathParts[2]) {
        const job = await getCronJob(cronId);
        if (!job) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, job);
        return;
      }
      if (method === "PATCH" && !pathParts[2]) {
        const job = await updateCronJob(cronId, await readJson(req));
        if (!job) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, job);
        return;
      }
      if (method === "DELETE" && !pathParts[2]) {
        const deleted = await deleteCronJob(cronId);
        if (!deleted) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      if (method === "POST" && pathParts[2] === "toggle") {
        const body = await readJson<{ enabled: boolean }>(req);
        const job = await toggleCronJob(cronId, body.enabled);
        if (!job) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, job);
        return;
      }
    }

    // --- Plugins ---
    if (url.pathname === "/plugins" && method === "GET") {
      sendJson(res, 200, await listPlugins());
      return;
    }

    if (url.pathname === "/plugins" && method === "POST") {
      const manifest = await readJson<PluginManifest>(req);
      sendJson(res, 200, await installPlugin(manifest));
      return;
    }

    if (pathParts[0] === "plugins" && pathParts[1]) {
      const pluginId = pathParts[1];
      if (method === "POST" && pathParts[2] === "activate") {
        const result = await activatePlugin(pluginId);
        if (!result) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, result);
        return;
      }
      if (method === "POST" && pathParts[2] === "deactivate") {
        const result = await deactivatePlugin(pluginId);
        if (!result) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, result);
        return;
      }
      if (method === "DELETE" && !pathParts[2]) {
        const deleted = await uninstallPlugin(pluginId);
        if (!deleted) {
          sendNotFound(res);
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    sendNotFound(res);
  }
}
