import { createTestDb } from "./helpers/testDb.js";

vi.mock("../services/v2Db.js", () => ({ ensureV2Db: vi.fn() }));

import { ensureV2Db } from "../services/v2Db.js";
import { trackEvent, listEvents, getWeeklyReport } from "../services/analyticsCollector.js";

describe("analyticsCollector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const db = createTestDb();
    vi.mocked(ensureV2Db).mockResolvedValue(db as any);
  });

  describe("trackEvent", () => {
    it("creates an event with auto-generated id", async () => {
      const event = await trackEvent("task_completed", { taskId: "t1" });
      expect(event.id).toBeDefined();
      expect(event.eventType).toBe("task_completed");
      expect(event.metadata.taskId).toBe("t1");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("stores metadata as JSON", async () => {
      const event = await trackEvent("skill_used", { skillName: "email-writer", count: 3 });
      expect(event.metadata.skillName).toBe("email-writer");
      expect(event.metadata.count).toBe(3);
    });
  });

  describe("listEvents", () => {
    it("returns events ordered by timestamp DESC", async () => {
      await trackEvent("task_completed");
      await trackEvent("document_generated");
      const events = await listEvents();
      expect(events.length).toBe(2);
      expect(events[0].timestamp).toBeGreaterThanOrEqual(events[1].timestamp);
    });

    it("filters by eventType", async () => {
      await trackEvent("task_completed");
      await trackEvent("document_generated");
      await trackEvent("task_completed");
      const events = await listEvents({ eventType: "task_completed" });
      expect(events.length).toBe(2);
      events.forEach((e) => expect(e.eventType).toBe("task_completed"));
    });

    it("filters by since timestamp", async () => {
      const before = Date.now() - 10000;
      await trackEvent("task_completed");
      const events = await listEvents({ since: before });
      expect(events.length).toBe(1);
    });

    it("respects limit parameter", async () => {
      await trackEvent("task_completed");
      await trackEvent("task_completed");
      await trackEvent("task_completed");
      const events = await listEvents({ limit: 2 });
      expect(events.length).toBe(2);
    });

    it("returns empty array when no events match", async () => {
      const events = await listEvents({ eventType: "nonexistent" as any });
      expect(events).toEqual([]);
    });
  });

  describe("getWeeklyReport", () => {
    it("aggregates events into report", async () => {
      // Track various event types
      await trackEvent("task_completed");
      await trackEvent("task_completed");
      await trackEvent("document_generated");
      await trackEvent("skill_used", { skillName: "email-writer" });
      await trackEvent("chat_session");
      await trackEvent("mcp_tool_call");
      await trackEvent("draft_sent");

      // Capture `now` AFTER inserts so weekEnd safely includes all events.
      const now = Date.now();
      // Use a weekStart that includes now
      const weekStart = now - 7 * 24 * 60 * 60 * 1000;
      const report = await getWeeklyReport(weekStart);

      expect(report.tasksCompleted).toBe(2);
      expect(report.documentsGenerated).toBe(1);
      expect(report.totalSessions).toBe(1);
      expect(report.totalToolCalls).toBe(1);
      expect(report.draftsSent).toBe(1);
      expect(report.skillsUsed["email-writer"]).toBe(1);
      expect(report.topActivities.length).toBeGreaterThan(0);
      expect(report.topActivities[0].count).toBeGreaterThanOrEqual(report.topActivities[report.topActivities.length - 1].count);
    });
  });
});
