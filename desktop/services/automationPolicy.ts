import type {
  AutomationPackage,
  AutomationValidationCheck,
} from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { Workflow, WorkflowStep } from "../../src/types/workflow.js";

type ValidateAutomationPolicyInput = {
  automationPackage?: Partial<AutomationPackage>;
  workflow?: Partial<Workflow>;
  recipes?: Array<Partial<WebRecipe>>;
  connections?: Array<Partial<Connection>>;
};

function normalizeDomainEntry(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    const normalized = trimmed.replace(/^\*\./, "").replace(/^\.+|\.+$/g, "");
    return normalized || null;
  }
}

function normalizeAllowedDomains(domains: string[] | undefined): string[] {
  if (!Array.isArray(domains)) {
    return [];
  }

  const unique = new Set<string>();
  for (const domain of domains) {
    if (typeof domain !== "string") {
      continue;
    }
    const normalized = normalizeDomainEntry(domain);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function parseHostname(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return normalizeDomainEntry(value);
}

function isHostnameAllowed(hostname: string, allowedDomains: string[]): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return allowedDomains.some(
    (allowedDomain) =>
      normalized === allowedDomain || normalized.endsWith(`.${allowedDomain}`),
  );
}

function extractRecipeHosts(recipe: Partial<WebRecipe>): string[] {
  const hosts = new Set<string>();

  const targetSiteHost = parseHostname(recipe.targetSite);
  if (targetSiteHost) {
    hosts.add(targetSiteHost);
  }

  for (const step of recipe.steps ?? []) {
    if (step.action !== "browser_open") {
      continue;
    }
    const host = parseHostname(step.args?.url);
    if (host) {
      hosts.add(host);
    }
  }

  return [...hosts];
}

function extractConnectionHosts(connection: Partial<Connection>): string[] {
  const hosts = new Set<string>();

  const loginHost = parseHostname(connection.loginUrl);
  if (loginHost) {
    hosts.add(loginHost);
  }

  const targetHost = parseHostname(connection.targetSite);
  if (targetHost) {
    hosts.add(targetHost);
  }

  return [...hosts];
}

function extractWorkflowStepHosts(
  step: Partial<WorkflowStep>,
  toolArgs: Record<string, unknown> | undefined,
): string[] {
  const hosts = new Set<string>();
  const toolName = step.toolName?.trim();

  if (!toolName) {
    return [];
  }

  if (toolName === "browser_open" || toolName === "http_fetch") {
    const host = parseHostname(toolArgs?.url);
    if (host) {
      hosts.add(host);
    }
  }

  return [...hosts];
}

function buildDisallowedDomainChecks(params: {
  allowedDomains: string[];
  recipes: Array<Partial<WebRecipe>>;
  connections: Array<Partial<Connection>>;
  workflow?: Partial<Workflow>;
}): AutomationValidationCheck[] {
  const checks: AutomationValidationCheck[] = [];

  for (const recipe of params.recipes) {
    const recipeId = typeof recipe.id === "string" && recipe.id.trim() ? recipe.id : undefined;
    for (const hostname of extractRecipeHosts(recipe)) {
      if (!isHostnameAllowed(hostname, params.allowedDomains)) {
        checks.push({
          code: "package.policy.domain_not_allowed",
          severity: "error",
          message: `Recipe "${recipe.name || recipeId || "unnamed"}" targets "${hostname}", which is outside the package allowedDomains policy.`,
          field: "automationPackage.activationPolicy.allowedDomains",
          relatedArtifactIds: recipeId ? [recipeId] : undefined,
        });
      }
    }
  }

  for (const connection of params.connections) {
    const connectionId =
      typeof connection.id === "string" && connection.id.trim()
        ? connection.id
        : undefined;
    for (const hostname of extractConnectionHosts(connection)) {
      if (!isHostnameAllowed(hostname, params.allowedDomains)) {
        checks.push({
          code: "package.policy.domain_not_allowed",
          severity: "error",
          message: `Connection "${connection.label || connectionId || "unnamed"}" targets "${hostname}", which is outside the package allowedDomains policy.`,
          field: "automationPackage.activationPolicy.allowedDomains",
          relatedArtifactIds: connectionId ? [connectionId] : undefined,
        });
      }
    }
  }

  for (const step of params.workflow?.steps ?? []) {
    for (const hostname of extractWorkflowStepHosts(step, step.toolArgs)) {
      if (!isHostnameAllowed(hostname, params.allowedDomains)) {
        checks.push({
          code: "package.policy.domain_not_allowed",
          severity: "error",
          message: `Workflow step "${step.id || "unknown"}" targets "${hostname}", which is outside the package allowedDomains policy.`,
          field: "automationPackage.activationPolicy.allowedDomains",
        });
      }
    }
  }

  return checks;
}

export function buildAutomationPolicyChecks(
  input: ValidateAutomationPolicyInput,
): AutomationValidationCheck[] {
  const automationPackage = input.automationPackage;
  if (!automationPackage?.activationPolicy) {
    return [];
  }

  const checks: AutomationValidationCheck[] = [];
  const workflow = input.workflow;
  const allowedToolNames = Array.isArray(automationPackage.activationPolicy.allowedToolNames)
    ? automationPackage.activationPolicy.allowedToolNames
        .map((toolName) => String(toolName).trim())
        .filter(Boolean)
    : [];
  const allowedDomains = normalizeAllowedDomains(
    automationPackage.activationPolicy.allowedDomains,
  );
  const workflowToolCalls =
    workflow?.steps?.filter(
      (step): step is WorkflowStep =>
        Boolean(step && step.type === "tool-call" && step.toolName?.trim()),
    ) ?? [];

  if (workflowToolCalls.length > 0 && allowedToolNames.length === 0) {
    checks.push({
      code: "package.policy.allowed_tools_missing",
      severity: "warning",
      message:
        "Automation package contains workflow tool calls but activationPolicy.allowedToolNames is empty.",
      field: "automationPackage.activationPolicy.allowedToolNames",
    });
  }

  for (const step of workflowToolCalls) {
    if (allowedToolNames.length > 0 && !allowedToolNames.includes(step.toolName!)) {
      checks.push({
        code: "package.policy.tool_not_allowed",
        severity: "error",
        message: `Workflow step "${step.id || "unknown"}" uses tool "${step.toolName}", which is outside the package allowedToolNames policy.`,
        field: "automationPackage.activationPolicy.allowedToolNames",
      });
    }
  }

  const recipes = input.recipes ?? [];
  const connections = input.connections ?? [];
  const referencedHosts = [
    ...recipes.flatMap((recipe) => extractRecipeHosts(recipe)),
    ...connections.flatMap((connection) => extractConnectionHosts(connection)),
    ...workflowToolCalls.flatMap((step) => extractWorkflowStepHosts(step, step.toolArgs)),
  ];

  if (referencedHosts.length > 0 && allowedDomains.length === 0) {
    checks.push({
      code: "package.policy.allowed_domains_missing",
      severity: "warning",
      message:
        "Automation package references external domains but activationPolicy.allowedDomains is empty.",
      field: "automationPackage.activationPolicy.allowedDomains",
    });
  }

  checks.push(
    ...buildDisallowedDomainChecks({
      allowedDomains,
      recipes,
      connections,
      workflow,
    }),
  );

  return checks;
}

function extractToolCallHosts(params: {
  step: WorkflowStep;
  resolvedArgs: Record<string, unknown>;
  recipe?: Partial<WebRecipe> | null;
}): string[] {
  const toolName = params.step.toolName?.trim();
  if (!toolName) {
    return [];
  }

  if (toolName === "run_recipe") {
    return params.recipe ? extractRecipeHosts(params.recipe) : [];
  }

  return extractWorkflowStepHosts(params.step, params.resolvedArgs);
}

export function ensureAutomationToolCallAllowed(params: {
  automationPackage?: AutomationPackage | null;
  step: WorkflowStep;
  resolvedArgs: Record<string, unknown>;
  recipe?: Partial<WebRecipe> | null;
}): void {
  const automationPackage = params.automationPackage;
  if (!automationPackage?.activationPolicy || params.step.type !== "tool-call") {
    return;
  }

  const toolName = params.step.toolName?.trim();
  if (!toolName) {
    return;
  }

  const allowedToolNames = automationPackage.activationPolicy.allowedToolNames
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowedToolNames.length > 0 && !allowedToolNames.includes(toolName)) {
    throw new Error(
      `Automation package "${automationPackage.title}" does not allow tool "${toolName}".`,
    );
  }

  const allowedDomains = normalizeAllowedDomains(
    automationPackage.activationPolicy.allowedDomains,
  );
  if (allowedDomains.length === 0) {
    return;
  }

  for (const hostname of extractToolCallHosts(params)) {
    if (!isHostnameAllowed(hostname, allowedDomains)) {
      throw new Error(
        `Automation package "${automationPackage.title}" does not allow access to domain "${hostname}".`,
      );
    }
  }
}
