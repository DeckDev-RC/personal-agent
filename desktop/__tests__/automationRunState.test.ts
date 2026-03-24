vi.mock("../services/automationPackageStore.js", () => ({
  getAutomationPackage: vi.fn(),
  saveAutomationPackage: vi.fn(async (automationPackage) => automationPackage),
}));

vi.mock("../services/taskManager.js", () => ({
  createTask: vi.fn(async (task) => ({
    id: "task-exception-1",
    createdAt: 123,
    updatedAt: 123,
    ...task,
  })),
}));

import { recordAutomationWorkflowRun } from "../services/automationRunState.js";
import {
  getAutomationPackage,
  saveAutomationPackage,
} from "../services/automationPackageStore.js";
import { createTask } from "../services/taskManager.js";

describe("automationRunState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an exception task and degrades an active package after workflow failure", async () => {
    vi.mocked(getAutomationPackage).mockResolvedValue({
      id: "pkg-1",
      title: "Importacao ERP",
      goal: "Importar dados",
      status: "active",
      sourcePrompt: "Importar dados",
      workflowId: "wf-1",
      recipeIds: [],
      cronJobIds: ["cron-1"],
      connectionIds: ["conn-1"],
      taskIds: [],
      reminderIds: [],
      projectContextIds: ["ctx-1"],
      activationPolicy: {
        mode: "manual",
        approvalProfileId: "manual_sensitive",
        allowBackgroundRun: false,
        requiresDryRun: true,
        allowedToolNames: ["run_recipe"],
        allowedDomains: ["erp.local"],
      },
      createdBy: "agent",
      createdAt: 1,
      updatedAt: 1,
    } as any);

    const result = await recordAutomationWorkflowRun({
      workflow: {
        id: "wf-1",
        packageId: "pkg-1",
        name: "Importar ERP",
        description: "",
        steps: [],
        variables: {},
        exceptionPolicy: {
          createTaskOnFailure: true,
        },
        createdAt: 1,
        updatedAt: 1,
      },
      runId: "run-1",
      sessionId: "session-1",
      trigger: "cron",
      success: false,
      error: "Falha ao autenticar",
      lastOutput: "HTTP 401",
      occurredAt: 456,
    });

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Resolver falha em Importacao ERP",
        priority: "high",
        status: "backlog",
        projectContextId: "ctx-1",
        source: "automation_exception",
      }),
    );
    expect(saveAutomationPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pkg-1",
        status: "degraded",
        lastRunAt: 456,
        lastError: "Falha ao autenticar",
        taskIds: ["task-exception-1"],
      }),
    );
    expect(result.exceptionTaskId).toBe("task-exception-1");
  });

  it("marks a degraded package as active again after a successful run", async () => {
    vi.mocked(getAutomationPackage).mockResolvedValue({
      id: "pkg-1",
      title: "Importacao ERP",
      goal: "Importar dados",
      status: "degraded",
      sourcePrompt: "Importar dados",
      workflowId: "wf-1",
      recipeIds: [],
      cronJobIds: ["cron-1"],
      connectionIds: ["conn-1"],
      taskIds: ["task-exception-1"],
      reminderIds: [],
      projectContextIds: ["ctx-1"],
      activationPolicy: {
        mode: "manual",
        approvalProfileId: "manual_sensitive",
        allowBackgroundRun: false,
        requiresDryRun: true,
        allowedToolNames: ["run_recipe"],
        allowedDomains: ["erp.local"],
      },
      createdBy: "agent",
      createdAt: 1,
      updatedAt: 1,
      lastError: "Falha anterior",
    } as any);

    await recordAutomationWorkflowRun({
      workflow: {
        id: "wf-1",
        packageId: "pkg-1",
        name: "Importar ERP",
        description: "",
        steps: [],
        variables: {},
        exceptionPolicy: {
          createTaskOnFailure: true,
        },
        createdAt: 1,
        updatedAt: 1,
      },
      runId: "run-2",
      sessionId: "session-2",
      trigger: "cron",
      success: true,
      lastOutput: "Execucao concluida",
      occurredAt: 789,
    });

    expect(createTask).not.toHaveBeenCalled();
    expect(saveAutomationPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pkg-1",
        status: "active",
        lastRunAt: 789,
        lastError: undefined,
        taskIds: ["task-exception-1"],
      }),
    );
  });
});
