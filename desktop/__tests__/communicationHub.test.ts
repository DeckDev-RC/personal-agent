import { createTestDb } from "./helpers/testDb.js";

vi.mock("../services/v2Db.js", () => ({ ensureV2Db: vi.fn() }));
vi.mock("../services/mcpManager.js", () => ({ callTool: vi.fn() }));

import { ensureV2Db } from "../services/v2Db.js";
import * as mcp from "../services/mcpManager.js";
import {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  sendDraft,
} from "../services/communicationHub.js";

describe("communicationHub", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const db = createTestDb();
    vi.mocked(ensureV2Db).mockResolvedValue(db as any);
  });

  describe("createDraft", () => {
    it("creates a draft with correct defaults", async () => {
      const draft = await createDraft({ to: "user@example.com", subject: "Test", body: "Hello" });
      expect(draft.id).toBeDefined();
      expect(draft.type).toBe("generic");
      expect(draft.status).toBe("draft");
      expect(draft.to).toBe("user@example.com");
    });

    it("creates a draft with email type", async () => {
      const draft = await createDraft({ type: "email", to: "a@b.com", subject: "Hi", body: "World" });
      expect(draft.type).toBe("email");
    });

    it("falls back to generic for invalid type", async () => {
      const draft = await createDraft({ type: "invalid" as any, to: "a@b.com", subject: "Hi", body: "W" });
      expect(draft.type).toBe("generic");
    });

    it("trims to and subject", async () => {
      const draft = await createDraft({ to: "  user@test.com  ", subject: "  Subject  ", body: "Body" });
      expect(draft.to).toBe("user@test.com");
      expect(draft.subject).toBe("Subject");
    });
  });

  describe("listDrafts", () => {
    it("lists all drafts ordered by updated_at DESC", async () => {
      await createDraft({ to: "a@b.com", subject: "A", body: "1" });
      await createDraft({ to: "c@d.com", subject: "B", body: "2" });
      const drafts = await listDrafts();
      expect(drafts.length).toBe(2);
    });

    it("filters by status", async () => {
      await createDraft({ to: "a@b.com", subject: "A", body: "1" });
      const drafts = await listDrafts({ status: "sent" });
      expect(drafts.length).toBe(0);
    });

    it("filters by type", async () => {
      await createDraft({ type: "email", to: "a@b.com", subject: "A", body: "1" });
      await createDraft({ type: "slack", to: "#channel", subject: "", body: "msg" });
      const drafts = await listDrafts({ type: "email" });
      expect(drafts.length).toBe(1);
      expect(drafts[0].type).toBe("email");
    });
  });

  describe("getDraft", () => {
    it("gets a draft by id", async () => {
      const created = await createDraft({ to: "a@b.com", subject: "Test", body: "Body" });
      const found = await getDraft(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it("returns null for non-existent draft", async () => {
      const found = await getDraft("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("updateDraft", () => {
    it("updates draft fields", async () => {
      const created = await createDraft({ to: "a@b.com", subject: "Old", body: "Old body" });
      const updated = await updateDraft(created.id, { subject: "New", body: "New body" });
      expect(updated).not.toBeNull();
      expect(updated!.subject).toBe("New");
      expect(updated!.body).toBe("New body");
    });

    it("returns null for non-existent draft", async () => {
      const updated = await updateDraft("nonexistent", { subject: "X" });
      expect(updated).toBeNull();
    });
  });

  describe("deleteDraft", () => {
    it("deletes a draft and returns true", async () => {
      const created = await createDraft({ to: "a@b.com", subject: "X", body: "Y" });
      const deleted = await deleteDraft(created.id);
      expect(deleted).toBe(true);
      const found = await getDraft(created.id);
      expect(found).toBeNull();
    });

    it("returns false for non-existent draft", async () => {
      const deleted = await deleteDraft("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("sendDraft", () => {
    it("returns null for non-existent draft", async () => {
      const result = await sendDraft("nonexistent");
      expect(result).toBeNull();
    });

    it("marks draft as failed when no MCP server is configured", async () => {
      const draft = await createDraft({ to: "a@b.com", subject: "Hi", body: "Body" });
      const sent = await sendDraft(draft.id);
      expect(sent).not.toBeNull();
      expect(sent!.status).toBe("failed");
    });

    it("marks draft as failed when MCP call throws", async () => {
      const draft = await createDraft({ to: "a@b.com", subject: "Hi", body: "Body", mcpServerId: "server-1" });
      vi.mocked(mcp.callTool).mockRejectedValue(new Error("MCP error"));
      const sent = await sendDraft(draft.id);
      expect(sent).not.toBeNull();
      expect(sent!.status).toBe("failed");
    });
  });
});
