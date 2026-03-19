import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { DaemonEnvelope, DaemonHealthStatus } from "../../src/types/daemon.js";
import type { Workflow } from "../../src/types/workflow.js";
import type { JobRecord } from "../../src/types/runtime.js";
import type { AgentConfig } from "../../src/types/agent.js";
import type { McpServerConfig } from "../../src/types/mcp.js";
import type { Skill } from "../../src/types/skill.js";
import type { V2AppSettings } from "../services/v2EntityStore.js";
import { enqueueScopedJob } from "../services/jobQueue.js";
import * as mcp from "../services/mcpManager.js";
import { saveAttachment } from "../services/attachmentService.js";
import {
  abortRun,
  resolveRunApproval,
  startPromptRun,
  startWorkflowRun,
} from "../services/runtimeExecutor.js";
import { getRuntimeStatus } from "../services/runtimeStatus.js";
import {
  closeAllBrowserSessions,
  getBrowserSessionStatus,
  resetBrowserSession,
} from "../services/browserRuntime.js";
import { listCapabilityDescriptors } from "../services/capabilityRegistry.js";
import { buildRegisteredTools } from "../services/toolRegistry.js";
import { getEffectiveToolRiskDecision, startDirectToolInvocation } from "../services/toolExecutionService.js";
import { reindexWorkspace, setWorkspaceRootForSession } from "../services/workspaceIndex.js";
import {
  deleteAgentV2,
  deleteMcpServerV2,
  deleteSkillV2,
  deleteWorkflowV2,
  getAgentV2,
  getMcpServerV2,
  getSettingsV2,
  getSkillV2,
  getWorkflowV2,
  listAgentsV2,
  listMcpServersV2,
  listSkillsV2,
  listWorkflowsV2,
  saveAgentV2,
  saveMcpServerV2,
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

function sendNotFound(res: ServerResponse): void {
  sendJson(res, 404, { ok: false, error: "Not found" });
}

function computeNextRunAt(params: {
  workflow: Workflow;
  from?: number;
  retryAttempt?: number;
}): number {
  const from = params.from ?? Date.now();
  if (params.retryAttempt && params.retryAttempt > 0) {
    const delayMinutes = Math.min(2 ** (params.retryAttempt - 1), 30);
    return from + delayMinutes * 60_000;
  }
  return from + params.workflow.schedule!.intervalMinutes * 60_000;
}

export class CodexAgentDaemon {
  private readonly startedAt = Date.now();
  private readonly token: string;
  private readonly server: Server;
  private readonly scheduledWorkflows = new Map<string, ScheduledWorkflow>();

  constructor(token: string) {
    this.token = token;
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
  }

  async listen(port: number): Promise<number> {
    await mcp.connectEnabledServers(await listMcpServersV2());
    await this.refreshWorkflowSchedules();
    await new Promise<void>((resolve) => this.server.listen(port, "127.0.0.1", resolve));
    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    for (const scheduled of this.scheduledWorkflows.values()) {
      clearInterval(scheduled.timer);
    }
    this.scheduledWorkflows.clear();
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
      if (!workflow.schedule?.enabled || !workflow.schedule.intervalMinutes) {
        continue;
      }
      const nextRunAt = workflow.schedule.nextRunAt ?? Date.now();
      await this.scheduleWorkflow(workflow, nextRunAt <= Date.now() ? Date.now() + 1_000 : nextRunAt);
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
      } as const;
      const getMap = {
        agents: getAgentV2,
        skills: getSkillV2,
        workflows: getWorkflowV2,
        mcp: getMcpServerV2,
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
        await saveWorkflowV2(body as Workflow);
        await this.refreshWorkflowSchedules();
      } else if (kind === "mcp") {
        await saveMcpServerV2(body as McpServerConfig);
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
      } else {
        sendNotFound(res);
        return;
      }
      sendJson(res, 200, { ok: true });
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
      const body = await readJson<{ title?: string; model?: string; modelRef?: string; systemPrompt: string; agentId?: string; sessionId?: string }>(req);
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
      sendJson(res, 200, await getArtifactRecord(pathParts[1]));
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
          | "browser_open"
          | "browser_snapshot"
          | "browser_click"
          | "browser_type"
          | "browser_wait"
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

    sendNotFound(res);
  }
}
