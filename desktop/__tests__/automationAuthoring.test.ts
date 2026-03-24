import { normalizeAutomationPackage } from "../services/automationPackageStore.js";
import { planAutomationFromPrompt } from "../services/automationPlanner.js";
import { validateAutomationDraft } from "../services/automationValidator.js";
import { normalizeConnection } from "../services/connectionManager.js";

describe("automation authoring foundation", () => {
  it("normalizes connection defaults for pending credentials", () => {
    const connection = normalizeConnection({
      label: "ERP Financeiro",
      provider: "erp.local",
      authType: "api_key",
    });

    expect(connection.id).toBeTruthy();
    expect(connection.status).toBe("pending_credentials");
    expect(connection.label).toBe("ERP Financeiro");
  });

  it("normalizes automation package defaults", () => {
    const automationPackage = normalizeAutomationPackage({
      title: "Cadastrar lancamentos",
      goal: "Importar PDF e cadastrar no ERP",
      recipeIds: ["recipe-a", "recipe-a", "recipe-b"],
    });

    expect(automationPackage.id).toBeTruthy();
    expect(automationPackage.status).toBe("draft");
    expect(automationPackage.activationPolicy.mode).toBe("manual");
    expect(automationPackage.activationPolicy.requiresDryRun).toBe(true);
    expect(automationPackage.recipeIds).toEqual(["recipe-a", "recipe-b"]);
  });

  it("plans a document-driven recurring automation draft", () => {
    const draft = planAutomationFromPrompt(
      "Cria um workflow que leia o PDF mensal, entre no https://erp.local/login, cadastre os itens e rode toda segunda as 8h.",
    );

    expect(draft.title).toContain("PDF mensal");
    expect(draft.status).toBe("needs_credentials");
    expect(draft.connections).toHaveLength(1);
    expect(draft.recipes).toHaveLength(1);
    expect(draft.cronJobs).toHaveLength(1);
    expect(draft.workflow.documentInputSchema?.[0]?.mimeTypes).toContain("application/pdf");
    expect(draft.requirements.some((requirement) => requirement.kind === "cron" && requirement.required)).toBe(true);
  });

  it("plans a simpler automation without unnecessary artifacts", () => {
    const draft = planAutomationFromPrompt(
      "Create an automation that summarizes the latest support notes and prepares a daily digest at 9am.",
    );

    expect(draft.cronJobs).toHaveLength(1);
    expect(draft.recipes).toHaveLength(0);
    expect(draft.connections).toHaveLength(0);
    expect(draft.status).toBe("ready_for_activation");
  });

  it("validates a coherent automation draft", () => {
    const report = validateAutomationDraft({
      automationPackage: {
        title: "Importacao mensal",
        goal: "Ler o PDF e cadastrar no sistema",
        recipeIds: ["recipe-1"],
        cronJobIds: ["cron-1"],
        connectionIds: ["conn-1"],
      },
      workflow: {
        id: "wf-1",
        name: "Importar PDF mensal",
        steps: [
          {
            id: "step-1",
            type: "tool-call",
            toolName: "manage_recipes",
          },
        ],
        recipeIds: ["recipe-1"],
        connectionIds: ["conn-1"],
      },
      recipes: [
        {
          id: "recipe-1",
          name: "Login e cadastro",
          steps: [
            {
              id: "r-step-1",
              label: "Abrir login",
              action: "browser_open",
              args: { url: "https://erp.local/login" },
            },
          ],
          connectionId: "conn-1",
        },
      ],
      cronJobs: [
        {
          id: "cron-1",
          name: "Toda segunda 8h",
          cronExpr: "0 8 * * 1",
        },
      ],
      connections: [
        {
          id: "conn-1",
          label: "ERP",
          provider: "erp.local",
          authType: "browser_profile",
          browserProfileId: "profile-1",
        },
      ],
    });

    expect(report.valid).toBe(true);
    expect(report.checks.filter((check) => check.severity === "error")).toHaveLength(0);
  });

  it("reports structural automation issues", () => {
    const report = validateAutomationDraft({
      automationPackage: {
        title: "",
        goal: "",
        recipeIds: ["missing-recipe"],
        cronJobIds: ["missing-cron"],
        connectionIds: ["missing-connection"],
      },
      workflow: {
        id: "wf-1",
        name: "",
        steps: [
          {
            id: "step-1",
            type: "tool-call",
          },
        ],
        recipeIds: ["missing-recipe"],
        connectionIds: ["missing-connection"],
        schedule: {
          enabled: true,
          mode: "cron",
          cronExpression: "bad cron",
        },
      },
      recipes: [
        {
          id: "recipe-1",
          name: "",
          steps: [
            {
              id: "r-step-1",
              label: "Invalid",
              action: "unknown_action" as any,
              args: {},
            },
          ],
          connectionId: "missing-connection",
        },
      ],
      cronJobs: [
        {
          id: "cron-1",
          name: "",
          cronExpr: "invalid cron",
        },
      ],
      connections: [
        {
          id: "conn-1",
          label: "",
          provider: "",
          authType: "api_key",
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.checks.some((check) => check.code === "workflow.schedule_invalid")).toBe(true);
    expect(report.checks.some((check) => check.code === "workflow.step.tool_name_missing")).toBe(true);
    expect(report.checks.some((check) => check.code === "recipe.step.action_invalid")).toBe(true);
    expect(report.checks.some((check) => check.code === "cron.expression_invalid")).toBe(true);
    expect(report.checks.some((check) => check.code === "package.connection_missing")).toBe(true);
  });

  it("validates workflow tool-call args and recipe browser args", () => {
    const report = validateAutomationDraft({
      automationPackage: {
        title: "Importacao mensal",
        goal: "Executar recipe de ERP",
        recipeIds: ["recipe-1"],
      },
      workflow: {
        id: "wf-1",
        name: "Workflow com args invalidos",
        steps: [
          {
            id: "step-1",
            type: "tool-call",
            toolName: "run_recipe",
            toolArgs: {},
          },
          {
            id: "step-2",
            type: "tool-call",
            toolName: "tool_desconhecida",
          },
        ],
      },
      recipes: [
        {
          id: "recipe-1",
          name: "Recipe sem url",
          steps: [
            {
              id: "r-step-1",
              label: "Abrir sem URL",
              action: "browser_open",
              args: {},
            },
          ],
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.checks.some((check) => check.code === "workflow.step.tool_arg_missing")).toBe(true);
    expect(report.checks.some((check) => check.code === "workflow.step.tool_name_unknown")).toBe(true);
    expect(report.checks.some((check) => check.code === "recipe.step.arg_missing")).toBe(true);
  });
});
