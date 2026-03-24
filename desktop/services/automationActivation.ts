import type {
  AutomationPackage,
  AutomationPackageStatus,
  AutomationValidationReport,
} from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { Workflow } from "../../src/types/workflow.js";
import {
  getAutomationPackage,
  saveAutomationPackage,
} from "./automationPackageStore.js";
import { runAutomationDryRun } from "./automationDryRun.js";
import {
  appendAutomationValidationChecks,
  validateAutomationDraft,
} from "./automationValidator.js";
import {
  ensureConnectionBrowserProfile,
  getConnection,
} from "./connectionManager.js";
import {
  getJob,
  toggleJob,
  type CronJob,
} from "./cronScheduler.js";
import { getWorkflowV2 } from "./v2EntityStore.js";
import { getWebRecipe } from "./webRecipes.js";

type AutomationArtifactSnapshot = {
  automationPackage: AutomationPackage;
  workflow?: Workflow;
  recipes: WebRecipe[];
  cronJobs: CronJob[];
  connections: Connection[];
  validationReport: AutomationValidationReport;
  blockingIssues: string[];
};

export type AutomationActivationResult = AutomationArtifactSnapshot & {
  status: AutomationPackageStatus;
  changedCronJobs: CronJob[];
};

function buildValidationIssues(report: AutomationValidationReport): string[] {
  const errors = report.checks
    .filter((check) => check.severity === "error")
    .map((check) => check.message);
  if (errors.length > 0) {
    return errors;
  }
  return [];
}

function buildConnectionIssues(connections: Connection[]): string[] {
  return connections
    .filter((connection) => connection.status !== "ready")
    .map(
      (connection) =>
        `Connection "${connection.label}" is ${connection.status} and still blocks activation.`,
    );
}

function nextPackageStatus(params: {
  automationPackage: AutomationPackage;
  validationReport: AutomationValidationReport;
  connections: Connection[];
  activating: boolean;
}): AutomationPackageStatus {
  const hasValidationErrors = !params.validationReport.valid;
  const hasConnectionBlockers = params.connections.some(
    (connection) => connection.status !== "ready",
  );

  if (params.activating) {
    return hasValidationErrors || hasConnectionBlockers
      ? "degraded"
      : "active";
  }

  if (params.automationPackage.status === "needs_mapping") {
    return "needs_mapping";
  }
  if (hasValidationErrors) {
    return params.automationPackage.status === "active" ? "degraded" : "draft";
  }
  if (hasConnectionBlockers) {
    return params.automationPackage.status === "active"
      ? "degraded"
      : "needs_credentials";
  }
  return "ready_for_activation";
}

function computeNextRunAt(cronJobs: CronJob[]): number | undefined {
  const nextRuns = cronJobs
    .filter((cronJob) => cronJob.enabled && typeof cronJob.nextRun === "number")
    .map((cronJob) => cronJob.nextRun as number);
  if (nextRuns.length === 0) {
    return undefined;
  }
  return Math.min(...nextRuns);
}

async function loadAutomationArtifacts(
  packageId: string,
): Promise<AutomationArtifactSnapshot> {
  const automationPackage = await getAutomationPackage(packageId);
  if (!automationPackage) {
    throw new Error(`Automation package not found: ${packageId}`);
  }

  const workflow = automationPackage.workflowId
    ? await getWorkflowV2(automationPackage.workflowId)
    : null;
  const recipes = (
    await Promise.all(
      automationPackage.recipeIds.map((recipeId) => getWebRecipe(recipeId)),
    )
  ).filter((recipe): recipe is WebRecipe => Boolean(recipe));
  const cronJobs = (
    await Promise.all(
      automationPackage.cronJobIds.map((cronJobId) => getJob(cronJobId)),
    )
  ).filter((cronJob): cronJob is CronJob => Boolean(cronJob));
  const connections = (
    await Promise.all(
      automationPackage.connectionIds.map((connectionId) => getConnection(connectionId)),
    )
  ).filter((connection): connection is Connection => Boolean(connection));

  const validationReport = validateAutomationDraft({
    automationPackage,
    workflow: workflow ?? undefined,
    recipes,
    cronJobs,
    connections,
  });
  const blockingIssues = [
    ...buildValidationIssues(validationReport),
    ...buildConnectionIssues(connections),
  ];

  if (automationPackage.status === "needs_mapping") {
    blockingIssues.push(
      "Automation package still needs document mapping before activation.",
    );
  }
  if (!workflow) {
    blockingIssues.push("Automation package is missing its workflow.");
  }

  return {
    automationPackage,
    workflow: workflow ?? undefined,
    recipes,
    cronJobs,
    connections,
    validationReport,
    blockingIssues,
  };
}

async function buildValidationReportWithDryRun(params: {
  automationPackage: AutomationPackage;
  workflow?: Workflow;
  recipes: WebRecipe[];
  cronJobs: CronJob[];
  connections: Connection[];
}): Promise<AutomationValidationReport> {
  const structuralReport = validateAutomationDraft({
    automationPackage: params.automationPackage,
    workflow: params.workflow,
    recipes: params.recipes,
    cronJobs: params.cronJobs,
    connections: params.connections,
  });

  if (!params.automationPackage.activationPolicy.requiresDryRun) {
    return structuralReport;
  }

  const dryRunChecks = await runAutomationDryRun({
    automationPackage: params.automationPackage,
    recipes: params.recipes,
    connections: params.connections,
  });

  return appendAutomationValidationChecks(structuralReport, dryRunChecks);
}

export async function inspectAutomationPackageState(
  packageId: string,
): Promise<AutomationActivationResult> {
  const snapshot = await loadAutomationArtifacts(packageId);
  const status = nextPackageStatus({
    automationPackage: snapshot.automationPackage,
    validationReport: snapshot.validationReport,
    connections: snapshot.connections,
    activating: snapshot.automationPackage.status === "active",
  });

  return {
    ...snapshot,
    status,
    changedCronJobs: [],
  };
}

async function persistAutomationState(params: {
  automationPackage: AutomationPackage;
  validationReport: AutomationValidationReport;
  status: AutomationPackageStatus;
  nextRunAt?: number;
  lastActivatedAt?: number;
  lastError?: string;
}): Promise<AutomationPackage> {
  const now = Date.now();
  return await saveAutomationPackage({
    ...params.automationPackage,
    status: params.status,
    validationReport: params.validationReport,
    lastValidatedAt: params.validationReport.generatedAt,
    lastActivatedAt:
      params.lastActivatedAt ?? params.automationPackage.lastActivatedAt,
    nextRunAt: params.nextRunAt,
    lastError: params.lastError,
    updatedAt: now,
  });
}

export async function validateAutomationPackageState(
  packageId: string,
): Promise<AutomationActivationResult> {
  const snapshot = await loadAutomationArtifacts(packageId);
  const validationReport = await buildValidationReportWithDryRun({
    automationPackage: snapshot.automationPackage,
    workflow: snapshot.workflow,
    recipes: snapshot.recipes,
    cronJobs: snapshot.cronJobs,
    connections: snapshot.connections,
  });
  const blockingIssues = [
    ...buildValidationIssues(validationReport),
    ...buildConnectionIssues(snapshot.connections),
  ];
  if (snapshot.automationPackage.status === "needs_mapping") {
    blockingIssues.push(
      "Automation package still needs document mapping before activation.",
    );
  }
  if (!snapshot.workflow) {
    blockingIssues.push("Automation package is missing its workflow.");
  }
  const status = nextPackageStatus({
    automationPackage: snapshot.automationPackage,
    validationReport,
    connections: snapshot.connections,
    activating: snapshot.automationPackage.status === "active",
  });
  const automationPackage = await persistAutomationState({
    automationPackage: snapshot.automationPackage,
    validationReport,
    status,
    nextRunAt: computeNextRunAt(snapshot.cronJobs),
    lastError:
      blockingIssues.length > 0
        ? blockingIssues.join(" ")
        : undefined,
  });

  return {
    ...snapshot,
    automationPackage,
    validationReport,
    blockingIssues,
    status,
    changedCronJobs: [],
  };
}

export async function activateAutomationPackage(
  packageId: string,
): Promise<AutomationActivationResult> {
  const initialSnapshot = await loadAutomationArtifacts(packageId);

  const preparedConnections: Connection[] = [];
  for (const connection of initialSnapshot.connections) {
    if (connection.authType === "browser_profile") {
      preparedConnections.push(
        await ensureConnectionBrowserProfile(connection.id),
      );
    } else {
      preparedConnections.push(connection);
    }
  }

  const validationReport = await buildValidationReportWithDryRun({
    automationPackage: initialSnapshot.automationPackage,
    workflow: initialSnapshot.workflow,
    recipes: initialSnapshot.recipes,
    cronJobs: initialSnapshot.cronJobs,
    connections: preparedConnections,
  });
  const blockingIssues = [
    ...buildValidationIssues(validationReport),
    ...buildConnectionIssues(preparedConnections),
  ];

  if (initialSnapshot.automationPackage.status === "needs_mapping") {
    blockingIssues.push(
      "Automation package still needs document mapping before activation.",
    );
  }
  if (!initialSnapshot.workflow) {
    blockingIssues.push("Automation package is missing its workflow.");
  }

  if (blockingIssues.length > 0) {
    const status = nextPackageStatus({
      automationPackage: initialSnapshot.automationPackage,
      validationReport,
      connections: preparedConnections,
      activating: false,
    });
    const automationPackage = await persistAutomationState({
      automationPackage: initialSnapshot.automationPackage,
      validationReport,
      status,
      nextRunAt: computeNextRunAt(initialSnapshot.cronJobs),
      lastError: blockingIssues.join(" "),
    });
    throw new Error(
      [
        `Automation package ${automationPackage.id} is not ready for activation.`,
        ...blockingIssues.map((issue) => `- ${issue}`),
      ].join("\n"),
    );
  }

  const changedCronJobs: CronJob[] = [];
  for (const cronJob of initialSnapshot.cronJobs) {
    if (!cronJob.enabled) {
      const updated = await toggleJob(cronJob.id, true);
      if (updated) {
        changedCronJobs.push(updated);
      }
    } else {
      changedCronJobs.push(cronJob);
    }
  }

  const status = nextPackageStatus({
    automationPackage: initialSnapshot.automationPackage,
    validationReport,
    connections: preparedConnections,
    activating: true,
  });
  const automationPackage = await persistAutomationState({
    automationPackage: initialSnapshot.automationPackage,
    validationReport,
    status,
    nextRunAt: computeNextRunAt(changedCronJobs),
    lastActivatedAt: Date.now(),
    lastError: undefined,
  });

  return {
    automationPackage,
    workflow: initialSnapshot.workflow,
    recipes: initialSnapshot.recipes,
    cronJobs: changedCronJobs,
    connections: preparedConnections,
    validationReport,
    blockingIssues: [],
    status,
    changedCronJobs,
  };
}

export async function deactivateAutomationPackage(
  packageId: string,
): Promise<AutomationActivationResult> {
  const snapshot = await loadAutomationArtifacts(packageId);
  const changedCronJobs: CronJob[] = [];

  for (const cronJob of snapshot.cronJobs) {
    if (cronJob.enabled) {
      const updated = await toggleJob(cronJob.id, false);
      if (updated) {
        changedCronJobs.push(updated);
      }
    } else {
      changedCronJobs.push(cronJob);
    }
  }

  const status = nextPackageStatus({
    automationPackage: snapshot.automationPackage,
    validationReport: snapshot.validationReport,
    connections: snapshot.connections,
    activating: false,
  });
  const automationPackage = await persistAutomationState({
    automationPackage: snapshot.automationPackage,
    validationReport: snapshot.validationReport,
    status,
    nextRunAt: undefined,
    lastError:
      snapshot.blockingIssues.length > 0
        ? snapshot.blockingIssues.join(" ")
        : undefined,
  });

  return {
    ...snapshot,
    automationPackage,
    cronJobs: changedCronJobs,
    status,
    changedCronJobs,
  };
}
