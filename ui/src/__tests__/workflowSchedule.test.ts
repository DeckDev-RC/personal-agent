import { describe, expect, it } from "vitest";
import {
  computeNextWorkflowScheduleRunAt,
  describeWorkflowSchedule,
  getNextWorkflowScheduleRunAt,
  validateWorkflowSchedule,
} from "../../../src/workflowSchedule.js";

describe("workflowSchedule", () => {
  it("describes interval schedules", () => {
    expect(
      describeWorkflowSchedule({
        enabled: true,
        mode: "interval",
        intervalMinutes: 120,
      }),
    ).toBe("Every 2 hours");
  });

  it("computes the next interval execution", () => {
    const from = new Date(2026, 2, 20, 8, 15, 0, 0).getTime();
    const nextRunAt = computeNextWorkflowScheduleRunAt({
      schedule: {
        enabled: true,
        mode: "interval",
        intervalMinutes: 45,
      },
      from,
    });

    const next = new Date(nextRunAt);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it("computes the next weekday cron execution", () => {
    const from = new Date(2026, 2, 20, 8, 1, 0, 0).getTime();
    const nextRunAt = getNextWorkflowScheduleRunAt({
      enabled: true,
      mode: "cron",
      cronExpression: "0 8 * * 1-5",
    }, from);

    expect(nextRunAt).toBeDefined();
    const next = new Date(nextRunAt!);
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(0);
  });

  it("rejects invalid cron expressions", () => {
    expect(
      validateWorkflowSchedule({
        enabled: true,
        mode: "cron",
        cronExpression: "61 8 * * 1-5",
      }),
    ).toEqual({
      valid: false,
      error: 'Invalid minute value "61". Expected 0-59.',
    });
  });
});
