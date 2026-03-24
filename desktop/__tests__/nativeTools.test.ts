import { classifyNativeToolRisk, buildNativeTools } from "../services/nativeTools.js";

describe("nativeTools", () => {
  describe("classifyNativeToolRisk", () => {
    it("allows read-only tools", () => {
      for (const tool of ["list_dir", "search", "read_file", "diff_status", "diff_file"] as const) {
        const result = classifyNativeToolRisk(tool, {});
        expect(result.mode).toBe("allow");
      }
    });

    it("allows web_search", () => {
      expect(classifyNativeToolRisk("web_search", {}).mode).toBe("allow");
    });

    it("allows http_fetch", () => {
      expect(classifyNativeToolRisk("http_fetch", {}).mode).toBe("allow");
    });

    it("requires approval for generate_image", () => {
      const result = classifyNativeToolRisk("generate_image", {});
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("medium");
    });

    it("requires approval for text_to_speech", () => {
      const result = classifyNativeToolRisk("text_to_speech", {});
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("medium");
    });

    it("requires approval for run_recipe", () => {
      const result = classifyNativeToolRisk("run_recipe", {});
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("medium");
    });

    it("allows workflow draft management without enabled schedule", () => {
      expect(classifyNativeToolRisk("manage_workflows", { action: "create", workflow: { name: "Draft" } }).mode).toBe("allow");
    });

    it("requires approval for enabled workflow schedule", () => {
      const result = classifyNativeToolRisk("manage_workflows", {
        action: "create",
        workflow: {
          name: "Scheduled workflow",
          schedule: { enabled: true, mode: "cron", cronExpression: "0 8 * * 1" },
        },
      });
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("medium");
    });

    it("allows recipe draft management", () => {
      expect(classifyNativeToolRisk("manage_recipes", { action: "create" }).mode).toBe("allow");
    });

    it("requires approval for deleting recipes", () => {
      const result = classifyNativeToolRisk("manage_recipes", { action: "delete" });
      expect(result.mode).toBe("approval");
    });

    it("requires approval for enabled cron jobs", () => {
      const result = classifyNativeToolRisk("manage_cron", {
        action: "create",
        job: { enabled: true, cronExpr: "0 8 * * 1" },
      });
      expect(result.mode).toBe("approval");
    });

    it("allows draft cron changes when not enabled", () => {
      expect(classifyNativeToolRisk("manage_cron", {
        action: "update",
        job: { enabled: false },
      }).mode).toBe("allow");
    });

    it("allows connection and context management except delete", () => {
      expect(classifyNativeToolRisk("manage_connections", { action: "create" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("manage_contexts", { action: "update" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("manage_connections", { action: "delete" }).mode).toBe("approval");
      expect(classifyNativeToolRisk("manage_contexts", { action: "delete" }).mode).toBe("approval");
    });

    it("allows automation package authoring and protects package deletion", () => {
      expect(classifyNativeToolRisk("author_automation", { action: "plan" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("manage_automation_packages", { action: "create" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("manage_automation_packages", { action: "delete" }).mode).toBe("approval");
    });

    it("allows manage_tasks for non-delete actions", () => {
      expect(classifyNativeToolRisk("manage_tasks", { action: "list" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("manage_tasks", { action: "create" }).mode).toBe("allow");
    });

    it("requires approval for manage_tasks delete", () => {
      const result = classifyNativeToolRisk("manage_tasks", { action: "delete" });
      expect(result.mode).toBe("approval");
    });

    it("allows set_reminder and list_reminders", () => {
      expect(classifyNativeToolRisk("set_reminder", {}).mode).toBe("allow");
      expect(classifyNativeToolRisk("list_reminders", {}).mode).toBe("allow");
    });

    it("requires approval for spawn_agent", () => {
      const result = classifyNativeToolRisk("spawn_agent", {});
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("medium");
    });

    it("allows validate_automation", () => {
      expect(classifyNativeToolRisk("validate_automation", {}).mode).toBe("allow");
    });

    it("allows inspection of automation activation state and protects activation changes", () => {
      expect(classifyNativeToolRisk("activate_automation", { action: "get" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("activate_automation", { action: "validate" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("activate_automation", { action: "activate" }).mode).toBe("approval");
      expect(classifyNativeToolRisk("activate_automation", { action: "deactivate" }).mode).toBe("approval");
    });

    it("allows query_database without allowWrite", () => {
      expect(classifyNativeToolRisk("query_database", {}).mode).toBe("allow");
    });

    it("requires high approval for query_database with allowWrite", () => {
      const result = classifyNativeToolRisk("query_database", { allowWrite: true });
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("high");
    });

    it("allows render_canvas", () => {
      expect(classifyNativeToolRisk("render_canvas", {}).mode).toBe("allow");
    });

    it("requires high approval for execute_code", () => {
      const result = classifyNativeToolRisk("execute_code", {});
      expect(result.mode).toBe("approval");
      expect(result.riskLevel).toBe("high");
    });

    it("requires approval for write_file", () => {
      expect(classifyNativeToolRisk("write_file", {}).mode).toBe("approval");
    });

    it("requires approval for edit_file", () => {
      expect(classifyNativeToolRisk("edit_file", {}).mode).toBe("approval");
    });

    it("requires approval for apply_patch", () => {
      expect(classifyNativeToolRisk("apply_patch", {}).mode).toBe("approval");
    });

    it("denies empty run_command", () => {
      expect(classifyNativeToolRisk("run_command", { command: "" }).mode).toBe("deny");
    });

    it("denies shell chaining in run_command", () => {
      expect(classifyNativeToolRisk("run_command", { command: "ls; rm -rf /" }).mode).toBe("deny");
      expect(classifyNativeToolRisk("run_command", { command: "ls && rm -rf /" }).mode).toBe("deny");
    });

    it("allows safe read-only commands", () => {
      expect(classifyNativeToolRisk("run_command", { command: "git status" }).mode).toBe("allow");
      expect(classifyNativeToolRisk("run_command", { command: "ls -la" }).mode).toBe("allow");
    });

    it("requires approval for unknown commands", () => {
      const result = classifyNativeToolRisk("run_command", { command: "custom-tool arg" });
      expect(result.mode).toBe("approval");
    });
  });

  describe("buildNativeTools", () => {
    it("returns array of tool definitions", () => {
      const tools = buildNativeTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it("includes expected tool names", () => {
      const tools = buildNativeTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("list_dir");
      expect(names).toContain("read_file");
      expect(names).toContain("write_file");
      expect(names).toContain("http_fetch");
      expect(names).toContain("generate_image");
      expect(names).toContain("text_to_speech");
      expect(names).toContain("run_recipe");
      expect(names).toContain("manage_workflows");
      expect(names).toContain("manage_recipes");
      expect(names).toContain("manage_cron");
      expect(names).toContain("manage_connections");
      expect(names).toContain("manage_automation_packages");
      expect(names).toContain("manage_contexts");
      expect(names).toContain("spawn_agent");
      expect(names).toContain("validate_automation");
      expect(names).toContain("activate_automation");
      expect(names).toContain("author_automation");
      expect(names).toContain("query_database");
      expect(names).toContain("render_canvas");
      expect(names).toContain("execute_code");
    });

    it("each tool has required fields", () => {
      const tools = buildNativeTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
        expect(tool.metadata).toBeDefined();
      }
    });
  });
});
