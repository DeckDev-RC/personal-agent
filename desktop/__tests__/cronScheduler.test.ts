import { createTestDb } from "./helpers/testDb.js";

vi.mock("../services/v2Db.js", () => ({ ensureV2Db: vi.fn() }));

import { ensureV2Db } from "../services/v2Db.js";
import {
  listJobs,
  getJob,
  createJob,
  setJobExecutor,
  updateJob,
  deleteJob,
  toggleJob,
  stopScheduler,
} from "../services/cronScheduler.js";

describe("cronScheduler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const db = createTestDb();
    vi.mocked(ensureV2Db).mockResolvedValue(db as any);
    setJobExecutor(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    setJobExecutor(null);
    stopScheduler();
  });

  describe("createJob", () => {
    it("creates a job with auto-generated id", async () => {
      const job = await createJob({
        name: "Test Job",
        cronExpr: "0 9 * * *",
        actionType: "workflow",
        actionConfig: { workflowId: "w1" },
      });
      expect(job.id).toBeDefined();
      expect(job.name).toBe("Test Job");
      expect(job.cronExpr).toBe("0 9 * * *");
      expect(job.actionType).toBe("workflow");
      expect(job.enabled).toBe(true);
      expect(job.runCount).toBe(0);
    });

    it("computes nextRun for the job", async () => {
      const job = await createJob({
        name: "Daily Job",
        cronExpr: "0 8 * * *",
        actionType: "skill",
        actionConfig: {},
      });
      expect(job.nextRun).toBeDefined();
      expect(job.nextRun!).toBeGreaterThan(Date.now());
    });
  });

  describe("listJobs", () => {
    it("lists all jobs ordered by created_at DESC", async () => {
      await createJob({ name: "Job A", cronExpr: "0 * * * *", actionType: "workflow", actionConfig: {} });
      await createJob({ name: "Job B", cronExpr: "*/30 * * * *", actionType: "skill", actionConfig: {} });
      const jobs = await listJobs();
      expect(jobs.length).toBe(2);
    });
  });

  describe("getJob", () => {
    it("gets a job by id", async () => {
      const created = await createJob({ name: "Job", cronExpr: "0 * * * *", actionType: "workflow", actionConfig: {} });
      const found = await getJob(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Job");
    });

    it("returns null for non-existent job", async () => {
      const found = await getJob("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("updateJob", () => {
    it("updates a job's name and cronExpr", async () => {
      const created = await createJob({ name: "Old", cronExpr: "0 * * * *", actionType: "workflow", actionConfig: {} });
      const updated = await updateJob(created.id, { name: "New", cronExpr: "*/15 * * * *" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New");
      expect(updated!.cronExpr).toBe("*/15 * * * *");
    });

    it("returns null for non-existent job", async () => {
      const updated = await updateJob("nonexistent", { name: "X" });
      expect(updated).toBeNull();
    });
  });

  describe("deleteJob", () => {
    it("deletes a job and returns true", async () => {
      const created = await createJob({ name: "Job", cronExpr: "0 * * * *", actionType: "workflow", actionConfig: {} });
      const deleted = await deleteJob(created.id);
      expect(deleted).toBe(true);
      const found = await getJob(created.id);
      expect(found).toBeNull();
    });

    it("returns false for non-existent job", async () => {
      const deleted = await deleteJob("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("toggleJob", () => {
    it("disables an enabled job", async () => {
      const created = await createJob({ name: "Job", cronExpr: "0 * * * *", actionType: "workflow", actionConfig: {} });
      const toggled = await toggleJob(created.id, false);
      expect(toggled).not.toBeNull();
      expect(toggled!.enabled).toBe(false);
    });

    it("enables a disabled job", async () => {
      const created = await createJob({ name: "Job", cronExpr: "0 * * * *", actionType: "workflow", actionConfig: {}, enabled: false });
      const toggled = await toggleJob(created.id, true);
      expect(toggled).not.toBeNull();
      expect(toggled!.enabled).toBe(true);
    });
  });

  describe("job executor", () => {
    it("invokes the registered executor when a cron run is due", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-22T10:00:00.000Z"));

      const executor = vi.fn(async () => undefined);
      setJobExecutor(executor);

      await createJob({
        name: "Execute workflow",
        cronExpr: "* * * * *",
        actionType: "workflow",
        actionConfig: { workflowId: "wf-1" },
      });

      await vi.advanceTimersByTimeAsync(61_000);

      expect(executor).toHaveBeenCalledTimes(1);
      const jobs = await listJobs();
      expect(jobs[0]?.runCount).toBeGreaterThanOrEqual(1);
      expect(jobs[0]?.lastError).toBeUndefined();
    });
  });
});
