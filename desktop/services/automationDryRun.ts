import type {
  AutomationPackage,
  AutomationValidationCheck,
} from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { BrowserToolName } from "./browserTools.js";
import { executeBrowserTool } from "./browserRuntime.js";
import { resolveConnectionSessionId } from "./connectionManager.js";

const SAFE_RECIPE_DRY_RUN_ACTIONS = new Set<BrowserToolName>([
  "browser_tabs",
  "browser_open",
  "browser_snapshot",
  "browser_hover",
  "browser_extract_text",
  "browser_screenshot",
]);

type AutomationDryRunInput = {
  automationPackage?: Partial<AutomationPackage>;
  recipes?: WebRecipe[];
  connections?: Connection[];
};

function pushCheck(
  checks: AutomationValidationCheck[],
  check: AutomationValidationCheck,
): void {
  checks.push(check);
}

function dryRunSessionId(recipeId: string): string {
  return `dry-run:${recipeId}`;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? "Unknown dry-run failure.");
}

function collectSafeRecipeSteps(recipe: WebRecipe): WebRecipe["steps"] {
  const safeSteps: WebRecipe["steps"] = [];

  for (const step of recipe.steps) {
    if (!SAFE_RECIPE_DRY_RUN_ACTIONS.has(step.action)) {
      break;
    }
    safeSteps.push(step);
  }

  return safeSteps;
}

function buildConnectionIndex(connections: Connection[]): Map<string, Connection> {
  return new Map(
    connections.map((connection) => [connection.id, connection] as const),
  );
}

function describeConnectionBlockingState(connection: Connection): string | null {
  if (connection.status === "pending_credentials") {
    return "still needs credentials";
  }
  if (connection.status === "pending_login") {
    return "still needs login";
  }
  if (connection.status === "expired") {
    return "has expired";
  }
  if (connection.status === "error") {
    return "is in error state";
  }
  return null;
}

function buildConnectionDryRunChecks(
  connections: Connection[],
): AutomationValidationCheck[] {
  const checks: AutomationValidationCheck[] = [];

  for (const connection of connections) {
    const blockingState = describeConnectionBlockingState(connection);
    if (blockingState) {
      pushCheck(checks, {
        code: "dry_run.connection.blocked",
        severity: "warning",
        message: `Connection "${connection.label}" ${blockingState}, so the dry-run can only validate structure right now.`,
        field: "connections[].status",
        relatedArtifactIds: [connection.id],
      });
      continue;
    }

    pushCheck(checks, {
      code: "dry_run.connection.ready",
      severity: "info",
      message: `Connection "${connection.label}" is ready to reuse during dry-run.`,
      field: "connections[].status",
      relatedArtifactIds: [connection.id],
    });
  }

  return checks;
}

async function runRecipeDryRun(params: {
  recipe: WebRecipe;
  connectionIndex: Map<string, Connection>;
}): Promise<AutomationValidationCheck[]> {
  const checks: AutomationValidationCheck[] = [];
  const safeSteps = collectSafeRecipeSteps(params.recipe);

  if (safeSteps.length === 0) {
    pushCheck(checks, {
      code: "dry_run.recipe.skipped",
      severity: "info",
      message: `Recipe "${params.recipe.name}" does not have a safe navigation prefix to dry-run yet.`,
      field: "recipes[].steps",
      relatedArtifactIds: [params.recipe.id],
    });
    return checks;
  }

  const connection = params.recipe.connectionId
    ? params.connectionIndex.get(params.recipe.connectionId)
    : undefined;

  if (params.recipe.connectionId && !connection) {
    pushCheck(checks, {
      code: "dry_run.recipe.connection_missing",
      severity: "error",
      message: `Recipe "${params.recipe.name}" cannot run a dry-run because connection "${params.recipe.connectionId}" is missing.`,
      field: "recipes[].connectionId",
      relatedArtifactIds: [params.recipe.id, params.recipe.connectionId],
    });
    return checks;
  }

  if (connection && connection.status !== "ready") {
    pushCheck(checks, {
      code: "dry_run.recipe.connection_blocked",
      severity: "warning",
      message: `Recipe "${params.recipe.name}" skipped browser dry-run because connection "${connection.label}" is ${connection.status}.`,
      field: "recipes[].connectionId",
      relatedArtifactIds: [params.recipe.id, connection.id],
    });
    return checks;
  }

  const sessionId = connection
    ? resolveConnectionSessionId(connection.id)
    : dryRunSessionId(params.recipe.id);
  let currentStepLabel = safeSteps[0]?.label ?? safeSteps[0]?.id ?? "unknown";

  try {
    for (const step of safeSteps) {
      currentStepLabel = step.label || step.id;
      const result = await executeBrowserTool(
        step.action,
        {
          ...step.args,
          ...(connection ? { connectionId: connection.id } : {}),
        },
        {
          sessionId,
          connectionId: connection?.id,
        },
      );

      if (result.isError) {
        throw new Error(result.content || `Dry-run failed at "${currentStepLabel}".`);
      }
    }

    pushCheck(checks, {
      code: "dry_run.recipe.navigation_ok",
      severity: "info",
      message: `Recipe "${params.recipe.name}" completed dry-run for ${safeSteps.length} safe step(s).`,
      field: "recipes[].steps",
      relatedArtifactIds: connection
        ? [params.recipe.id, connection.id]
        : [params.recipe.id],
    });
  } catch (error) {
    pushCheck(checks, {
      code: "dry_run.recipe.navigation_failed",
      severity: "error",
      message: `Recipe "${params.recipe.name}" failed dry-run at "${currentStepLabel}": ${normalizeErrorMessage(error)}`,
      field: "recipes[].steps",
      relatedArtifactIds: connection
        ? [params.recipe.id, connection.id]
        : [params.recipe.id],
    });
  } finally {
    if (!connection) {
      await executeBrowserTool(
        "browser_close",
        {},
        { sessionId },
      ).catch(() => undefined);
    }
  }

  return checks;
}

export async function runAutomationDryRun(
  input: AutomationDryRunInput,
): Promise<AutomationValidationCheck[]> {
  if (input.automationPackage?.activationPolicy?.requiresDryRun === false) {
    return [];
  }

  const connections = input.connections ?? [];
  const recipes = input.recipes ?? [];
  const checks = buildConnectionDryRunChecks(connections);
  const connectionIndex = buildConnectionIndex(connections);

  for (const recipe of recipes) {
    checks.push(
      ...(await runRecipeDryRun({
        recipe,
        connectionIndex,
      })),
    );
  }

  if (recipes.length === 0) {
    pushCheck(checks, {
      code: "dry_run.recipe.none",
      severity: "info",
      message: "No browser recipes were attached to this automation package, so the dry-run stayed structural.",
      field: "recipes",
    });
  }

  return checks;
}
