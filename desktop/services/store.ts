import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { Conversation, ConversationSummary } from "../../src/types/conversation.js";
import type { AgentConfig } from "../../src/types/agent.js";
import {
  getDefaultModelRef,
  getModelId,
  normalizeProviderName,
  splitModelRef,
  type CanonicalProviderName,
} from "../../src/types/model.js";
import type { Skill } from "../../src/types/skill.js";
import type { Workflow } from "../../src/types/workflow.js";
import type { McpServerConfig } from "../../src/types/mcp.js";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { app } = electron;

function dataDir(): string {
  return path.join(app.getPath("userData"), "codex-agent-data");
}

function conversationsDir(): string {
  return path.join(dataDir(), "conversations");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const dir = conversationsDir();
  await ensureDir(dir);
  const files = await fs.readdir(dir);
  const summaries: ConversationSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const conv = await readJsonFile<Conversation | null>(path.join(dir, file), null);
    if (!conv) continue;
    summaries.push({
      id: conv.id,
      title: conv.title,
      agentId: conv.agentId,
      model: conv.model,
      messageCount: conv.messages.length,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    });
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const filePath = path.join(conversationsDir(), `${id}.json`);
  return readJsonFile<Conversation | null>(filePath, null);
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const filePath = path.join(conversationsDir(), `${conv.id}.json`);
  await writeJsonFile(filePath, conv);
}

export async function deleteConversation(id: string): Promise<void> {
  const filePath = path.join(conversationsDir(), `${id}.json`);
  try {
    await fs.unlink(filePath);
  } catch {
    // Already deleted or never existed.
  }
}

type CollectionName = "agents" | "skills" | "workflows" | "mcp-servers";

function collectionPath(name: CollectionName): string {
  return path.join(dataDir(), `${name}.json`);
}

async function readCollection<T>(name: CollectionName): Promise<T[]> {
  return readJsonFile<T[]>(collectionPath(name), []);
}

async function writeCollection<T>(name: CollectionName, items: T[]): Promise<void> {
  await writeJsonFile(collectionPath(name), items);
}

export async function listAgents(): Promise<AgentConfig[]> {
  return readCollection<AgentConfig>("agents");
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const agents = await listAgents();
  return agents.find((a) => a.id === id) ?? null;
}

export async function saveAgent(agent: AgentConfig): Promise<void> {
  const agents = await listAgents();
  const idx = agents.findIndex((a) => a.id === agent.id);
  if (idx >= 0) agents[idx] = agent;
  else agents.push(agent);
  await writeCollection("agents", agents);
}

export async function deleteAgent(id: string): Promise<void> {
  const agents = await listAgents();
  await writeCollection(
    "agents",
    agents.filter((a) => a.id !== id),
  );
}

export async function listSkills(): Promise<Skill[]> {
  return readCollection<Skill>("skills");
}

export async function getSkill(id: string): Promise<Skill | null> {
  const skills = await listSkills();
  return skills.find((s) => s.id === id) ?? null;
}

export async function saveSkill(skill: Skill): Promise<void> {
  const skills = await listSkills();
  const idx = skills.findIndex((s) => s.id === skill.id);
  if (idx >= 0) skills[idx] = skill;
  else skills.push(skill);
  await writeCollection("skills", skills);
}

export async function deleteSkill(id: string): Promise<void> {
  const skills = await listSkills();
  await writeCollection(
    "skills",
    skills.filter((s) => s.id !== id),
  );
}

export async function listWorkflows(): Promise<Workflow[]> {
  return readCollection<Workflow>("workflows");
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const workflows = await listWorkflows();
  return workflows.find((w) => w.id === id) ?? null;
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const workflows = await listWorkflows();
  const idx = workflows.findIndex((w) => w.id === workflow.id);
  if (idx >= 0) workflows[idx] = workflow;
  else workflows.push(workflow);
  await writeCollection("workflows", workflows);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const workflows = await listWorkflows();
  await writeCollection(
    "workflows",
    workflows.filter((w) => w.id !== id),
  );
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  return readCollection<McpServerConfig>("mcp-servers");
}

export async function getMcpServer(id: string): Promise<McpServerConfig | null> {
  const servers = await listMcpServers();
  return servers.find((s) => s.id === id) ?? null;
}

export async function saveMcpServer(server: McpServerConfig): Promise<void> {
  const servers = await listMcpServers();
  const idx = servers.findIndex((s) => s.id === server.id);
  if (idx >= 0) servers[idx] = server;
  else servers.push(server);
  await writeCollection("mcp-servers", servers);
}

export async function deleteMcpServer(id: string): Promise<void> {
  const servers = await listMcpServers();
  await writeCollection(
    "mcp-servers",
    servers.filter((s) => s.id !== id),
  );
}

export type AppSettings = {
  provider: CanonicalProviderName;
  defaultModelRef: string;
  fastModelRef: string;
  reviewModelRef: string;
  defaultModel: string;
  fastModel: string;
  reviewModel: string;
  language: "pt-BR" | "en";
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  planMode: boolean;
  fastMode: boolean;
  globalSystemPrompt: string;
  contextWindow: number;
  compactAtTokens: number;
  maxOutputTokens: number;
};

const DEFAULT_SETTINGS: AppSettings = {
  provider: "openai-codex",
  defaultModelRef: getDefaultModelRef("openai-codex"),
  fastModelRef: "openai-codex/gpt-5.4-mini",
  reviewModelRef: getDefaultModelRef("openai-codex"),
  defaultModel: getDefaultModelRef("openai-codex"),
  fastModel: "openai-codex/gpt-5.4-mini",
  reviewModel: getDefaultModelRef("openai-codex"),
  language: "pt-BR",
  reasoningEffort: "medium",
  planMode: false,
  fastMode: false,
  globalSystemPrompt: "",
  contextWindow: 128000,
  compactAtTokens: 96000,
  maxOutputTokens: 4096,
};

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  const provider = normalizeProviderName(
    settings?.provider ??
      splitModelRef(settings?.defaultModelRef ?? settings?.defaultModel).provider,
  );
  const defaultModelRef = splitModelRef(getModelId(settings?.defaultModelRef ?? settings?.defaultModel), provider).modelRef;
  const fastModelRef = splitModelRef(getModelId(settings?.fastModelRef ?? settings?.fastModel), provider).modelRef;
  const reviewModelRef = splitModelRef(getModelId(settings?.reviewModelRef ?? settings?.reviewModel), provider).modelRef;

  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    provider,
    defaultModelRef,
    fastModelRef,
    reviewModelRef,
    defaultModel: defaultModelRef,
    fastModel: fastModelRef,
    reviewModel: reviewModelRef,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const saved = await readJsonFile<Partial<AppSettings> | null>(
    path.join(dataDir(), "settings.json"),
    null,
  );
  return normalizeSettings(saved);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeJsonFile(path.join(dataDir(), "settings.json"), normalizeSettings(settings));
}
