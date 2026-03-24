import type {
  AutomationPackage,
  AutomationValidationCheck,
  AutomationValidationReport,
} from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { Workflow, WorkflowStep } from "../../src/types/workflow.js";
import { validateWorkflowSchedule } from "../../src/workflowSchedule.js";
import { buildAutomationPolicyChecks } from "./automationPolicy.js";
import type { CronJob } from "./cronScheduler.js";

const VALID_BROWSER_ACTIONS = new Set([
  "browser_tabs",
  "browser_open",
  "browser_snapshot",
  "browser_click",
  "browser_hover",
  "browser_type",
  "browser_drag",
  "browser_select",
  "browser_fill",
  "browser_wait",
  "browser_evaluate",
  "browser_batch",
  "browser_set_input_files",
  "browser_handle_dialog",
  "browser_screenshot",
  "browser_extract_text",
  "browser_close",
]);

const KNOWN_TOOL_CALLS = new Set([
  "run_recipe",
  "manage_workflows",
  "manage_recipes",
  "manage_cron",
  "manage_connections",
  "manage_automation_packages",
  "manage_contexts",
  "manage_tasks",
  "set_reminder",
  "list_reminders",
  "validate_automation",
  "activate_automation",
  "author_automation",
  "query_database",
  "render_canvas",
  "execute_code",
  "browser_tabs",
  "browser_open",
  "browser_snapshot",
  "browser_click",
  "browser_hover",
  "browser_type",
  "browser_drag",
  "browser_select",
  "browser_fill",
  "browser_wait",
  "browser_evaluate",
  "browser_batch",
  "browser_set_input_files",
  "browser_handle_dialog",
  "browser_screenshot",
  "browser_extract_text",
  "browser_close",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasStructuredArg(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return isNonEmptyString(value);
}

function validateRecipeStepArgs(
  recipeName: string,
  recipeId: string | undefined,
  step: { action?: unknown; args?: Record<string, unknown> },
  checks: AutomationValidationCheck[],
): void {
  const action = String(step.action ?? "");
  const args = step.args ?? {};

  const pushRecipeArgError = (code: string, message: string): void => {
    pushCheck(checks, {
      code,
      severity: "error",
      message,
      field: "recipes[].steps[].args",
      relatedArtifactIds: recipeId ? [recipeId] : undefined,
    });
  };

  if (action === "browser_open") {
    if (!isNonEmptyString(args.url)) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" step "${String(step.action)}" requires args.url.`,
      );
      return;
    }
    try {
      new URL(args.url);
    } catch {
      pushRecipeArgError(
        "recipe.step.arg_invalid",
        `Recipe "${recipeName}" contains an invalid browser_open URL.`,
      );
    }
    return;
  }

  if (action === "browser_click") {
    if (!isNonEmptyString(args.selector) && !isNonEmptyString(args.ref)) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_click requires args.selector or args.ref.`,
      );
    }
    return;
  }

  if (action === "browser_hover") {
    if (!isNonEmptyString(args.selector) && !isNonEmptyString(args.ref)) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_hover requires args.selector or args.ref.`,
      );
    }
    return;
  }

  if (action === "browser_type") {
    if (
      (!isNonEmptyString(args.selector) && !isNonEmptyString(args.ref)) ||
      !isNonEmptyString(args.text)
    ) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_type requires args.selector or args.ref, plus args.text.`,
      );
    }
    return;
  }

  if (action === "browser_drag") {
    const hasStart =
      isNonEmptyString(args.startSelector) || isNonEmptyString(args.startRef);
    const hasEnd =
      isNonEmptyString(args.endSelector) || isNonEmptyString(args.endRef);
    if (!hasStart || !hasEnd) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_drag requires startSelector/startRef and endSelector/endRef.`,
      );
    }
    return;
  }

  if (action === "browser_select") {
    if (
      (!isNonEmptyString(args.selector) && !isNonEmptyString(args.ref)) ||
      !hasStructuredArg(args.values)
    ) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_select requires args.selector or args.ref, plus args.values.`,
      );
    }
    return;
  }

  if (action === "browser_fill") {
    if (!hasStructuredArg(args.fields)) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_fill requires args.fields.`,
      );
    }
    return;
  }

  if (action === "browser_wait") {
    if (
      !isNonEmptyString(args.selector) &&
      !isNonEmptyString(args.text) &&
      !isNonEmptyString(args.textGone) &&
      !isNonEmptyString(args.url) &&
      !isNonEmptyString(args.loadState) &&
      !isFiniteNumber(args.timeMs)
    ) {
      pushCheck(checks, {
        code: "recipe.step.arg_missing",
        severity: "warning",
        message: `Recipe "${recipeName}" browser_wait should define args.selector, args.text, args.textGone, args.url, args.loadState, or args.timeMs.`,
        field: "recipes[].steps[].args",
        relatedArtifactIds: recipeId ? [recipeId] : undefined,
      });
    }
    return;
  }

  if (action === "browser_evaluate") {
    if (!isNonEmptyString(args.fn)) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_evaluate requires args.fn.`,
      );
    }
    return;
  }

  if (action === "browser_batch") {
    if (!hasStructuredArg(args.actions)) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_batch requires args.actions.`,
      );
    }
    return;
  }

  if (action === "browser_set_input_files") {
    if (
      (!isNonEmptyString(args.selector) && !isNonEmptyString(args.ref)) ||
      !hasStructuredArg(args.paths)
    ) {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_set_input_files requires args.selector or args.ref, plus args.paths.`,
      );
    }
    return;
  }

  if (action === "browser_handle_dialog") {
    if (typeof args.accept !== "boolean") {
      pushRecipeArgError(
        "recipe.step.arg_missing",
        `Recipe "${recipeName}" browser_handle_dialog requires args.accept.`,
      );
    }
  }
}

function validateWorkflowToolCall(
  step: WorkflowStep,
  checks: AutomationValidationCheck[],
  availableRecipeIds: Set<string>,
): void {
  const toolName = step.toolName?.trim();
  if (!toolName) {
    return;
  }

  if (!KNOWN_TOOL_CALLS.has(toolName) && !toolName.includes("__")) {
    pushCheck(checks, {
      code: "workflow.step.tool_name_unknown",
      severity: "warning",
      message: `Workflow step "${step.id || "unknown"}" references an unknown tool "${toolName}".`,
      field: "workflow.steps[].toolName",
    });
  }

  const toolArgs =
    step.toolArgs && typeof step.toolArgs === "object" ? step.toolArgs : {};

  if (toolName === "run_recipe") {
    const recipeId = toolArgs.recipeId;
    if (!isNonEmptyString(recipeId)) {
      pushCheck(checks, {
        code: "workflow.step.tool_arg_missing",
        severity: "error",
        message: `Workflow step "${step.id || "unknown"}" requires toolArgs.recipeId for run_recipe.`,
        field: "workflow.steps[].toolArgs.recipeId",
      });
      return;
    }
    if (!availableRecipeIds.has(recipeId)) {
      pushCheck(checks, {
        code: "workflow.step.tool_arg_reference_missing",
        severity: "error",
        message: `Workflow step "${step.id || "unknown"}" references missing recipe "${recipeId}".`,
        field: "workflow.steps[].toolArgs.recipeId",
        relatedArtifactIds: [recipeId],
      });
    }
  }
}

function pushCheck(
  checks: AutomationValidationCheck[],
  check: AutomationValidationCheck,
): void {
  checks.push(check);
}

function validateWorkflowStep(
  step: WorkflowStep,
  checks: AutomationValidationCheck[],
  availableRecipeIds: Set<string>,
): void {
  if (!step.id?.trim()) {
    pushCheck(checks, {
      code: "workflow.step.id_missing",
      severity: "error",
      message: "Workflow step is missing an id.",
      field: "workflow.steps[].id",
    });
  }

  if (step.type === "tool-call" && !step.toolName?.trim()) {
    pushCheck(checks, {
      code: "workflow.step.tool_name_missing",
      severity: "error",
      message: `Workflow step "${step.id || "unknown"}" is missing toolName.`,
      field: "workflow.steps[].toolName",
    });
  }

  if (step.type === "tool-call" && step.toolName?.trim()) {
    validateWorkflowToolCall(step, checks, availableRecipeIds);
  }

  if (step.type === "agent-chat" && !step.prompt?.trim()) {
    pushCheck(checks, {
      code: "workflow.step.prompt_missing",
      severity: "warning",
      message: `Workflow step "${step.id || "unknown"}" should define a prompt.`,
      field: "workflow.steps[].prompt",
    });
  }

  if (step.type === "skill-execute" && !step.skillId?.trim()) {
    pushCheck(checks, {
      code: "workflow.step.skill_missing",
      severity: "error",
      message: `Workflow step "${step.id || "unknown"}" is missing skillId.`,
      field: "workflow.steps[].skillId",
    });
  }
}

function validateWorkflow(
  workflow: Partial<Workflow> | undefined,
  checks: AutomationValidationCheck[],
  availableRecipeIds: Set<string>,
  availableConnectionIds: Set<string>,
): void {
  if (!workflow) {
    return;
  }

  if (!workflow.name?.trim()) {
    pushCheck(checks, {
      code: "workflow.name_missing",
      severity: "error",
      message: "Workflow must define a name.",
      field: "workflow.name",
    });
  }

  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    pushCheck(checks, {
      code: "workflow.steps_empty",
      severity: "warning",
      message: "Workflow has no steps yet.",
      field: "workflow.steps",
    });
  }

  const scheduleValidation = validateWorkflowSchedule(workflow.schedule);
  if (!scheduleValidation.valid) {
    pushCheck(checks, {
      code: "workflow.schedule_invalid",
      severity: "error",
      message: scheduleValidation.error ?? "Invalid workflow schedule.",
      field: "workflow.schedule",
    });
  }

  const seenStepIds = new Set<string>();
  for (const step of workflow.steps ?? []) {
    if (step.id && seenStepIds.has(step.id)) {
      pushCheck(checks, {
        code: "workflow.step.id_duplicate",
        severity: "error",
        message: `Workflow step id "${step.id}" is duplicated.`,
        field: "workflow.steps[].id",
      });
    }
    if (step.id) {
      seenStepIds.add(step.id);
    }
    validateWorkflowStep(step, checks, availableRecipeIds);
  }

  for (const recipeId of workflow.recipeIds ?? []) {
    if (!availableRecipeIds.has(recipeId)) {
      pushCheck(checks, {
        code: "workflow.recipe_missing",
        severity: "error",
        message: `Workflow references missing recipe "${recipeId}".`,
        field: "workflow.recipeIds",
        relatedArtifactIds: [recipeId],
      });
    }
  }

  for (const connectionId of workflow.connectionIds ?? []) {
    if (!availableConnectionIds.has(connectionId)) {
      pushCheck(checks, {
        code: "workflow.connection_missing",
        severity: "error",
        message: `Workflow references missing connection "${connectionId}".`,
        field: "workflow.connectionIds",
        relatedArtifactIds: [connectionId],
      });
    }
  }
}

function validateRecipes(
  recipes: Array<Partial<WebRecipe>> | undefined,
  checks: AutomationValidationCheck[],
  availableConnectionIds: Set<string>,
): Set<string> {
  const recipeIds = new Set<string>();

  for (const recipe of recipes ?? []) {
    const id = String(recipe.id ?? "").trim();
    if (id) {
      if (recipeIds.has(id)) {
        pushCheck(checks, {
          code: "recipe.id_duplicate",
          severity: "error",
          message: `Recipe id "${id}" is duplicated.`,
          field: "recipes[].id",
        });
      }
      recipeIds.add(id);
    }

    if (!recipe.name?.trim()) {
      pushCheck(checks, {
        code: "recipe.name_missing",
        severity: "error",
        message: "Recipe must define a name.",
        field: "recipes[].name",
      });
    }

    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      pushCheck(checks, {
        code: "recipe.steps_empty",
        severity: "warning",
        message: `Recipe "${recipe.name || id || "unnamed"}" has no steps.`,
        field: "recipes[].steps",
      });
    }

    for (const step of recipe.steps ?? []) {
      if (!VALID_BROWSER_ACTIONS.has(String(step.action ?? ""))) {
        pushCheck(checks, {
          code: "recipe.step.action_invalid",
          severity: "error",
          message: `Recipe "${recipe.name || id || "unnamed"}" contains an unknown browser action.`,
          field: "recipes[].steps[].action",
          relatedArtifactIds: id ? [id] : undefined,
        });
        continue;
      }

      validateRecipeStepArgs(
        recipe.name || id || "unnamed",
        id || undefined,
        step as { action?: unknown; args?: Record<string, unknown> },
        checks,
      );
    }

    if (recipe.connectionId && !availableConnectionIds.has(recipe.connectionId)) {
      pushCheck(checks, {
        code: "recipe.connection_missing",
        severity: "error",
        message: `Recipe "${recipe.name || id || "unnamed"}" references missing connection "${recipe.connectionId}".`,
        field: "recipes[].connectionId",
        relatedArtifactIds: [recipe.connectionId],
      });
    }
  }

  return recipeIds;
}

function validateCronJobs(
  cronJobs: Array<Partial<CronJob>> | undefined,
  checks: AutomationValidationCheck[],
): Set<string> {
  const cronIds = new Set<string>();

  for (const cronJob of cronJobs ?? []) {
    const id = String(cronJob.id ?? "").trim();
    if (id) {
      cronIds.add(id);
    }

    if (!cronJob.name?.trim()) {
      pushCheck(checks, {
        code: "cron.name_missing",
        severity: "error",
        message: "Cron job must define a name.",
        field: "cronJobs[].name",
      });
    }

    const scheduleValidation = validateWorkflowSchedule({
      enabled: true,
      mode: "cron",
      cronExpression: cronJob.cronExpr,
    });
    if (!scheduleValidation.valid) {
      pushCheck(checks, {
        code: "cron.expression_invalid",
        severity: "error",
        message: scheduleValidation.error ?? "Invalid cron expression.",
        field: "cronJobs[].cronExpr",
        relatedArtifactIds: id ? [id] : undefined,
      });
    }
  }

  return cronIds;
}

function validateConnections(
  connections: Array<Partial<Connection>> | undefined,
  checks: AutomationValidationCheck[],
): Set<string> {
  const connectionIds = new Set<string>();

  for (const connection of connections ?? []) {
    const id = String(connection.id ?? "").trim();
    if (id) {
      connectionIds.add(id);
    }

    if (!connection.label?.trim()) {
      pushCheck(checks, {
        code: "connection.label_missing",
        severity: "error",
        message: "Connection must define a label.",
        field: "connections[].label",
      });
    }

    if (!connection.provider?.trim()) {
      pushCheck(checks, {
        code: "connection.provider_missing",
        severity: "error",
        message: `Connection "${connection.label || id || "unnamed"}" is missing provider.`,
        field: "connections[].provider",
      });
    }

    if (!connection.authType) {
      pushCheck(checks, {
        code: "connection.auth_type_missing",
        severity: "error",
        message: `Connection "${connection.label || id || "unnamed"}" is missing authType.`,
        field: "connections[].authType",
      });
    }

    if (
      (connection.authType === "api_key" || connection.authType === "password") &&
      !connection.secretRef?.trim()
    ) {
      pushCheck(checks, {
        code: "connection.secret_missing",
        severity: "warning",
        message: `Connection "${connection.label || id || "unnamed"}" still needs secretRef.`,
        field: "connections[].secretRef",
        relatedArtifactIds: id ? [id] : undefined,
      });
    }

    if (connection.authType === "browser_profile" && !connection.browserProfileId?.trim()) {
      pushCheck(checks, {
        code: "connection.browser_profile_missing",
        severity: "warning",
        message: `Connection "${connection.label || id || "unnamed"}" still needs browserProfileId.`,
        field: "connections[].browserProfileId",
        relatedArtifactIds: id ? [id] : undefined,
      });
    }
  }

  return connectionIds;
}

function buildSummary(checks: AutomationValidationCheck[]): string {
  const errorCount = checks.filter((check) => check.severity === "error").length;
  const warningCount = checks.filter((check) => check.severity === "warning").length;
  if (errorCount === 0 && warningCount === 0) {
    return "Automation draft passed structural validation.";
  }
  return `Validation found ${errorCount} error(s) and ${warningCount} warning(s).`;
}

export type ValidateAutomationDraftInput = {
  automationPackage?: Partial<AutomationPackage>;
  workflow?: Partial<Workflow>;
  recipes?: Array<Partial<WebRecipe>>;
  cronJobs?: Array<Partial<CronJob>>;
  connections?: Array<Partial<Connection>>;
};

export function buildAutomationValidationReport(
  checks: AutomationValidationCheck[],
): AutomationValidationReport {
  return {
    valid: checks.every((check) => check.severity !== "error"),
    generatedAt: Date.now(),
    summary: buildSummary(checks),
    checks,
  };
}

export function appendAutomationValidationChecks(
  report: AutomationValidationReport,
  additionalChecks: AutomationValidationCheck[],
): AutomationValidationReport {
  if (additionalChecks.length === 0) {
    return report;
  }

  return buildAutomationValidationReport([
    ...report.checks,
    ...additionalChecks,
  ]);
}

export function validateAutomationDraft(
  input: ValidateAutomationDraftInput,
): AutomationValidationReport {
  const checks: AutomationValidationCheck[] = [];
  const connectionIds = validateConnections(input.connections, checks);
  const recipeIds = validateRecipes(input.recipes, checks, connectionIds);
  const cronIds = validateCronJobs(input.cronJobs, checks);
  validateWorkflow(input.workflow, checks, recipeIds, connectionIds);

  if (input.automationPackage) {
    const automationPackage = input.automationPackage;
    if (!automationPackage.title?.trim()) {
      pushCheck(checks, {
        code: "package.title_missing",
        severity: "warning",
        message: "Automation package should define a title.",
        field: "automationPackage.title",
      });
    }
    if (!automationPackage.goal?.trim()) {
      pushCheck(checks, {
        code: "package.goal_missing",
        severity: "warning",
        message: "Automation package should define a goal.",
        field: "automationPackage.goal",
      });
    }
    for (const recipeId of automationPackage.recipeIds ?? []) {
      if (!recipeIds.has(recipeId)) {
        pushCheck(checks, {
          code: "package.recipe_missing",
          severity: "error",
          message: `Automation package references missing recipe "${recipeId}".`,
          field: "automationPackage.recipeIds",
          relatedArtifactIds: [recipeId],
        });
      }
    }
    for (const connectionId of automationPackage.connectionIds ?? []) {
      if (!connectionIds.has(connectionId)) {
        pushCheck(checks, {
          code: "package.connection_missing",
          severity: "error",
          message: `Automation package references missing connection "${connectionId}".`,
          field: "automationPackage.connectionIds",
          relatedArtifactIds: [connectionId],
        });
      }
    }
    for (const cronId of automationPackage.cronJobIds ?? []) {
      if (!cronIds.has(cronId)) {
        pushCheck(checks, {
          code: "package.cron_missing",
          severity: "error",
          message: `Automation package references missing cron "${cronId}".`,
          field: "automationPackage.cronJobIds",
          relatedArtifactIds: [cronId],
        });
      }
    }
  }

  checks.push(...buildAutomationPolicyChecks(input));

  return buildAutomationValidationReport(checks);
}
