import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import TurndownService from "turndown";
import { validateWorkflowSchedule, normalizeWorkflowSchedule } from "../../src/workflowSchedule.js";
import type { AutomationDraft, AutomationPackage } from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import type { ReminderRecurrence } from "../../src/types/reminder.js";
import type { WebRecipe, WebRecipeFieldDefinition } from "../../src/types/webRecipe.js";
import type { Workflow, WorkflowDocumentInput, WorkflowExceptionPolicy, WorkflowStep } from "../../src/types/workflow.js";
import { applySimplePatch } from "./simplePatch.js";
import {
  activateAutomationPackage,
  deactivateAutomationPackage,
  inspectAutomationPackageState,
  validateAutomationPackageState,
} from "./automationActivation.js";
import { compileAutomationDraft } from "./automationCompiler.js";
import {
  deleteAutomationPackage,
  getAutomationPackage,
  listAutomationPackages,
  normalizeAutomationPackage,
  saveAutomationPackage,
  summarizeAutomationPackage,
} from "./automationPackageStore.js";
import { planAutomationFromPrompt } from "./automationPlanner.js";
import type { ToolMetadata } from "../../src/types/runtime.js";
import { validateAutomationDraft } from "./automationValidator.js";
import { deleteConnection, getConnection, listConnections, markConnectionValidated, normalizeConnection, resolveConnectionSessionId, saveConnection, summarizeConnection } from "./connectionManager.js";
import { createJob, deleteJob, getJob, listJobs, toggleJob, updateJob, type CronJob } from "./cronScheduler.js";
import { normalizeProjectContext } from "./projectContext.js";
import { createReminder, listReminders } from "./reminderScheduler.js";
import { runWebSearch } from "./webSearchProvider.js";
import { spawnSubagent } from "./subagentManager.js";
import { completeTask, createTask, deleteTask, listTasks, updateTask } from "./taskManager.js";
import { getProjectContextV2, getWorkflowV2, listProjectContextsV2, listWorkflowsV2, saveProjectContextV2, saveWorkflowV2, deleteProjectContextV2, deleteWorkflowV2 } from "./v2EntityStore.js";
import { getSessionRecord } from "./v2SessionStore.js";
import { deleteWebRecipe, executeWebRecipe, getWebRecipe, listWebRecipes, normalizeWebRecipe, saveWebRecipe } from "./webRecipes.js";
import { generateImages } from "./imageGenerator.js";
import { synthesizeSpeech } from "./ttsEngine.js";

export type NativeToolName =
  | "list_dir"
  | "search"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "run_command"
  | "apply_patch"
  | "diff_status"
  | "diff_file"
  | "web_search"
  | "http_fetch"
  | "generate_image"
  | "text_to_speech"
  | "run_recipe"
  | "manage_workflows"
  | "manage_recipes"
  | "manage_cron"
  | "manage_connections"
  | "manage_automation_packages"
  | "manage_contexts"
  | "manage_tasks"
  | "set_reminder"
  | "list_reminders"
  | "spawn_agent"
  | "author_automation"
  | "validate_automation"
  | "activate_automation"
  | "query_database"
  | "render_canvas"
  | "execute_code";

export type ToolRiskDecision =
  | { mode: "allow"; reason: string }
  | { mode: "approval"; reason: string; riskLevel: "medium" | "high" }
  | { mode: "deny"; reason: string };

export type NativeToolContext = {
  workspaceRoot: string;
  sessionId?: string;
  runId?: string;
  signal?: AbortSignal;
};

export type NativeToolExecutionResult = {
  content: string;
  filesTouched?: string[];
  isError?: boolean;
  metadata?: Record<string, unknown>;
};

export type NativeToolDefinition = Tool & {
  metadata: ToolMetadata;
};

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage"]);
const SAFE_COMMANDS = new Set(["git", "pwd", "ls", "dir", "Get-Location", "Get-ChildItem", "type", "cat"]);
const MUTATING_COMMAND_HINTS = /\b(npm install|pnpm install|yarn add|git reset|git checkout|rm |del |move |copy |mkdir |rmdir )\b/i;
const SHELL_CHAINING = /[;&|><]/;
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

function formatTaskSummary(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  projectContextId?: string;
}): string {
  const meta = [task.status, task.priority];
  if (task.dueDate) {
    meta.push(`due ${task.dueDate}`);
  }
  if (task.projectContextId) {
    meta.push(`context ${task.projectContextId}`);
  }
  return `- ${task.title} (${meta.join(", ")}) [${task.id}]`;
}

function formatWorkflowSummary(workflow: Pick<Workflow, "id" | "name" | "steps" | "recipeIds" | "connectionIds" | "schedule">): string {
  const meta = [`${workflow.steps.length} step(s)`];
  if (workflow.recipeIds?.length) {
    meta.push(`${workflow.recipeIds.length} recipe(s)`);
  }
  if (workflow.connectionIds?.length) {
    meta.push(`${workflow.connectionIds.length} connection(s)`);
  }
  if (workflow.schedule?.enabled) {
    meta.push(workflow.schedule.mode === "cron" ? `cron ${workflow.schedule.cronExpression}` : `every ${workflow.schedule.intervalMinutes} min`);
  }
  return `- ${workflow.name} (${meta.join(", ")}) [${workflow.id}]`;
}

function formatRecipeSummary(recipe: Pick<WebRecipe, "id" | "name" | "steps" | "targetSite" | "connectionId">): string {
  const meta = [`${recipe.steps.length} step(s)`];
  if (recipe.targetSite) {
    meta.push(recipe.targetSite);
  }
  if (recipe.connectionId) {
    meta.push(`connection ${recipe.connectionId}`);
  }
  return `- ${recipe.name} (${meta.join(", ")}) [${recipe.id}]`;
}

function formatCronSummary(job: Pick<CronJob, "id" | "name" | "cronExpr" | "enabled" | "actionType">): string {
  const meta = [job.cronExpr, job.actionType, job.enabled ? "enabled" : "disabled"];
  return `- ${job.name} (${meta.join(", ")}) [${job.id}]`;
}

function formatContextSummary(projectContext: Pick<ProjectContext, "id" | "name" | "stakeholders">): string {
  const meta = [`${projectContext.stakeholders.length} stakeholder(s)`];
  return `- ${projectContext.name} (${meta.join(", ")}) [${projectContext.id}]`;
}

function formatAutomationDraftSummary(draft: AutomationDraft): string {
  const meta = [
    draft.status,
    draft.activationMode,
    `${draft.workflow ? 1 : 0} workflow`,
    draft.recipes.length > 0 ? `${draft.recipes.length} recipe(s)` : undefined,
    draft.cronJobs.length > 0 ? `${draft.cronJobs.length} cron(s)` : undefined,
    draft.connections.length > 0 ? `${draft.connections.length} connection(s)` : undefined,
  ].filter(Boolean);
  return `- ${draft.title} (${meta.join(", ")}) [${draft.id}]`;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function pickObject(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = asObject(args[key]);
    if (value) {
      return value;
    }
  }
  return args;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeRecordOfStrings(value: unknown): Record<string, string> {
  const record = asObject(value);
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, String(item ?? "")]),
  );
}

function normalizeRecipeFieldDefinitions(value: unknown): WebRecipeFieldDefinition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry, index) => ({
      key: String(entry.key ?? `field_${index + 1}`).trim(),
      label: String(entry.label ?? entry.key ?? `Field ${index + 1}`).trim(),
      type:
        entry.type === "number" || entry.type === "boolean" || entry.type === "json"
          ? entry.type
          : "string",
      description: typeof entry.description === "string" ? entry.description.trim() || undefined : undefined,
      required: entry.required === true,
    }));
}

function normalizeWorkflowExceptionPolicy(value: unknown): WorkflowExceptionPolicy | undefined {
  const record = asObject(value);
  if (!record) {
    return undefined;
  }
  return {
    createTaskOnFailure: record.createTaskOnFailure === true,
    createReminderOnBlocked: record.createReminderOnBlocked === true,
    notifyOnDegraded: record.notifyOnDegraded === true,
    checkpointOnFailure: record.checkpointOnFailure === true,
    maxRecoveryAttempts:
      typeof record.maxRecoveryAttempts === "number"
        ? Math.max(0, Math.round(record.maxRecoveryAttempts))
        : undefined,
  };
}

function normalizeWorkflowDocumentInputs(value: unknown): WorkflowDocumentInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry, index) => ({
      id: String(entry.id ?? `document_${index + 1}`).trim(),
      label: String(entry.label ?? `Documento ${index + 1}`).trim(),
      mimeTypes: normalizeStringArray(entry.mimeTypes),
      required: entry.required === true,
      templateId: typeof entry.templateId === "string" ? entry.templateId.trim() || undefined : undefined,
    }));
}

function normalizeWorkflowStep(step: Record<string, unknown>, fallbackTimestamp: number): WorkflowStep {
  const normalizedType =
    step.type === "skill-execute" ||
    step.type === "conditional" ||
    step.type === "delay" ||
    step.type === "tool-call" ||
    step.type === "memory-query" ||
    step.type === "reindex-workspace"
      ? step.type
      : "agent-chat";

  return {
    id: String(step.id ?? `${normalizedType}-${fallbackTimestamp}`).trim(),
    type: normalizedType,
    agentId: typeof step.agentId === "string" ? step.agentId.trim() || undefined : undefined,
    skillId: typeof step.skillId === "string" ? step.skillId.trim() || undefined : undefined,
    prompt: typeof step.prompt === "string" ? step.prompt : undefined,
    condition: typeof step.condition === "string" ? step.condition : undefined,
    delayMs: typeof step.delayMs === "number" ? Math.max(0, Math.round(step.delayMs)) : undefined,
    toolName: typeof step.toolName === "string" ? step.toolName.trim() || undefined : undefined,
    toolArgs: normalizeRecordOfStrings(step.toolArgs),
    memoryQuery: typeof step.memoryQuery === "string" ? step.memoryQuery : undefined,
    memoryLimit:
      typeof step.memoryLimit === "number" ? Math.max(1, Math.round(step.memoryLimit)) : undefined,
    onSuccess: typeof step.onSuccess === "string" ? step.onSuccess.trim() || undefined : undefined,
    onFailure: typeof step.onFailure === "string" ? step.onFailure.trim() || undefined : undefined,
  };
}

function normalizeWorkflowDraft(
  partial: Record<string, unknown>,
  existing?: Workflow,
  fallbackTimestamp = Date.now(),
): Workflow {
  return {
    id: String(partial.id ?? existing?.id ?? `${fallbackTimestamp}`).trim(),
    name: String(partial.name ?? existing?.name ?? "Novo workflow").trim(),
    description: String(partial.description ?? existing?.description ?? "").trim(),
    steps: Array.isArray(partial.steps)
      ? partial.steps
          .map((entry, index) => asObject(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .map((entry, index) => normalizeWorkflowStep(entry, fallbackTimestamp + index))
      : (existing?.steps ?? []),
    variables:
      Object.prototype.hasOwnProperty.call(partial, "variables")
        ? normalizeRecordOfStrings(partial.variables)
        : (existing?.variables ?? {}),
    schedule:
      Object.prototype.hasOwnProperty.call(partial, "schedule")
        ? normalizeWorkflowSchedule(asObject(partial.schedule) ?? undefined)
        : existing?.schedule,
    packageId:
      typeof partial.packageId === "string"
        ? partial.packageId.trim() || undefined
        : existing?.packageId,
    connectionIds:
      Object.prototype.hasOwnProperty.call(partial, "connectionIds")
        ? normalizeStringArray(partial.connectionIds)
        : (existing?.connectionIds ?? []),
    recipeIds:
      Object.prototype.hasOwnProperty.call(partial, "recipeIds")
        ? normalizeStringArray(partial.recipeIds)
        : (existing?.recipeIds ?? []),
    approvalProfileId:
      typeof partial.approvalProfileId === "string"
        ? partial.approvalProfileId.trim() || undefined
        : existing?.approvalProfileId,
    exceptionPolicy:
      Object.prototype.hasOwnProperty.call(partial, "exceptionPolicy")
        ? normalizeWorkflowExceptionPolicy(partial.exceptionPolicy)
        : existing?.exceptionPolicy,
    documentInputSchema:
      Object.prototype.hasOwnProperty.call(partial, "documentInputSchema")
        ? normalizeWorkflowDocumentInputs(partial.documentInputSchema)
        : existing?.documentInputSchema,
    createdAt: existing?.createdAt ?? fallbackTimestamp,
    updatedAt: fallbackTimestamp,
  };
}

function normalizeProjectContextDraft(
  partial: Record<string, unknown>,
  existing?: ProjectContext,
  fallbackTimestamp = Date.now(),
): ProjectContext {
  return normalizeProjectContext(
    {
      ...existing,
      ...partial,
      id: String(partial.id ?? existing?.id ?? `${fallbackTimestamp}`).trim(),
      name: String(partial.name ?? existing?.name ?? "Novo contexto").trim(),
      description: String(partial.description ?? existing?.description ?? "").trim(),
      stakeholders: Object.prototype.hasOwnProperty.call(partial, "stakeholders")
        ? normalizeStringArray(partial.stakeholders)
        : existing?.stakeholders,
      decisions: Object.prototype.hasOwnProperty.call(partial, "decisions")
        ? normalizeStringArray(partial.decisions)
        : existing?.decisions,
      links: Object.prototype.hasOwnProperty.call(partial, "links")
        ? normalizeStringArray(partial.links)
        : existing?.links,
      notes: typeof partial.notes === "string" ? partial.notes : existing?.notes,
      createdAt: existing?.createdAt ?? fallbackTimestamp,
      updatedAt: fallbackTimestamp,
    },
    fallbackTimestamp,
  );
}

function normalizeRecipeDraft(
  partial: Record<string, unknown>,
  existing?: WebRecipe,
  fallbackTimestamp = Date.now(),
): WebRecipe {
  return normalizeWebRecipe(
    {
      ...existing,
      ...partial,
      id: String(partial.id ?? existing?.id ?? `${fallbackTimestamp}`).trim(),
      name: String(partial.name ?? existing?.name ?? "Nova web recipe").trim(),
      description: String(partial.description ?? existing?.description ?? "").trim(),
      tags: Object.prototype.hasOwnProperty.call(partial, "tags")
        ? normalizeStringArray(partial.tags)
        : existing?.tags,
      connectionId:
        typeof partial.connectionId === "string"
          ? partial.connectionId.trim() || undefined
          : existing?.connectionId,
      targetSite:
        typeof partial.targetSite === "string"
          ? partial.targetSite.trim() || undefined
          : existing?.targetSite,
      inputSchema:
        Object.prototype.hasOwnProperty.call(partial, "inputSchema")
          ? normalizeRecipeFieldDefinitions(partial.inputSchema)
          : existing?.inputSchema,
      expectedOutputs:
        Object.prototype.hasOwnProperty.call(partial, "expectedOutputs")
          ? normalizeRecipeFieldDefinitions(partial.expectedOutputs)
          : existing?.expectedOutputs,
      requiresApprovalProfile:
        typeof partial.requiresApprovalProfile === "string"
          ? partial.requiresApprovalProfile.trim() || undefined
          : existing?.requiresApprovalProfile,
      createdAt: existing?.createdAt ?? fallbackTimestamp,
      updatedAt: fallbackTimestamp,
    },
    fallbackTimestamp,
  );
}

function ensureInsideWorkspace(workspaceRoot: string, candidatePath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(resolvedRoot, candidatePath);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error(`Path outside workspace: ${candidatePath}`);
  }
  return resolvedPath;
}

async function safeReadFile(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  if (stats.size > 512_000) {
    return `[file too large: ${stats.size} bytes]`;
  }
  return await fs.readFile(filePath, "utf8");
}

async function walk(
  root: string,
  visitor: (filePath: string, relativePath: string) => Promise<void>,
): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      continue;
    }
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const absolute = path.join(root, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      await walk(absolute, async (nestedPath, nestedRelative) => {
        await visitor(nestedPath, path.join(entry.name, nestedRelative));
      });
      continue;
    }
    await visitor(absolute, relative);
  }
}

async function searchWorkspace(workspaceRoot: string, query: string): Promise<string> {
  const matches: string[] = [];
  await walk(workspaceRoot, async (absolute, relative) => {
    try {
      const content = await safeReadFile(absolute);
      if (content.startsWith("[file too large:")) {
        return;
      }
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          matches.push(`${relative}:${index + 1}: ${line.trim()}`);
        }
      });
    } catch {
      // Best-effort search.
    }
  });
  return matches.slice(0, 200).join("\n") || "No matches found.";
}

async function diffStatus(workspaceRoot: string): Promise<string> {
  return await runCommandInternal(workspaceRoot, "git", ["status", "--short"], undefined);
}

async function diffFile(workspaceRoot: string, filePath: string): Promise<string> {
  return await runCommandInternal(workspaceRoot, "git", ["diff", "--", filePath], undefined);
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [String(key).trim(), String(headerValue ?? "").trim()] as const)
      .filter(([key, headerValue]) => Boolean(key) && Boolean(headerValue)),
  );
}

function isLikelyBinaryContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/") ||
    normalized.includes("octet-stream") ||
    normalized.includes("application/zip") ||
    normalized.includes("application/pdf")
  );
}

function extractRobotsRules(content: string): string[] {
  const rules: string[] = [];
  let inWildcardSection = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [directiveRaw, ...rest] = line.split(":");
    const directive = directiveRaw.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (directive === "user-agent") {
      inWildcardSection = value === "*";
      continue;
    }
    if (!inWildcardSection) {
      continue;
    }
    if (directive === "disallow" && value) {
      rules.push(value);
    }
  }
  return rules;
}

async function assertRobotsAllowed(url: URL, headers: Record<string, string>, signal?: AbortSignal): Promise<void> {
  const robotsUrl = new URL("/robots.txt", url);
  try {
    const response = await fetch(robotsUrl, {
      method: "GET",
      headers,
      signal,
    });
    if (!response.ok) {
      return;
    }
    const rules = extractRobotsRules(await response.text());
    const blocked = rules.some((rule) => rule === "/" || url.pathname.startsWith(rule));
    if (blocked) {
      throw new Error(`Blocked by robots.txt for ${url.origin}${url.pathname}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Blocked by robots.txt")) {
      throw error;
    }
  }
}

async function readResponsePreview(response: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { body: text, truncated: false };
  }
  let currentBytes = 0;
  let index = 0;
  while (index < text.length && currentBytes < maxBytes) {
    const next = text[index];
    currentBytes += Buffer.byteLength(next, "utf8");
    index += 1;
  }
  return { body: `${text.slice(0, index)}\n\n[response truncated]`, truncated: true };
}

async function httpFetch(args: Record<string, unknown>, signal?: AbortSignal): Promise<NativeToolExecutionResult> {
  const rawUrl = String(args.url ?? "").trim();
  if (!rawUrl) {
    throw new Error("url is required.");
  }

  const url = new URL(rawUrl);
  const method = String(args.method ?? "GET").toUpperCase();
  const maxBytes = Math.min(1_000_000, Math.max(2_048, Number(args.maxBytes ?? 250_000) || 250_000));
  const headers = {
    "User-Agent": "codex-agent/1.0",
    ...normalizeHeaders(args.headers),
  };

  if (Boolean(args.respectRobotsTxt)) {
    await assertRobotsAllowed(url, headers, signal);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: typeof args.body === "string" ? args.body : undefined,
    signal,
  });
  const contentType = response.headers.get("content-type") ?? "";
  let content: string;

  if (method === "HEAD") {
    content = "[HEAD request completed without body]";
  } else if (isLikelyBinaryContentType(contentType)) {
    content = `[binary response omitted: ${contentType || "unknown content-type"}]`;
  } else {
    const preview = await readResponsePreview(response, maxBytes);
    if (contentType.includes("application/json")) {
      try {
        content = JSON.stringify(JSON.parse(preview.body), null, 2);
      } catch {
        content = preview.body;
      }
    } else if (contentType.includes("text/html")) {
      content = turndown.turndown(preview.body);
    } else {
      content = preview.body;
    }
  }

  const importantHeaders = [
    "content-type",
    "content-length",
    "cache-control",
    "last-modified",
  ]
    .map((name) => [name, response.headers.get(name)] as const)
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name}: ${value}`);
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    content: [
      `${response.status} ${response.statusText}`.trim(),
      `URL: ${response.url}`,
      ...importantHeaders,
      "",
      content,
    ].join("\n"),
    metadata: {
      status: response.status,
      url: response.url,
      method,
      headers: responseHeaders,
      contentType,
    },
    isError: !response.ok,
  };
}

async function runCommandInternal(
  workspaceRoot: string,
  command: string,
  args: string[],
  signal?: AbortSignal,
  input?: string,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const outputLimit = 64_000;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30_000);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortHandler);
      fn();
    };
    const appendChunk = (target: "stdout" | "stderr", chunk: string) => {
      if (target === "stdout") {
        stdout += chunk;
        if (stdout.length > outputLimit) {
          stdout = `${stdout.slice(0, outputLimit)}\n[output truncated]`;
          child.kill();
        }
      } else {
        stderr += chunk;
        if (stderr.length > outputLimit) {
          stderr = `${stderr.slice(0, outputLimit)}\n[output truncated]`;
          child.kill();
        }
      }
    };
    const abortHandler = () => {
      child.kill();
    };

    child.stdout.on("data", (chunk) => {
      appendChunk("stdout", String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      appendChunk("stderr", String(chunk));
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          reject(new Error("Command timed out after 30000ms."));
          return;
        }
        if (signal?.aborted) {
          reject(new Error("Command aborted."));
          return;
        }
        if (code === 0) {
          resolve(stdout.trim() || stderr.trim() || "[command completed without output]");
        } else {
          reject(new Error(stderr.trim() || stdout.trim() || `Command failed with code ${code ?? "unknown"}`));
        }
      });
    });
    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export function classifyNativeToolRisk(
  toolName: NativeToolName,
  args: Record<string, unknown>,
): ToolRiskDecision {
  if (toolName === "list_dir" || toolName === "search" || toolName === "read_file" || toolName === "diff_status" || toolName === "diff_file") {
    return { mode: "allow", reason: "Read-only local inspection." };
  }

  if (toolName === "web_search") {
    return { mode: "allow", reason: "Read-only external search." };
  }

  if (toolName === "http_fetch") {
    return { mode: "allow", reason: "Read-only HTTP fetch." };
  }

  if (toolName === "generate_image") {
    return {
      mode: "approval",
      reason: "Image generation may incur provider costs and creates new media artifacts.",
      riskLevel: "medium",
    };
  }

  if (toolName === "text_to_speech") {
    return {
      mode: "approval",
      reason: "Text-to-speech may incur provider costs and creates new audio artifacts.",
      riskLevel: "medium",
    };
  }

  if (toolName === "run_recipe") {
    return {
      mode: "approval",
      reason: "Running a stored recipe may interact with external systems and browser sessions.",
      riskLevel: "medium",
    };
  }

  if (toolName === "manage_workflows") {
    const action = String(args.action ?? "list");
    if (action === "delete") {
      return { mode: "approval", reason: "Deleting workflows requires confirmation.", riskLevel: "medium" };
    }
    const payload = pickObject(args, ["workflow", "payload"]);
    const schedule = normalizeWorkflowSchedule(asObject(payload.schedule));
    if ((action === "create" || action === "update") && schedule?.enabled) {
      return {
        mode: "approval",
        reason: "Persisting an enabled workflow schedule requires confirmation.",
        riskLevel: "medium",
      };
    }
    return { mode: "allow", reason: "Workflow drafts can be managed locally." };
  }

  if (toolName === "manage_recipes") {
    const action = String(args.action ?? "list");
    if (action === "delete") {
      return { mode: "approval", reason: "Deleting recipes requires confirmation.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Recipe drafts can be managed locally." };
  }

  if (toolName === "manage_cron") {
    const action = String(args.action ?? "list");
    if (action === "delete") {
      return { mode: "approval", reason: "Deleting cron jobs requires confirmation.", riskLevel: "medium" };
    }
    const enabled = action === "toggle"
      ? args.enabled === true
      : pickObject(args, ["job", "payload"]).enabled === true;
    if ((action === "create" || action === "update" || action === "toggle") && enabled) {
      return {
        mode: "approval",
        reason: "Enabling recurring automation requires confirmation.",
        riskLevel: "medium",
      };
    }
    return { mode: "allow", reason: "Draft cron jobs can be managed locally." };
  }

  if (toolName === "manage_connections") {
    const action = String(args.action ?? "list");
    if (action === "delete") {
      return { mode: "approval", reason: "Deleting connections requires confirmation.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Connection metadata can be managed locally." };
  }

  if (toolName === "manage_automation_packages") {
    const action = String(args.action ?? "list");
    if (action === "delete") {
      return { mode: "approval", reason: "Deleting automation packages requires confirmation.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Automation package drafts can be managed locally." };
  }

  if (toolName === "manage_contexts") {
    const action = String(args.action ?? "list");
    if (action === "delete") {
      return { mode: "approval", reason: "Deleting project contexts requires confirmation.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Project contexts can be managed locally." };
  }

  if (toolName === "manage_tasks") {
    if (String(args.action ?? "list") === "delete") {
      return { mode: "approval", reason: "Deleting tasks requires confirmation.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Local task management is allowed." };
  }

  if (toolName === "set_reminder" || toolName === "list_reminders") {
    return { mode: "allow", reason: "Local reminders are allowed." };
  }

  if (toolName === "spawn_agent") {
    return {
      mode: "approval",
      reason: "Launching background subagents requires confirmation.",
      riskLevel: "medium",
    };
  }

  if (toolName === "validate_automation") {
    return { mode: "allow", reason: "Automation validation is read-only." };
  }

  if (toolName === "activate_automation") {
    const action = String(args.action ?? "get");
    if (action === "get" || action === "validate") {
      return { mode: "allow", reason: "Inspecting automation readiness is allowed." };
    }
    return {
      mode: "approval",
      reason: "Changing automation activation state requires confirmation.",
      riskLevel: "medium",
    };
  }

  if (toolName === "author_automation") {
    return { mode: "allow", reason: "Automation authoring creates draft entities only." };
  }

  if (toolName === "query_database") {
    if (Boolean(args.allowWrite)) {
      return { mode: "approval", reason: "Write queries require confirmation.", riskLevel: "high" };
    }
    return { mode: "allow", reason: "Read-only database query." };
  }

  if (toolName === "render_canvas") {
    return { mode: "allow", reason: "Read-only canvas rendering." };
  }

  if (toolName === "execute_code") {
    return {
      mode: "approval",
      reason: "Code execution requires confirmation.",
      riskLevel: "high",
    };
  }

  if (toolName === "write_file" || toolName === "edit_file" || toolName === "apply_patch") {
    return { mode: "approval", reason: "Mutates workspace files.", riskLevel: "high" };
  }

  if (toolName === "run_command") {
    const command = String(args.command ?? "").trim();
    if (!command) {
      return { mode: "deny", reason: "Empty command." };
    }
    if (SHELL_CHAINING.test(command)) {
      return { mode: "deny", reason: "Shell chaining is denied in v2." };
    }
    if (MUTATING_COMMAND_HINTS.test(command)) {
      return { mode: "approval", reason: "Potentially mutating command.", riskLevel: "high" };
    }
    const firstToken = command.split(/\s+/)[0];
    if (!SAFE_COMMANDS.has(firstToken)) {
      return { mode: "approval", reason: "Unknown command requires review.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Allowed read-only command." };
  }

  return { mode: "approval", reason: "Unknown native tool.", riskLevel: "medium" };
}

export function buildNativeTools(): NativeToolDefinition[] {
  return [
    {
      name: "list_dir",
      description: "List files and directories inside the active workspace.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          path: Type.Optional(Type.String({ description: "Relative path inside the workspace." })),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "search",
      description: "Search for text across workspace files.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        {
          query: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "read_file",
      description: "Read a UTF-8 text file inside the active workspace.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          path: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "write_file",
      description: "Write a new file or replace a file entirely inside the workspace.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          path: Type.String(),
          content: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "edit_file",
      description: "Replace a localized text span inside a workspace file.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          path: Type.String(),
          oldText: Type.String(),
          newText: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "run_command",
      description: "Run a shell command inside the active workspace.",
      metadata: {
        capabilities: ["long_running", "mutating", "requires_approval"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        {
          command: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "apply_patch",
      description: "Apply a structured patch to files in the workspace.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          patch: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "diff_status",
      description: "Show git status for the active workspace.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object({}, { additionalProperties: false }),
    },
    {
      name: "diff_file",
      description: "Show git diff for a file inside the active workspace.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          path: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "web_search",
      description: "Search the web using the configured HTTP provider.",
      metadata: {
        capabilities: ["read_only", "networked"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        {
          query: Type.String(),
          maxResults: Type.Optional(Type.Number()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "http_fetch",
      description: "Fetch an HTTP resource and normalize HTML, JSON, or text output for the model.",
      metadata: {
        capabilities: ["read_only", "networked"],
        defaultTimeoutMs: 20_000,
      },
      parameters: Type.Object(
        {
          url: Type.String(),
          method: Type.Optional(
            Type.Union([
              Type.Literal("GET"),
              Type.Literal("POST"),
              Type.Literal("PUT"),
              Type.Literal("PATCH"),
              Type.Literal("DELETE"),
              Type.Literal("HEAD"),
            ]),
          ),
          headers: Type.Optional(Type.Record(Type.String(), Type.String())),
          body: Type.Optional(Type.String()),
          maxBytes: Type.Optional(Type.Number({ description: "Maximum response bytes to keep in memory." })),
          respectRobotsTxt: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "generate_image",
      description: "Generate one or more images from a prompt using the configured image provider.",
      metadata: {
        capabilities: ["networked", "requires_approval"],
        defaultTimeoutMs: 45_000,
      },
      parameters: Type.Object(
        {
          prompt: Type.String(),
          model: Type.Optional(Type.String({ description: "Image model, for example gpt-image-1.5 or dall-e-3." })),
          size: Type.Optional(
            Type.Union([
              Type.Literal("1024x1024"),
              Type.Literal("1024x1536"),
              Type.Literal("1536x1024"),
              Type.Literal("auto"),
            ]),
          ),
          quality: Type.Optional(
            Type.Union([
              Type.Literal("low"),
              Type.Literal("medium"),
              Type.Literal("high"),
              Type.Literal("auto"),
            ]),
          ),
          background: Type.Optional(
            Type.Union([
              Type.Literal("transparent"),
              Type.Literal("opaque"),
              Type.Literal("auto"),
            ]),
          ),
          outputFormat: Type.Optional(
            Type.Union([
              Type.Literal("png"),
              Type.Literal("webp"),
              Type.Literal("jpeg"),
            ]),
          ),
          count: Type.Optional(Type.Number({ minimum: 1, maximum: 4 })),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "text_to_speech",
      description: "Convert text into spoken audio and attach the generated file to the session.",
      metadata: {
        capabilities: ["networked", "requires_approval"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        {
          text: Type.String(),
          provider: Type.Optional(Type.String({ description: "Speech provider, for example openai." })),
          model: Type.Optional(Type.String({ description: "Speech model, for example gpt-4o-mini-tts." })),
          voice: Type.Optional(Type.String({ description: "Voice preset such as alloy." })),
          language: Type.Optional(Type.String({ description: "Preferred spoken language or locale." })),
          instructions: Type.Optional(Type.String({ description: "Optional delivery instructions for the speech model." })),
          format: Type.Optional(
            Type.Union([
              Type.Literal("mp3"),
              Type.Literal("wav"),
            ]),
          ),
          speed: Type.Optional(Type.Number({ minimum: 0.25, maximum: 4 })),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "run_recipe",
      description: "Execute a stored browser recipe, optionally reusing a connection-scoped browser session.",
      metadata: {
        capabilities: ["networked", "mutating", "requires_approval"],
        defaultTimeoutMs: 60_000,
      },
      parameters: Type.Object(
        {
          recipeId: Type.String(),
          sessionId: Type.Optional(Type.String()),
          connectionId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "manage_workflows",
      description: "List, inspect, create, update, or delete workflow drafts stored inside the app.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("get"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("delete"),
          ]),
          workflowId: Type.Optional(Type.String()),
          workflow: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "manage_recipes",
      description: "List, inspect, create, update, or delete browser recipes stored inside the app.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("get"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("delete"),
          ]),
          recipeId: Type.Optional(Type.String()),
          recipe: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "manage_cron",
      description: "List, inspect, create, update, toggle, or delete cron jobs used by automations.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("get"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("toggle"),
            Type.Literal("delete"),
          ]),
          cronId: Type.Optional(Type.String()),
          enabled: Type.Optional(Type.Boolean()),
          job: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "manage_connections",
      description: "List, inspect, create, update, validate, or delete reusable automation connections.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("get"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("mark_validated"),
            Type.Literal("delete"),
          ]),
          connectionId: Type.Optional(Type.String()),
          connection: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
          status: Type.Optional(Type.String()),
          browserProfileId: Type.Optional(Type.String()),
          secretRef: Type.Optional(Type.String()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "manage_automation_packages",
      description: "List, inspect, create, update, or delete automation packages stored inside the app.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("get"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("delete"),
          ]),
          packageId: Type.Optional(Type.String()),
          automationPackage: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "manage_contexts",
      description: "List, inspect, create, update, or delete project contexts stored inside the app.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("get"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("delete"),
          ]),
          contextId: Type.Optional(Type.String()),
          projectContext: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "manage_tasks",
      description: "Create, update, complete, delete, or list local cowork tasks.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("list"),
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("complete"),
            Type.Literal("delete"),
          ]),
          taskId: Type.Optional(Type.String()),
          title: Type.Optional(Type.String()),
          description: Type.Optional(Type.String()),
          status: Type.Optional(
            Type.Union([
              Type.Literal("backlog"),
              Type.Literal("today"),
              Type.Literal("in_progress"),
              Type.Literal("done"),
            ]),
          ),
          priority: Type.Optional(
            Type.Union([
              Type.Literal("low"),
              Type.Literal("medium"),
              Type.Literal("high"),
            ]),
          ),
          dueDate: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format." })),
          projectContextId: Type.Optional(Type.String()),
          includeDone: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "set_reminder",
      description: "Create a local reminder that triggers a desktop notification later.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          message: Type.String(),
          triggerAt: Type.String({
            description: "Reminder time as ISO datetime or another parseable local datetime string.",
          }),
          recurring: Type.Optional(
            Type.Union([
              Type.Literal("none"),
              Type.Literal("daily"),
              Type.Literal("weekly"),
              Type.Literal("weekdays"),
            ]),
          ),
          projectContextId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "list_reminders",
      description: "List local reminders that have been scheduled in the app.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          status: Type.Optional(
            Type.Union([
              Type.Literal("pending"),
              Type.Literal("delivered"),
              Type.Literal("acknowledged"),
              Type.Literal("canceled"),
            ]),
          ),
          includeCanceled: Type.Optional(Type.Boolean()),
          includeAcknowledged: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Number()),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "spawn_agent",
      description: "Launch a delegated background subagent to work on a subtask in parallel.",
      metadata: {
        capabilities: ["long_running", "mutating", "requires_approval"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        {
          prompt: Type.String(),
          title: Type.Optional(Type.String()),
          agentId: Type.Optional(Type.String()),
          projectContextId: Type.Optional(Type.String()),
          modelRef: Type.Optional(Type.String()),
          systemPrompt: Type.Optional(Type.String()),
          mcpServerIds: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "validate_automation",
      description: "Validate an automation draft package, workflow, recipes, cron jobs, and connections before activation.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          automationPackage: Type.Optional(Type.Any()),
          workflow: Type.Optional(Type.Any()),
          recipes: Type.Optional(Type.Array(Type.Any())),
          cronJobs: Type.Optional(Type.Array(Type.Any())),
          connections: Type.Optional(Type.Array(Type.Any())),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "activate_automation",
      description: "Inspect, validate, activate, or deactivate an automation package with package-level guardrails.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("get"),
            Type.Literal("validate"),
            Type.Literal("activate"),
            Type.Literal("deactivate"),
          ]),
          packageId: Type.String(),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "author_automation",
      description: "Plan or create an automation draft package from a natural-language request.",
      metadata: {
        capabilities: ["mutating"],
        defaultTimeoutMs: 10_000,
      },
      parameters: Type.Object(
        {
          action: Type.Union([
            Type.Literal("plan"),
            Type.Literal("create"),
            Type.Literal("compile"),
          ]),
          prompt: Type.Optional(Type.String()),
          createdBy: Type.Optional(Type.String()),
          draft: Type.Optional(Type.Any()),
          payload: Type.Optional(Type.Any()),
        },
        { additionalProperties: true },
      ),
    },
    {
      name: "query_database",
      description: "Execute a read-only SQL query against a SQLite, PostgreSQL, or MySQL database. Returns results as a formatted table. Use for data analysis, reporting, or inspecting database state.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 15_000,
      },
      parameters: Type.Object(
        {
          connectionString: Type.String({
            description:
              "Database connection string. For SQLite: 'sqlite:///path/to/db.sqlite'. For PostgreSQL: 'postgresql://user:pass@host:5432/dbname'. For MySQL: 'mysql://user:pass@host:3306/dbname'.",
          }),
          query: Type.String({
            description: "The SQL query to execute. Must be a SELECT query (read-only by default).",
          }),
          params: Type.Optional(
            Type.Array(Type.String(), {
              description: "Query parameters for prepared statements (optional).",
            }),
          ),
          allowWrite: Type.Optional(
            Type.Boolean({
              description: "Set to true to allow INSERT/UPDATE/DELETE queries. Requires explicit approval.",
            }),
          ),
          maxRows: Type.Optional(
            Type.Number({
              description: "Maximum number of rows to return (default 100).",
            }),
          ),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "render_canvas",
      description:
        "Render rich visual content inline in the chat. Supports mermaid diagrams, Chart.js charts, markdown tables, and HTML snippets. The frontend will render the output visually.",
      metadata: {
        capabilities: ["read_only"],
        defaultTimeoutMs: 5_000,
      },
      parameters: Type.Object(
        {
          type: Type.Union(
            [
              Type.Literal("mermaid"),
              Type.Literal("chart"),
              Type.Literal("table"),
              Type.Literal("html"),
              Type.Literal("svg"),
            ],
            { description: "The type of content to render." },
          ),
          content: Type.String({
            description:
              "The content to render. For mermaid: diagram DSL. For chart: Chart.js config JSON. For table: markdown table. For html: HTML snippet. For svg: SVG markup.",
          }),
          title: Type.Optional(
            Type.String({ description: "Optional title for the rendered content." }),
          ),
          width: Type.Optional(
            Type.Number({ description: "Optional width in pixels (default: auto)." }),
          ),
          height: Type.Optional(
            Type.Number({ description: "Optional height in pixels (default: auto)." }),
          ),
        },
        { additionalProperties: false },
      ),
    },
    {
      name: "execute_code",
      description:
        "Execute code in a sandboxed environment and return stdout, stderr, and exit code. Supports JavaScript/TypeScript (Node.js), Python, and Bash.",
      metadata: {
        capabilities: ["mutating", "requires_approval"],
        defaultTimeoutMs: 30_000,
      },
      parameters: Type.Object(
        {
          language: Type.Union(
            [
              Type.Literal("javascript"),
              Type.Literal("typescript"),
              Type.Literal("python"),
              Type.Literal("bash"),
            ],
            { description: "Programming language to execute." },
          ),
          code: Type.String({ description: "The code to execute." }),
          timeout: Type.Optional(
            Type.Number({
              description: "Execution timeout in milliseconds (default 30000, max 120000).",
            }),
          ),
          stdin: Type.Optional(
            Type.String({ description: "Optional stdin input for the process." }),
          ),
        },
        { additionalProperties: false },
      ),
    },
  ] satisfies NativeToolDefinition[];
}

export async function executeNativeTool(
  toolName: NativeToolName,
  args: Record<string, unknown>,
  ctx: NativeToolContext,
): Promise<NativeToolExecutionResult> {
  const workspaceRoot = ensureInsideWorkspace(ctx.workspaceRoot, ".");

  switch (toolName) {
    case "list_dir": {
      const target = ensureInsideWorkspace(workspaceRoot, String(args.path ?? "."));
      const entries = await fs.readdir(target, { withFileTypes: true });
      return {
        content: entries
          .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
          .join("\n"),
      };
    }
    case "search":
      return {
        content: await searchWorkspace(workspaceRoot, String(args.query ?? "")),
      };
    case "read_file": {
      const target = ensureInsideWorkspace(workspaceRoot, String(args.path ?? ""));
      return { content: await safeReadFile(target) };
    }
    case "write_file": {
      const relativePath = String(args.path ?? "");
      const target = ensureInsideWorkspace(workspaceRoot, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(args.content ?? ""), "utf8");
      return { content: `Wrote ${relativePath}`, filesTouched: [relativePath] };
    }
    case "edit_file": {
      const relativePath = String(args.path ?? "");
      const target = ensureInsideWorkspace(workspaceRoot, relativePath);
      const current = await fs.readFile(target, "utf8");
      const oldText = String(args.oldText ?? "");
      if (!current.includes(oldText)) {
        throw new Error(`Could not find target text in ${relativePath}`);
      }
      await fs.writeFile(target, current.replace(oldText, String(args.newText ?? "")), "utf8");
      return { content: `Edited ${relativePath}`, filesTouched: [relativePath] };
    }
    case "run_command": {
      const command = String(args.command ?? "").trim();
      const [binary, ...rest] = command.split(/\s+/);
      return {
        content: await runCommandInternal(workspaceRoot, binary, rest, ctx.signal, undefined),
        metadata: { command },
      };
    }
    case "apply_patch": {
      const changed = await applySimplePatch(workspaceRoot, String(args.patch ?? ""));
      return {
        content: `Patched ${changed.length} file(s).\n${changed.join("\n")}`,
        filesTouched: changed,
      };
    }
    case "diff_status":
      return { content: await diffStatus(workspaceRoot) };
    case "diff_file":
      return { content: await diffFile(workspaceRoot, String(args.path ?? "")) };
    case "web_search": {
      const results = await runWebSearch({
        query: String(args.query ?? ""),
        maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
      });
      return {
        content: results.map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`).join("\n\n"),
        metadata: {
          webSearchResults: results,
        },
      };
    }
    case "http_fetch":
      return await httpFetch(args, ctx.signal);
    case "generate_image": {
      if (!ctx.sessionId) {
        throw new Error("generate_image requires an active session.");
      }

      const generated = await generateImages({
        sessionId: ctx.sessionId,
        runId: ctx.runId ?? "tool",
        prompt: String(args.prompt ?? ""),
        model: typeof args.model === "string" ? args.model : undefined,
        size: typeof args.size === "string" ? (args.size as any) : undefined,
        quality: typeof args.quality === "string" ? (args.quality as any) : undefined,
        background: typeof args.background === "string" ? (args.background as any) : undefined,
        outputFormat: typeof args.outputFormat === "string" ? (args.outputFormat as any) : undefined,
        count: typeof args.count === "number" ? args.count : undefined,
        signal: ctx.signal,
      });

      const summaryLines = [
        `Generated ${generated.attachments.length} image(s) with ${generated.model}.`,
        `Size: ${generated.size}`,
        `Quality: ${generated.quality}`,
        `Background: ${generated.background}`,
        `Format: ${generated.outputFormat}`,
      ];

      if (generated.revisedPrompts.length > 0) {
        summaryLines.push(
          "",
          "Revised prompts:",
          ...generated.revisedPrompts.map((item, index) => `${index + 1}. ${item}`),
        );
      }

      return {
        content: summaryLines.join("\n"),
        metadata: {
          attachments: generated.attachments,
          imageGeneration: {
            model: generated.model,
            size: generated.size,
            quality: generated.quality,
            background: generated.background,
            outputFormat: generated.outputFormat,
            revisedPrompts: generated.revisedPrompts,
            usage: generated.usage,
          },
        },
      };
    }
    case "text_to_speech": {
      if (!ctx.sessionId) {
        throw new Error("text_to_speech requires an active session.");
      }

      const generated = await synthesizeSpeech({
        sessionId: ctx.sessionId,
        runId: ctx.runId ?? "tool",
        text: String(args.text ?? ""),
        provider: typeof args.provider === "string" ? (args.provider as "openai") : undefined,
        model: typeof args.model === "string" ? args.model : undefined,
        voice: typeof args.voice === "string" ? args.voice : undefined,
        language: typeof args.language === "string" ? args.language : undefined,
        instructions: typeof args.instructions === "string" ? args.instructions : undefined,
        format: typeof args.format === "string" ? (args.format as "mp3" | "wav") : undefined,
        speed: typeof args.speed === "number" ? args.speed : undefined,
        signal: ctx.signal,
      });

      const summaryLines = [
        `Generated ${generated.attachments.length} audio file(s) with ${generated.provider}.`,
        `Model: ${generated.model}`,
        `Voice: ${generated.voice}`,
        `Format: ${generated.format}`,
      ];

      if (generated.language) {
        summaryLines.push(`Language: ${generated.language}`);
      }
      if (typeof generated.speed === "number") {
        summaryLines.push(`Speed: ${generated.speed}`);
      }
      if (generated.instructions) {
        summaryLines.push("", `Instructions: ${generated.instructions}`);
      }

      return {
        content: summaryLines.join("\n"),
        metadata: {
          attachments: generated.attachments,
          speechSynthesis: {
            provider: generated.provider,
            model: generated.model,
            voice: generated.voice,
            format: generated.format,
            language: generated.language,
            instructions: generated.instructions,
            speed: generated.speed,
          },
        },
      };
    }
    case "run_recipe": {
      const recipeId = String(args.recipeId ?? "").trim();
      if (!recipeId) {
        throw new Error("recipeId is required.");
      }
      const providedConnectionId =
        typeof args.connectionId === "string" ? args.connectionId.trim() : "";
      const providedSessionId =
        typeof args.sessionId === "string" ? args.sessionId.trim() : "";
      const result = await executeWebRecipe({
        recipeId,
        sessionId:
          (providedConnectionId ? resolveConnectionSessionId(providedConnectionId) : "") ||
          providedSessionId ||
          ctx.sessionId,
      });

      const stepSummary =
        result.steps.length > 0
          ? result.steps
              .map(
                (step) =>
                  `- ${step.label}: ${step.status}${step.error ? ` (${step.error})` : ""}`,
              )
              .join("\n")
          : "- No recipe steps executed.";

      return {
        content: [
          `Recipe run ${result.error ? "failed" : "completed"}: ${result.recipeId}`,
          `Session: ${result.sessionId}`,
          stepSummary,
        ].join("\n"),
        isError: Boolean(result.error),
        metadata: {
          recipeRun: result,
        },
      };
    }
    case "manage_workflows": {
      const action = String(args.action ?? "list");

      if (action === "list") {
        const workflows = await listWorkflowsV2();
        return {
          content:
            workflows.length > 0
              ? `${workflows.length} workflow(s):\n${workflows.map((workflow) => formatWorkflowSummary(workflow)).join("\n")}`
              : "No workflows found.",
          metadata: { workflows },
        };
      }

      const payload = pickObject(args, ["workflow", "payload"]);
      const workflowId = String(args.workflowId ?? payload.id ?? "").trim();

      if (action === "get") {
        if (!workflowId) {
          throw new Error("workflowId is required for this action.");
        }
        const workflow = await getWorkflowV2(workflowId);
        if (!workflow) {
          throw new Error(`Workflow not found: ${workflowId}`);
        }
        return {
          content: `Workflow:\n${formatWorkflowSummary(workflow)}`,
          metadata: { workflow },
        };
      }

      if (action === "delete") {
        if (!workflowId) {
          throw new Error("workflowId is required for this action.");
        }
        await deleteWorkflowV2(workflowId);
        return {
          content: `Deleted workflow ${workflowId}.`,
          metadata: { workflowId },
        };
      }

      if (action === "create" || action === "update") {
        const existing = workflowId ? await getWorkflowV2(workflowId) : null;
        if (action === "update" && !existing) {
          throw new Error(`Workflow not found: ${workflowId}`);
        }

        const workflow = normalizeWorkflowDraft(payload, existing ?? undefined, Date.now());
        const scheduleValidation = validateWorkflowSchedule(workflow.schedule);
        if (!scheduleValidation.valid) {
          throw new Error(scheduleValidation.error ?? "Invalid workflow schedule.");
        }
        await saveWorkflowV2(workflow);
        return {
          content: `${action === "create" ? "Created" : "Updated"} workflow:\n${formatWorkflowSummary(workflow)}`,
          metadata: { workflow },
        };
      }

      throw new Error(`Unsupported workflow action: ${action}`);
    }
    case "manage_recipes": {
      const action = String(args.action ?? "list");

      if (action === "list") {
        const recipes = await listWebRecipes();
        return {
          content:
            recipes.length > 0
              ? `${recipes.length} recipe(s):\n${recipes.map((recipe) => formatRecipeSummary(recipe)).join("\n")}`
              : "No recipes found.",
          metadata: { recipes },
        };
      }

      const payload = pickObject(args, ["recipe", "payload"]);
      const recipeId = String(args.recipeId ?? payload.id ?? "").trim();

      if (action === "get") {
        if (!recipeId) {
          throw new Error("recipeId is required for this action.");
        }
        const recipe = await getWebRecipe(recipeId);
        if (!recipe) {
          throw new Error(`Recipe not found: ${recipeId}`);
        }
        return {
          content: `Recipe:\n${formatRecipeSummary(recipe)}`,
          metadata: { recipe },
        };
      }

      if (action === "delete") {
        if (!recipeId) {
          throw new Error("recipeId is required for this action.");
        }
        await deleteWebRecipe(recipeId);
        return {
          content: `Deleted recipe ${recipeId}.`,
          metadata: { recipeId },
        };
      }

      if (action === "create" || action === "update") {
        const existing = recipeId ? await getWebRecipe(recipeId) : null;
        if (action === "update" && !existing) {
          throw new Error(`Recipe not found: ${recipeId}`);
        }

        const recipe = normalizeRecipeDraft(payload, existing ?? undefined, Date.now());
        await saveWebRecipe(recipe);
        return {
          content: `${action === "create" ? "Created" : "Updated"} recipe:\n${formatRecipeSummary(recipe)}`,
          metadata: { recipe },
        };
      }

      throw new Error(`Unsupported recipe action: ${action}`);
    }
    case "manage_cron": {
      const action = String(args.action ?? "list");

      if (action === "list") {
        const jobs = await listJobs();
        return {
          content:
            jobs.length > 0
              ? `${jobs.length} cron job(s):\n${jobs.map((job) => formatCronSummary(job)).join("\n")}`
              : "No cron jobs found.",
          metadata: { cronJobs: jobs },
        };
      }

      const payload = pickObject(args, ["job", "payload"]);
      const cronId = String(args.cronId ?? payload.id ?? "").trim();

      if (action === "get") {
        if (!cronId) {
          throw new Error("cronId is required for this action.");
        }
        const job = await getJob(cronId);
        if (!job) {
          throw new Error(`Cron job not found: ${cronId}`);
        }
        return {
          content: `Cron job:\n${formatCronSummary(job)}`,
          metadata: { cronJob: job },
        };
      }

      if (action === "delete") {
        if (!cronId) {
          throw new Error("cronId is required for this action.");
        }
        const deleted = await deleteJob(cronId);
        if (!deleted) {
          throw new Error(`Cron job not found: ${cronId}`);
        }
        return {
          content: `Deleted cron job ${cronId}.`,
          metadata: { cronId },
        };
      }

      if (action === "toggle") {
        if (!cronId) {
          throw new Error("cronId is required for this action.");
        }
        const job = await toggleJob(cronId, Boolean(args.enabled));
        if (!job) {
          throw new Error(`Cron job not found: ${cronId}`);
        }
        return {
          content: `Updated cron job:\n${formatCronSummary(job)}`,
          metadata: { cronJob: job },
        };
      }

      if (action === "create") {
        const job = await createJob({
          id: typeof payload.id === "string" ? payload.id.trim() || undefined : undefined,
          name: String(payload.name ?? "").trim(),
          cronExpr: String(payload.cronExpr ?? "").trim(),
          actionType: String(payload.actionType ?? "workflow") as CronJob["actionType"],
          actionConfig: asObject(payload.actionConfig) ?? {},
          enabled: payload.enabled !== false,
        });
        return {
          content: `Created cron job:\n${formatCronSummary(job)}`,
          metadata: { cronJob: job },
        };
      }

      if (action === "update") {
        if (!cronId) {
          throw new Error("cronId is required for this action.");
        }
        const job = await updateJob(cronId, {
          name: typeof payload.name === "string" ? payload.name : undefined,
          cronExpr: typeof payload.cronExpr === "string" ? payload.cronExpr : undefined,
          actionType: typeof payload.actionType === "string" ? (payload.actionType as CronJob["actionType"]) : undefined,
          actionConfig: Object.prototype.hasOwnProperty.call(payload, "actionConfig")
            ? (asObject(payload.actionConfig) ?? {})
            : undefined,
          enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined,
        });
        if (!job) {
          throw new Error(`Cron job not found: ${cronId}`);
        }
        return {
          content: `Updated cron job:\n${formatCronSummary(job)}`,
          metadata: { cronJob: job },
        };
      }

      throw new Error(`Unsupported cron action: ${action}`);
    }
    case "manage_connections": {
      const action = String(args.action ?? "list");

      if (action === "list") {
        const connections = await listConnections();
        return {
          content:
            connections.length > 0
              ? `${connections.length} connection(s):\n${connections.map((connection) => summarizeConnection(connection)).join("\n")}`
              : "No connections found.",
          metadata: { connections },
        };
      }

      const payload = pickObject(args, ["connection", "payload"]);
      const connectionId = String(args.connectionId ?? payload.id ?? "").trim();

      if (action === "get") {
        if (!connectionId) {
          throw new Error("connectionId is required for this action.");
        }
        const connection = await getConnection(connectionId);
        if (!connection) {
          throw new Error(`Connection not found: ${connectionId}`);
        }
        return {
          content: `Connection:\n${summarizeConnection(connection)}`,
          metadata: { connection },
        };
      }

      if (action === "delete") {
        if (!connectionId) {
          throw new Error("connectionId is required for this action.");
        }
        const existing = await getConnection(connectionId);
        if (!existing) {
          throw new Error(`Connection not found: ${connectionId}`);
        }
        await deleteConnection(connectionId);
        return {
          content: `Deleted connection ${connectionId}.`,
          metadata: { connectionId },
        };
      }

      if (action === "mark_validated") {
        if (!connectionId) {
          throw new Error("connectionId is required for this action.");
        }
        const connection = await markConnectionValidated({
          connectionId,
          status: typeof args.status === "string" ? (args.status as Connection["status"]) : undefined,
          browserProfileId:
            typeof args.browserProfileId === "string" ? args.browserProfileId : undefined,
          secretRef: typeof args.secretRef === "string" ? args.secretRef : undefined,
        });
        return {
          content: `Validated connection:\n${summarizeConnection(connection)}`,
          metadata: { connection },
        };
      }

      if (action === "create" || action === "update") {
        const existing = connectionId ? await getConnection(connectionId) : null;
        if (action === "update" && !existing) {
          throw new Error(`Connection not found: ${connectionId}`);
        }
        const connection = normalizeConnection(
          {
            ...existing,
            ...payload,
            id: connectionId || existing?.id,
            createdAt: existing?.createdAt,
            updatedAt: Date.now(),
          },
          Date.now(),
        );
        await saveConnection(connection);
        return {
          content: `${action === "create" ? "Created" : "Updated"} connection:\n${summarizeConnection(connection)}`,
          metadata: { connection },
        };
      }

      throw new Error(`Unsupported connection action: ${action}`);
    }
    case "manage_automation_packages": {
      const action = String(args.action ?? "list");

      if (action === "list") {
        const automationPackages = await listAutomationPackages();
        return {
          content:
            automationPackages.length > 0
              ? `${automationPackages.length} automation package(s):\n${automationPackages
                  .map((automationPackage) =>
                    summarizeAutomationPackage(automationPackage),
                  )
                  .join("\n")}`
              : "No automation packages found.",
          metadata: { automationPackages },
        };
      }

      const payload = pickObject(args, ["automationPackage", "payload"]);
      const packageId = String(args.packageId ?? payload.id ?? "").trim();

      if (action === "get") {
        if (!packageId) {
          throw new Error("packageId is required for this action.");
        }
        const automationPackage = await getAutomationPackage(packageId);
        if (!automationPackage) {
          throw new Error(`Automation package not found: ${packageId}`);
        }
        return {
          content: `Automation package:\n${summarizeAutomationPackage(automationPackage)}`,
          metadata: { automationPackage },
        };
      }

      if (action === "delete") {
        if (!packageId) {
          throw new Error("packageId is required for this action.");
        }
        const automationPackage = await getAutomationPackage(packageId);
        if (!automationPackage) {
          throw new Error(`Automation package not found: ${packageId}`);
        }
        await deleteAutomationPackage(packageId);
        return {
          content: `Deleted automation package ${packageId}.`,
          metadata: { packageId },
        };
      }

      if (action === "create" || action === "update") {
        const existing = packageId ? await getAutomationPackage(packageId) : null;
        if (action === "update" && !existing) {
          throw new Error(`Automation package not found: ${packageId}`);
        }
        const automationPackage = normalizeAutomationPackage(
          {
            ...existing,
            ...payload,
            id: packageId || existing?.id,
            createdAt: existing?.createdAt,
            updatedAt: Date.now(),
          } as Partial<AutomationPackage>,
          Date.now(),
        );
        await saveAutomationPackage(automationPackage);
        return {
          content: `${action === "create" ? "Created" : "Updated"} automation package:\n${summarizeAutomationPackage(automationPackage)}`,
          metadata: { automationPackage },
        };
      }

      throw new Error(`Unsupported automation package action: ${action}`);
    }
    case "manage_contexts": {
      const action = String(args.action ?? "list");

      if (action === "list") {
        const contexts = await listProjectContextsV2();
        return {
          content:
            contexts.length > 0
              ? `${contexts.length} context(s):\n${contexts.map((projectContext) => formatContextSummary(projectContext)).join("\n")}`
              : "No project contexts found.",
          metadata: { contexts },
        };
      }

      const payload = pickObject(args, ["projectContext", "payload"]);
      const contextId = String(args.contextId ?? payload.id ?? "").trim();

      if (action === "get") {
        if (!contextId) {
          throw new Error("contextId is required for this action.");
        }
        const projectContext = await getProjectContextV2(contextId);
        if (!projectContext) {
          throw new Error(`Project context not found: ${contextId}`);
        }
        return {
          content: `Project context:\n${formatContextSummary(projectContext)}`,
          metadata: { projectContext },
        };
      }

      if (action === "delete") {
        if (!contextId) {
          throw new Error("contextId is required for this action.");
        }
        const projectContext = await getProjectContextV2(contextId);
        if (!projectContext) {
          throw new Error(`Project context not found: ${contextId}`);
        }
        await deleteProjectContextV2(contextId);
        return {
          content: `Deleted project context ${contextId}.`,
          metadata: { contextId },
        };
      }

      if (action === "create" || action === "update") {
        const existing = contextId ? await getProjectContextV2(contextId) : null;
        if (action === "update" && !existing) {
          throw new Error(`Project context not found: ${contextId}`);
        }
        const projectContext = normalizeProjectContextDraft(payload, existing ?? undefined, Date.now());
        await saveProjectContextV2(projectContext);
        return {
          content: `${action === "create" ? "Created" : "Updated"} project context:\n${formatContextSummary(projectContext)}`,
          metadata: { projectContext },
        };
      }

      throw new Error(`Unsupported context action: ${action}`);
    }
    case "manage_tasks": {
      const action = String(args.action ?? "list");
      const session = ctx.sessionId ? await getSessionRecord(ctx.sessionId) : null;
      const explicitProjectContextId =
        typeof args.projectContextId === "string"
          ? String(args.projectContextId).trim() || undefined
          : undefined;
      const contextualProjectContextId = explicitProjectContextId ?? session?.projectContextId;

      if (action === "list") {
        const tasks = await listTasks({
          status: typeof args.status === "string" ? (args.status as any) : undefined,
          projectContextId: contextualProjectContextId,
          includeDone: Boolean(args.includeDone),
        });
        return {
          content:
            tasks.length > 0
              ? `${tasks.length} task(s):\n${tasks.map((task) => formatTaskSummary(task)).join("\n")}`
              : "No tasks found.",
          metadata: { tasks },
        };
      }

      if (action === "create") {
        const task = await createTask({
          title: String(args.title ?? "").trim(),
          description: String(args.description ?? ""),
          status: typeof args.status === "string" ? (args.status as any) : "backlog",
          priority: typeof args.priority === "string" ? (args.priority as any) : "medium",
          dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
          projectContextId: contextualProjectContextId,
          source: "agent",
        });
        return {
          content: `Created task:\n${formatTaskSummary(task)}`,
          metadata: { task },
        };
      }

      const taskId = String(args.taskId ?? "").trim();
      if (!taskId) {
        throw new Error("taskId is required for this action.");
      }

      if (action === "update") {
        const task = await updateTask(taskId, {
          title: typeof args.title === "string" ? args.title : undefined,
          description: typeof args.description === "string" ? args.description : undefined,
          status: typeof args.status === "string" ? (args.status as any) : undefined,
          priority: typeof args.priority === "string" ? (args.priority as any) : undefined,
          dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
          ...(Object.prototype.hasOwnProperty.call(args, "projectContextId")
            ? { projectContextId: explicitProjectContextId }
            : {}),
          source: "agent",
        });
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        return {
          content: `Updated task:\n${formatTaskSummary(task)}`,
          metadata: { task },
        };
      }

      if (action === "complete") {
        const task = await completeTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        return {
          content: `Completed task:\n${formatTaskSummary(task)}`,
          metadata: { task },
        };
      }

      if (action === "delete") {
        const deleted = await deleteTask(taskId);
        if (!deleted) {
          throw new Error(`Task not found: ${taskId}`);
        }
        return {
          content: `Deleted task ${taskId}.`,
          metadata: { taskId },
        };
      }

      throw new Error(`Unsupported task action: ${action}`);
    }
    case "set_reminder": {
      const session = ctx.sessionId ? await getSessionRecord(ctx.sessionId) : null;
      const reminder = await createReminder({
        message: String(args.message ?? "").trim(),
        triggerAt: String(args.triggerAt ?? ""),
        recurring:
          typeof args.recurring === "string"
            ? (args.recurring as ReminderRecurrence)
            : "none",
        projectContextId:
          typeof args.projectContextId === "string"
            ? String(args.projectContextId).trim() || undefined
            : session?.projectContextId,
        sessionId: session?.sessionId,
        source: "agent",
      });
      return {
        content: `Reminder set for ${new Date(reminder.triggerAt).toLocaleString()}: ${reminder.message}`,
        metadata: { reminder },
      };
    }
    case "list_reminders": {
      const reminders = await listReminders({
        status: typeof args.status === "string" ? (args.status as any) : undefined,
        includeCanceled: Boolean(args.includeCanceled),
        includeAcknowledged: Boolean(args.includeAcknowledged),
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      return {
        content:
          reminders.length > 0
            ? `${reminders.length} reminder(s):\n${reminders
                .map(
                  (reminder) =>
                    `- ${new Date(reminder.triggerAt).toLocaleString()} [${reminder.status}] ${reminder.message} [${reminder.id}]`,
                )
                .join("\n")}`
            : "No reminders found.",
        metadata: { reminders },
      };
    }
    case "spawn_agent": {
      const subagent = await spawnSubagent({
        title: typeof args.title === "string" ? args.title : undefined,
        prompt: String(args.prompt ?? "").trim(),
        parentSessionId: ctx.sessionId,
        parentRunId: ctx.runId,
        agentId: typeof args.agentId === "string" ? args.agentId : undefined,
        projectContextId: typeof args.projectContextId === "string" ? args.projectContextId : undefined,
        modelRef: typeof args.modelRef === "string" ? args.modelRef : undefined,
        systemPrompt: typeof args.systemPrompt === "string" ? args.systemPrompt : undefined,
        mcpServerIds: Array.isArray(args.mcpServerIds)
          ? args.mcpServerIds.map((item) => String(item).trim()).filter(Boolean)
          : undefined,
        requestedBy: "agent",
      });
      return {
        content: [
          `Spawned subagent ${subagent.id}.`,
          `Status: ${subagent.status}`,
          subagent.runId ? `Run: ${subagent.runId}` : null,
          subagent.sessionId ? `Session: ${subagent.sessionId}` : null,
          `Title: ${subagent.title}`,
        ].filter(Boolean).join("\n"),
        metadata: { subagent },
      };
    }
    case "validate_automation": {
      const report = validateAutomationDraft({
        automationPackage: asObject(args.automationPackage),
        workflow: asObject(args.workflow) as Partial<Workflow> | undefined,
        recipes: Array.isArray(args.recipes)
          ? args.recipes.map((entry) => asObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
          : undefined,
        cronJobs: Array.isArray(args.cronJobs)
          ? args.cronJobs.map((entry) => asObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
          : undefined,
        connections: Array.isArray(args.connections)
          ? args.connections.map((entry) => asObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
          : undefined,
      });

      const details =
        report.checks.length > 0
          ? report.checks
              .map((check) => `- [${check.severity}] ${check.code}: ${check.message}`)
              .join("\n")
          : "- No issues found.";

      return {
        content: `${report.summary}\n${details}`,
        isError: !report.valid,
        metadata: { validationReport: report },
      };
    }
    case "activate_automation": {
      const action = String(args.action ?? "get");
      const packageId = String(args.packageId ?? "").trim();
      if (!packageId) {
        throw new Error("packageId is required.");
      }

      const result =
        action === "get"
          ? await inspectAutomationPackageState(packageId)
          : action === "validate"
          ? await validateAutomationPackageState(packageId)
          : action === "activate"
            ? await activateAutomationPackage(packageId)
            : action === "deactivate"
              ? await deactivateAutomationPackage(packageId)
              : await inspectAutomationPackageState(packageId);

      const blockingDetails =
        result.blockingIssues.length > 0
          ? result.blockingIssues.map((issue) => `- ${issue}`).join("\n")
          : "- No blocking issues.";
      const cronSummary =
        result.cronJobs.length > 0
          ? result.cronJobs
              .map((cronJob) => formatCronSummary(cronJob))
              .join("\n")
          : "- No cron jobs attached.";

      return {
        content: [
          `Automation package ${action === "get" ? "status" : action}:\n${summarizeAutomationPackage(result.automationPackage)}`,
          `Validation: ${result.validationReport.summary}`,
          `Blocking issues:\n${blockingDetails}`,
          `Cron jobs:\n${cronSummary}`,
        ].join("\n"),
        isError:
          action === "activate" && (result.status !== "active" || result.blockingIssues.length > 0),
        metadata: {
          automationPackage: result.automationPackage,
          workflow: result.workflow,
          recipes: result.recipes,
          cronJobs: result.cronJobs,
          connections: result.connections,
          validationReport: result.validationReport,
          blockingIssues: result.blockingIssues,
        },
      };
    }
    case "author_automation": {
      const action = String(args.action ?? "plan");
      const payload = asObject(args.draft) ?? asObject(args.payload);
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      const createdBy = typeof args.createdBy === "string" ? args.createdBy.trim() || undefined : undefined;

      if (action === "plan") {
        if (!prompt) {
          throw new Error("prompt is required for planning automation.");
        }
        const draft = planAutomationFromPrompt(prompt);
        return {
          content: `Automation draft planned:\n${formatAutomationDraftSummary(draft)}`,
          metadata: { automationDraft: draft },
        };
      }

      const draft =
        payload
          ? (payload as AutomationDraft)
          : prompt
            ? planAutomationFromPrompt(prompt)
            : null;

      if (!draft) {
        throw new Error("Either prompt or draft is required to create automation.");
      }

      const compiled = await compileAutomationDraft({
        draft,
        createdBy,
      });

      return {
        content: [
          `Automation package created:\n${summarizeAutomationPackage(compiled.automationPackage)}`,
          compiled.automationPackage.validationReport?.summary
            ? `Validation: ${compiled.automationPackage.validationReport.summary}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          automationDraft: draft,
          automationPackage: compiled.automationPackage,
          workflow: compiled.workflow,
          recipes: compiled.recipes,
          cronJobs: compiled.cronJobs,
          connections: compiled.connections,
          validationReport: compiled.automationPackage.validationReport,
        },
      };
    }
    case "query_database": {
      const connStr = String(args.connectionString ?? "");
      const query = String(args.query ?? "");
      const maxRows = Number(args.maxRows ?? 100);
      const allowWrite = Boolean(args.allowWrite);

      if (!allowWrite && !/^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN|PRAGMA|WITH)\b/i.test(query)) {
        return {
          content: "Error: Only SELECT queries are allowed by default. Set allowWrite=true for write operations.",
          isError: true,
        };
      }

      if (connStr.startsWith("sqlite://")) {
        const dbPath = connStr.replace(/^sqlite:\/\/\/?/, "");
        const { DatabaseSync } = await import("node:sqlite");
        const db = new DatabaseSync(dbPath, { open: true });
        try {
          const params = (args.params as string[]) ?? [];
          if (/^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN|PRAGMA|WITH)\b/i.test(query)) {
            const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
            const limited = rows.slice(0, maxRows);
            if (limited.length === 0) return { content: "Query returned 0 rows." };
            const cols = Object.keys(limited[0]);
            const header = cols.join(" | ");
            const separator = cols.map((c) => "-".repeat(c.length)).join("-+-");
            const body = limited
              .map((r) => cols.map((c) => String(r[c] ?? "NULL")).join(" | "))
              .join("\n");
            return {
              content: `${header}\n${separator}\n${body}\n\n(${limited.length} of ${rows.length} rows)`,
            };
          } else {
            const result = db.prepare(query).run(...params);
            return {
              content: `Query executed. Changes: ${(result as any).changes ?? 0}`,
            };
          }
        } finally {
          db.close();
        }
      }

      return {
        content: `Database type not supported natively. Connection: ${connStr.split("://")[0]}. For PostgreSQL/MySQL, use an MCP server like @anthropic/mcp-postgres or @anthropic/mcp-mysql.`,
      };
    }
    case "render_canvas": {
      const canvasType = String(args.type ?? "html");
      const content = String(args.content ?? "");
      const title = args.title ? String(args.title) : undefined;
      return {
        content: `[canvas:${canvasType}]${title ? ` ${title}` : ""}\n\n${content}`,
        metadata: {
          canvas: {
            type: canvasType,
            content,
            title,
            width: args.width,
            height: args.height,
          },
        },
      };
    }
    case "execute_code": {
      const fsSync = await import("node:fs");
      const os = await import("node:os");
      const pathMod = await import("node:path");

      const language = String(args.language ?? "javascript");
      const code = String(args.code ?? "");
      const timeout = Math.min(Number(args.timeout ?? 30000), 120000);
      const stdinInput = args.stdin ? String(args.stdin) : undefined;

      let cmd: string;
      let cmdArgs: string[];
      let tmpFile: string | null = null;

      const tmpDir = os.tmpdir();

      switch (language) {
        case "javascript":
        case "typescript": {
          const ext = language === "typescript" ? ".ts" : ".js";
          tmpFile = pathMod.join(tmpDir, `codex-sandbox-${Date.now()}${ext}`);
          fsSync.writeFileSync(tmpFile, code);
          if (language === "typescript") {
            cmd = "npx";
            cmdArgs = ["tsx", tmpFile];
          } else {
            cmd = "node";
            cmdArgs = [tmpFile];
          }
          break;
        }
        case "python": {
          tmpFile = pathMod.join(tmpDir, `codex-sandbox-${Date.now()}.py`);
          fsSync.writeFileSync(tmpFile, code);
          cmd = "python3";
          cmdArgs = [tmpFile];
          break;
        }
        case "bash": {
          tmpFile = pathMod.join(tmpDir, `codex-sandbox-${Date.now()}.sh`);
          fsSync.writeFileSync(tmpFile, code);
          cmd = "bash";
          cmdArgs = [tmpFile];
          break;
        }
        default:
          return { content: `Unsupported language: ${language}`, isError: true };
      }

      const capturedTmpFile = tmpFile;
      return await new Promise<NativeToolExecutionResult>((resolve) => {
        const proc = spawn(cmd, cmdArgs, {
          timeout,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d: Buffer) => {
          stderr += d.toString();
        });

        if (stdinInput) {
          proc.stdin.write(stdinInput);
          proc.stdin.end();
        }

        proc.on("close", (exitCode: number | null) => {
          if (capturedTmpFile) {
            try {
              fsSync.unlinkSync(capturedTmpFile);
            } catch {}
          }
          const parts: string[] = [];
          if (stdout) parts.push(`--- stdout ---\n${stdout.slice(0, 50000)}`);
          if (stderr) parts.push(`--- stderr ---\n${stderr.slice(0, 10000)}`);
          parts.push(`Exit code: ${exitCode ?? "unknown"}`);
          resolve({ content: parts.join("\n\n") });
        });

        proc.on("error", (err: Error) => {
          if (capturedTmpFile) {
            try {
              fsSync.unlinkSync(capturedTmpFile);
            } catch {}
          }
          resolve({
            content: `Execution error: ${err.message}. Make sure ${cmd} is installed.`,
            isError: true,
          });
        });
      });
    }
  }
}
