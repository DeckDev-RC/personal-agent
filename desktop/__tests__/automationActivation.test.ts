vi.mock("../services/automationPackageStore.js", () => ({
  getAutomationPackage: vi.fn(),
  saveAutomationPackage: vi.fn(async (automationPackage) => automationPackage),
}));

vi.mock("../services/automationValidator.js", () => ({
  validateAutomationDraft: vi.fn(),
  appendAutomationValidationChecks: vi.fn((report, checks) => ({
    valid: [...report.checks, ...checks].every((check) => check.severity !== "error"),
    generatedAt: 456,
    summary: `Validation found ${[...report.checks, ...checks].filter((check) => check.severity === "error").length} error(s) and ${[...report.checks, ...checks].filter((check) => check.severity === "warning").length} warning(s).`,
    checks: [...report.checks, ...checks],
  })),
}));

vi.mock("../services/automationDryRun.js", () => ({
  runAutomationDryRun: vi.fn(),
}));

vi.mock("../services/connectionManager.js", () => ({
  getConnection: vi.fn(),
  ensureConnectionBrowserProfile: vi.fn(),
}));

vi.mock("../services/cronScheduler.js", () => ({
  getJob: vi.fn(),
  toggleJob: vi.fn(),
}));

vi.mock("../services/v2EntityStore.js", () => ({
  getWorkflowV2: vi.fn(),
}));

vi.mock("../services/webRecipes.js", () => ({
  getWebRecipe: vi.fn(),
}));

import {
  activateAutomationPackage,
  deactivateAutomationPackage,
  validateAutomationPackageState,
} from "../services/automationActivation.js";
import {
  getAutomationPackage,
  saveAutomationPackage,
} from "../services/automationPackageStore.js";
import { validateAutomationDraft } from "../services/automationValidator.js";
import {
  runAutomationDryRun,
} from "../services/automationDryRun.js";
import {
  ensureConnectionBrowserProfile,
  getConnection,
} from "../services/connectionManager.js";
import { getJob, toggleJob } from "../services/cronScheduler.js";
import { getWorkflowV2 } from "../services/v2EntityStore.js";
import { getWebRecipe } from "../services/webRecipes.js";

describe("automationActivation", () => {
  const basePackage = {
    id: "pkg-1",
    title: "Importacao mensal",
    goal: "Importar PDF para o ERP",
    status: "ready_for_activation",
    sourcePrompt: "Importar PDF",
    workflowId: "wf-1",
    recipeIds: ["recipe-1"],
    cronJobIds: ["cron-1"],
    connectionIds: ["conn-1"],
    taskIds: [],
    reminderIds: [],
    projectContextIds: [],
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
  } as const;

  const baseWorkflow = {
    id: "wf-1",
    name: "Importar PDF",
    description: "",
    steps: [{ id: "step-1", type: "tool-call", toolName: "run_recipe" }],
    variables: {},
    recipeIds: ["recipe-1"],
    connectionIds: ["conn-1"],
    createdAt: 1,
    updatedAt: 1,
  } as const;

  const baseRecipe = {
    id: "recipe-1",
    name: "ERP",
    description: "",
    steps: [{ id: "open", label: "Abrir", action: "browser_open", args: { url: "https://erp.local" } }],
    createdAt: 1,
    updatedAt: 1,
  } as const;

  const readyConnection = {
    id: "conn-1",
    label: "ERP",
    provider: "erp.local",
    authType: "browser_profile",
    browserProfileId: "connection:conn-1",
    status: "ready",
    createdAt: 1,
    updatedAt: 1,
  } as const;

  const disabledCron = {
    id: "cron-1",
    name: "Toda segunda 8h",
    cronExpr: "0 8 * * 1",
    actionType: "workflow",
    actionConfig: { workflowId: "wf-1", packageId: "pkg-1" },
    enabled: false,
    nextRun: 123456789,
    runCount: 0,
    createdAt: 1,
    updatedAt: 1,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getAutomationPackage).mockResolvedValue({ ...basePackage });
    vi.mocked(getWorkflowV2).mockResolvedValue({ ...baseWorkflow } as any);
    vi.mocked(getWebRecipe).mockResolvedValue({ ...baseRecipe } as any);
    vi.mocked(getJob).mockResolvedValue({ ...disabledCron } as any);
    vi.mocked(getConnection).mockResolvedValue({ ...readyConnection } as any);
    vi.mocked(ensureConnectionBrowserProfile).mockResolvedValue({
      ...readyConnection,
    } as any);
    vi.mocked(toggleJob).mockImplementation(async (id, enabled) => ({
      ...disabledCron,
      id,
      enabled,
      nextRun: enabled ? disabledCron.nextRun : undefined,
      updatedAt: Date.now(),
    }) as any);
    vi.mocked(validateAutomationDraft).mockReturnValue({
      valid: true,
      generatedAt: 123,
      summary: "Automation draft passed structural validation.",
      checks: [],
    });
    vi.mocked(runAutomationDryRun).mockResolvedValue([]);
  });

  it("validates package state and persists the refreshed report", async () => {
    const result = await validateAutomationPackageState("pkg-1");

    expect(result.status).toBe("ready_for_activation");
    expect(result.blockingIssues).toEqual([]);
    expect(runAutomationDryRun).toHaveBeenCalledWith({
      automationPackage: expect.objectContaining({ id: "pkg-1" }),
      recipes: expect.any(Array),
      connections: expect.any(Array),
    });
    expect(saveAutomationPackage).toHaveBeenCalled();
  });

  it("activates a ready package and enables its cron jobs", async () => {
    const result = await activateAutomationPackage("pkg-1");

    expect(result.status).toBe("active");
    expect(result.changedCronJobs[0]?.enabled).toBe(true);
    expect(toggleJob).toHaveBeenCalledWith("cron-1", true);
    expect(ensureConnectionBrowserProfile).toHaveBeenCalledWith("conn-1");
    expect(saveAutomationPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pkg-1",
        status: "active",
      }),
    );
  });

  it("blocks activation when the package still has unmet prerequisites", async () => {
    const blockedConnection = {
      ...readyConnection,
      status: "pending_login",
      browserProfileId: undefined,
    } as any;
    vi.mocked(getConnection).mockResolvedValue(blockedConnection);
    vi.mocked(ensureConnectionBrowserProfile).mockResolvedValue(blockedConnection);

    await expect(activateAutomationPackage("pkg-1")).rejects.toThrow(
      /not ready for activation/i,
    );
    expect(saveAutomationPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pkg-1",
        status: "needs_credentials",
      }),
    );
  });

  it("deactivates a package and disables its cron jobs", async () => {
    vi.mocked(getAutomationPackage).mockResolvedValue({
      ...basePackage,
      status: "active",
    } as any);
    vi.mocked(getJob).mockResolvedValue({
      ...disabledCron,
      enabled: true,
      nextRun: 999,
    } as any);

    const result = await deactivateAutomationPackage("pkg-1");

    expect(result.status).toBe("ready_for_activation");
    expect(toggleJob).toHaveBeenCalledWith("cron-1", false);
    expect(saveAutomationPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pkg-1",
        status: "ready_for_activation",
        nextRunAt: undefined,
      }),
    );
  });

  it("blocks validation when dry-run reports a navigation failure", async () => {
    vi.mocked(runAutomationDryRun).mockResolvedValue([
      {
        code: "dry_run.recipe.navigation_failed",
        severity: "error",
        message: "Recipe failed during dry-run.",
      },
    ] as any);

    const result = await validateAutomationPackageState("pkg-1");

    expect(result.status).toBe("draft");
    expect(result.validationReport.valid).toBe(false);
    expect(result.blockingIssues).toContain("Recipe failed during dry-run.");
  });
});
