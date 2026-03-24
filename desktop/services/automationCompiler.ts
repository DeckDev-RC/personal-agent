import { randomUUID } from "node:crypto";
import type {
  AutomationDraft,
  AutomationPackage,
} from "../../src/types/automation.js";
import type { Connection } from "../../src/types/connection.js";
import type { ProjectContext } from "../../src/types/projectContext.js";
import type { ReminderRecord } from "../../src/types/reminder.js";
import type { TaskRecord } from "../../src/types/task.js";
import type { WebRecipe } from "../../src/types/webRecipe.js";
import type { Workflow, WorkflowStep } from "../../src/types/workflow.js";
import { normalizeAutomationPackage, saveAutomationPackage } from "./automationPackageStore.js";
import { validateAutomationDraft } from "./automationValidator.js";
import { normalizeConnection, saveConnection } from "./connectionManager.js";
import { createJob, type CronJob } from "./cronScheduler.js";
import { normalizeProjectContext } from "./projectContext.js";
import { createReminder } from "./reminderScheduler.js";
import { createTask } from "./taskManager.js";
import {
  saveProjectContextV2,
  saveWorkflowV2,
} from "./v2EntityStore.js";
import { normalizeWebRecipe, saveWebRecipe } from "./webRecipes.js";

export type CompiledAutomationDraft = {
  draft: AutomationDraft;
  automationPackage: AutomationPackage;
  workflow: Workflow;
  recipes: WebRecipe[];
  cronJobs: CronJob[];
  connections: Connection[];
  tasks: TaskRecord[];
  reminders: ReminderRecord[];
  projectContexts: ProjectContext[];
};

function buildAllowedToolNames(recipes: WebRecipe[]): string[] {
  if (recipes.length === 0) {
    return [];
  }
  return ["run_recipe"];
}

function buildWorkflowSteps(params: {
  draft: AutomationDraft;
  recipes: WebRecipe[];
}): WorkflowStep[] {
  const steps: WorkflowStep[] = [];

  if (params.draft.workflow.documentInputSchema?.length) {
    steps.push({
      id: "review-document-input",
      type: "agent-chat",
      prompt:
        "Review the available document input and prepare the structured data needed for the next automation step.",
    });
  }

  for (const recipe of params.recipes) {
    steps.push({
      id: `run-${recipe.id}`,
      type: "tool-call",
      toolName: "run_recipe",
      toolArgs: {
        recipeId: recipe.id,
        ...(recipe.connectionId ? { connectionId: recipe.connectionId } : {}),
      },
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: "execute-goal",
      type: "agent-chat",
      prompt: `Execute this automation goal: ${params.draft.goal}`,
    });
  }

  return steps;
}

function normalizeCompiledWorkflow(params: {
  draft: AutomationDraft;
  recipeIds: string[];
  connectionIds: string[];
  steps: WorkflowStep[];
  packageId: string;
  timestamp: number;
}): Workflow {
  return {
    id: params.draft.workflow.id || randomUUID(),
    name: params.draft.workflow.name || params.draft.title,
    description: params.draft.workflow.description || params.draft.goal,
    steps: params.steps,
    variables: {
      packageTitle: params.draft.title,
      packageGoal: params.draft.goal,
      packageSourcePrompt: params.draft.sourcePrompt,
    },
    packageId: params.packageId,
    connectionIds: params.connectionIds,
    recipeIds: params.recipeIds,
    approvalProfileId: params.draft.workflow.approvalProfileId,
    exceptionPolicy: params.draft.workflow.exceptionPolicy,
    documentInputSchema: params.draft.workflow.documentInputSchema,
    createdAt: params.timestamp,
    updatedAt: params.timestamp,
  };
}

function resolvePackageStatus(params: {
  draft: AutomationDraft;
  reportValid: boolean;
}): AutomationPackage["status"] {
  if (!params.reportValid) {
    return "draft";
  }
  if (params.draft.status === "needs_credentials") {
    return "needs_credentials";
  }
  if (params.draft.status === "needs_mapping") {
    return "needs_mapping";
  }
  return "ready_for_activation";
}

export async function compileAutomationDraft(params: {
  draft: AutomationDraft;
  createdBy?: string;
}): Promise<CompiledAutomationDraft> {
  const now = Date.now();
  const projectContexts: ProjectContext[] = [];

  for (const projectContextDraft of params.draft.projectContexts) {
    const projectContext = normalizeProjectContext(
      {
        id: randomUUID(),
        name: projectContextDraft.name,
        description: projectContextDraft.description,
        stakeholders: projectContextDraft.stakeholders,
        decisions: [],
        links: [],
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    await saveProjectContextV2(projectContext);
    projectContexts.push(projectContext);
  }

  const connections: Connection[] = [];
  for (const connectionDraft of params.draft.connections) {
    const connection = normalizeConnection(
      {
        id: connectionDraft.id || randomUUID(),
        provider: connectionDraft.provider,
        label: connectionDraft.label,
        authType: connectionDraft.authType,
        loginUrl: connectionDraft.loginUrl,
        targetSite: connectionDraft.targetSite,
        updatedAt: now,
        createdAt: now,
      },
      now,
    );
    await saveConnection(connection);
    connections.push(connection);
  }

  const recipes: WebRecipe[] = [];
  for (const recipeDraft of params.draft.recipes) {
    const recipe = normalizeWebRecipe(
      {
        id: recipeDraft.id || randomUUID(),
        name: recipeDraft.name,
        description: recipeDraft.description,
        tags: [],
        connectionId: recipeDraft.connectionId,
        targetSite: recipeDraft.targetSite,
        inputSchema: recipeDraft.inputSchema,
        expectedOutputs: recipeDraft.expectedOutputs,
        steps: recipeDraft.steps,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    await saveWebRecipe(recipe);
    recipes.push(recipe);
  }

  const workflow = normalizeCompiledWorkflow({
    draft: params.draft,
    recipeIds: recipes.map((recipe) => recipe.id),
    connectionIds: connections.map((connection) => connection.id),
    steps: buildWorkflowSteps({
      draft: params.draft,
      recipes,
    }),
    packageId: params.draft.id,
    timestamp: now,
  });
  await saveWorkflowV2(workflow);

  const cronJobs: CronJob[] = [];
  for (const cronJobDraft of params.draft.cronJobs) {
    const cronJob = await createJob({
      id: cronJobDraft.id || randomUUID(),
      name: cronJobDraft.name,
      cronExpr: cronJobDraft.cronExpr,
      actionType: "workflow",
      actionConfig: {
        workflowId: workflow.id,
        packageId: params.draft.id,
      },
      enabled: false,
    });
    cronJobs.push(cronJob);
  }

  const tasks: TaskRecord[] = [];
  for (const taskDraft of params.draft.tasks) {
    tasks.push(
      await createTask({
        title: taskDraft.title,
        description: taskDraft.description,
        priority: taskDraft.priority ?? "medium",
        status: taskDraft.status ?? "backlog",
        projectContextId: projectContexts[0]?.id,
        source: "agent",
      }),
    );
  }

  const reminders: ReminderRecord[] = [];
  for (const reminderDraft of params.draft.reminders) {
    reminders.push(
      await createReminder({
        message: reminderDraft.message,
        triggerAt: reminderDraft.triggerAt,
        recurring: reminderDraft.recurring ?? "none",
        projectContextId: projectContexts[0]?.id,
        source: "agent",
      }),
    );
  }

  const validationReport = validateAutomationDraft({
    automationPackage: {
      title: params.draft.title,
      goal: params.draft.goal,
      workflowId: workflow.id,
      recipeIds: recipes.map((recipe) => recipe.id),
      cronJobIds: cronJobs.map((cronJob) => cronJob.id),
      connectionIds: connections.map((connection) => connection.id),
    } as Partial<AutomationPackage>,
    workflow,
    recipes,
    cronJobs,
    connections,
  });

  const automationPackage = normalizeAutomationPackage({
    id: params.draft.id,
    title: params.draft.title,
    goal: params.draft.goal,
    sourcePrompt: params.draft.sourcePrompt,
    status: resolvePackageStatus({
      draft: params.draft,
      reportValid: validationReport.valid,
    }),
    workflowId: workflow.id,
    recipeIds: recipes.map((recipe) => recipe.id),
    cronJobIds: cronJobs.map((cronJob) => cronJob.id),
    connectionIds: connections.map((connection) => connection.id),
    taskIds: tasks.map((task) => task.id),
    reminderIds: reminders.map((reminder) => reminder.id),
    projectContextIds: projectContexts.map((projectContext) => projectContext.id),
    validationReport,
    activationPolicy: {
      mode: params.draft.activationMode,
      approvalProfileId:
        params.draft.workflow.approvalProfileId ?? "manual_sensitive",
      allowBackgroundRun: false,
      requiresDryRun: true,
      allowedToolNames: buildAllowedToolNames(recipes),
      allowedDomains: params.draft.suggestedAllowedDomains,
    },
    createdBy: params.createdBy ?? "agent",
    createdAt: now,
    updatedAt: now,
    lastValidatedAt: validationReport.generatedAt,
  });
  await saveAutomationPackage(automationPackage);

  return {
    draft: params.draft,
    automationPackage,
    workflow,
    recipes,
    cronJobs,
    connections,
    tasks,
    reminders,
    projectContexts,
  };
}
