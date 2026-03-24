vi.mock("../services/browserRuntime.js", () => ({
  executeBrowserTool: vi.fn(),
}));

import { runAutomationDryRun } from "../services/automationDryRun.js";
import { executeBrowserTool } from "../services/browserRuntime.js";

describe("automationDryRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeBrowserTool).mockResolvedValue({
      content: "ok",
      isError: false,
      metadata: {},
    } as any);
  });

  it("runs only the safe navigation prefix for ready browser recipes", async () => {
    const checks = await runAutomationDryRun({
      automationPackage: {
        activationPolicy: {
          requiresDryRun: true,
        },
      } as any,
      connections: [
        {
          id: "conn-1",
          label: "ERP",
          provider: "erp.local",
          authType: "browser_profile",
          browserProfileId: "connection:conn-1",
          status: "ready",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      recipes: [
        {
          id: "recipe-1",
          name: "ERP login",
          description: "",
          connectionId: "conn-1",
          steps: [
            {
              id: "open",
              label: "Abrir login",
              action: "browser_open",
              args: { url: "https://erp.local/login" },
            },
            {
              id: "snapshot",
              label: "Capturar contexto",
              action: "browser_snapshot",
              args: {},
            },
            {
              id: "click",
              label: "Clicar entrar",
              action: "browser_click",
              args: { selector: "button[type=submit]" },
            },
          ],
          tags: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(
      checks.some((check) => check.code === "dry_run.connection.ready"),
    ).toBe(true);
    expect(
      checks.some((check) => check.code === "dry_run.recipe.navigation_ok"),
    ).toBe(true);
    expect(vi.mocked(executeBrowserTool)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executeBrowserTool).mock.calls[0]?.[0]).toBe("browser_open");
    expect(vi.mocked(executeBrowserTool).mock.calls[1]?.[0]).toBe("browser_snapshot");
  });

  it("skips browser execution when the connection is not ready", async () => {
    const checks = await runAutomationDryRun({
      automationPackage: {
        activationPolicy: {
          requiresDryRun: true,
        },
      } as any,
      connections: [
        {
          id: "conn-1",
          label: "ERP",
          provider: "erp.local",
          authType: "browser_profile",
          status: "pending_login",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      recipes: [
        {
          id: "recipe-1",
          name: "ERP login",
          description: "",
          connectionId: "conn-1",
          steps: [
            {
              id: "open",
              label: "Abrir login",
              action: "browser_open",
              args: { url: "https://erp.local/login" },
            },
          ],
          tags: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(
      checks.some((check) => check.code === "dry_run.connection.blocked"),
    ).toBe(true);
    expect(
      checks.some((check) => check.code === "dry_run.recipe.connection_blocked"),
    ).toBe(true);
    expect(executeBrowserTool).not.toHaveBeenCalled();
  });
});
