import type { AgentConfig } from "../../src/types/agent.js";
import type { AutomationPackage } from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { McpServerConfig } from "../../src/types/mcp.js";
import type { PersonaConfig } from "../../src/types/persona.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
} from "../../src/settings/appSettings.js";
import type { Skill } from "../../src/types/skill.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { Workflow } from "../../src/types/workflow.js";
import { loadDefaultCoworkAgents, loadDefaultCoworkSkills, loadDefaultCoworkWorkflows } from "./coworkDefaults.js";
import { ensureV2Db } from "./v2Db.js";

export type V2AppSettings = AppSettings & {
  persona?: PersonaConfig;
};

export const DEFAULT_V2_SETTINGS: V2AppSettings = DEFAULT_APP_SETTINGS;

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
  return normalizeAppSettings(settings);
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

type EntityKind =
  | "agents"
  | "skills"
  | "workflows"
  | "mcp_servers"
  | "project_contexts"
  | "web_recipes"
  | "automation_packages"
  | "connections";

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

export async function listAutomationPackagesV2(): Promise<AutomationPackage[]> {
  return await listEntities<AutomationPackage>("automation_packages");
}

export async function getAutomationPackageV2(id: string): Promise<AutomationPackage | null> {
  return await getEntity<AutomationPackage>("automation_packages", id);
}

export async function saveAutomationPackageV2(automationPackage: AutomationPackage): Promise<void> {
  await saveEntity("automation_packages", automationPackage);
}

export async function deleteAutomationPackageV2(id: string): Promise<void> {
  await deleteEntity("automation_packages", id);
}

export async function listConnectionsV2(): Promise<Connection[]> {
  return await listEntities<Connection>("connections");
}

export async function getConnectionV2(id: string): Promise<Connection | null> {
  return await getEntity<Connection>("connections", id);
}

export async function saveConnectionV2(connection: Connection): Promise<void> {
  await saveEntity("connections", connection);
}

export async function deleteConnectionV2(id: string): Promise<void> {
  await deleteEntity("connections", id);
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
