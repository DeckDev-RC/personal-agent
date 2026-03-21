import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  listAgentsV2,
  listSkillsV2,
  listWorkflowsV2,
  listProjectContextsV2,
  saveAgentV2,
  saveSkillV2,
  saveWorkflowV2,
  saveProjectContextV2,
} from "./v2EntityStore.js";
import { listTasks, createTask, updateTask } from "./taskManager.js";
import { resolveDataRoot } from "./dataRoot.js";

export type SyncConfig = {
  enabled: boolean;
  syncPath: string;
  syncEntities: {
    agents: boolean;
    skills: boolean;
    workflows: boolean;
    contexts: boolean;
    tasks: boolean;
  };
  lastSyncAt?: number;
};

const SYNC_FILE = "openclaw-sync.json";

function defaultSyncConfig(): SyncConfig {
  return {
    enabled: false,
    syncPath: "",
    syncEntities: {
      agents: true,
      skills: true,
      workflows: true,
      contexts: true,
      tasks: true,
    },
  };
}

let currentConfig: SyncConfig = defaultSyncConfig();

export function getSyncConfig(): SyncConfig {
  return { ...currentConfig };
}

export function updateSyncConfig(patch: Partial<SyncConfig>): SyncConfig {
  currentConfig = { ...currentConfig, ...patch };
  return { ...currentConfig };
}

export async function exportData(): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    exportedAt: Date.now(),
    version: 1,
  };
  if (currentConfig.syncEntities.agents) {
    data.agents = await listAgentsV2();
  }
  if (currentConfig.syncEntities.skills) {
    data.skills = await listSkillsV2();
  }
  if (currentConfig.syncEntities.workflows) {
    data.workflows = await listWorkflowsV2();
  }
  if (currentConfig.syncEntities.contexts) {
    data.contexts = await listProjectContextsV2();
  }
  if (currentConfig.syncEntities.tasks) {
    data.tasks = await listTasks({ includeDone: false });
  }
  return data;
}

export async function syncToPath(): Promise<{ exported: number }> {
  if (!currentConfig.syncPath) throw new Error("Sync path not configured");
  const data = await exportData();
  const syncFilePath = path.join(currentConfig.syncPath, SYNC_FILE);
  await fs.mkdir(currentConfig.syncPath, { recursive: true });
  await fs.writeFile(syncFilePath, JSON.stringify(data, null, 2), "utf8");
  currentConfig.lastSyncAt = Date.now();
  const count = Object.values(data).filter(Array.isArray).reduce((sum, arr) => sum + (arr as unknown[]).length, 0);
  return { exported: count };
}

export async function importFromPath(): Promise<{ imported: number }> {
  if (!currentConfig.syncPath) throw new Error("Sync path not configured");
  const syncFilePath = path.join(currentConfig.syncPath, SYNC_FILE);
  const raw = await fs.readFile(syncFilePath, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;
  let imported = 0;

  if (Array.isArray(data.agents) && currentConfig.syncEntities.agents) {
    for (const agent of data.agents) {
      await saveAgentV2(agent);
      imported++;
    }
  }
  if (Array.isArray(data.skills) && currentConfig.syncEntities.skills) {
    for (const skill of data.skills) {
      await saveSkillV2(skill);
      imported++;
    }
  }
  if (Array.isArray(data.workflows) && currentConfig.syncEntities.workflows) {
    for (const workflow of data.workflows) {
      await saveWorkflowV2(workflow);
      imported++;
    }
  }
  if (Array.isArray(data.contexts) && currentConfig.syncEntities.contexts) {
    for (const ctx of data.contexts) {
      await saveProjectContextV2(ctx);
      imported++;
    }
  }

  currentConfig.lastSyncAt = Date.now();
  return { imported };
}
