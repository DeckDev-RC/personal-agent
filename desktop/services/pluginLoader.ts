import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PluginManifest, PluginRecord, PluginStatus } from "../../src/types/plugin.js";
import { ensureV2Db } from "./v2Db.js";

const PLUGINS_DIR = path.join(process.cwd(), "plugins");

function ensurePluginsDir(): void {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }
}

function rowToPlugin(row: Record<string, unknown>): PluginRecord {
  return {
    id: String(row.id),
    manifest: typeof row.manifest_json === "string" ? JSON.parse(row.manifest_json) : {} as PluginManifest,
    status: String(row.status ?? "installed") as PluginStatus,
    installedAt: Number(row.installed_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
    error: typeof row.error === "string" ? row.error : undefined,
  };
}

export async function listPlugins(): Promise<PluginRecord[]> {
  const db = await ensureV2Db();
  const rows = db.prepare("SELECT * FROM plugins ORDER BY installed_at DESC").all() as Record<string, unknown>[];
  return rows.map(rowToPlugin);
}

export async function getPlugin(id: string): Promise<PluginRecord | null> {
  const db = await ensureV2Db();
  const row = db.prepare("SELECT * FROM plugins WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToPlugin(row) : null;
}

export async function installPlugin(manifest: PluginManifest): Promise<PluginRecord> {
  ensurePluginsDir();
  const db = await ensureV2Db();
  const now = Date.now();
  const record: PluginRecord = {
    id: manifest.id || randomUUID(),
    manifest,
    status: "installed",
    installedAt: now,
    updatedAt: now,
  };

  // Save manifest to disk
  const pluginDir = path.join(PLUGINS_DIR, record.id);
  if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Save to DB
  db.prepare(
    "INSERT OR REPLACE INTO plugins (id, manifest_json, status, installed_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(record.id, JSON.stringify(record.manifest), record.status, record.installedAt, record.updatedAt);

  return record;
}

export async function activatePlugin(id: string): Promise<PluginRecord | null> {
  return updatePluginStatus(id, "active");
}

export async function deactivatePlugin(id: string): Promise<PluginRecord | null> {
  return updatePluginStatus(id, "disabled");
}

async function updatePluginStatus(id: string, status: PluginStatus, error?: string): Promise<PluginRecord | null> {
  const existing = await getPlugin(id);
  if (!existing) return null;
  const now = Date.now();
  const db = await ensureV2Db();
  db.prepare("UPDATE plugins SET status = ?, error = ?, updated_at = ? WHERE id = ?")
    .run(status, error ?? null, now, id);
  return { ...existing, status, error, updatedAt: now };
}

export async function uninstallPlugin(id: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM plugins WHERE id = ?").run(id);
  // Remove from disk
  const pluginDir = path.join(PLUGINS_DIR, id);
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }
  return (result as any).changes > 0;
}

export async function scanLocalPlugins(): Promise<PluginManifest[]> {
  ensurePluginsDir();
  const manifests: PluginManifest[] = [];
  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(PLUGINS_DIR, entry.name, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        manifests.push(data as PluginManifest);
      } catch { /* skip invalid */ }
    }
  }
  return manifests;
}

export async function getActivePluginMcpServers(): Promise<Array<{ pluginId: string; server: NonNullable<PluginManifest["mcpServers"]>[number] }>> {
  const plugins = await listPlugins();
  const servers: Array<{ pluginId: string; server: NonNullable<PluginManifest["mcpServers"]>[number] }> = [];
  for (const plugin of plugins) {
    if (plugin.status !== "active") continue;
    for (const server of plugin.manifest.mcpServers ?? []) {
      servers.push({ pluginId: plugin.id, server });
    }
  }
  return servers;
}

export async function getActivePluginSkills(): Promise<Array<{ pluginId: string; skill: NonNullable<PluginManifest["skills"]>[number] }>> {
  const plugins = await listPlugins();
  const skills: Array<{ pluginId: string; skill: NonNullable<PluginManifest["skills"]>[number] }> = [];
  for (const plugin of plugins) {
    if (plugin.status !== "active") continue;
    for (const skill of plugin.manifest.skills ?? []) {
      skills.push({ pluginId: plugin.id, skill });
    }
  }
  return skills;
}
