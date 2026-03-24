import type { AutomationPackage } from "../../src/types/automation.js";
import type { Workflow } from "../../src/types/workflow.js";
import {
  getAutomationPackage,
  saveAutomationPackage,
} from "./automationPackageStore.js";
import { createTask } from "./taskManager.js";

export type AutomationWorkflowTrigger =
  | "manual"
  | "scheduled"
  | "cron";

export type RecordAutomationWorkflowRunParams = {
  workflow: Workflow;
  runId: string;
  sessionId: string;
  trigger: AutomationWorkflowTrigger;
  success: boolean;
  error?: string;
  lastOutput?: string;
  occurredAt?: number;
};

export type AutomationWorkflowRunStateResult = {
  automationPackage?: AutomationPackage;
  exceptionTaskId?: string;
};

function appendUniqueValue(values: string[], nextValue?: string): string[] {
  if (!nextValue) {
    return values;
  }
  const unique = new Set(values);
  unique.add(nextValue);
  return [...unique];
}

function resolveStatusAfterRun(
  automationPackage: AutomationPackage,
  success: boolean,
): AutomationPackage["status"] {
  if (success) {
    if (
      automationPackage.status === "active" ||
      automationPackage.status === "degraded"
    ) {
      return "active";
    }
    return automationPackage.status;
  }

  if (automationPackage.status === "active") {
    return "degraded";
  }

  return automationPackage.status;
}

function trimMessage(value: string | undefined, maxLength: number): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildExceptionTaskDescription(params: {
  automationPackage: AutomationPackage;
  workflow: Workflow;
  trigger: AutomationWorkflowTrigger;
  runId: string;
  sessionId: string;
  error: string;
  lastOutput?: string;
}): string {
  const sections = [
    `Pacote: ${params.automationPackage.title}`,
    `Workflow: ${params.workflow.name}`,
    `Trigger: ${params.trigger}`,
    `Run ID: ${params.runId}`,
    `Session ID: ${params.sessionId}`,
    `Erro: ${params.error}`,
  ];

  const lastOutput = trimMessage(params.lastOutput, 2400);
  if (lastOutput) {
    sections.push(`Ultimo output util:\n${lastOutput}`);
  }

  sections.push(
    "Proximo passo sugerido: revisar a execucao, validar credenciais/conexao e reexecutar o workflow apos corrigir a causa raiz.",
  );

  return sections.join("\n\n");
}

export async function recordAutomationWorkflowRun(
  params: RecordAutomationWorkflowRunParams,
): Promise<AutomationWorkflowRunStateResult> {
  const packageId = params.workflow.packageId?.trim();
  if (!packageId) {
    return {};
  }

  const automationPackage = await getAutomationPackage(packageId);
  if (!automationPackage) {
    return {};
  }

  const occurredAt = params.occurredAt ?? Date.now();
  const errorMessage = trimMessage(
    params.error,
    1000,
  ) ?? "Workflow execution failed.";
  let exceptionTaskId: string | undefined;

  if (!params.success && params.workflow.exceptionPolicy?.createTaskOnFailure) {
    const task = await createTask({
      title: `Resolver falha em ${automationPackage.title}`,
      description: buildExceptionTaskDescription({
        automationPackage,
        workflow: params.workflow,
        trigger: params.trigger,
        runId: params.runId,
        sessionId: params.sessionId,
        error: errorMessage,
        lastOutput: params.lastOutput,
      }),
      priority: "high",
      status: "backlog",
      projectContextId: automationPackage.projectContextIds[0],
      source: "automation_exception",
    });
    exceptionTaskId = task.id;
  }

  const updatedPackage = await saveAutomationPackage({
    ...automationPackage,
    status: resolveStatusAfterRun(automationPackage, params.success),
    taskIds: appendUniqueValue(automationPackage.taskIds, exceptionTaskId),
    lastRunAt: occurredAt,
    lastError: params.success ? undefined : errorMessage,
    updatedAt: occurredAt,
  });

  return {
    automationPackage: updatedPackage,
    exceptionTaskId,
  };
}
