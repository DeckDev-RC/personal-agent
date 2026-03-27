import { randomUUID } from "node:crypto";
import type { AgentConfig } from "../../src/types/agent.js";
import type {
  AttachmentRecord,
  ArtifactRecord,
  ToolHistoryRecord,
  ToolInvocationResponse,
  WebSearchResult,
} from "../../src/types/runtime.js";
import { getDefaultModelRef } from "../../src/types/model.js";
import { getAgentV2, getSettingsV2 } from "./v2EntityStore.js";
import {
  createApprovalRecord,
  createRunRecord,
  createSessionRecord,
  getSessionRecord,
  resolveApprovalRecord,
  saveMemorySourceContent,
  saveRunArtifactRecord,
  saveMessageRecord,
  saveToolHistoryRecord,
  updateRunRecord,
} from "./v2SessionStore.js";
import { getRiskDecision, invokeRegisteredTool, type RegisteredTool } from "./toolRegistry.js";
import {
  createExecutionContext,
  finishExecution,
  getExecutionContext,
  waitForApproval,
} from "./executionRegistry.js";

export type ToolExecutionEvent =
  | {
      type: "approval_required";
      runId: string;
      sessionId: string;
      approvalId: string;
      toolCallId: string;
      toolName: string;
      reason: string;
      riskLevel: "medium" | "high";
      request: Record<string, unknown>;
    }
  | {
      type: "approval_resolved";
      runId: string;
      sessionId: string;
      approvalId: string;
      approved: boolean;
      note?: string;
    }
  | {
      type: "artifact";
      runId: string;
      sessionId: string;
      artifactId: string;
      label: string;
      artifactType: string;
    }
  | {
      type: "toolresult";
      runId: string;
      sessionId: string;
      toolCallId: string;
      toolName: string;
      content: string;
      isError: boolean;
      source: "native" | "mcp" | "browser";
      serverId?: string;
      serverName?: string;
      attachments?: AttachmentRecord[];
    };

type EffectiveRiskDecision =
  | { mode: "allow"; reason: string; requiresApprovalNow: boolean }
  | { mode: "approval"; reason: string; riskLevel: "medium" | "high"; requiresApprovalNow: boolean }
  | { mode: "deny"; reason: string; requiresApprovalNow: false };

function isTrustedTool(tool: RegisteredTool, agent: AgentConfig | null): boolean {
  const policy = agent?.toolPolicy;
  if (!policy || policy.approvalMode !== "trusted") {
    return false;
  }

  if (tool.source === "native") {
    return policy.trustedToolNames?.includes(tool.publicName) === true;
  }

  if (tool.source === "browser") {
    return policy.trustedToolNames?.includes(tool.publicName) === true;
  }

  return Boolean(tool.serverId && policy.trustedMcpServerIds?.includes(tool.serverId));
}

async function resolveAgentForSession(sessionId: string): Promise<AgentConfig | null> {
  const session = await getSessionRecord(sessionId);
  if (!session?.agentId || session.agentId === "__default__") {
    return null;
  }
  return await getAgentV2(session.agentId);
}

export async function getEffectiveToolRiskDecision(params: {
  tool: RegisteredTool;
  args: Record<string, unknown>;
  sessionId: string;
}): Promise<EffectiveRiskDecision> {
  const agent = await resolveAgentForSession(params.sessionId);
  const policy = agent?.toolPolicy;
  const settings = await getSettingsV2().catch(() => null);

  if (policy && !policy.allowNetworkedTools && params.tool.metadata.capabilities.includes("networked")) {
    return { mode: "deny", reason: "Networked tools are disabled for this agent.", requiresApprovalNow: false };
  }

  if (policy && !policy.allowLongRunningTools && params.tool.metadata.capabilities.includes("long_running")) {
    return { mode: "deny", reason: "Long-running tools are disabled for this agent.", requiresApprovalNow: false };
  }

  const base = getRiskDecision(params.tool, params.args);
  if (base.mode === "approval" && settings?.approvalMode === "free") {
    return {
      mode: "allow",
      reason: `Allowed by free mode: ${params.tool.publicName}`,
      requiresApprovalNow: false,
    };
  }
  if (base.mode === "approval" && isTrustedTool(params.tool, agent)) {
    return {
      mode: "allow",
      reason: `Trusted by agent policy: ${params.tool.publicName}`,
      requiresApprovalNow: false,
    };
  }

  if (base.mode === "approval") {
    return {
      ...base,
      requiresApprovalNow: true,
    };
  }

  if (base.mode === "allow") {
    return {
      ...base,
      requiresApprovalNow: false,
    };
  }

  return {
    ...base,
    requiresApprovalNow: false,
  };
}

async function createToolArtifact(params: {
  sessionId: string;
  runId: string;
  artifact: Omit<ArtifactRecord, "sessionId" | "runId" | "createdAt">;
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<string> {
  const artifact = await saveRunArtifactRecord({
    sessionId: params.sessionId,
    runId: params.runId,
    artifact: params.artifact,
  });
  params.onEvent?.({
    type: "artifact",
    runId: params.runId,
    sessionId: params.sessionId,
    artifactId: artifact.artifactId,
    label: artifact.label,
    artifactType: artifact.type,
  });
  return artifact.artifactId;
}

async function persistResultMetadata(params: {
  sessionId: string;
  runId: string;
  toolName: string;
  metadata: Record<string, unknown> | undefined;
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<string[]> {
  const createdArtifactIds: string[] = [];
  const webSearchResults = Array.isArray(params.metadata?.webSearchResults)
    ? (params.metadata?.webSearchResults as WebSearchResult[])
    : [];

  if (webSearchResults.length > 0) {
    const artifactId = await createToolArtifact({
      sessionId: params.sessionId,
      runId: params.runId,
      artifact: {
        artifactId: randomUUID(),
        type: "search_results",
        label: `Search results: ${params.toolName}`,
        contentText: JSON.stringify(webSearchResults, null, 2),
        metadata: { toolName: params.toolName, resultCount: webSearchResults.length },
      },
      onEvent: params.onEvent,
    });
    createdArtifactIds.push(artifactId);
    for (const result of webSearchResults) {
      await saveMemorySourceContent({
        sourceId: `search:${params.sessionId}:${artifactId}:${result.url}`,
        sourceType: "search_result",
        sessionId: params.sessionId,
        runId: params.runId,
        title: result.title,
        path: result.url,
        content: `${result.title}\n${result.url}\n${result.snippet}`.trim(),
      });
    }
  }

  const artifactHints = Array.isArray(params.metadata?.browserArtifacts)
    ? (params.metadata?.browserArtifacts as Array<Record<string, unknown>>)
    : [];

  for (const artifactHint of artifactHints) {
    const artifactId = await createToolArtifact({
      sessionId: params.sessionId,
      runId: params.runId,
      artifact: {
        artifactId: randomUUID(),
        type: (artifactHint.type as ArtifactRecord["type"]) ?? "browser_log",
        label: String(artifactHint.label ?? params.toolName),
        contentText: typeof artifactHint.contentText === "string" ? artifactHint.contentText : undefined,
        filePath: typeof artifactHint.filePath === "string" ? artifactHint.filePath : undefined,
        metadata: { toolName: params.toolName },
      },
      onEvent: params.onEvent,
    });
    createdArtifactIds.push(artifactId);

    if (typeof artifactHint.memoryContent === "string" && artifactHint.memoryContent.trim()) {
      await saveMemorySourceContent({
        sourceId: `browser:${params.sessionId}:${artifactId}`,
        sourceType: "browser_snapshot",
        sessionId: params.sessionId,
        runId: params.runId,
        title: String(artifactHint.memoryTitle ?? artifactHint.label ?? params.toolName),
        content: artifactHint.memoryContent,
      });
    }
  }

  return createdArtifactIds;
}

async function executeToolBody(params: {
  runId: string;
  sessionId: string;
  toolCallId: string;
  tool: RegisteredTool;
  args: Record<string, unknown>;
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<ToolInvocationResponse> {
  const context = getExecutionContext(params.runId);
  const result = await invokeRegisteredTool(params.tool, params.args, {
    workspaceRoot: (await getSessionRecord(params.sessionId))?.workspaceRoot ?? process.cwd(),
    sessionId: params.sessionId,
    runId: params.runId,
    signal: context?.abortController.signal,
  });

  const artifactsCreated: string[] = [];
  if (result.filesTouched?.length) {
    artifactsCreated.push(
      await createToolArtifact({
        sessionId: params.sessionId,
        runId: params.runId,
        artifact: {
          artifactId: randomUUID(),
          type: "patch",
          label: `Touched files: ${result.filesTouched.join(", ")}`,
          contentText: result.content,
          metadata: { filesTouched: result.filesTouched, toolName: params.tool.publicName },
        },
        onEvent: params.onEvent,
      }),
    );
  }

  if (params.tool.actualName === "run_command") {
    artifactsCreated.push(
      await createToolArtifact({
        sessionId: params.sessionId,
        runId: params.runId,
        artifact: {
          artifactId: randomUUID(),
          type: "log",
          label: `Command output: ${String(params.args.command ?? params.tool.publicName)}`,
          contentText: result.content,
          metadata: { toolName: params.tool.publicName, args: params.args },
        },
        onEvent: params.onEvent,
      }),
    );
  }
  artifactsCreated.push(
    ...(await persistResultMetadata({
      sessionId: params.sessionId,
      runId: params.runId,
      toolName: params.tool.publicName,
      metadata: result.metadata,
      onEvent: params.onEvent,
    })),
  );

  const timedOut = /timed out/i.test(result.content);
  const aborted = context?.abortController.signal.aborted === true || /aborted/i.test(result.content);

  return {
    status: aborted ? "aborted" : result.isError ? "failed" : "completed",
    runId: params.runId,
    sessionId: params.sessionId,
    toolCallId: params.toolCallId,
    toolName: params.tool.publicName,
    content: result.content,
    artifactsCreated,
    filesTouched: result.filesTouched ?? [],
    timedOut,
    aborted,
    isError: result.isError === true,
    metadata: result.metadata,
  };
}

async function finalizeToolInvocation(params: {
  response: ToolInvocationResponse;
  tool: RegisteredTool;
  args: Record<string, unknown>;
  approvalId?: string;
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<ToolInvocationResponse> {
  const attachments = Array.isArray(params.response.metadata?.attachments)
    ? (params.response.metadata.attachments as AttachmentRecord[])
    : undefined;
  const history: ToolHistoryRecord = {
    toolCallId: params.response.toolCallId,
    sessionId: params.response.sessionId,
    runId: params.response.runId,
    toolName: params.tool.publicName,
    source: params.tool.source,
    serverId: params.tool.serverId,
    serverName: params.tool.serverName,
    status:
      params.response.status === "awaiting_approval"
        ? "awaiting_approval"
        : params.response.status === "completed"
          ? "completed"
          : params.response.status === "aborted"
            ? "error"
            : "error",
    args: params.args,
    resultText: params.response.content,
    isError: params.response.isError,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    approvalId: params.approvalId,
  };
  await saveToolHistoryRecord(history);

  if (params.response.status !== "awaiting_approval") {
    await saveMessageRecord({
      id: randomUUID(),
      sessionId: params.response.sessionId,
      runId: params.response.runId,
      role: "tool",
      content: params.response.content,
      timestamp: Date.now(),
      toolCallId: params.response.toolCallId,
      toolName: params.tool.publicName,
      metadata: {
        ...(params.response.metadata ?? {}),
        isError: params.response.isError,
        source: params.tool.source,
      },
    });
    params.onEvent?.({
      type: "toolresult",
      runId: params.response.runId,
      sessionId: params.response.sessionId,
      toolCallId: params.response.toolCallId,
      toolName: params.tool.publicName,
      content: params.response.content,
      isError: params.response.isError,
      source: params.tool.source,
      serverId: params.tool.serverId,
      serverName: params.tool.serverName,
      attachments,
    });
  }

  return params.response;
}

export async function executeTrackedToolInvocation(params: {
  runId: string;
  sessionId: string;
  toolCallId: string;
  tool: RegisteredTool;
  args: Record<string, unknown>;
  waitForApprovalMode: "wait" | "defer";
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<ToolInvocationResponse> {
  const risk = await getEffectiveToolRiskDecision({
    tool: params.tool,
    args: params.args,
    sessionId: params.sessionId,
  });

  if (risk.mode === "deny") {
    const denied: ToolInvocationResponse = {
      status: "failed",
      runId: params.runId,
      sessionId: params.sessionId,
      toolCallId: params.toolCallId,
      toolName: params.tool.publicName,
      content: `Denied: ${risk.reason}`,
      artifactsCreated: [],
      filesTouched: [],
      timedOut: false,
      aborted: false,
      isError: true,
    };
    return await finalizeToolInvocation({
      response: denied,
      tool: params.tool,
      args: params.args,
      onEvent: params.onEvent,
    });
  }

  if (risk.mode === "approval") {
    const approvalId = randomUUID();
    await createApprovalRecord({
      approvalId,
      sessionId: params.sessionId,
      runId: params.runId,
      toolCallId: params.toolCallId,
      toolName: params.tool.publicName,
      riskLevel: risk.riskLevel,
      reason: risk.reason,
      source: params.tool.source,
      request: params.args,
    });
    await updateRunRecord(params.runId, { status: "awaiting_approval" });
    params.onEvent?.({
      type: "approval_required",
      runId: params.runId,
      sessionId: params.sessionId,
      approvalId,
      toolCallId: params.toolCallId,
      toolName: params.tool.publicName,
      reason: risk.reason,
      riskLevel: risk.riskLevel,
      request: params.args,
    });

    const pending: ToolInvocationResponse = {
      status: "awaiting_approval",
      runId: params.runId,
      sessionId: params.sessionId,
      toolCallId: params.toolCallId,
      toolName: params.tool.publicName,
      content: `Awaiting approval: ${risk.reason}`,
      approvalId,
      artifactsCreated: [],
      filesTouched: [],
      timedOut: false,
      aborted: false,
      isError: false,
    };
    await finalizeToolInvocation({
      response: pending,
      tool: params.tool,
      args: params.args,
      approvalId,
      onEvent: params.onEvent,
    });

    if (params.waitForApprovalMode === "defer") {
      void continueDeferredToolInvocation({
        ...params,
        approvalId,
      });
      return pending;
    }

    const decision = await waitForApproval(params.runId, approvalId);
    await resolveApprovalRecord(approvalId, decision);
    params.onEvent?.({
      type: "approval_resolved",
      runId: params.runId,
      sessionId: params.sessionId,
      approvalId,
      approved: decision.approved,
      note: decision.note,
    });
    if (!decision.approved) {
      await updateRunRecord(params.runId, { status: "failed" });
      return await finalizeToolInvocation({
        response: {
          ...pending,
          status: "failed",
          content: `Rejected: ${decision.note?.trim() || risk.reason}`,
          isError: true,
        },
        tool: params.tool,
        args: params.args,
        approvalId,
        onEvent: params.onEvent,
      });
    }
  }

  await updateRunRecord(params.runId, { status: "running" });
  const completed = await executeToolBody(params);
  return await finalizeToolInvocation({
    response: completed,
    tool: params.tool,
    args: params.args,
    onEvent: params.onEvent,
  });
}

async function continueDeferredToolInvocation(params: {
  runId: string;
  sessionId: string;
  toolCallId: string;
  tool: RegisteredTool;
  args: Record<string, unknown>;
  approvalId: string;
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<void> {
  try {
    const decision = await waitForApproval(params.runId, params.approvalId);
    await resolveApprovalRecord(params.approvalId, decision);
    params.onEvent?.({
      type: "approval_resolved",
      runId: params.runId,
      sessionId: params.sessionId,
      approvalId: params.approvalId,
      approved: decision.approved,
      note: decision.note,
    });

    if (!decision.approved) {
      await updateRunRecord(params.runId, { status: "failed" });
      await finalizeToolInvocation({
        response: {
          status: "failed",
          runId: params.runId,
          sessionId: params.sessionId,
          toolCallId: params.toolCallId,
          toolName: params.tool.publicName,
          content: `Rejected: ${decision.note?.trim() || "Approval rejected."}`,
          approvalId: params.approvalId,
          artifactsCreated: [],
          filesTouched: [],
          timedOut: false,
          aborted: false,
          isError: true,
        },
        tool: params.tool,
        args: params.args,
        approvalId: params.approvalId,
        onEvent: params.onEvent,
      });
      return;
    }

    await updateRunRecord(params.runId, { status: "running" });
    await finalizeToolInvocation({
      response: await executeToolBody(params),
      tool: params.tool,
      args: params.args,
      approvalId: params.approvalId,
      onEvent: params.onEvent,
    });
    await updateRunRecord(params.runId, { status: "completed" });
  } catch (error) {
    await updateRunRecord(params.runId, {
      status: getExecutionContext(params.runId)?.abortController.signal.aborted ? "aborted" : "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    finishExecution(params.runId);
  }
}

export async function startDirectToolInvocation(params: {
  sessionId?: string;
  tool: RegisteredTool;
  args: Record<string, unknown>;
  onEvent?: (event: ToolExecutionEvent) => void;
}): Promise<ToolInvocationResponse> {
  const session =
    (params.sessionId ? await getSessionRecord(params.sessionId) : null) ??
    (await createSessionRecord({
      title: "Direct tool invocation",
      model: getDefaultModelRef("openai-codex"),
      systemPrompt: "",
    }));
  const runId = randomUUID();
  const toolCallId = randomUUID();
  await createRunRecord({
    runId,
    sessionId: session.sessionId,
    taskType: "tool_invoke",
    phase: "execute",
    status: "running",
    prompt: `Direct tool invocation: ${params.tool.publicName}`,
    attempt: 0,
  });
  createExecutionContext({ runId, sessionId: session.sessionId });

  try {
    const response = await executeTrackedToolInvocation({
      runId,
      sessionId: session.sessionId,
      toolCallId,
      tool: params.tool,
      args: params.args,
      waitForApprovalMode: "defer",
      onEvent: params.onEvent,
    });

    if (response.status !== "awaiting_approval") {
      await updateRunRecord(runId, {
        status: response.status === "completed" ? "completed" : response.status === "aborted" ? "aborted" : "failed",
      });
      finishExecution(runId);
    }

    return response;
  } catch (error) {
    finishExecution(runId);
    await updateRunRecord(runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
