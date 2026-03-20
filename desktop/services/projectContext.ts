import type { MemorySearchResult } from "../../src/types/runtime.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import { ensureV2Db } from "./v2Db.js";
import { getAgentV2, getProjectContextV2 } from "./v2EntityStore.js";

function joinLines(title: string, values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  return `${title}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

export function normalizeProjectContext(
  partial: Partial<ProjectContext>,
  fallbackTimestamp = Date.now(),
): ProjectContext {
  const cleanList = (values: unknown): string[] =>
    Array.isArray(values)
      ? values.map((value) => String(value).trim()).filter(Boolean)
      : [];

  return {
    id: String(partial.id ?? ""),
    name: partial.name?.trim() || "Project Context",
    description: partial.description?.trim() || "",
    stakeholders: cleanList(partial.stakeholders),
    decisions: cleanList(partial.decisions),
    links: cleanList(partial.links),
    notes: partial.notes?.trim() || "",
    createdAt: Number(partial.createdAt ?? fallbackTimestamp),
    updatedAt: Number(partial.updatedAt ?? fallbackTimestamp),
  };
}

export function buildProjectContextPrompt(projectContext: ProjectContext): string {
  const sections = [
    `Active project context: ${projectContext.name}`,
  ];

  if (projectContext.description) {
    sections.push(`Project summary:\n${projectContext.description}`);
  }

  const stakeholders = joinLines("Stakeholders", projectContext.stakeholders);
  if (stakeholders) {
    sections.push(stakeholders);
  }

  const decisions = joinLines("Previous decisions", projectContext.decisions);
  if (decisions) {
    sections.push(decisions);
  }

  const links = joinLines("Useful links", projectContext.links);
  if (links) {
    sections.push(links);
  }

  if (projectContext.notes) {
    sections.push(`Working notes:\n${projectContext.notes}`);
  }

  sections.push(
    "Use this context when it is relevant, keep it consistent across the conversation, and call out when the user asks for information that is missing from the stored project context.",
  );

  return sections.join("\n\n");
}

export async function resolveProjectContextId(params: {
  requestedProjectContextId?: string;
  sessionProjectContextId?: string;
  agentId?: string;
}): Promise<string | undefined> {
  if (params.requestedProjectContextId) {
    return params.requestedProjectContextId;
  }

  if (params.sessionProjectContextId) {
    return params.sessionProjectContextId;
  }

  if (!params.agentId) {
    return undefined;
  }

  const agent = await getAgentV2(params.agentId);
  return agent?.projectContextId;
}

export async function injectProjectContextPrompt(
  systemPrompt: string,
  projectContextId?: string,
): Promise<string> {
  if (!projectContextId) {
    return systemPrompt;
  }

  const projectContext = await getProjectContextV2(projectContextId);
  if (!projectContext) {
    return systemPrompt;
  }

  return [systemPrompt.trim(), buildProjectContextPrompt(projectContext)]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export async function searchProjectContextMemory(params: {
  projectContextId: string;
  query: string;
  limit?: number;
}): Promise<MemorySearchResult[]> {
  const db = await ensureV2Db();
  const rows = db.prepare(
    `
      SELECT
        c.chunk_id,
        c.source_id,
        s.source_type,
        s.title,
        c.content,
        c.path
      FROM memory_chunks_fts f
      JOIN memory_chunks c ON c.chunk_id = f.chunk_id
      JOIN memory_sources s ON s.source_id = c.source_id
      JOIN sessions sess ON sess.session_id = c.session_id
      WHERE sess.project_context_id = ?1
        AND memory_chunks_fts MATCH ?2
      LIMIT ?3
    `,
  ).all(params.projectContextId, params.query, params.limit ?? 8) as Array<Record<string, unknown>>;

  return rows.map((row, index) => ({
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    sourceType: String(row.source_type) as MemorySearchResult["sourceType"],
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    path: typeof row.path === "string" ? row.path : undefined,
    score: Math.max(0, 1 - index * 0.1),
  }));
}
