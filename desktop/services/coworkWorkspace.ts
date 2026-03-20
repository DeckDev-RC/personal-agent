import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Skill } from "../../src/types/skill.js";
import { isSupportedWorkspaceDocument } from "./templateEngine.js";
import { listSkillsV2 } from "./v2EntityStore.js";

export type CoworkWorkspaceCategory = "meetings" | "drafts" | "research" | "tasks";

export type CoworkWorkspaceFileEntry = {
  name: string;
  title: string;
  category: CoworkWorkspaceCategory;
  relativePath: string;
  absolutePath: string;
  updatedAt: number;
  sizeBytes: number;
  preview: string;
  sessionId?: string;
  runId?: string;
  projectContextId?: string;
  skillId?: string;
  skillName?: string;
};

export type CoworkWorkspaceSnapshot = {
  rootPath: string;
  categories: Array<{
    id: CoworkWorkspaceCategory;
    label: string;
    absolutePath: string;
    fileCount: number;
  }>;
  files: CoworkWorkspaceFileEntry[];
};

const COWORK_CATEGORIES: Array<{ id: CoworkWorkspaceCategory; label: string }> = [
  { id: "meetings", label: "Meetings" },
  { id: "drafts", label: "Drafts" },
  { id: "research", label: "Research" },
  { id: "tasks", label: "Tasks" },
];

const SKILL_NAME_PATTERN = /^## Skill:\s*(.+)$/gim;
const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase();
}

function slugify(value: string): string {
  const normalized = normalizeText(value).replace(/[-\s]+/g, "-");
  return normalized || "output";
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildFrontmatter(params: Record<string, string | undefined>): string {
  const lines = Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${String(value).replace(/\r?\n/g, " ").trim()}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }

  const lines = match[1].split(/\r?\n/);
  const result: Record<string, string> = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_PATTERN, "");
}

function buildPreview(content: string): string {
  const body = stripFrontmatter(content)
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return body.slice(0, 220) || "Sem preview.";
}

function inferCategoryFromSkill(skill: Skill): CoworkWorkspaceCategory {
  const tags = new Set(skill.tags.map((tag) => tag.toLowerCase()));
  if (tags.has("meetings") || tags.has("notes")) {
    return "meetings";
  }
  if (tags.has("research") || tags.has("web") || tags.has("analysis")) {
    return "research";
  }
  if (tags.has("standup") || tags.has("planning") || tags.has("sprint") || tags.has("status")) {
    return "tasks";
  }
  return "drafts";
}

function extractSkillNames(systemPrompt: string): string[] {
  return Array.from(systemPrompt.matchAll(SKILL_NAME_PATTERN))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

async function nextAvailableFilePath(directory: string, baseName: string): Promise<string> {
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const absolutePath = path.join(directory, `${baseName}${suffix}.md`);
    try {
      await fs.access(absolutePath);
      attempt += 1;
    } catch {
      return absolutePath;
    }
  }

  throw new Error("Could not allocate a cowork workspace filename.");
}

async function walkDirectory(rootPath: string, relativePath = ""): Promise<string[]> {
  const absolutePath = relativePath ? path.join(rootPath, relativePath) : rootPath;
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(rootPath, nextRelative)));
      continue;
    }
    if (!isSupportedWorkspaceDocument(entry.name)) {
      continue;
    }
    files.push(nextRelative);
  }

  return files;
}

export function resolveCoworkWorkspaceRoot(): string {
  return path.join(os.homedir(), "OpenClaw");
}

export async function ensureCoworkWorkspaceStructure(): Promise<CoworkWorkspaceSnapshot> {
  const rootPath = resolveCoworkWorkspaceRoot();
  await fs.mkdir(rootPath, { recursive: true });

  for (const category of COWORK_CATEGORIES) {
    await fs.mkdir(path.join(rootPath, category.id), { recursive: true });
  }

  const snapshot = await listCoworkWorkspaceFiles();
  return {
    ...snapshot,
    rootPath,
  };
}

export async function inferCoworkSkillFromPrompt(systemPrompt: string): Promise<Skill | null> {
  const skillNames = extractSkillNames(systemPrompt);
  if (skillNames.length !== 1) {
    return null;
  }

  const target = normalizeText(skillNames[0]);
  const skills = await listSkillsV2();
  return (
    skills.find(
      (skill) => normalizeText(skill.name) === target && skill.tags.some((tag) => tag.toLowerCase() === "cowork"),
    ) ?? null
  );
}

export async function saveCoworkOutput(params: {
  systemPrompt: string;
  sessionId: string;
  runId: string;
  prompt: string;
  output: string;
  title?: string;
  projectContextId?: string;
}): Promise<CoworkWorkspaceFileEntry | null> {
  const skill = await inferCoworkSkillFromPrompt(params.systemPrompt);
  if (!skill || !params.output.trim()) {
    return null;
  }

  const rootPath = resolveCoworkWorkspaceRoot();
  const category = inferCategoryFromSkill(skill);
  const categoryPath = path.join(rootPath, category);
  await fs.mkdir(categoryPath, { recursive: true });

  const datePrefix = formatLocalDate(new Date());
  const preferredTitle = params.title?.trim() || skill.name;
  const baseName = `${datePrefix}-${slugify(preferredTitle)}`;
  const absolutePath = await nextAvailableFilePath(categoryPath, baseName);

  const content =
    buildFrontmatter({
      title: preferredTitle,
      skillId: skill.id,
      skillName: skill.name,
      category,
      sessionId: params.sessionId,
      runId: params.runId,
      projectContextId: params.projectContextId,
      createdAt: new Date().toISOString(),
    }) +
    `# ${preferredTitle}\n\n` +
    `## Skill\n${skill.name}\n\n` +
    `## Prompt\n${params.prompt.trim()}\n\n` +
    `## Output\n${params.output.trim()}\n`;

  await fs.writeFile(absolutePath, content, "utf8");
  const stats = await fs.stat(absolutePath);
  const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");

  return {
    name: path.basename(absolutePath),
    title: preferredTitle,
    category,
    relativePath,
    absolutePath,
    updatedAt: stats.mtimeMs,
    sizeBytes: stats.size,
    preview: buildPreview(content),
    sessionId: params.sessionId,
    runId: params.runId,
    projectContextId: params.projectContextId,
    skillId: skill.id,
    skillName: skill.name,
  };
}

export async function listCoworkWorkspaceFiles(): Promise<CoworkWorkspaceSnapshot> {
  const rootPath = resolveCoworkWorkspaceRoot();
  await fs.mkdir(rootPath, { recursive: true });

  const files: CoworkWorkspaceFileEntry[] = [];
  const categories = await Promise.all(
    COWORK_CATEGORIES.map(async (category) => {
      const absolutePath = path.join(rootPath, category.id);
      await fs.mkdir(absolutePath, { recursive: true });
      const relativeFiles = await walkDirectory(absolutePath);

      for (const relativeFile of relativeFiles) {
        const absoluteFilePath = path.join(absolutePath, relativeFile);
        const stats = await fs.stat(absoluteFilePath);
        const content = await fs.readFile(absoluteFilePath, "utf8");
        const metadata = parseFrontmatter(content);
        const rootRelativePath = path
          .relative(rootPath, absoluteFilePath)
          .replace(/\\/g, "/");

        files.push({
          name: path.basename(absoluteFilePath),
          title: metadata.title?.trim() || path.basename(absoluteFilePath, path.extname(absoluteFilePath)),
          category: category.id,
          relativePath: rootRelativePath,
          absolutePath: absoluteFilePath,
          updatedAt: stats.mtimeMs,
          sizeBytes: stats.size,
          preview: buildPreview(content),
          sessionId: metadata.sessionId,
          runId: metadata.runId,
          projectContextId: metadata.projectContextId,
          skillId: metadata.skillId,
          skillName: metadata.skillName,
        });
      }

      return {
        id: category.id,
        label: category.label,
        absolutePath,
        fileCount: relativeFiles.length,
      };
    }),
  );

  files.sort((left, right) => right.updatedAt - left.updatedAt || left.relativePath.localeCompare(right.relativePath));

  return {
    rootPath,
    categories,
    files,
  };
}

export async function readCoworkWorkspaceFile(relativePath: string): Promise<CoworkWorkspaceFileEntry & { content: string }> {
  const rootPath = resolveCoworkWorkspaceRoot();
  const normalizedRelativePath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolutePath = path.resolve(rootPath, normalizedRelativePath);
  const resolvedRootPath = path.resolve(rootPath);

  if (!absolutePath.startsWith(resolvedRootPath)) {
    throw new Error("Path outside cowork workspace.");
  }

  const stats = await fs.stat(absolutePath);
  const content = await fs.readFile(absolutePath, "utf8");
  const metadata = parseFrontmatter(content);
  const category = normalizedRelativePath.split("/")[0] as CoworkWorkspaceCategory;

  return {
    name: path.basename(absolutePath),
    title: metadata.title?.trim() || path.basename(absolutePath, path.extname(absolutePath)),
    category,
    relativePath: normalizedRelativePath,
    absolutePath,
    updatedAt: stats.mtimeMs,
    sizeBytes: stats.size,
    preview: buildPreview(content),
    sessionId: metadata.sessionId,
    runId: metadata.runId,
    projectContextId: metadata.projectContextId,
    skillId: metadata.skillId,
    skillName: metadata.skillName,
    content,
  };
}
