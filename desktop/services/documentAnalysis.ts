import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { parse as csvParse } from "csv-parse/sync";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellValue = string | number | boolean | null;

export type SheetData = {
  name: string;
  headers: string[];
  rows: CellValue[][];
  rowCount: number;
};

export type TabularDocument = {
  kind: "tabular";
  filePath: string;
  alias: string;
  format: "xlsx" | "xls" | "csv" | "tsv" | "json";
  sheets: Map<string, SheetData>;
  loadedAt: number;
};

export type TextDocument = {
  kind: "text";
  filePath: string;
  alias: string;
  format: "pdf" | "txt" | "md";
  content: string;
  pages?: string[];
  loadedAt: number;
};

export type LoadedDocument = TabularDocument | TextDocument;

export type FilterOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "starts_with" | "in" | "not_in";

export type FilterDef = {
  column: string;
  operator: FilterOperator;
  value: unknown;
};

export type AggregateFn = "sum" | "avg" | "min" | "max" | "count" | "distinct";

export type AggregateDef = {
  column: string;
  function: AggregateFn;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ROWS = 50_000;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DOCUMENTS_PER_SESSION = 10;
const MAX_TOTAL_ROWS_PER_SESSION = 500_000;
const DEFAULT_RESULT_LIMIT = 50;

// ---------------------------------------------------------------------------
// Session-scoped cache
// ---------------------------------------------------------------------------

const documentCache = new Map<string, Map<string, LoadedDocument>>();

export function getSessionCache(sessionId: string): Map<string, LoadedDocument> {
  let cache = documentCache.get(sessionId);
  if (!cache) {
    cache = new Map();
    documentCache.set(sessionId, cache);
  }
  return cache;
}

export function clearSessionCache(sessionId: string): void {
  documentCache.delete(sessionId);
}

function totalRowsInSession(cache: Map<string, LoadedDocument>): number {
  let total = 0;
  for (const doc of cache.values()) {
    if (doc.kind === "tabular") {
      for (const sheet of doc.sheets.values()) {
        total += sheet.rowCount;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function normalizeCell(value: unknown): CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  return String(value);
}

export async function parseExcelFile(
  filePath: string,
  options?: { sheet?: string; maxRows?: number },
): Promise<Map<string, SheetData>> {
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const sheets = new Map<string, SheetData>();

  const sheetNames = options?.sheet
    ? workbook.SheetNames.filter((n) => n === options.sheet)
    : workbook.SheetNames;

  if (options?.sheet && sheetNames.length === 0) {
    throw new Error(
      `Sheet '${options.sheet}' not found. Available sheets: ${workbook.SheetNames.join(", ")}`,
    );
  }

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const jsonData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (jsonData.length === 0) {
      sheets.set(sheetName, { name: sheetName, headers: [], rows: [], rowCount: 0 });
      continue;
    }
    const headers = (jsonData[0] ?? []).map((h, i) => (h != null ? String(h) : `col_${i + 1}`));
    const dataRows = jsonData.slice(1, maxRows + 1).map((row) =>
      headers.map((_, i) => normalizeCell(row[i])),
    );
    sheets.set(sheetName, {
      name: sheetName,
      headers,
      rows: dataRows,
      rowCount: dataRows.length,
    });
  }
  return sheets;
}

export async function parseCsvFile(
  filePath: string,
  options?: { maxRows?: number },
): Promise<SheetData> {
  const content = await fs.readFile(filePath, "utf8");
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const delimiter = filePath.endsWith(".tsv") ? "\t" : ",";

  const records: unknown[][] = csvParse(content, {
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    to: maxRows + 1, // +1 for header
  });

  if (records.length === 0) {
    return { name: "data", headers: [], rows: [], rowCount: 0 };
  }

  const headers = (records[0] ?? []).map((h, i) => (h != null ? String(h).trim() : `col_${i + 1}`));
  const dataRows = records.slice(1).map((row) =>
    headers.map((_, i) => normalizeCell(row[i])),
  );

  return { name: "data", headers, rows: dataRows, rowCount: dataRows.length };
}

export async function parseJsonFile(filePath: string): Promise<TabularDocument | TextDocument> {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  const alias = path.basename(filePath, path.extname(filePath));

  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
    const headers = [...new Set(parsed.flatMap((item) => Object.keys(item as Record<string, unknown>)))];
    const rows: CellValue[][] = parsed.map((item) => {
      const record = item as Record<string, unknown>;
      return headers.map((h) => normalizeCell(record[h]));
    });
    const sheet: SheetData = { name: "data", headers, rows, rowCount: rows.length };
    return {
      kind: "tabular",
      filePath,
      alias,
      format: "json",
      sheets: new Map([["data", sheet]]),
      loadedAt: Date.now(),
    };
  }

  return {
    kind: "text",
    filePath,
    alias,
    format: "txt",
    content: typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2),
    loadedAt: Date.now(),
  };
}

export async function parsePdfFile(filePath: string): Promise<{ content: string; pages: string[] }> {
  const buffer = await fs.readFile(filePath);
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    if (pageText) {
      pages.push(pageText);
    }
  }
  return { content: pages.join("\n\n"), pages };
}

// ---------------------------------------------------------------------------
// Load document (main entry point)
// ---------------------------------------------------------------------------

export async function loadDocument(
  sessionId: string,
  filePath: string,
  options?: { alias?: string; sheet?: string; maxRows?: number },
): Promise<{ document: LoadedDocument; summary: string }> {
  const resolvedPath = path.resolve(filePath);
  const stat = await fs.stat(resolvedPath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File exceeds 100MB limit (actual: ${(stat.size / 1024 / 1024).toFixed(1)}MB). Consider splitting the file.`,
    );
  }

  const cache = getSessionCache(sessionId);
  if (cache.size >= MAX_DOCUMENTS_PER_SESSION) {
    throw new Error(
      `Session limit of ${MAX_DOCUMENTS_PER_SESSION} documents reached. Remove a document or start a new session.`,
    );
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const alias = options?.alias ?? path.basename(resolvedPath, ext);
  let doc: LoadedDocument;

  switch (ext) {
    case ".xlsx":
    case ".xls":
    case ".xlsb":
    case ".ods": {
      const sheets = await parseExcelFile(resolvedPath, {
        sheet: options?.sheet,
        maxRows: options?.maxRows,
      });
      doc = {
        kind: "tabular",
        filePath: resolvedPath,
        alias,
        format: ext === ".xls" ? "xls" : "xlsx",
        sheets,
        loadedAt: Date.now(),
      };
      break;
    }
    case ".csv":
    case ".tsv": {
      const sheet = await parseCsvFile(resolvedPath, { maxRows: options?.maxRows });
      doc = {
        kind: "tabular",
        filePath: resolvedPath,
        alias,
        format: ext === ".tsv" ? "tsv" : "csv",
        sheets: new Map([["data", sheet]]),
        loadedAt: Date.now(),
      };
      break;
    }
    case ".json": {
      const result = await parseJsonFile(resolvedPath);
      result.alias = alias;
      doc = result;
      break;
    }
    case ".pdf": {
      const { content, pages } = await parsePdfFile(resolvedPath);
      doc = {
        kind: "text",
        filePath: resolvedPath,
        alias,
        format: "pdf",
        content,
        pages,
        loadedAt: Date.now(),
      };
      break;
    }
    case ".txt":
    case ".md":
    case ".log": {
      const content = await fs.readFile(resolvedPath, "utf8");
      doc = {
        kind: "text",
        filePath: resolvedPath,
        alias,
        format: ext === ".md" ? "md" : "txt",
        content,
        loadedAt: Date.now(),
      };
      break;
    }
    default:
      throw new Error(
        `Unsupported file format '${ext}'. Supported: .xlsx, .xls, .xlsb, .ods, .csv, .tsv, .pdf, .json, .txt, .md`,
      );
  }

  // Check total row cap
  if (doc.kind === "tabular") {
    let newRows = 0;
    for (const s of doc.sheets.values()) newRows += s.rowCount;
    const currentTotal = totalRowsInSession(cache);
    if (currentTotal + newRows > MAX_TOTAL_ROWS_PER_SESSION) {
      throw new Error(
        `Loading this file would exceed the session row limit (${MAX_TOTAL_ROWS_PER_SESSION.toLocaleString()}). Current: ${currentTotal.toLocaleString()}, new: ${newRows.toLocaleString()}.`,
      );
    }
  }

  cache.set(alias, doc);
  return { document: doc, summary: buildLoadSummary(doc) };
}

function buildLoadSummary(doc: LoadedDocument): string {
  if (doc.kind === "tabular") {
    const parts: string[] = [`Loaded '${doc.alias}' (${doc.format}):`];
    for (const [name, sheet] of doc.sheets) {
      parts.push(
        `  Sheet '${name}': ${sheet.rowCount.toLocaleString()} rows, ${sheet.headers.length} columns [${sheet.headers.join(", ")}]`,
      );
    }
    return parts.join("\n");
  }
  const pageInfo = doc.pages ? `, ${doc.pages.length} pages` : "";
  return `Loaded '${doc.alias}' (${doc.format}): ${doc.content.length.toLocaleString()} chars${pageInfo}`;
}

// ---------------------------------------------------------------------------
// Resolve document + sheet
// ---------------------------------------------------------------------------

function resolveDocument(sessionId: string, aliasOrName: string): LoadedDocument {
  const cache = getSessionCache(sessionId);
  const doc = cache.get(aliasOrName);
  if (doc) return doc;
  // Fallback: match by filename
  for (const d of cache.values()) {
    if (path.basename(d.filePath) === aliasOrName) return d;
  }
  const available = [...cache.keys()].join(", ") || "(none)";
  throw new Error(`Document '${aliasOrName}' not found. Loaded documents: ${available}`);
}

function resolveSheet(doc: TabularDocument, sheetName?: string): SheetData {
  if (sheetName) {
    const sheet = doc.sheets.get(sheetName);
    if (!sheet) {
      const available = [...doc.sheets.keys()].join(", ");
      throw new Error(`Sheet '${sheetName}' not found in '${doc.alias}'. Available: ${available}`);
    }
    return sheet;
  }
  // Default: first sheet
  const first = doc.sheets.values().next().value;
  if (!first) throw new Error(`Document '${doc.alias}' has no sheets.`);
  return first;
}

function requireTabular(doc: LoadedDocument): TabularDocument {
  if (doc.kind !== "tabular") {
    throw new Error(
      `Document '${doc.alias}' is a text document (${doc.format}). This operation requires a tabular document (Excel, CSV, JSON array).`,
    );
  }
  return doc;
}

// ---------------------------------------------------------------------------
// List documents
// ---------------------------------------------------------------------------

export function listDocuments(sessionId: string): string {
  const cache = getSessionCache(sessionId);
  if (cache.size === 0) return "No documents loaded in this session.";
  const lines: string[] = ["Loaded documents:"];
  for (const doc of cache.values()) {
    if (doc.kind === "tabular") {
      for (const [name, sheet] of doc.sheets) {
        lines.push(
          `- ${doc.alias} [${doc.format}] Sheet '${name}': ${sheet.rowCount.toLocaleString()} rows, columns: ${sheet.headers.join(", ")}`,
        );
      }
    } else {
      const pageInfo = doc.pages ? ` (${doc.pages.length} pages)` : "";
      lines.push(`- ${doc.alias} [${doc.format}]: ${doc.content.length.toLocaleString()} chars${pageInfo}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format table
// ---------------------------------------------------------------------------

export function formatTable(headers: string[], rows: CellValue[][], maxColWidth = 40): string {
  if (headers.length === 0) return "(empty table)";

  const colWidths = headers.map((h) => Math.min(h.length, maxColWidth));
  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const val = row[i] != null ? String(row[i]) : "";
      colWidths[i] = Math.min(Math.max(colWidths[i] ?? 0, val.length), maxColWidth);
    }
  }

  const pad = (val: string, width: number) =>
    val.length > width ? val.slice(0, width - 1) + "…" : val.padEnd(width);

  const headerLine = headers.map((h, i) => pad(h, colWidths[i] ?? 10)).join(" | ");
  const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => pad(cell != null ? String(cell) : "", colWidths[i] ?? 10)).join(" | "),
  );

  return [headerLine, separator, ...dataLines].join("\n");
}

// ---------------------------------------------------------------------------
// Preview data
// ---------------------------------------------------------------------------

export function previewData(
  sessionId: string,
  alias: string,
  options?: { sheet?: string; limit?: number; offset?: number },
): string {
  const doc = resolveDocument(sessionId, alias);
  if (doc.kind === "text") {
    const limit = options?.limit ?? 2000;
    const offset = options?.offset ?? 0;
    const slice = doc.content.slice(offset, offset + limit);
    const truncated = doc.content.length > offset + limit ? `\n... (truncated, ${doc.content.length.toLocaleString()} chars total)` : "";
    return slice + truncated;
  }
  const tabDoc = requireTabular(doc);
  const sheet = resolveSheet(tabDoc, options?.sheet);
  const limit = options?.limit ?? DEFAULT_RESULT_LIMIT;
  const offset = options?.offset ?? 0;
  const slicedRows = sheet.rows.slice(offset, offset + limit);
  const header = `Preview of '${alias}' sheet '${sheet.name}' (rows ${offset + 1}-${offset + slicedRows.length} of ${sheet.rowCount}):`;
  return header + "\n" + formatTable(sheet.headers, slicedRows);
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function getColumnIndex(headers: string[], column: string): number {
  const idx = headers.indexOf(column);
  if (idx === -1) {
    throw new Error(`Column '${column}' not found. Available: ${headers.join(", ")}`);
  }
  return idx;
}

function matchesFilter(cellValue: CellValue, operator: FilterOperator, filterValue: unknown): boolean {
  switch (operator) {
    case "eq":
      return cellValue === filterValue || String(cellValue) === String(filterValue);
    case "neq":
      return cellValue !== filterValue && String(cellValue) !== String(filterValue);
    case "gt":
      return Number(cellValue) > Number(filterValue);
    case "gte":
      return Number(cellValue) >= Number(filterValue);
    case "lt":
      return Number(cellValue) < Number(filterValue);
    case "lte":
      return Number(cellValue) <= Number(filterValue);
    case "contains":
      return String(cellValue ?? "").toLowerCase().includes(String(filterValue).toLowerCase());
    case "starts_with":
      return String(cellValue ?? "").toLowerCase().startsWith(String(filterValue).toLowerCase());
    case "in": {
      const list = Array.isArray(filterValue) ? filterValue : [filterValue];
      return list.some((v) => String(cellValue) === String(v));
    }
    case "not_in": {
      const list = Array.isArray(filterValue) ? filterValue : [filterValue];
      return !list.some((v) => String(cellValue) === String(v));
    }
    default:
      return true;
  }
}

export function applyFilters(
  rows: CellValue[][],
  headers: string[],
  filters: FilterDef[],
): CellValue[][] {
  if (filters.length === 0) return rows;
  const resolved = filters.map((f) => ({
    index: getColumnIndex(headers, f.column),
    operator: f.operator,
    value: f.value,
  }));
  return rows.filter((row) =>
    resolved.every((f) => matchesFilter(row[f.index] ?? null, f.operator, f.value)),
  );
}

// ---------------------------------------------------------------------------
// Query data
// ---------------------------------------------------------------------------

export function queryData(
  sessionId: string,
  alias: string,
  options: {
    sheet?: string;
    columns?: string[];
    filter?: FilterDef;
    filters?: FilterDef[];
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  },
): string {
  const doc = resolveDocument(sessionId, alias);

  // Text document search
  if (doc.kind === "text") {
    if (options.filter?.operator === "contains" && typeof options.filter.value === "string") {
      return searchText(sessionId, alias, options.filter.value);
    }
    return previewData(sessionId, alias, { limit: options.limit });
  }

  const tabDoc = requireTabular(doc);
  const sheet = resolveSheet(tabDoc, options.sheet);

  // Build all filters
  const allFilters: FilterDef[] = [
    ...(options.filter ? [options.filter] : []),
    ...(options.filters ?? []),
  ];

  let resultRows = applyFilters(sheet.rows, sheet.headers, allFilters);

  // Sort
  if (options.sortBy) {
    const sortIdx = getColumnIndex(sheet.headers, options.sortBy);
    const order = options.sortOrder === "desc" ? -1 : 1;
    resultRows = [...resultRows].sort((a, b) => {
      const va = a[sortIdx];
      const vb = b[sortIdx];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * order;
      return String(va).localeCompare(String(vb)) * order;
    });
  }

  // Pagination
  const limit = options.limit ?? DEFAULT_RESULT_LIMIT;
  const offset = options.offset ?? 0;
  const paginatedRows = resultRows.slice(offset, offset + limit);

  // Column selection
  let displayHeaders = sheet.headers;
  let displayRows = paginatedRows;
  if (options.columns && options.columns.length > 0) {
    const indices = options.columns.map((c) => getColumnIndex(sheet.headers, c));
    displayHeaders = options.columns;
    displayRows = paginatedRows.map((row) => indices.map((i) => row[i] ?? null));
  }

  const meta = `Query result: ${resultRows.length} rows matched (showing ${offset + 1}-${offset + displayRows.length}):`;
  return meta + "\n" + formatTable(displayHeaders, displayRows);
}

// ---------------------------------------------------------------------------
// Stats / Aggregation
// ---------------------------------------------------------------------------

export function computeStats(
  sessionId: string,
  alias: string,
  options: {
    sheet?: string;
    aggregate: AggregateDef;
    groupBy?: string;
    filter?: FilterDef;
    filters?: FilterDef[];
  },
): string {
  const doc = requireTabular(resolveDocument(sessionId, alias));
  const sheet = resolveSheet(doc, options.sheet);

  const allFilters: FilterDef[] = [
    ...(options.filter ? [options.filter] : []),
    ...(options.filters ?? []),
  ];
  const filteredRows = applyFilters(sheet.rows, sheet.headers, allFilters);

  const aggColIdx = getColumnIndex(sheet.headers, options.aggregate.column);
  const fn = options.aggregate.function;

  if (!options.groupBy) {
    const value = computeAggregate(filteredRows, aggColIdx, fn);
    return `${fn}(${options.aggregate.column}) = ${value}`;
  }

  const groupIdx = getColumnIndex(sheet.headers, options.groupBy);
  const groups = new Map<string, CellValue[][]>();
  for (const row of filteredRows) {
    const key = String(row[groupIdx] ?? "(null)");
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const resultHeaders = [options.groupBy, `${fn}(${options.aggregate.column})`];
  const resultRows: CellValue[][] = [];
  for (const [key, groupRows] of groups) {
    resultRows.push([key, computeAggregate(groupRows, aggColIdx, fn)]);
  }

  // Sort by aggregate value descending
  resultRows.sort((a, b) => {
    const va = Number(a[1]) || 0;
    const vb = Number(b[1]) || 0;
    return vb - va;
  });

  return `Grouped stats (${resultRows.length} groups):\n` + formatTable(resultHeaders, resultRows);
}

function computeAggregate(rows: CellValue[][], colIdx: number, fn: AggregateFn): CellValue {
  const values = rows.map((r) => r[colIdx]).filter((v) => v !== null);
  const nums = values.map(Number).filter((n) => !isNaN(n));

  switch (fn) {
    case "count":
      return values.length;
    case "distinct":
      return new Set(values.map(String)).size;
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
    case "min":
      return nums.length > 0 ? Math.min(...nums) : null;
    case "max":
      return nums.length > 0 ? Math.max(...nums) : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Cross-reference (join)
// ---------------------------------------------------------------------------

export function crossReference(
  sessionId: string,
  sourceAlias: string,
  targetAlias: string,
  options: {
    sourceSheet?: string;
    targetSheet?: string;
    joinColumn: string;
    targetJoinColumn?: string;
    joinType?: "inner" | "left" | "full";
    columns?: string[];
    filter?: FilterDef;
    filters?: FilterDef[];
    aggregate?: AggregateDef;
    groupBy?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  },
): string {
  const srcDoc = requireTabular(resolveDocument(sessionId, sourceAlias));
  const tgtDoc = requireTabular(resolveDocument(sessionId, targetAlias));
  const srcSheet = resolveSheet(srcDoc, options.sourceSheet);
  const tgtSheet = resolveSheet(tgtDoc, options.targetSheet);

  const joinType = options.joinType ?? "inner";
  const srcJoinCol = options.joinColumn;
  const tgtJoinCol = options.targetJoinColumn ?? srcJoinCol;

  const srcJoinIdx = getColumnIndex(srcSheet.headers, srcJoinCol);
  const tgtJoinIdx = getColumnIndex(tgtSheet.headers, tgtJoinCol);

  // Prefix headers to disambiguate
  const mergedHeaders = [
    ...srcSheet.headers.map((h) => `${sourceAlias}.${h}`),
    ...tgtSheet.headers.map((h) => `${targetAlias}.${h}`),
  ];

  // Build index on target join column
  const tgtIndex = new Map<string, CellValue[][]>();
  for (const row of tgtSheet.rows) {
    const key = String(row[tgtJoinIdx] ?? "");
    const group = tgtIndex.get(key);
    if (group) {
      group.push(row);
    } else {
      tgtIndex.set(key, [row]);
    }
  }

  // Perform join
  const joinedRows: CellValue[][] = [];
  const matchedTargetKeys = new Set<string>();
  const emptyTarget = tgtSheet.headers.map(() => null);
  const emptySource = srcSheet.headers.map(() => null);

  for (const srcRow of srcSheet.rows) {
    const key = String(srcRow[srcJoinIdx] ?? "");
    const tgtRows = tgtIndex.get(key);
    if (tgtRows && tgtRows.length > 0) {
      matchedTargetKeys.add(key);
      for (const tgtRow of tgtRows) {
        joinedRows.push([...srcRow, ...tgtRow]);
      }
    } else if (joinType === "left" || joinType === "full") {
      joinedRows.push([...srcRow, ...emptyTarget]);
    }
  }

  if (joinType === "full") {
    for (const tgtRow of tgtSheet.rows) {
      const key = String(tgtRow[tgtJoinIdx] ?? "");
      if (!matchedTargetKeys.has(key)) {
        joinedRows.push([...emptySource, ...tgtRow]);
      }
    }
  }

  // Apply filters on joined data
  const allFilters: FilterDef[] = [
    ...(options.filter ? [options.filter] : []),
    ...(options.filters ?? []),
  ];
  let resultRows = applyFilters(joinedRows, mergedHeaders, allFilters);

  // Aggregate if requested
  if (options.aggregate && options.groupBy) {
    return computeJoinedStats(mergedHeaders, resultRows, options.aggregate, options.groupBy, sourceAlias, targetAlias);
  }

  // Sort
  if (options.sortBy) {
    const sortIdx = getColumnIndex(mergedHeaders, options.sortBy);
    const order = options.sortOrder === "desc" ? -1 : 1;
    resultRows = [...resultRows].sort((a, b) => {
      const va = a[sortIdx];
      const vb = b[sortIdx];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * order;
      return String(va).localeCompare(String(vb)) * order;
    });
  }

  // Pagination
  const limit = options.limit ?? DEFAULT_RESULT_LIMIT;
  const offset = options.offset ?? 0;
  const paginatedRows = resultRows.slice(offset, offset + limit);

  // Column selection
  let displayHeaders = mergedHeaders;
  let displayRows = paginatedRows;
  if (options.columns && options.columns.length > 0) {
    const indices = options.columns.map((c) => getColumnIndex(mergedHeaders, c));
    displayHeaders = options.columns;
    displayRows = paginatedRows.map((row) => indices.map((i) => row[i] ?? null));
  }

  const meta = `Cross-reference (${joinType} join on ${srcJoinCol}↔${tgtJoinCol}): ${resultRows.length} rows (showing ${offset + 1}-${offset + displayRows.length}):`;
  return meta + "\n" + formatTable(displayHeaders, displayRows);
}

function computeJoinedStats(
  headers: string[],
  rows: CellValue[][],
  aggregate: AggregateDef,
  groupBy: string,
  _sourceAlias: string,
  _targetAlias: string,
): string {
  const aggColIdx = getColumnIndex(headers, aggregate.column);
  const groupIdx = getColumnIndex(headers, groupBy);
  const fn = aggregate.function;

  const groups = new Map<string, CellValue[][]>();
  for (const row of rows) {
    const key = String(row[groupIdx] ?? "(null)");
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const resultHeaders = [groupBy, `${fn}(${aggregate.column})`];
  const resultRows: CellValue[][] = [];
  for (const [key, groupRows] of groups) {
    resultRows.push([key, computeAggregate(groupRows, aggColIdx, fn)]);
  }
  resultRows.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));

  return `Cross-reference grouped stats (${resultRows.length} groups):\n` + formatTable(resultHeaders, resultRows);
}

// ---------------------------------------------------------------------------
// Summarize document
// ---------------------------------------------------------------------------

export function summarizeDocument(sessionId: string, alias: string, sheet?: string): string {
  const doc = resolveDocument(sessionId, alias);

  if (doc.kind === "text") {
    const lines: string[] = [
      `Document '${alias}' (${doc.format}):`,
      `  File: ${doc.filePath}`,
      `  Size: ${doc.content.length.toLocaleString()} chars`,
    ];
    if (doc.pages) lines.push(`  Pages: ${doc.pages.length}`);
    // Top terms (simple frequency)
    const words = doc.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const topTerms = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => `${word} (${count})`)
      .join(", ");
    lines.push(`  Top terms: ${topTerms}`);
    return lines.join("\n");
  }

  const tabDoc = requireTabular(doc);
  const sheetData = resolveSheet(tabDoc, sheet);
  const lines: string[] = [
    `Document '${alias}' (${doc.format}), Sheet '${sheetData.name}':`,
    `  File: ${doc.filePath}`,
    `  Rows: ${sheetData.rowCount.toLocaleString()}`,
    `  Columns: ${sheetData.headers.length}`,
    "",
  ];

  for (let i = 0; i < sheetData.headers.length; i++) {
    const header = sheetData.headers[i]!;
    const values = sheetData.rows.map((r) => r[i]);
    const nonNull = values.filter((v) => v !== null);
    const nullCount = values.length - nonNull.length;
    const nums = nonNull.map(Number).filter((n) => !isNaN(n));
    const isNumeric = nums.length > nonNull.length * 0.7;

    const colInfo: string[] = [`  ${header}:`];
    colInfo.push(`    Non-null: ${nonNull.length}, Null: ${nullCount}`);

    if (isNumeric && nums.length > 0) {
      colInfo.push(`    Type: numeric`);
      colInfo.push(`    Min: ${Math.min(...nums)}, Max: ${Math.max(...nums)}`);
      colInfo.push(`    Avg: ${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}`);
    } else {
      const unique = new Set(nonNull.map(String));
      colInfo.push(`    Type: text`);
      colInfo.push(`    Unique values: ${unique.size}`);
      if (unique.size <= 10) {
        colInfo.push(`    Values: ${[...unique].slice(0, 10).join(", ")}`);
      } else {
        colInfo.push(`    Sample: ${[...unique].slice(0, 5).join(", ")}, ...`);
      }
    }
    lines.push(colInfo.join("\n"));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Search text
// ---------------------------------------------------------------------------

export function searchText(sessionId: string, alias: string, query: string): string {
  const doc = resolveDocument(sessionId, alias);

  if (doc.kind === "text") {
    const lowerQuery = query.toLowerCase();
    const lowerContent = doc.content.toLowerCase();
    const matches: string[] = [];
    let pos = 0;
    while (pos < lowerContent.length && matches.length < 20) {
      const idx = lowerContent.indexOf(lowerQuery, pos);
      if (idx === -1) break;
      const start = Math.max(0, idx - 80);
      const end = Math.min(doc.content.length, idx + query.length + 80);
      matches.push(`...${doc.content.slice(start, end)}...`);
      pos = idx + query.length;
    }
    if (matches.length === 0) return `No matches found for '${query}' in '${alias}'.`;
    return `Found ${matches.length} match(es) for '${query}' in '${alias}':\n\n${matches.join("\n\n")}`;
  }

  // For tabular: search across all string columns
  const tabDoc = requireTabular(doc);
  const lowerQuery = query.toLowerCase();
  const results: string[] = [];

  for (const [sheetName, sheet] of tabDoc.sheets) {
    for (let rowIdx = 0; rowIdx < sheet.rows.length && results.length < 50; rowIdx++) {
      const row = sheet.rows[rowIdx]!;
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const cell = row[colIdx];
        if (cell !== null && String(cell).toLowerCase().includes(lowerQuery)) {
          results.push(
            `Sheet '${sheetName}' row ${rowIdx + 1}, ${sheet.headers[colIdx]}: ${String(cell)}`,
          );
          break; // one match per row
        }
      }
    }
  }

  if (results.length === 0) return `No matches found for '${query}' in '${alias}'.`;
  return `Found ${results.length} match(es) for '${query}' in '${alias}':\n${results.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Remove document
// ---------------------------------------------------------------------------

export function removeDocument(sessionId: string, alias: string): string {
  const cache = getSessionCache(sessionId);
  if (!cache.has(alias)) {
    const available = [...cache.keys()].join(", ") || "(none)";
    throw new Error(`Document '${alias}' not found. Loaded: ${available}`);
  }
  cache.delete(alias);
  return `Document '${alias}' removed from session.`;
}
