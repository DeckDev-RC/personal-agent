import type { AgentConfig } from "../../src/types/agent.js";
import {
  getModelId,
  getDefaultModelRef,
  normalizeProviderName,
  splitModelRef,
  type CanonicalProviderName,
} from "../../src/types/model.js";
import type { McpServerConfig } from "../../src/types/mcp.js";
import type { PersonaConfig } from "../../src/types/persona.js";
import type { ProactivitySettings } from "../../src/types/proactive.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import type { Skill } from "../../src/types/skill.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { Workflow } from "../../src/types/workflow.js";
import { loadDefaultCoworkAgents, loadDefaultCoworkSkills, loadDefaultCoworkWorkflows } from "./coworkDefaults.js";
import { ensureV2Db } from "./v2Db.js";

export type V2AppSettings = {
  provider: CanonicalProviderName;
  defaultModelRef: string;
  fastModelRef: string;
  reviewModelRef: string;
  defaultModel: string;
  fastModel: string;
  reviewModel: string;
  language: "pt-BR" | "en" | "es" | "de" | "zh-CN" | "zh-TW";
  themeMode: "dark" | "light" | "system";
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  planMode: boolean;
  fastMode: boolean;
  onboardingCompleted: boolean;
  globalSystemPrompt: string;
  contextWindow: number;
  compactAtTokens: number;
  maxOutputTokens: number;
  webSearch: {
    endpoint: string;
    apiKey: string;
    timeoutMs: number;
    maxResults: number;
  };
  reasoningPolicyByTask: Record<string, "low" | "medium" | "high" | "xhigh">;
  proactivity: ProactivitySettings;
  persona?: PersonaConfig;
};

export const DEFAULT_PROACTIVITY_SETTINGS: ProactivitySettings = {
  enabled: true,
  dashboard: true,
  chat: true,
  frequency: "balanced",
  suggestionTypes: {
    tasks: true,
    routines: true,
    context: true,
    communication: true,
  },
};

export const DEFAULT_V2_SETTINGS: V2AppSettings = {
  provider: "openai-codex",
  defaultModelRef: getDefaultModelRef("openai-codex"),
  fastModelRef: "openai-codex/gpt-5.4-mini",
  reviewModelRef: getDefaultModelRef("openai-codex"),
  defaultModel: getDefaultModelRef("openai-codex"),
  fastModel: "openai-codex/gpt-5.4-mini",
  reviewModel: getDefaultModelRef("openai-codex"),
  language: "pt-BR",
  themeMode: "dark",
  reasoningEffort: "medium",
  planMode: false,
  fastMode: false,
  onboardingCompleted: false,
  globalSystemPrompt: "",
  contextWindow: 128000,
  compactAtTokens: 96000,
  maxOutputTokens: 4096,
  webSearch: {
    endpoint: "",
    apiKey: "",
    timeoutMs: 15000,
    maxResults: 5,
  },
  reasoningPolicyByTask: {
    chat_simple: "low",
    plan_research: "medium",
    code_read: "medium",
    code_change: "high",
    command_exec: "medium",
    review_fix: "high",
    tool_invoke: "medium",
  },
  proactivity: DEFAULT_PROACTIVITY_SETTINGS,
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeSettings(settings?: Partial<V2AppSettings> | null): V2AppSettings {
  const provider = normalizeProviderName(
    settings?.provider ??
      splitModelRef(settings?.defaultModelRef ?? settings?.defaultModel).provider,
  );
  const defaultModelRef = splitModelRef(getModelId(settings?.defaultModelRef ?? settings?.defaultModel), provider).modelRef;
  const fastModelRef = splitModelRef(getModelId(settings?.fastModelRef ?? settings?.fastModel), provider).modelRef;
  const reviewModelRef = splitModelRef(getModelId(settings?.reviewModelRef ?? settings?.reviewModel), provider).modelRef;

  return {
    ...DEFAULT_V2_SETTINGS,
    ...(settings ?? {}),
    provider,
    defaultModelRef,
    fastModelRef,
    reviewModelRef,
    defaultModel: defaultModelRef,
    fastModel: fastModelRef,
    reviewModel: reviewModelRef,
    reasoningPolicyByTask: {
      ...DEFAULT_V2_SETTINGS.reasoningPolicyByTask,
      ...(settings?.reasoningPolicyByTask ?? {}),
    },
    proactivity: {
      ...DEFAULT_PROACTIVITY_SETTINGS,
      ...(settings?.proactivity ?? {}),
      suggestionTypes: {
        ...DEFAULT_PROACTIVITY_SETTINGS.suggestionTypes,
        ...(settings?.proactivity?.suggestionTypes ?? {}),
      },
    },
  };
}

let agentSeedPromise: Promise<void> | null = null;
let coworkAgentsSeeded = false;
let skillSeedPromise: Promise<void> | null = null;
let coworkSkillsSeeded = false;
let workflowSeedPromise: Promise<void> | null = null;
let coworkWorkflowsSeeded = false;

async function seedDefaultEntities<T extends { id: string; updatedAt?: number }>(params: {
  kind: "agents" | "skills" | "workflows";
  defaults: T[];
}): Promise<void> {
  const db = await ensureV2Db();
  const existingRows = db
    .prepare("SELECT id FROM entities WHERE kind = ?")
    .all(params.kind) as Array<Record<string, unknown>>;
  const existingIds = new Set(existingRows.map((row) => String(row.id)));
  const insert = db.prepare(
    `
      INSERT OR REPLACE INTO entities (kind, id, payload_json, updated_at)
      VALUES (?1, ?2, ?3, ?4)
    `,
  );

  for (const item of params.defaults) {
    if (existingIds.has(item.id)) {
      continue;
    }

    insert.run(params.kind, item.id, JSON.stringify(item), Number(item.updatedAt ?? Date.now()));
  }
}

async function ensureDefaultCoworkSkillsSeeded(): Promise<void> {
  if (coworkSkillsSeeded) {
    return;
  }

  if (skillSeedPromise) {
    await skillSeedPromise;
    return;
  }

  skillSeedPromise = (async () => {
    const defaults = await loadDefaultCoworkSkills();
    await seedDefaultEntities({ kind: "skills", defaults });
    coworkSkillsSeeded = true;
  })();

  try {
    await skillSeedPromise;
  } finally {
    skillSeedPromise = null;
  }
}

async function ensureDefaultCoworkAgentsSeeded(): Promise<void> {
  if (coworkAgentsSeeded) {
    return;
  }

  if (agentSeedPromise) {
    await agentSeedPromise;
    return;
  }

  agentSeedPromise = (async () => {
    const defaults = await loadDefaultCoworkAgents();
    await seedDefaultEntities({ kind: "agents", defaults });
    coworkAgentsSeeded = true;
  })();

  try {
    await agentSeedPromise;
  } finally {
    agentSeedPromise = null;
  }
}

async function ensureDefaultCoworkWorkflowsSeeded(): Promise<void> {
  if (coworkWorkflowsSeeded) {
    return;
  }

  if (workflowSeedPromise) {
    await workflowSeedPromise;
    return;
  }

  workflowSeedPromise = (async () => {
    const defaults = await loadDefaultCoworkWorkflows();
    await seedDefaultEntities({ kind: "workflows", defaults });
    coworkWorkflowsSeeded = true;
  })();

  try {
    await workflowSeedPromise;
  } finally {
    workflowSeedPromise = null;
  }
}

type EntityKind = "agents" | "skills" | "workflows" | "mcp_servers" | "project_contexts" | "web_recipes";

async function listEntities<T>(kind: EntityKind): Promise<T[]> {
  const db = await ensureV2Db();
  const rows = db
    .prepare("SELECT payload_json FROM entities WHERE kind = ? ORDER BY updated_at DESC")
    .all(kind) as Array<Record<string, unknown>>;
  return rows.map((row) => parseJson<T>(row.payload_json, {} as T));
}

async function getEntity<T>(kind: EntityKind, id: string): Promise<T | null> {
  const db = await ensureV2Db();
  const row = db
    .prepare("SELECT payload_json FROM entities WHERE kind = ? AND id = ?")
    .get(kind, id) as Record<string, unknown> | undefined;
  return row ? parseJson<T>(row.payload_json, {} as T) : null;
}

async function saveEntity<T extends { id: string; updatedAt?: number }>(kind: EntityKind, item: T): Promise<void> {
  const db = await ensureV2Db();
  db.prepare(
    `
      INSERT OR REPLACE INTO entities (kind, id, payload_json, updated_at)
      VALUES (?1, ?2, ?3, ?4)
    `,
  ).run(kind, item.id, JSON.stringify(item), Number(item.updatedAt ?? Date.now()));
}

async function deleteEntity(
  kind: EntityKind,
  id: string,
): Promise<void> {
  const db = await ensureV2Db();
  db.prepare("DELETE FROM entities WHERE kind = ? AND id = ?").run(kind, id);
}

export async function listAgentsV2(): Promise<AgentConfig[]> {
  await ensureDefaultCoworkAgentsSeeded();
  return await listEntities<AgentConfig>("agents");
}

export async function getAgentV2(id: string): Promise<AgentConfig | null> {
  await ensureDefaultCoworkAgentsSeeded();
  return await getEntity<AgentConfig>("agents", id);
}

export async function saveAgentV2(agent: AgentConfig): Promise<void> {
  await saveEntity("agents", agent);
}

export async function deleteAgentV2(id: string): Promise<void> {
  await deleteEntity("agents", id);
}

export async function listSkillsV2(): Promise<Skill[]> {
  await ensureDefaultCoworkSkillsSeeded();
  return await listEntities<Skill>("skills");
}

export async function getSkillV2(id: string): Promise<Skill | null> {
  await ensureDefaultCoworkSkillsSeeded();
  return await getEntity<Skill>("skills", id);
}

export async function saveSkillV2(skill: Skill): Promise<void> {
  await saveEntity("skills", skill);
}

export async function deleteSkillV2(id: string): Promise<void> {
  await deleteEntity("skills", id);
}

export async function listWorkflowsV2(): Promise<Workflow[]> {
  await ensureDefaultCoworkWorkflowsSeeded();
  return await listEntities<Workflow>("workflows");
}

export async function getWorkflowV2(id: string): Promise<Workflow | null> {
  await ensureDefaultCoworkWorkflowsSeeded();
  return await getEntity<Workflow>("workflows", id);
}

export async function saveWorkflowV2(workflow: Workflow): Promise<void> {
  await saveEntity("workflows", workflow);
}

export async function deleteWorkflowV2(id: string): Promise<void> {
  await deleteEntity("workflows", id);
}

export async function listMcpServersV2(): Promise<McpServerConfig[]> {
  return await listEntities<McpServerConfig>("mcp_servers");
}

export async function getMcpServerV2(id: string): Promise<McpServerConfig | null> {
  return await getEntity<McpServerConfig>("mcp_servers", id);
}

export async function saveMcpServerV2(server: McpServerConfig): Promise<void> {
  await saveEntity("mcp_servers", server);
}

export async function deleteMcpServerV2(id: string): Promise<void> {
  await deleteEntity("mcp_servers", id);
}

export async function listProjectContextsV2(): Promise<ProjectContext[]> {
  return await listEntities<ProjectContext>("project_contexts");
}

export async function getProjectContextV2(id: string): Promise<ProjectContext | null> {
  return await getEntity<ProjectContext>("project_contexts", id);
}

export async function saveProjectContextV2(projectContext: ProjectContext): Promise<void> {
  await saveEntity("project_contexts", projectContext);
}

export async function deleteProjectContextV2(id: string): Promise<void> {
  await deleteEntity("project_contexts", id);
}

export async function listWebRecipesV2(): Promise<WebRecipe[]> {
  return await listEntities<WebRecipe>("web_recipes");
}

export async function getWebRecipeV2(id: string): Promise<WebRecipe | null> {
  return await getEntity<WebRecipe>("web_recipes", id);
}

export async function saveWebRecipeV2(recipe: WebRecipe): Promise<void> {
  await saveEntity("web_recipes", recipe);
}

export async function deleteWebRecipeV2(id: string): Promise<void> {
  await deleteEntity("web_recipes", id);
}

export async function getSettingsV2(): Promise<V2AppSettings> {
  const db = await ensureV2Db();
  const row = db
    .prepare("SELECT payload_json FROM settings WHERE key = 'app'")
    .get() as Record<string, unknown> | undefined;
  return normalizeSettings(row ? parseJson<Partial<V2AppSettings>>(row.payload_json, {}) : null);
}

export async function saveSettingsV2(settings: V2AppSettings): Promise<void> {
  const db = await ensureV2Db();
  db.prepare("INSERT OR REPLACE INTO settings (key, payload_json) VALUES ('app', ?)").run(
    JSON.stringify(normalizeSettings(settings)),
  );
}
