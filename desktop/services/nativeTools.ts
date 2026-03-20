import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ReminderRecurrence } from "../../src/types/reminder.js";
import { applySimplePatch } from "./simplePatch.js";
import type { ToolMetadata } from "../../src/types/runtime.js";
import { createReminder, listReminders } from "./reminderScheduler.js";
import { runWebSearch } from "./webSearchProvider.js";
import { completeTask, createTask, deleteTask, listTasks, updateTask } from "./taskManager.js";
import { getSessionRecord } from "./v2SessionStore.js";

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
  | "manage_tasks"
  | "set_reminder"
  | "list_reminders";

export type ToolRiskDecision =
  | { mode: "allow"; reason: string }
  | { mode: "approval"; reason: string; riskLevel: "medium" | "high" }
  | { mode: "deny"; reason: string };

export type NativeToolContext = {
  workspaceRoot: string;
  sessionId?: string;
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

  if (toolName === "manage_tasks") {
    if (String(args.action ?? "list") === "delete") {
      return { mode: "approval", reason: "Deleting tasks requires confirmation.", riskLevel: "medium" };
    }
    return { mode: "allow", reason: "Local task management is allowed." };
  }

  if (toolName === "set_reminder" || toolName === "list_reminders") {
    return { mode: "allow", reason: "Local reminders are allowed." };
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
  }
}
