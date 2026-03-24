import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AutomationView from "../components/automation/AutomationView";
import { useAutomationStore } from "../stores/automationStore";

const basePackage = {
  id: "pkg-1",
  title: "Financeiro mensal",
  goal: "Ler o PDF mensal, validar excecoes e publicar no ERP.",
  status: "needs_credentials",
  sourcePrompt: "Cria um workflow financeiro mensal",
  workflowId: "wf-1",
  recipeIds: ["recipe-1"],
  cronJobIds: ["cron-1"],
  connectionIds: ["conn-1"],
  taskIds: ["task-1"],
  reminderIds: [],
  projectContextIds: [],
  activationPolicy: {
    mode: "manual",
    approvalProfileId: "manual_sensitive",
    allowBackgroundRun: false,
    requiresDryRun: true,
    allowedToolNames: ["run_recipe"],
    allowedDomains: ["erp.example.com"],
  },
  createdBy: "agent",
  createdAt: 1_710_000_000_000,
  updatedAt: 1_710_000_100_000,
  lastValidatedAt: 1_710_000_100_000,
};

const baseState = {
  automationPackage: basePackage,
  workflow: {
    id: "wf-1",
    name: "Financeiro mensal",
    description: "Workflow principal",
    steps: [
      {
        id: "step-1",
        type: "tool-call",
        toolName: "run_recipe",
        toolArgs: { recipeId: "recipe-1" },
      },
    ],
    variables: {},
    packageId: "pkg-1",
    connectionIds: ["conn-1"],
    recipeIds: ["recipe-1"],
    approvalProfileId: "manual_sensitive",
    createdAt: 1_710_000_000_000,
    updatedAt: 1_710_000_100_000,
  },
  recipes: [
    {
      id: "recipe-1",
      name: "ERP Financeiro",
      description: "Cadastro de lancamentos",
      steps: [
        {
          id: "recipe-step-1",
          label: "Abrir portal",
          action: "browser_open",
          args: { url: "https://erp.example.com" },
        },
      ],
      tags: ["browser"],
      targetSite: "https://erp.example.com",
      connectionId: "conn-1",
      createdAt: 1_710_000_000_000,
      updatedAt: 1_710_000_100_000,
    },
  ],
  cronJobs: [
    {
      id: "cron-1",
      name: "Toda segunda as 8h",
      cronExpr: "0 8 * * 1",
      actionType: "workflow",
      enabled: false,
      runCount: 0,
      nextRun: 1_710_060_000_000,
    },
  ],
  connections: [
    {
      id: "conn-1",
      label: "ERP Financeiro",
      provider: "erp.example.com",
      authType: "browser_profile",
      targetSite: "https://erp.example.com",
      status: "pending_login",
      createdAt: 1_710_000_000_000,
      updatedAt: 1_710_000_100_000,
    },
  ],
  validationReport: {
    valid: true,
    generatedAt: 1_710_000_100_000,
    summary: "Validation found 0 error(s) and 1 warning(s).",
    checks: [
      {
        code: "connection.browser_profile_missing",
        severity: "warning",
        message: "Connection still needs browserProfileId.",
        field: "connections[].browserProfileId",
      },
    ],
  },
  blockingIssues: [
    'Connection "ERP Financeiro" is pending_login and still blocks activation.',
  ],
  status: "needs_credentials",
  changedCronJobs: [],
};

describe("AutomationView", () => {
  beforeEach(() => {
    useAutomationStore.setState({
      packages: [],
      loaded: false,
      loadingList: false,
      selectedPackageId: undefined,
      selectedPackageState: null,
      loadingState: false,
      busyAction: null,
      error: undefined,
    });

    (window as any).codexAgent.store.listAutomationPackages = vi.fn().mockResolvedValue([
      basePackage,
    ]);
    (window as any).codexAgent.automation.inspectPackage = vi
      .fn()
      .mockResolvedValue(baseState);
    (window as any).codexAgent.automation.validatePackage = vi
      .fn()
      .mockResolvedValue(baseState);
    (window as any).codexAgent.automation.activatePackage = vi
      .fn()
      .mockResolvedValue({
        ...baseState,
        status: "active",
        automationPackage: {
          ...basePackage,
          status: "active",
          updatedAt: 1_710_000_200_000,
        },
      });
    (window as any).codexAgent.automation.deactivatePackage = vi
      .fn()
      .mockResolvedValue(baseState);
  });

  it("loads the selected package review and validates it", async () => {
    render(<AutomationView />);

    await waitFor(() => {
      expect(screen.getAllByText("Financeiro mensal").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Blocking issues")).toBeInTheDocument();
    expect(screen.getAllByText("ERP Financeiro").length).toBeGreaterThan(0);
    expect(screen.getByText("Validation report")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Validate package" }));

    await waitFor(() => {
      expect((window as any).codexAgent.automation.validatePackage).toHaveBeenCalledWith(
        "pkg-1",
      );
    });
  });
});
