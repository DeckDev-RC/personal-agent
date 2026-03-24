import { randomUUID } from "node:crypto";
import type {
  ApprovalProfileId,
  AutomationActivationPolicy,
  AutomationPackage,
} from "../../src/types/automation.js";
import {
  deleteAutomationPackageV2,
  getAutomationPackageV2,
  listAutomationPackagesV2,
  saveAutomationPackageV2,
} from "./v2EntityStore.js";

const DEFAULT_APPROVAL_PROFILE: ApprovalProfileId = "manual_sensitive";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = String(entry ?? "").trim();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function normalizeActivationPolicy(
  policy: Partial<AutomationActivationPolicy> | undefined,
): AutomationActivationPolicy {
  return {
    mode: policy?.mode ?? "manual",
    approvalProfileId: policy?.approvalProfileId ?? DEFAULT_APPROVAL_PROFILE,
    allowBackgroundRun: policy?.allowBackgroundRun === true,
    requiresDryRun: policy?.requiresDryRun !== false,
    allowedToolNames: normalizeStringArray(policy?.allowedToolNames),
    allowedDomains: normalizeStringArray(policy?.allowedDomains),
  };
}

export function normalizeAutomationPackage(
  partial: Partial<AutomationPackage>,
  fallbackTimestamp = Date.now(),
): AutomationPackage {
  return {
    id: String(partial.id ?? randomUUID()),
    title: partial.title?.trim() || "Novo pacote de automacao",
    goal: partial.goal?.trim() || "",
    status: partial.status ?? "draft",
    sourcePrompt: partial.sourcePrompt?.trim() || "",
    workflowId: partial.workflowId?.trim() || undefined,
    recipeIds: normalizeStringArray(partial.recipeIds),
    cronJobIds: normalizeStringArray(partial.cronJobIds),
    connectionIds: normalizeStringArray(partial.connectionIds),
    taskIds: normalizeStringArray(partial.taskIds),
    reminderIds: normalizeStringArray(partial.reminderIds),
    projectContextIds: normalizeStringArray(partial.projectContextIds),
    validationReport: partial.validationReport,
    activationPolicy: normalizeActivationPolicy(partial.activationPolicy),
    createdBy: partial.createdBy?.trim() || "agent",
    createdAt: Number(partial.createdAt ?? fallbackTimestamp),
    updatedAt: Number(partial.updatedAt ?? fallbackTimestamp),
    lastValidatedAt:
      typeof partial.lastValidatedAt === "number" ? partial.lastValidatedAt : undefined,
    lastActivatedAt:
      typeof partial.lastActivatedAt === "number" ? partial.lastActivatedAt : undefined,
    lastRunAt: typeof partial.lastRunAt === "number" ? partial.lastRunAt : undefined,
    nextRunAt: typeof partial.nextRunAt === "number" ? partial.nextRunAt : undefined,
    lastError: partial.lastError?.trim() || undefined,
  };
}

export function summarizeAutomationPackage(automationPackage: AutomationPackage): string {
  const parts = [
    automationPackage.status,
    automationPackage.activationPolicy.mode,
    automationPackage.workflowId ? "workflow" : undefined,
    automationPackage.recipeIds.length > 0 ? `${automationPackage.recipeIds.length} recipe(s)` : undefined,
    automationPackage.cronJobIds.length > 0 ? `${automationPackage.cronJobIds.length} cron(s)` : undefined,
    automationPackage.connectionIds.length > 0 ? `${automationPackage.connectionIds.length} connection(s)` : undefined,
  ].filter(Boolean);

  return `- ${automationPackage.title} (${parts.join(", ")}) [${automationPackage.id}]`;
}

export async function listAutomationPackages(): Promise<AutomationPackage[]> {
  return await listAutomationPackagesV2();
}

export async function getAutomationPackage(
  automationPackageId: string,
): Promise<AutomationPackage | null> {
  return await getAutomationPackageV2(automationPackageId);
}

export async function saveAutomationPackage(
  automationPackage: AutomationPackage,
): Promise<AutomationPackage> {
  const normalized = normalizeAutomationPackage(
    automationPackage,
    automationPackage.updatedAt ?? Date.now(),
  );
  await saveAutomationPackageV2(normalized);
  return normalized;
}

export async function deleteAutomationPackage(
  automationPackageId: string,
): Promise<void> {
  await deleteAutomationPackageV2(automationPackageId);
}
