import { randomUUID } from "node:crypto";
import type { AssistantMessage, Context, Message, ToolResultMessage, Usage } from "@mariozechner/pi-ai";
import { splitModelRef } from "../../src/types/model.js";
import type { Workflow } from "../../src/types/workflow.js";
import type { SessionMessageRecord } from "../../src/types/runtime.js";
import { buildTaskPolicy, classifyTask } from "./taskPolicy.js";
import { streamModelResponse } from "./runtimeCore.js";
import { getSettingsV2, type V2AppSettings } from "./v2EntityStore.js";
import {
  createRunRecord,
  createSessionRecord,
  getSessionRecord,
  listMessagesForSession,
  patchSessionRecord,
  saveArtifactRecord,
  saveCheckpointRecord,
  saveMessageRecord,
  searchMemoryRecords,
  updateRunRecord,
} from "./v2SessionStore.js";
import { buildRegisteredTools, splitToolsByMutability, type RegisteredTool } from "./toolRegistry.js";
import {
  abortExecution,
  createExecutionContext,
  finishExecution,
  getExecutionContext,
  resolveExecutionApproval,
} from "./executionRegistry.js";
import { executeTrackedToolInvocation, startDirectToolInvocation } from "./toolExecutionService.js";
import { enqueueScopedJob } from "./jobQueue.js";
import { gatherContextForPrompt, reindexWorkspace } from "./workspaceIndex.js";

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export type RuntimeEvent =
  | { type: "phase"; runId: string; sessionId: string; phase: "plan" | "execute" | "review" | "repair" | "complete" }
  | { type: "text_delta"; runId: string; sessionId: string; phase: string; delta: string }
  | { type: "thinking_delta"; runId: string; sessionId: string; phase: string; delta: string }
  | { type: "toolcall"; runId: string; sessionId: string; toolCallId: string; toolName: string; args: Record<string, unknown>; source: "native" | "mcp" | "browser"; serverId?: string; serverName?: string }
  | { type: "toolresult"; runId: string; sessionId: string; toolCallId: string; toolName: string; content: string; isError: boolean; source: "native" | "mcp" | "browser"; serverId?: string; serverName?: string }
  | { type: "approval_required"; runId: string; sessionId: string; approvalId: string; toolCallId: string; toolName: string; reason: string; riskLevel: "medium" | "high"; request: Record<string, unknown> }
  | { type: "approval_resolved"; runId: string; sessionId: string; approvalId: string; approved: boolean; note?: string }
  | { type: "artifact"; runId: string; sessionId: string; artifactId: string; label: string; artifactType: string }
  | { type: "done"; runId: string; sessionId: string; text: string; review: string; success: boolean }
  | { type: "error"; runId: string; sessionId: string; message: string };

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toAssistantMessage(message: SessionMessageRecord, modelRef: string): AssistantMessage {
  const resolved = splitModelRef(message.model ?? modelRef);
  const content: AssistantMessage["content"] = [];
  if (message.thinkingContent) {
    content.push({ type: "thinking", thinking: message.thinkingContent });
  }
  content.push({ type: "text", text: message.content });
  return {
    role: "assistant",
    content,
    api:
      resolved.provider === "anthropic"
        ? "anthropic-messages"
        : resolved.provider === "ollama"
          ? "openai-responses"
          : "openai-codex-responses",
    provider: resolved.provider,
    model: resolved.modelRef,
    usage: EMPTY_USAGE,
    stopReason: "stop",
    timestamp: message.timestamp,
  };
}

function buildToolResultMessage(params: {
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
}): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    content: [{ type: "text", text: params.content }],
    isError: params.isError,
    timestamp: Date.now(),
  };
}

function buildContextMessages(messages: SessionMessageRecord[], modelRef: string): Message[] {
  return messages.map<Message>((message) => {
    if (message.role === "assistant" || message.role === "system") {
      const assistant = toAssistantMessage(message, modelRef);
      const toolCalls = Array.isArray(message.metadata?.toolCalls)
        ? (message.metadata?.toolCalls as Array<Record<string, unknown>>)
        : [];
      if (toolCalls.length > 0 && assistant.role === "assistant") {
        assistant.content = [
          ...assistant.content,
          ...toolCalls.map((toolCall) => ({
            type: "toolCall" as const,
            id: String(toolCall.id ?? ""),
            name: String(toolCall.name ?? ""),
            arguments: (toolCall.arguments as Record<string, unknown> | undefined) ?? {},
          })),
        ];
      }
      return assistant;
    }
    if (message.role === "tool") {
      return buildToolResultMessage({
        toolCallId: message.toolCallId ?? message.id,
        toolName: message.toolName ?? "tool",
        content: message.content,
        isError: Boolean(message.metadata?.isError),
      });
    }
    return {
      role: "user",
      content: message.content,
      timestamp: message.timestamp,
    };
  });
}

function buildCompactedMessages(
  messages: SessionMessageRecord[],
  settings: V2AppSettings,
): { contextMessages: Message[]; checkpointText?: string } {
  const totalTokens = messages.reduce(
    (sum, message) => sum + estimateTokens(message.content || "") + estimateTokens(message.thinkingContent || ""),
    0,
  );
  if (totalTokens <= settings.compactAtTokens) {
    return {
      contextMessages: buildContextMessages(messages, settings.defaultModelRef),
    };
  }

  const recent: SessionMessageRecord[] = [];
  let recentTokens = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const messageTokens = estimateTokens(message.content || "") + estimateTokens(message.thinkingContent || "");
    if (recentTokens + messageTokens > Math.floor(settings.compactAtTokens * 0.7) && recent.length > 0) {
      break;
    }
    recent.unshift(message);
    recentTokens += messageTokens;
  }

  const summaryLines = messages
    .slice(0, Math.max(0, messages.length - recent.length))
    .slice(-10)
    .map((message) => `[${message.role}] ${message.content.slice(0, 180)}`);
  const checkpointText =
    "Context checkpoint:\n" +
    (summaryLines.length > 0 ? summaryLines.join("\n") : "Earlier turns compacted.");

  return {
    contextMessages: [
      {
        role: "user",
        content: checkpointText,
        timestamp: Date.now(),
      },
      ...buildContextMessages(recent, settings.defaultModelRef),
    ],
    checkpointText,
  };
}

async function runModelPhase(params: {
  runId: string;
  sessionId: string;
  phase: "plan" | "execute" | "review" | "repair";
  prompt: string;
  settings: V2AppSettings;
  modelRef: string;
  systemPrompt: string;
  messages: SessionMessageRecord[];
  tools: RegisteredTool[];
  onEvent: (event: RuntimeEvent) => void;
}): Promise<{ text: string; usedTools: number }> {
  const active = getExecutionContext(params.runId);
  if (!active) {
    throw new Error("Run not active.");
  }

  const compacted = buildCompactedMessages(params.messages, params.settings);
  if (compacted.checkpointText) {
    await saveCheckpointRecord({
      sessionId: params.sessionId,
      runId: params.runId,
      summary: compacted.checkpointText,
      decisions: [],
      relevantFiles: [],
      pendingApprovals: [],
    });
  }

  const retrievalContext = await gatherContextForPrompt({
    sessionId: params.sessionId,
    prompt: params.prompt,
  });
  const context: Context = {
    systemPrompt: [params.systemPrompt, retrievalContext].filter(Boolean).join("\n\n====\n\n"),
    messages: [
      ...compacted.contextMessages,
      {
        role: "user",
        content: params.prompt,
        timestamp: Date.now(),
      },
    ],
    tools: params.tools.map((tool) => tool.tool),
  };

  let finalMessage: AssistantMessage | null = null;
  let text = "";
  let toolCount = 0;

  while (true) {
    finalMessage = null;
    for await (const event of streamModelResponse({
      modelRef: params.modelRef,
      context,
      reasoningEffort: params.phase === "review" ? "high" : params.settings.reasoningEffort,
      contextWindow: params.settings.contextWindow,
      maxOutputTokens: params.settings.maxOutputTokens,
      signal: active.abortController.signal,
    })) {
      switch (event.type) {
        case "text_delta":
          params.onEvent({ type: "text_delta", runId: params.runId, sessionId: params.sessionId, phase: params.phase, delta: event.delta });
          text += event.delta;
          break;
        case "thinking_delta":
          params.onEvent({ type: "thinking_delta", runId: params.runId, sessionId: params.sessionId, phase: params.phase, delta: event.delta });
          break;
        case "toolcall_end": {
          const tool = params.tools.find((entry) => entry.publicName === event.toolName);
          params.onEvent({
            type: "toolcall",
            runId: params.runId,
            sessionId: params.sessionId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            source: tool?.source ?? "native",
            serverId: tool?.serverId,
            serverName: tool?.serverName,
          });
          break;
        }
        case "done":
          finalMessage = event.raw;
          break;
        case "error":
          throw new Error(event.message);
      }
    }

    if (!finalMessage) {
      throw new Error("No assistant message produced.");
    }

    context.messages.push(finalMessage);
    const toolCalls = finalMessage.content.filter(
      (block): block is Extract<AssistantMessage["content"][number], { type: "toolCall" }> => block.type === "toolCall",
    );

    if (toolCalls.length > 0) {
      const textBlocks = finalMessage.content.filter(
        (block): block is Extract<AssistantMessage["content"][number], { type: "text" }> => block.type === "text",
      );
      const thinkingBlocks = finalMessage.content.filter(
        (block): block is Extract<AssistantMessage["content"][number], { type: "thinking" }> => block.type === "thinking",
      );
      await saveMessageRecord({
        id: randomUUID(),
        sessionId: params.sessionId,
        runId: params.runId,
        role: "assistant",
        content: textBlocks.map((block) => block.text).join(""),
        thinkingContent: thinkingBlocks.map((block) => block.thinking).join(""),
        model: params.modelRef,
        timestamp: Date.now(),
        phase: params.phase,
        kind: "assistant-toolcall",
        metadata: {
          toolCalls: toolCalls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          })),
        },
      });
    }

    if (finalMessage.stopReason !== "toolUse" || toolCalls.length === 0) {
      return { text, usedTools: toolCount };
    }

    for (const toolCall of toolCalls) {
      const tool = params.tools.find((entry) => entry.publicName === toolCall.name);
      const args = toolCall.arguments as Record<string, unknown>;
      toolCount += 1;
      if (!tool) {
        const missing = `Tool "${toolCall.name}" is not available.`;
        context.messages.push(buildToolResultMessage({ toolCallId: toolCall.id, toolName: toolCall.name, content: missing, isError: true }));
        params.onEvent({ type: "toolresult", runId: params.runId, sessionId: params.sessionId, toolCallId: toolCall.id, toolName: toolCall.name, content: missing, isError: true, source: "native" });
        continue;
      }
      const response = await executeTrackedToolInvocation({
        runId: params.runId,
        sessionId: params.sessionId,
        toolCallId: toolCall.id,
        tool,
        args,
        waitForApprovalMode: "wait",
        onEvent: params.onEvent,
      });
      const resultText = response.content;
      const isError = response.isError;
      context.messages.push(buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: tool.publicName,
        content: resultText,
        isError,
      }));
    }
  }
}

async function persistAssistantPhaseMessage(params: {
  runId: string;
  sessionId: string;
  phase?: "plan" | "execute" | "review" | "repair";
  modelRef: string;
  content: string;
  kind?: string;
}) {
  await saveMessageRecord({
    id: randomUUID(),
    sessionId: params.sessionId,
    runId: params.runId,
    role: "assistant",
    content: params.content,
    model: params.modelRef,
    timestamp: Date.now(),
    phase: params.phase,
    kind: params.kind,
  });
}

async function executeSimplePromptRun(params: {
  runId: string;
  sessionId: string;
  prompt: string;
  settings: V2AppSettings;
  systemPrompt: string;
  mcpServerIds: string[];
  onEvent: (event: RuntimeEvent) => void;
  workflowId?: string;
  taskType: "chat_simple";
}) {
  const policy = buildTaskPolicy(params.taskType, params.settings);
  const run = await createRunRecord({
    runId: params.runId,
    sessionId: params.sessionId,
    workflowId: params.workflowId,
    taskType: params.taskType,
    phase: "execute",
    status: "running",
    prompt: params.prompt,
    attempt: 0,
  });

  const activeRun = createExecutionContext({
    runId: run.runId,
    sessionId: params.sessionId,
  });

  try {
    const existingMessages = await listMessagesForSession(params.sessionId);
    const registeredTools = buildRegisteredTools(params.mcpServerIds);

    const result = await runModelPhase({
      runId: run.runId,
      sessionId: params.sessionId,
      phase: "execute",
      prompt: params.prompt,
      settings: params.settings,
      modelRef: policy.modelRef,
      systemPrompt: params.systemPrompt,
      messages: existingMessages,
      tools: registeredTools,
      onEvent: params.onEvent,
    });

    await persistAssistantPhaseMessage({
      runId: run.runId,
      sessionId: params.sessionId,
      modelRef: policy.modelRef,
      content: result.text,
    });

    await updateRunRecord(run.runId, {
      status: "completed",
      phase: "complete",
      reviewText: "",
      attempt: 0,
    });

    params.onEvent({
      type: "done",
      runId: run.runId,
      sessionId: params.sessionId,
      text: result.text,
      review: "",
      success: true,
    });

    return run.runId;
  } catch (error) {
    await updateRunRecord(run.runId, {
      status: activeRun.abortController.signal.aborted ? "aborted" : "failed",
      phase: "complete",
      error: error instanceof Error ? error.message : String(error),
    });
    params.onEvent({
      type: "error",
      runId: run.runId,
      sessionId: params.sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    finishExecution(run.runId);
  }
}

async function executePromptRun(params: {
  runId: string;
  sessionId: string;
  prompt: string;
  settings: V2AppSettings;
  systemPrompt: string;
  mcpServerIds: string[];
  onEvent: (event: RuntimeEvent) => void;
  workflowId?: string;
  taskType: Exclude<ReturnType<typeof classifyTask>, "chat_simple">;
}) {
  const policy = buildTaskPolicy(params.taskType, params.settings);
  const run = await createRunRecord({
    runId: params.runId,
    sessionId: params.sessionId,
    workflowId: params.workflowId,
    taskType: params.taskType,
    phase: "plan",
    status: "running",
    prompt: params.prompt,
    attempt: 0,
  });

  const activeRun = createExecutionContext({
    runId: run.runId,
    sessionId: params.sessionId,
  });

  try {
    const session = await getSessionRecord(params.sessionId);
    const existingMessages = session ? await listMessagesForSession(params.sessionId) : [];
    const registeredTools = buildRegisteredTools(params.mcpServerIds);
    const toolSplit = splitToolsByMutability(registeredTools);

    params.onEvent({ type: "phase", runId: run.runId, sessionId: params.sessionId, phase: "plan" });
    const planPrompt =
      `Task:\n${params.prompt}\n\n` +
      "Produce a concise execution plan with explicit success criteria. Do not make mutating changes in this phase.";
    const plan = await runModelPhase({
      runId: run.runId,
      sessionId: params.sessionId,
      phase: "plan",
      prompt: planPrompt,
      settings: params.settings,
      modelRef: policy.modelRef,
      systemPrompt: params.systemPrompt,
      messages: existingMessages,
      tools: toolSplit.readOnly,
      onEvent: params.onEvent,
    });
    await updateRunRecord(run.runId, { planText: plan.text, phase: "execute" });
    await persistAssistantPhaseMessage({
      runId: run.runId,
      sessionId: params.sessionId,
      phase: "plan",
      modelRef: policy.modelRef,
      content: plan.text,
    });
    await saveArtifactRecord({
      artifactId: randomUUID(),
      sessionId: params.sessionId,
      runId: run.runId,
      type: "plan",
      label: "Execution plan",
      contentText: plan.text,
      metadata: { taskType: params.taskType },
    });

    let latestExecutionText = "";
    let attempt = 0;
    let reviewText = "";
    let success = false;

    while (attempt <= 2 && !success) {
      const phase = attempt === 0 ? "execute" : "repair";
      params.onEvent({ type: "phase", runId: run.runId, sessionId: params.sessionId, phase });
      const phasePrompt =
        phase === "execute"
          ? `Original task:\n${params.prompt}\n\nApproved plan:\n${plan.text}`
          : `Original task:\n${params.prompt}\n\nPrevious review:\n${reviewText}\n\nApproved plan:\n${plan.text}`;

      const executeResult = await runModelPhase({
        runId: run.runId,
        sessionId: params.sessionId,
        phase,
        prompt: phasePrompt,
        settings: params.settings,
        modelRef: policy.modelRef,
        systemPrompt: params.systemPrompt,
        messages: await listMessagesForSession(params.sessionId),
        tools: toolSplit.all,
        onEvent: params.onEvent,
      });
      latestExecutionText = executeResult.text;
      await persistAssistantPhaseMessage({
        runId: run.runId,
        sessionId: params.sessionId,
        phase,
        modelRef: policy.modelRef,
        content: latestExecutionText,
      });

      params.onEvent({ type: "phase", runId: run.runId, sessionId: params.sessionId, phase: "review" });
      const reviewPolicy = buildTaskPolicy("review_fix", params.settings);
      const reviewResult = await runModelPhase({
        runId: run.runId,
        sessionId: params.sessionId,
        phase: "review",
        prompt:
          `Original task:\n${params.prompt}\n\nPlan:\n${plan.text}\n\nExecution output:\n${latestExecutionText}\n\n` +
          "Review the result. First line must be exactly REVIEW_STATUS: success or REVIEW_STATUS: retry. Then provide a short review.",
        settings: params.settings,
        modelRef: reviewPolicy.modelRef,
        systemPrompt: params.systemPrompt,
        messages: await listMessagesForSession(params.sessionId),
        tools: toolSplit.readOnly,
        onEvent: params.onEvent,
      });
      reviewText = reviewResult.text;
      await persistAssistantPhaseMessage({
        runId: run.runId,
        sessionId: params.sessionId,
        phase: "review",
        modelRef: reviewPolicy.modelRef,
        content: reviewText,
      });
      await updateRunRecord(run.runId, {
        phase: "review",
        reviewText,
        attempt,
      });
      await saveArtifactRecord({
        artifactId: randomUUID(),
        sessionId: params.sessionId,
        runId: run.runId,
        type: "review",
        label: `Review attempt ${attempt + 1}`,
        contentText: reviewText,
        metadata: { attempt },
      });

      success = /^REVIEW_STATUS:\s*success\b/im.test(reviewText);
      if (!success) {
        attempt += 1;
        await updateRunRecord(run.runId, { status: attempt <= 2 ? "retrying" : "failed", phase: attempt <= 2 ? "repair" : "complete", attempt });
      }
    }

    await updateRunRecord(run.runId, {
      status: success ? "completed" : "failed",
      phase: "complete",
      reviewText,
      attempt,
    });
    params.onEvent({ type: "phase", runId: run.runId, sessionId: params.sessionId, phase: "complete" });
    params.onEvent({
      type: "done",
      runId: run.runId,
      sessionId: params.sessionId,
      text: latestExecutionText,
      review: reviewText,
      success,
    });
    return run.runId;
  } catch (error) {
    await updateRunRecord(run.runId, {
      status: activeRun.abortController.signal.aborted ? "aborted" : "failed",
      phase: "complete",
      error: error instanceof Error ? error.message : String(error),
    });
    params.onEvent({
      type: "error",
      runId: run.runId,
      sessionId: params.sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    finishExecution(run.runId);
  }
}

export async function startPromptRun(params: {
  sessionId?: string;
  title?: string;
  agentId?: string;
  modelRef: string;
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
  onEvent: (event: RuntimeEvent) => void;
}): Promise<{ runId: string; sessionId: string; uiMode: "simple" | "agentic" }> {
  const settings = await getSettingsV2();
  const existingSession = params.sessionId ? await getSessionRecord(params.sessionId) : null;
  const session =
    existingSession ??
    (await createSessionRecord({
      sessionId: params.sessionId,
      title: params.title,
      model: params.modelRef,
      systemPrompt: params.systemPrompt,
      agentId: params.agentId,
    }));
  const taskType = classifyTask({
    prompt: params.prompt,
    workspaceRoot: session.workspaceRoot,
  });
  const uiMode: "simple" | "agentic" = !settings.planMode && taskType === "chat_simple" ? "simple" : "agentic";

  await patchSessionRecord(session.sessionId, {
    title: session.messageCount === 0 ? params.prompt.slice(0, 60) : session.title,
    model: params.modelRef,
    systemPrompt: params.systemPrompt,
    agentId: params.agentId,
  });
  const attachmentSummary =
    params.attachments && params.attachments.length > 0
      ? "\n\nAttachments:\n" +
        params.attachments
          .map((attachment) => `- ${attachment.fileName} (${attachment.mimeType}, ${attachment.byteSize} bytes)`)
          .join("\n")
      : "";
  await saveMessageRecord({
    id: randomUUID(),
    sessionId: session.sessionId,
    role: "user",
    content: `${params.prompt}${attachmentSummary}`,
    timestamp: Date.now(),
    metadata: params.attachments?.length
      ? {
          attachments: params.attachments,
        }
      : undefined,
  });

  const runId = randomUUID();
  if (uiMode === "simple") {
    void executeSimplePromptRun({
      runId,
      sessionId: session.sessionId,
      prompt: params.prompt,
      settings,
      systemPrompt: params.systemPrompt,
      mcpServerIds: params.mcpServerIds ?? [],
      onEvent: params.onEvent,
      taskType: "chat_simple",
    }).catch(() => {
      // surfaced via events
    });
  } else {
    const agenticTaskType =
      taskType === "chat_simple" ? "plan_research" : taskType;
    void executePromptRun({
      runId,
      sessionId: session.sessionId,
      prompt: params.prompt,
      settings,
      systemPrompt: params.systemPrompt,
      mcpServerIds: params.mcpServerIds ?? [],
      onEvent: params.onEvent,
      taskType: agenticTaskType,
    }).catch(() => {
      // surfaced via events
    });
  }

  return { runId, sessionId: session.sessionId, uiMode };
}

export function abortRun(runId: string): boolean {
  return abortExecution(runId);
}

export async function resolveRunApproval(params: {
  runId: string;
  approvalId: string;
  approved: boolean;
  note?: string;
}): Promise<boolean> {
  return await resolveExecutionApproval(params);
}

function getNestedValue(variables: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, variables);
}

function setNestedValue(target: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function stringifyWorkflowValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function renderWorkflowTemplate(input: string | undefined, variables: Record<string, unknown>): string {
  if (!input) return "";
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) =>
    stringifyWorkflowValue(getNestedValue(variables, key)),
  );
}

function tokenizeWorkflowQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((part) => part.trim().replace(/"/g, ""))
    .filter(Boolean)
    .map((part) => `"${part}"`)
    .join(" OR ");
}

function evaluateWorkflowCondition(condition: string | undefined, variables: Record<string, unknown>): boolean {
  const rendered = renderWorkflowTemplate(condition, variables).trim();
  if (!rendered) return false;
  if (rendered.startsWith("!")) {
    return !String(getNestedValue(variables, rendered.slice(1)) ?? "").trim();
  }
  const comparison = rendered.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=)\s*(.+)$/);
  if (comparison) {
    const [, key, operator, rawValue] = comparison;
    const left = stringifyWorkflowValue(getNestedValue(variables, key));
    const right = rawValue.trim().replace(/^["']|["']$/g, "");
    return operator === "==" ? left === right : left !== right;
  }
  return Boolean(getNestedValue(variables, rendered) ?? rendered);
}

function resolveWorkflowToolArgs(
  args: Record<string, string> | undefined,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  if (!args) return {};
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, renderWorkflowTemplate(value, variables)]),
  );
}

export async function startWorkflowRun(params: {
  workflow: Workflow;
  modelRef: string;
  systemPrompt: string;
  onEvent: (event: RuntimeEvent) => void;
}): Promise<{ sessionId: string; variables: Record<string, unknown>; stepOutputs: Record<string, unknown> }> {
  const session = await createSessionRecord({
    title: params.workflow.name,
    model: params.modelRef,
    systemPrompt: params.systemPrompt,
  });

  const settings = await getSettingsV2();
  const variables: Record<string, unknown> = { ...params.workflow.variables };
  const stepOutputs: Record<string, unknown> = {};
  const registeredTools = buildRegisteredTools([]);

  for (let index = 0; index < params.workflow.steps.length; index += 1) {
    const step = params.workflow.steps[index];
    let success = true;
    let output: unknown = "";
    const artifacts: string[] = [];

    if (step.type === "conditional") {
      success = evaluateWorkflowCondition(step.condition, variables);
      output = success;
    } else if (step.type === "delay") {
      await new Promise<void>((resolve) => setTimeout(resolve, Number(step.delayMs ?? 0)));
      output = `Delayed ${step.delayMs ?? 0}ms`;
    } else if (step.type === "tool-call") {
      const tool = registeredTools.find((entry) => entry.publicName === step.toolName);
      if (!tool) {
        throw new Error(`Workflow tool "${step.toolName}" not found.`);
      }
      const result = await startDirectToolInvocation({
        sessionId: session.sessionId,
        tool,
        args: resolveWorkflowToolArgs(step.toolArgs, variables),
      });
      success = !result.isError;
      output = result.content;
      artifacts.push(...result.artifactsCreated);
      setNestedValue(variables, `step.${step.id}.toolResult`, result);
    } else if (step.type === "memory-query") {
      const query = tokenizeWorkflowQuery(renderWorkflowTemplate(step.memoryQuery, variables));
      const results = await searchMemoryRecords({
        query,
        sessionId: session.sessionId,
        workspaceId: session.workspaceId,
        limit: step.memoryLimit ?? 4,
      });
      output = results.map((item) => `${item.title}\n${item.content}`).join("\n\n---\n\n");
      setNestedValue(variables, `step.${step.id}.memoryResults`, results);
    } else if (step.type === "reindex-workspace") {
      const workspaceScopeId = session.workspaceId ?? session.sessionId;
      const job = await enqueueScopedJob({
        kind: "workspace_reindex",
        scopeType: "workspace",
        scopeId: workspaceScopeId,
        payload: {
          sessionId: session.sessionId,
          workspaceId: session.workspaceId,
          trigger: "manual",
          stepId: step.id,
        },
        run: async () => {
          await reindexWorkspace(session.sessionId);
          return "Workspace reindexed";
        },
      });
      output = `Workspace reindex job queued: ${job.jobId}`;
      setNestedValue(variables, `step.${step.id}.jobId`, job.jobId);
      setNestedValue(variables, `step.${step.id}.job`, job);
    } else {
      const prompt = renderWorkflowTemplate(step.prompt?.trim(), variables);
      if (!prompt) {
        continue;
      }
      await executePromptRun({
        runId: randomUUID(),
        sessionId: session.sessionId,
        prompt,
        settings,
        systemPrompt: params.systemPrompt,
        mcpServerIds: [],
        onEvent: params.onEvent,
        workflowId: params.workflow.id,
        taskType: "plan_research",
      });
      const messages = await listMessagesForSession(session.sessionId);
      output =
        [...messages]
          .reverse()
          .find((message) => message.role === "assistant")?.content ?? "";
    }

    setNestedValue(variables, `step.${step.id}.status`, success ? "success" : "error");
    setNestedValue(variables, `step.${step.id}.output`, output);
    setNestedValue(variables, `step.${step.id}.artifacts`, artifacts);
    stepOutputs[step.id] = {
      status: success ? "success" : "error",
      output,
      artifacts,
      toolResult: getNestedValue(variables, `step.${step.id}.toolResult`),
      memoryResults: getNestedValue(variables, `step.${step.id}.memoryResults`),
      jobId: getNestedValue(variables, `step.${step.id}.jobId`),
    };

    const nextStepId = success ? step.onSuccess : step.onFailure;
    if (nextStepId) {
      const nextIndex = params.workflow.steps.findIndex((candidate) => candidate.id === nextStepId);
      if (nextIndex >= 0) {
        index = nextIndex - 1;
      }
    }
  }

  await saveArtifactRecord({
    artifactId: randomUUID(),
    sessionId: session.sessionId,
    runId: "workflow",
    type: "report",
    label: `Workflow output: ${params.workflow.name}`,
    contentText: JSON.stringify({ variables, stepOutputs }, null, 2),
    metadata: { workflowId: params.workflow.id },
  });

  return { sessionId: session.sessionId, variables, stepOutputs };
}
