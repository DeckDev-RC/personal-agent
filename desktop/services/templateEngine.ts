import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type {
  DocumentTemplate,
  DocumentTemplateCategory,
  RenderedDocument,
  SavedDocumentExport,
} from "../../src/types/document.js";
import { renderMarkdownDocumentHtml } from "./documentExporter.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const templateDirCandidates = [
  path.resolve(process.cwd(), "data", "templates"),
  path.resolve(moduleDir, "../../data/templates"),
  path.resolve(moduleDir, "../../../data/templates"),
];

const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const SAFE_TEXT_EXTENSIONS = new Set([".md", ".html"]);

function cleanText(value: string): string {
  return value.trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase();
}

function slugify(value: string): string {
  const normalized = normalizeText(value).replace(/[-\s]+/g, "-");
  return normalized || "document";
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseFrontmatter(markdown: string): { metadata: Record<string, string>; content: string } {
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { metadata: {}, content: markdown };
  }

  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      metadata[key] = value;
    }
  }

  return {
    metadata,
    content: markdown.slice(match[0].length),
  };
}

function extractPlaceholders(content: string): string[] {
  const placeholders = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const placeholder = match[1]?.trim();
    if (placeholder) {
      placeholders.add(placeholder);
    }
  }
  return [...placeholders];
}

function renderTemplateContent(content: string, values: Record<string, string>): string {
  return content.replace(PLACEHOLDER_PATTERN, (_match, key: string) => values[key] ?? "");
}

function inferDocumentTitle(markdown: string, values: Record<string, string>): string {
  const firstHeading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  if (firstHeading) {
    return firstHeading.replace(/^#\s+/, "").trim();
  }

  if (values.title?.trim()) {
    return values.title.trim();
  }

  return "Generated Document";
}

async function resolveTemplateDir(): Promise<string> {
  for (const candidate of templateDirCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Document template directory not found.");
}

export function resolveDocumentWorkspaceRoot(): string {
  return path.join(os.homedir(), "OpenClaw");
}

export function buildDefaultTemplateValues(placeholders: string[]): Record<string, string> {
  const defaults: Record<string, string> = {};
  const today = formatLocalDate(new Date());

  for (const placeholder of placeholders) {
    if (placeholder === "date") {
      defaults[placeholder] = today;
    } else if (placeholder === "action_items" || placeholder === "next_steps") {
      defaults[placeholder] = "- ";
    } else {
      defaults[placeholder] = "";
    }
  }

  return defaults;
}

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  const templateDir = await resolveTemplateDir();
  const entries = (await fs.readdir(templateDir))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  const templates = await Promise.all(
    entries.map(async (entry) => {
      const raw = await fs.readFile(path.join(templateDir, entry), "utf8");
      const { metadata, content } = parseFrontmatter(raw);
      const placeholders = extractPlaceholders(content);

      return {
        id: metadata.id?.trim() || path.basename(entry, ".md"),
        name: metadata.name?.trim() || path.basename(entry, ".md"),
        description: metadata.description?.trim() || "",
        category:
          metadata.category === "meetings" ||
          metadata.category === "research" ||
          metadata.category === "tasks"
            ? (metadata.category as DocumentTemplateCategory)
            : "drafts",
        placeholders,
        content: cleanText(content),
      } satisfies DocumentTemplate;
    }),
  );

  return templates;
}

export async function getDocumentTemplate(templateId: string): Promise<DocumentTemplate | null> {
  const templates = await listDocumentTemplates();
  return templates.find((template) => template.id === templateId) ?? null;
}

export async function renderDocumentTemplate(params: {
  templateId: string;
  values?: Record<string, string>;
}): Promise<RenderedDocument> {
  const template = await getDocumentTemplate(params.templateId);
  if (!template) {
    throw new Error(`Document template not found: ${params.templateId}`);
  }

  const defaults = buildDefaultTemplateValues(template.placeholders);
  const values = {
    ...defaults,
    ...(params.values ?? {}),
  };
  const markdown = renderTemplateContent(template.content, values).trim();
  const title = inferDocumentTitle(markdown, values);

  return {
    templateId: template.id,
    title,
    category: template.category,
    markdown,
    html: renderMarkdownDocumentHtml({
      title,
      markdown,
    }),
    placeholders: template.placeholders,
    values,
  };
}

async function ensureOutputDirectory(category: DocumentTemplateCategory): Promise<string> {
  const rootPath = resolveDocumentWorkspaceRoot();
  const categoryPath = path.join(rootPath, category);
  await fs.mkdir(categoryPath, { recursive: true });
  return categoryPath;
}

async function nextAvailableFilePath(directory: string, baseName: string, extension: string): Promise<string> {
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const absolutePath = path.join(directory, `${baseName}${suffix}${extension}`);
    try {
      await fs.access(absolutePath);
      attempt += 1;
    } catch {
      return absolutePath;
    }
  }

  throw new Error("Could not allocate a document export filename.");
}

export async function saveRenderedDocument(params: {
  rendered: RenderedDocument;
  format: "markdown" | "html";
}): Promise<SavedDocumentExport> {
  const directory = await ensureOutputDirectory(params.rendered.category);
  const baseName = `${formatLocalDate(new Date())}-${slugify(params.rendered.title)}`;
  const extension = params.format === "html" ? ".html" : ".md";
  const targetPath = await nextAvailableFilePath(directory, baseName, extension);

  await fs.writeFile(
    targetPath,
    params.format === "html" ? params.rendered.html : params.rendered.markdown,
    "utf8",
  );

  return {
    format: params.format,
    filePath: targetPath,
    relativePath: path.relative(resolveDocumentWorkspaceRoot(), targetPath).replace(/\\/g, "/"),
  };
}

export async function saveRenderedPdf(params: {
  rendered: RenderedDocument;
  pdfBytes: Uint8Array;
}): Promise<SavedDocumentExport> {
  const directory = await ensureOutputDirectory(params.rendered.category);
  const baseName = `${formatLocalDate(new Date())}-${slugify(params.rendered.title)}`;
  const targetPath = await nextAvailableFilePath(directory, baseName, ".pdf");
  await fs.writeFile(targetPath, params.pdfBytes);

  return {
    format: "pdf",
    filePath: targetPath,
    relativePath: path.relative(resolveDocumentWorkspaceRoot(), targetPath).replace(/\\/g, "/"),
  };
}

export function isSupportedWorkspaceDocument(filePath: string): boolean {
  return SAFE_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
