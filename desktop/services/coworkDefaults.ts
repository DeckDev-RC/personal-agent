import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig } from "../../src/types/agent.js";
import type { McpCatalogEntry } from "../../src/types/mcp.js";
import type { Skill } from "../../src/types/skill.js";
import type { Workflow, WorkflowSchedule, WorkflowStep } from "../../src/types/workflow.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const skillDirCandidates = [
  path.resolve(process.cwd(), "data", "skills"),
  path.resolve(moduleDir, "../../data/skills"),
  path.resolve(moduleDir, "../../../data/skills"),
];

const workflowDirCandidates = [
  path.resolve(process.cwd(), "data", "workflows"),
  path.resolve(moduleDir, "../../data/workflows"),
  path.resolve(moduleDir, "../../../data/workflows"),
];

const agentDirCandidates = [
  path.resolve(process.cwd(), "data", "agents"),
  path.resolve(moduleDir, "../../data/agents"),
  path.resolve(moduleDir, "../../../data/agents"),
];

let cachedCoworkSkills: Promise<Skill[]> | null = null;
let cachedCoworkWorkflows: Promise<Workflow[]> | null = null;
let cachedCoworkAgents: Promise<AgentConfig[]> | null = null;

export const RECOMMENDED_MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Read channels, send updates, and react to team messages from the agent.",
    category: "Communication",
    maintainer: "Model Context Protocol",
    docsUrl: "https://www.npmjs.com/package/@modelcontextprotocol/server-slack",
    packageName: "@modelcontextprotocol/server-slack",
    setupHint: "Use a bot token with access to the channels you want the agent to read and write.",
    recommendedTools: ["post_message", "list_channels", "search_messages"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "",
    },
    fields: [
      {
        id: "slack-bot-token",
        label: "Slack bot token",
        kind: "env",
        key: "SLACK_BOT_TOKEN",
        placeholder: "xoxb-...",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "microsoft-teams-bridge",
    name: "Microsoft Teams Bridge",
    description: "Connect a custom MCP bridge for Microsoft Teams channels, chats, and outbound updates.",
    category: "Communication",
    maintainer: "Custom MCP",
    setupHint: "Provide the URL of an HTTP MCP bridge that wraps Microsoft Teams or Graph messaging APIs.",
    recommendedTools: ["send_message", "list_messages", "list_channels"],
    type: "http",
    fields: [
      {
        id: "teams-bridge-url",
        label: "Bridge URL",
        kind: "url",
        placeholder: "http://localhost:8787/mcp",
        helperText: "Expected to expose outbound tools such as send_message or list_messages.",
        required: true,
      },
    ],
  },
  {
    id: "discord-bridge",
    name: "Discord Bridge",
    description: "Connect a custom MCP bridge for Discord channels, DMs, and moderation workflows.",
    category: "Communication",
    maintainer: "Custom MCP",
    setupHint: "Point this at a Discord-aware MCP bridge or gateway running locally or on your network.",
    recommendedTools: ["send_message", "post_message", "list_messages"],
    type: "http",
    fields: [
      {
        id: "discord-bridge-url",
        label: "Bridge URL",
        kind: "url",
        placeholder: "http://localhost:8788/mcp",
        helperText: "Use a bridge that maps Discord channels/users to MCP tools.",
        required: true,
      },
    ],
  },
  {
    id: "telegram-bridge",
    name: "Telegram Bridge",
    description: "Connect a custom MCP bridge for Telegram bots, channels, and direct chats.",
    category: "Communication",
    maintainer: "Custom MCP",
    setupHint: "Use a bridge backed by the Telegram Bot API and expose send/list message tools over MCP.",
    recommendedTools: ["send_message", "list_messages", "get_chat"],
    type: "http",
    fields: [
      {
        id: "telegram-bridge-url",
        label: "Bridge URL",
        kind: "url",
        placeholder: "http://localhost:8789/mcp",
        helperText: "Chat IDs and @usernames can be sent through the compose flow.",
        required: true,
      },
    ],
  },
  {
    id: "whatsapp-bridge",
    name: "WhatsApp Bridge",
    description: "Connect a custom MCP bridge for WhatsApp Cloud or Business messaging workflows.",
    category: "Communication",
    maintainer: "Custom MCP",
    setupHint: "Point this at a bridge that wraps WhatsApp Business or Cloud API capabilities.",
    recommendedTools: ["send_message", "send_whatsapp_message", "list_messages"],
    type: "http",
    fields: [
      {
        id: "whatsapp-bridge-url",
        label: "Bridge URL",
        kind: "url",
        placeholder: "http://localhost:8790/mcp",
        helperText: "Useful for customer support, reminders, and transactional updates.",
        required: true,
      },
    ],
  },
  {
    id: "signal-bridge",
    name: "Signal Bridge",
    description: "Connect a custom MCP bridge for Signal chats and secure outbound notifications.",
    category: "Communication",
    maintainer: "Custom MCP",
    setupHint: "Use a bridge around signal-cli or another Signal-compatible service that exposes MCP tools.",
    recommendedTools: ["send_message", "list_messages"],
    type: "http",
    fields: [
      {
        id: "signal-bridge-url",
        label: "Bridge URL",
        kind: "url",
        placeholder: "http://localhost:8791/mcp",
        helperText: "Good fit for private operational notifications and alerts.",
        required: true,
      },
    ],
  },
  {
    id: "twilio-sms-bridge",
    name: "Twilio SMS Bridge",
    description: "Connect a custom MCP bridge that sends transactional or conversational SMS messages.",
    category: "Communication",
    maintainer: "Custom MCP",
    setupHint: "Use a bridge that wraps Twilio or another SMS provider and exposes send_sms/send_message tools.",
    recommendedTools: ["send_sms", "send_message", "list_messages"],
    type: "http",
    fields: [
      {
        id: "twilio-bridge-url",
        label: "Bridge URL",
        kind: "url",
        placeholder: "http://localhost:8792/mcp",
        helperText: "Phone numbers are passed directly from the compose flow.",
        required: true,
      },
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive / Docs",
    description: "Search docs, fetch notes, and work with Drive files during research or drafting.",
    category: "Knowledge",
    maintainer: "Community",
    docsUrl: "https://www.npmjs.com/package/@piotr-agier/google-drive-mcp",
    packageName: "@piotr-agier/google-drive-mcp",
    setupHint: "Most Drive servers require Google OAuth credentials. Review the package docs if the defaults need adjustment.",
    recommendedTools: ["search_drive", "read_doc", "list_files"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@piotr-agier/google-drive-mcp"],
    env: {
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/oauth2callback",
    },
    fields: [
      {
        id: "drive-client-id",
        label: "Google client ID",
        kind: "env",
        key: "GOOGLE_CLIENT_ID",
        placeholder: "Google OAuth client ID",
        required: true,
      },
      {
        id: "drive-client-secret",
        label: "Google client secret",
        kind: "env",
        key: "GOOGLE_CLIENT_SECRET",
        placeholder: "Google OAuth client secret",
        secret: true,
        required: true,
      },
      {
        id: "drive-redirect-uri",
        label: "Redirect URI",
        kind: "env",
        key: "GOOGLE_REDIRECT_URI",
        placeholder: "http://localhost:3000/oauth2callback",
        defaultValue: "http://localhost:3000/oauth2callback",
      },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Search inbox, draft replies, and gather context from email threads.",
    category: "Communication",
    maintainer: "Community",
    docsUrl: "https://www.npmjs.com/package/@mjamei/gmail-mcp",
    packageName: "@mjamei/gmail-mcp",
    setupHint: "Gmail MCP templates vary by package. This template uses common Google OAuth fields and can be refined in the editor.",
    recommendedTools: ["search_email", "read_email", "draft_reply"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@mjamei/gmail-mcp"],
    env: {
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/oauth2callback",
    },
    fields: [
      {
        id: "gmail-client-id",
        label: "Google client ID",
        kind: "env",
        key: "GOOGLE_CLIENT_ID",
        placeholder: "Google OAuth client ID",
        required: true,
      },
      {
        id: "gmail-client-secret",
        label: "Google client secret",
        kind: "env",
        key: "GOOGLE_CLIENT_SECRET",
        placeholder: "Google OAuth client secret",
        secret: true,
        required: true,
      },
      {
        id: "gmail-redirect-uri",
        label: "Redirect URI",
        kind: "env",
        key: "GOOGLE_REDIRECT_URI",
        placeholder: "http://localhost:3000/oauth2callback",
        defaultValue: "http://localhost:3000/oauth2callback",
      },
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Check availability, list upcoming meetings, and create new events.",
    category: "Planning",
    maintainer: "Community",
    docsUrl: "https://www.npmjs.com/package/@takumi0706/google-calendar-mcp",
    packageName: "@takumi0706/google-calendar-mcp",
    setupHint: "Use an OAuth client that is allowed to read and modify calendar events.",
    recommendedTools: ["list_events", "create_event", "check_availability"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@takumi0706/google-calendar-mcp"],
    env: {
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/oauth2callback",
    },
    fields: [
      {
        id: "calendar-client-id",
        label: "Google client ID",
        kind: "env",
        key: "GOOGLE_CLIENT_ID",
        placeholder: "Google OAuth client ID",
        required: true,
      },
      {
        id: "calendar-client-secret",
        label: "Google client secret",
        kind: "env",
        key: "GOOGLE_CLIENT_SECRET",
        placeholder: "Google OAuth client secret",
        secret: true,
        required: true,
      },
      {
        id: "calendar-redirect-uri",
        label: "Redirect URI",
        kind: "env",
        key: "GOOGLE_REDIRECT_URI",
        placeholder: "http://localhost:3000/oauth2callback",
        defaultValue: "http://localhost:3000/oauth2callback",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Search workspace pages, read specs, and capture notes or action items.",
    category: "Knowledge",
    maintainer: "Notion",
    docsUrl: "https://www.npmjs.com/package/@notionhq/notion-mcp-server",
    packageName: "@notionhq/notion-mcp-server",
    setupHint: "Create an internal integration token and share the pages or databases with that integration.",
    recommendedTools: ["search_pages", "read_page", "create_page"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      NOTION_API_KEY: "",
    },
    fields: [
      {
        id: "notion-api-key",
        label: "Notion API key",
        kind: "env",
        key: "NOTION_API_KEY",
        placeholder: "secret_...",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "List issues, update status, and create tasks from agent output.",
    category: "Execution",
    maintainer: "Community",
    docsUrl: "https://www.npmjs.com/package/@ibraheem4/linear-mcp",
    packageName: "@ibraheem4/linear-mcp",
    setupHint: "Use a Linear API key with access to the teams and projects you want to manage.",
    recommendedTools: ["list_issues", "create_issue", "update_issue"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@ibraheem4/linear-mcp"],
    env: {
      LINEAR_API_KEY: "",
    },
    fields: [
      {
        id: "linear-api-key",
        label: "Linear API key",
        kind: "env",
        key: "LINEAR_API_KEY",
        placeholder: "lin_api_...",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Inspect repositories, issues, and pull requests without leaving the chat.",
    category: "Engineering",
    maintainer: "Model Context Protocol",
    docsUrl: "https://www.npmjs.com/package/@modelcontextprotocol/server-github",
    packageName: "@modelcontextprotocol/server-github",
    setupHint: "Generate a personal access token with the repo scopes you need.",
    recommendedTools: ["list_pull_requests", "read_issue", "search_code"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "",
    },
    fields: [
      {
        id: "github-pat",
        label: "GitHub personal access token",
        kind: "env",
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        placeholder: "ghp_...",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Let the agent inspect local folders such as meeting notes, drafts, and research docs.",
    category: "Workspace",
    maintainer: "Model Context Protocol",
    docsUrl: "https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem",
    packageName: "@modelcontextprotocol/server-filesystem",
    setupHint: "Pass one or more folders the server is allowed to read and write.",
    recommendedTools: ["read_file", "write_file", "search_files"],
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", ""],
    fields: [
      {
        id: "filesystem-root",
        label: "Workspace root",
        kind: "arg",
        index: 2,
        placeholder: "C:\\Users\\User\\OpenClaw",
        helperText: "Choose the folder you want the agent to access.",
        required: true,
      },
    ],
  },
];

function normalizeSkill(skill: Partial<Skill>, fallbackTimestamp: number): Skill {
  const createdAt = Number(skill.createdAt ?? 0) > 0 ? Number(skill.createdAt) : fallbackTimestamp;
  const updatedAt = Number(skill.updatedAt ?? 0) > 0 ? Number(skill.updatedAt) : fallbackTimestamp;
  return {
    id: String(skill.id ?? ""),
    name: skill.name?.trim() || "Cowork Skill",
    description: skill.description?.trim() || "",
    content: skill.content?.trim() || "",
    type: skill.type === "tool" ? "tool" : "prompt",
    tags: Array.isArray(skill.tags) ? skill.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean) : [],
    createdAt,
    updatedAt,
  };
}

function normalizeAgent(agent: Partial<AgentConfig>, fallbackTimestamp: number): AgentConfig {
  const createdAt = Number(agent.createdAt ?? 0) > 0 ? Number(agent.createdAt) : fallbackTimestamp;
  const updatedAt = Number(agent.updatedAt ?? 0) > 0 ? Number(agent.updatedAt) : fallbackTimestamp;

  return {
    id: String(agent.id ?? ""),
    name: agent.name?.trim() || "Cowork Agent",
    description: agent.description?.trim() || "",
    systemPrompt: agent.systemPrompt?.trim() || "You are a helpful cowork assistant.",
    model: agent.model?.trim() || "openai-codex/gpt-5.4",
    skillIds: Array.isArray(agent.skillIds)
      ? agent.skillIds.map((skillId) => String(skillId).trim()).filter(Boolean)
      : [],
    mcpServerIds: Array.isArray(agent.mcpServerIds)
      ? agent.mcpServerIds.map((serverId) => String(serverId).trim()).filter(Boolean)
      : [],
    projectContextId: typeof agent.projectContextId === "string" ? agent.projectContextId.trim() || undefined : undefined,
    defaultWorkspaceId:
      typeof agent.defaultWorkspaceId === "string" ? agent.defaultWorkspaceId.trim() || undefined : undefined,
    memoryPolicy: agent.memoryPolicy,
    toolPolicy: agent.toolPolicy,
    automationPolicy: agent.automationPolicy,
    createdAt,
    updatedAt,
  };
}

function normalizeWorkflowStep(step: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: String(step.id ?? ""),
    type:
      step.type === "tool-call" ||
      step.type === "memory-query" ||
      step.type === "conditional" ||
      step.type === "delay" ||
      step.type === "reindex-workspace" ||
      step.type === "skill-execute"
        ? step.type
        : "agent-chat",
    agentId: typeof step.agentId === "string" ? step.agentId : undefined,
    skillId: typeof step.skillId === "string" ? step.skillId : undefined,
    prompt: typeof step.prompt === "string" ? step.prompt.trim() : undefined,
    condition: typeof step.condition === "string" ? step.condition.trim() : undefined,
    delayMs: typeof step.delayMs === "number" ? step.delayMs : undefined,
    toolName: typeof step.toolName === "string" ? step.toolName.trim() : undefined,
    toolArgs:
      step.toolArgs && typeof step.toolArgs === "object"
        ? Object.fromEntries(
            Object.entries(step.toolArgs as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
          )
        : undefined,
    memoryQuery: typeof step.memoryQuery === "string" ? step.memoryQuery.trim() : undefined,
    memoryLimit: typeof step.memoryLimit === "number" ? step.memoryLimit : undefined,
    onSuccess: typeof step.onSuccess === "string" ? step.onSuccess : undefined,
    onFailure: typeof step.onFailure === "string" ? step.onFailure : undefined,
  };
}

function normalizeWorkflowSchedule(schedule: Partial<WorkflowSchedule> | undefined): WorkflowSchedule | undefined {
  if (!schedule) {
    return undefined;
  }

  const mode =
    schedule.mode === "cron" || (typeof schedule.cronExpression === "string" && schedule.cronExpression.trim())
      ? "cron"
      : "interval";

  return {
    enabled: Boolean(schedule.enabled),
    mode,
    intervalMinutes:
      mode === "interval"
        ? typeof schedule.intervalMinutes === "number" && Number.isFinite(schedule.intervalMinutes)
          ? Math.max(1, Math.round(schedule.intervalMinutes))
          : 60
        : undefined,
    cronExpression:
      mode === "cron" && typeof schedule.cronExpression === "string"
        ? schedule.cronExpression.trim()
        : undefined,
    nextRunAt: typeof schedule.nextRunAt === "number" ? schedule.nextRunAt : undefined,
    lastRunAt: typeof schedule.lastRunAt === "number" ? schedule.lastRunAt : undefined,
    retryOnFailure: schedule.retryOnFailure === true,
    maxRetries:
      typeof schedule.maxRetries === "number" && Number.isFinite(schedule.maxRetries)
        ? Math.max(0, Math.round(schedule.maxRetries))
        : undefined,
  };
}

function normalizeWorkflow(workflow: Partial<Workflow>, fallbackTimestamp: number): Workflow {
  const createdAt = Number(workflow.createdAt ?? 0) > 0 ? Number(workflow.createdAt) : fallbackTimestamp;
  const updatedAt = Number(workflow.updatedAt ?? 0) > 0 ? Number(workflow.updatedAt) : fallbackTimestamp;

  return {
    id: String(workflow.id ?? ""),
    name: workflow.name?.trim() || "Cowork Workflow",
    description: workflow.description?.trim() || "",
    steps: Array.isArray(workflow.steps) ? workflow.steps.map(normalizeWorkflowStep) : [],
    variables:
      workflow.variables && typeof workflow.variables === "object"
        ? Object.fromEntries(
            Object.entries(workflow.variables).map(([key, value]) => [key, String(value ?? "")]),
          )
        : {},
    schedule: normalizeWorkflowSchedule(workflow.schedule),
    createdAt,
    updatedAt,
  };
}

async function resolveSkillsDir(): Promise<string> {
  for (const candidate of skillDirCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Default cowork skill directory not found.");
}

async function resolveWorkflowsDir(): Promise<string> {
  for (const candidate of workflowDirCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Default cowork workflow directory not found.");
}

async function resolveAgentsDir(): Promise<string> {
  for (const candidate of agentDirCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Default cowork agent directory not found.");
}

export async function loadDefaultCoworkSkills(): Promise<Skill[]> {
  if (!cachedCoworkSkills) {
    cachedCoworkSkills = (async () => {
      const skillsDir = await resolveSkillsDir();
      const fileNames = (await fs.readdir(skillsDir))
        .filter((fileName) => fileName.endsWith(".json"))
        .sort((left, right) => left.localeCompare(right));
      const baseTimestamp = Date.now();

      const skills = await Promise.all(
        fileNames.map(async (fileName, index) => {
          const raw = await fs.readFile(path.join(skillsDir, fileName), "utf8");
          return normalizeSkill(JSON.parse(raw) as Partial<Skill>, baseTimestamp + index);
        }),
      );

      return skills;
    })();
  }

  return cachedCoworkSkills;
}

export async function loadDefaultCoworkWorkflows(): Promise<Workflow[]> {
  if (!cachedCoworkWorkflows) {
    cachedCoworkWorkflows = (async () => {
      const workflowsDir = await resolveWorkflowsDir();
      const fileNames = (await fs.readdir(workflowsDir))
        .filter((fileName) => fileName.endsWith(".json"))
        .sort((left, right) => left.localeCompare(right));
      const baseTimestamp = Date.now();

      const workflows = await Promise.all(
        fileNames.map(async (fileName, index) => {
          const raw = await fs.readFile(path.join(workflowsDir, fileName), "utf8");
          return normalizeWorkflow(JSON.parse(raw) as Partial<Workflow>, baseTimestamp + index);
        }),
      );

      return workflows;
    })();
  }

  return cachedCoworkWorkflows;
}

export async function loadDefaultCoworkAgents(): Promise<AgentConfig[]> {
  if (!cachedCoworkAgents) {
    cachedCoworkAgents = (async () => {
      const agentsDir = await resolveAgentsDir();
      const fileNames = (await fs.readdir(agentsDir))
        .filter((fileName) => fileName.endsWith(".json"))
        .sort((left, right) => left.localeCompare(right));
      const baseTimestamp = Date.now();

      const agents = await Promise.all(
        fileNames.map(async (fileName, index) => {
          const raw = await fs.readFile(path.join(agentsDir, fileName), "utf8");
          return normalizeAgent(JSON.parse(raw) as Partial<AgentConfig>, baseTimestamp + index);
        }),
      );

      return agents;
    })();
  }

  return cachedCoworkAgents;
}
