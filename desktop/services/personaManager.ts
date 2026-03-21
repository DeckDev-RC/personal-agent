import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { FeedbackRecord, FeedbackRating, PersonaConfig } from "../../src/types/persona.js";
import { ensureV2Db } from "./v2Db.js";
import { getSettingsV2, saveSettingsV2 } from "./v2EntityStore.js";

function rowToFeedback(row: Record<string, unknown>): FeedbackRecord {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    sessionId: String(row.session_id),
    rating: String(row.rating) === "positive" ? "positive" : "negative",
    comment: typeof row.comment === "string" ? row.comment : undefined,
    createdAt: Number(row.created_at ?? Date.now()),
  };
}

export async function submitFeedback(params: {
  messageId: string;
  sessionId: string;
  rating: FeedbackRating;
  comment?: string;
}): Promise<FeedbackRecord> {
  const db = await ensureV2Db();
  const record: FeedbackRecord = {
    id: randomUUID(),
    messageId: params.messageId,
    sessionId: params.sessionId,
    rating: params.rating,
    comment: params.comment,
    createdAt: Date.now(),
  };
  db.prepare(
    "INSERT OR REPLACE INTO feedback (id, message_id, session_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(record.id, record.messageId, record.sessionId, record.rating, record.comment ?? null, record.createdAt);
  return record;
}

export async function listFeedback(opts?: {
  sessionId?: string;
  rating?: FeedbackRating;
  limit?: number;
}): Promise<FeedbackRecord[]> {
  const db = await ensureV2Db();
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (opts?.sessionId) {
    clauses.push("session_id = ?");
    params.push(opts.sessionId);
  }
  if (opts?.rating) {
    clauses.push("rating = ?");
    params.push(opts.rating);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 100;
  const rows = db.prepare(`SELECT * FROM feedback ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit) as Record<string, unknown>[];
  return rows.map(rowToFeedback);
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const db = await ensureV2Db();
  const result = db.prepare("DELETE FROM feedback WHERE id = ?").run(id);
  return (result as any).changes > 0;
}

export async function getFeedbackStats(): Promise<{ positive: number; negative: number; total: number }> {
  const db = await ensureV2Db();
  const pos = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE rating = 'positive'").get() as Record<string, unknown>;
  const neg = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE rating = 'negative'").get() as Record<string, unknown>;
  const positive = Number(pos?.count ?? 0);
  const negative = Number(neg?.count ?? 0);
  return { positive, negative, total: positive + negative };
}

const DEFAULT_PERSONA: PersonaConfig = {
  tone: "friendly",
  language: "pt-BR",
  detailLevel: "balanced",
};

export async function getPersonaConfig(): Promise<PersonaConfig> {
  const settings = await getSettingsV2();
  return (settings as any).persona ?? { ...DEFAULT_PERSONA };
}

export async function savePersonaConfig(config: PersonaConfig): Promise<PersonaConfig> {
  const settings = await getSettingsV2();
  await saveSettingsV2({ ...settings, persona: config } as any);
  return config;
}

export function buildPersonaInstructions(config: PersonaConfig): string {
  const parts: string[] = [];
  const toneMap: Record<string, string> = {
    formal: "Use um tom formal e profissional.",
    casual: "Use um tom casual e descontraido.",
    technical: "Use um tom tecnico e preciso.",
    friendly: "Use um tom amigavel e acessivel.",
  };
  parts.push(toneMap[config.tone] ?? "");

  const detailMap: Record<string, string> = {
    concise: "Seja conciso e direto ao ponto.",
    balanced: "Equilibre detalhes e brevidade.",
    detailed: "Forneça respostas detalhadas e completas.",
  };
  parts.push(detailMap[config.detailLevel] ?? "");

  if (config.customInstructions) {
    parts.push(config.customInstructions);
  }

  return parts.filter(Boolean).join(" ");
}
