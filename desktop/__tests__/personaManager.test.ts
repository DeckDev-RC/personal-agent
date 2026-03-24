import { createTestDb } from "./helpers/testDb.js";

vi.mock("../services/v2Db.js", () => ({ ensureV2Db: vi.fn() }));
vi.mock("../services/v2EntityStore.js", () => ({
  getSettingsV2: vi.fn(),
  saveSettingsV2: vi.fn(),
}));

import { ensureV2Db } from "../services/v2Db.js";
import { getSettingsV2, saveSettingsV2 } from "../services/v2EntityStore.js";
import {
  submitFeedback,
  listFeedback,
  deleteFeedback,
  getFeedbackStats,
  getPersonaConfig,
  savePersonaConfig,
  buildPersonaInstructions,
} from "../services/personaManager.js";

describe("personaManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const db = createTestDb();
    vi.mocked(ensureV2Db).mockResolvedValue(db as any);
  });

  describe("buildPersonaInstructions", () => {
    it("includes formal tone instruction", () => {
      const result = buildPersonaInstructions({ tone: "formal", language: "pt-BR", detailLevel: "balanced" });
      expect(result).toContain("formal");
    });

    it("includes friendly tone instruction", () => {
      const result = buildPersonaInstructions({ tone: "friendly", language: "pt-BR", detailLevel: "balanced" });
      expect(result).toContain("amigavel");
    });

    it("includes concise detail level", () => {
      const result = buildPersonaInstructions({ tone: "friendly", language: "pt-BR", detailLevel: "concise" });
      expect(result).toContain("conciso");
    });

    it("includes detailed detail level", () => {
      const result = buildPersonaInstructions({ tone: "friendly", language: "pt-BR", detailLevel: "detailed" });
      expect(result).toContain("detalhadas");
    });

    it("appends customInstructions when provided", () => {
      const result = buildPersonaInstructions({
        tone: "friendly",
        language: "pt-BR",
        detailLevel: "balanced",
        customInstructions: "Always use emojis.",
      });
      expect(result).toContain("Always use emojis.");
    });

    it("filters out empty parts", () => {
      const result = buildPersonaInstructions({ tone: "unknown" as any, language: "pt-BR", detailLevel: "unknown" as any });
      expect(result).toBe("");
    });
  });

  describe("feedback CRUD", () => {
    it("submits positive feedback", async () => {
      const record = await submitFeedback({ messageId: "m1", sessionId: "s1", rating: "positive" });
      expect(record.id).toBeDefined();
      expect(record.rating).toBe("positive");
      expect(record.messageId).toBe("m1");
    });

    it("submits negative feedback with comment", async () => {
      const record = await submitFeedback({ messageId: "m2", sessionId: "s1", rating: "negative", comment: "Bad response" });
      expect(record.rating).toBe("negative");
      expect(record.comment).toBe("Bad response");
    });

    it("lists feedback ordered by created_at DESC", async () => {
      await submitFeedback({ messageId: "m1", sessionId: "s1", rating: "positive" });
      await submitFeedback({ messageId: "m2", sessionId: "s1", rating: "negative" });
      const list = await listFeedback();
      expect(list.length).toBe(2);
      expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt);
    });

    it("filters feedback by sessionId", async () => {
      await submitFeedback({ messageId: "m1", sessionId: "s1", rating: "positive" });
      await submitFeedback({ messageId: "m2", sessionId: "s2", rating: "negative" });
      const list = await listFeedback({ sessionId: "s1" });
      expect(list.length).toBe(1);
      expect(list[0].sessionId).toBe("s1");
    });

    it("deletes feedback and returns true", async () => {
      const record = await submitFeedback({ messageId: "m1", sessionId: "s1", rating: "positive" });
      const deleted = await deleteFeedback(record.id);
      expect(deleted).toBe(true);
    });

    it("returns false when deleting non-existent feedback", async () => {
      const deleted = await deleteFeedback("nonexistent");
      expect(deleted).toBe(false);
    });

    it("getFeedbackStats returns correct counts", async () => {
      await submitFeedback({ messageId: "m1", sessionId: "s1", rating: "positive" });
      await submitFeedback({ messageId: "m2", sessionId: "s1", rating: "positive" });
      await submitFeedback({ messageId: "m3", sessionId: "s1", rating: "negative" });
      const stats = await getFeedbackStats();
      expect(stats.positive).toBe(2);
      expect(stats.negative).toBe(1);
      expect(stats.total).toBe(3);
    });
  });

  describe("persona config", () => {
    it("returns default persona config when none saved", async () => {
      vi.mocked(getSettingsV2).mockResolvedValue({} as any);
      const config = await getPersonaConfig();
      expect(config.tone).toBe("friendly");
      expect(config.language).toBe("pt-BR");
      expect(config.detailLevel).toBe("balanced");
    });

    it("saves persona config", async () => {
      vi.mocked(getSettingsV2).mockResolvedValue({} as any);
      vi.mocked(saveSettingsV2).mockResolvedValue(undefined as any);
      const config = { tone: "formal" as const, language: "en", detailLevel: "detailed" as const };
      const result = await savePersonaConfig(config);
      expect(result.tone).toBe("formal");
      expect(vi.mocked(saveSettingsV2)).toHaveBeenCalled();
    });
  });
});
