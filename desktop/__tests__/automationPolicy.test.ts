import { ensureAutomationToolCallAllowed } from "../services/automationPolicy.js";
import { validateAutomationDraft } from "../services/automationValidator.js";

describe("automation package policy", () => {
  const basePolicy = {
    mode: "manual" as const,
    approvalProfileId: "manual_sensitive" as const,
    allowBackgroundRun: false,
    requiresDryRun: true,
    allowedToolNames: ["run_recipe"],
    allowedDomains: ["erp.local"],
  };

  it("reports workflow tools outside the package allowedToolNames policy", () => {
    const report = validateAutomationDraft({
      automationPackage: {
        title: "Importacao ERP",
        goal: "Importar dados com workflow controlado",
        activationPolicy: {
          ...basePolicy,
          allowedToolNames: ["manage_tasks"],
        },
      },
      workflow: {
        id: "wf-1",
        name: "Workflow ERP",
        steps: [
          {
            id: "step-1",
            type: "tool-call",
            toolName: "run_recipe",
          },
        ],
      },
    });

    expect(report.valid).toBe(false);
    expect(
      report.checks.some((check) => check.code === "package.policy.tool_not_allowed"),
    ).toBe(true);
  });

  it("reports recipe domains outside the package allowedDomains policy", () => {
    const report = validateAutomationDraft({
      automationPackage: {
        title: "Importacao ERP",
        goal: "Importar dados com workflow controlado",
        activationPolicy: {
          ...basePolicy,
          allowedDomains: ["erp.local"],
        },
      },
      workflow: {
        id: "wf-1",
        name: "Workflow ERP",
        steps: [],
      },
      recipes: [
        {
          id: "recipe-1",
          name: "Recipe financeiro",
          targetSite: "https://financeiro.outrodominio.com",
          steps: [
            {
              id: "open",
              label: "Abrir portal",
              action: "browser_open",
              args: {
                url: "https://financeiro.outrodominio.com/login",
              },
            },
          ],
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(
      report.checks.some((check) => check.code === "package.policy.domain_not_allowed"),
    ).toBe(true);
  });

  it("warns when package policy does not declare allowed domains for external access", () => {
    const report = validateAutomationDraft({
      automationPackage: {
        title: "Importacao ERP",
        goal: "Importar dados com workflow controlado",
        activationPolicy: {
          ...basePolicy,
          allowedDomains: [],
        },
      },
      workflow: {
        id: "wf-1",
        name: "Workflow ERP",
        steps: [],
      },
      connections: [
        {
          id: "conn-1",
          label: "ERP",
          provider: "erp.local",
          authType: "browser_profile",
          targetSite: "https://erp.local",
        },
      ],
    });

    expect(
      report.checks.some((check) => check.code === "package.policy.allowed_domains_missing"),
    ).toBe(true);
  });

  it("blocks runtime tool-calls outside the package tool policy", () => {
    expect(() =>
      ensureAutomationToolCallAllowed({
        automationPackage: {
          id: "pkg-1",
          title: "Importacao ERP",
          goal: "Importar dados",
          status: "ready_for_activation",
          sourcePrompt: "Importar dados",
          recipeIds: [],
          cronJobIds: [],
          connectionIds: [],
          taskIds: [],
          reminderIds: [],
          projectContextIds: [],
          activationPolicy: {
            ...basePolicy,
            allowedToolNames: ["manage_tasks"],
          },
          createdBy: "agent",
          createdAt: 1,
          updatedAt: 1,
        },
        step: {
          id: "step-1",
          type: "tool-call",
          toolName: "run_recipe",
        },
        resolvedArgs: { recipeId: "recipe-1" },
      }),
    ).toThrow(/does not allow tool "run_recipe"/i);
  });

  it("blocks runtime recipe execution outside the package domain policy", () => {
    expect(() =>
      ensureAutomationToolCallAllowed({
        automationPackage: {
          id: "pkg-1",
          title: "Importacao ERP",
          goal: "Importar dados",
          status: "ready_for_activation",
          sourcePrompt: "Importar dados",
          recipeIds: ["recipe-1"],
          cronJobIds: [],
          connectionIds: [],
          taskIds: [],
          reminderIds: [],
          projectContextIds: [],
          activationPolicy: {
            ...basePolicy,
            allowedDomains: ["erp.local"],
          },
          createdBy: "agent",
          createdAt: 1,
          updatedAt: 1,
        },
        step: {
          id: "step-1",
          type: "tool-call",
          toolName: "run_recipe",
        },
        resolvedArgs: { recipeId: "recipe-1" },
        recipe: {
          id: "recipe-1",
          name: "Portal externo",
          description: "",
          tags: [],
          targetSite: "https://portal.outrodominio.com",
          steps: [
            {
              id: "open",
              label: "Abrir portal",
              action: "browser_open",
              args: {
                url: "https://portal.outrodominio.com/login",
              },
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    ).toThrow(/does not allow access to domain "portal.outrodominio.com"/i);
  });
});
