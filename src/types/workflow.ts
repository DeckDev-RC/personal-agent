export type WorkflowStep = {
  id: string;
  type:
    | "agent-chat"
    | "skill-execute"
    | "conditional"
    | "delay"
    | "tool-call"
    | "memory-query"
    | "reindex-workspace";
  agentId?: string;
  skillId?: string;
  prompt?: string;
  condition?: string;
  delayMs?: number;
  toolName?: string;
  toolArgs?: Record<string, string>;
  memoryQuery?: string;
  memoryLimit?: number;
  onSuccess?: string;
  onFailure?: string;
};

export type WorkflowSchedule = {
  enabled: boolean;
  mode: "interval" | "cron";
  intervalMinutes?: number;
  cronExpression?: string;
  nextRunAt?: number;
  lastRunAt?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
};

export type WorkflowExceptionPolicy = {
  createTaskOnFailure?: boolean;
  createReminderOnBlocked?: boolean;
  notifyOnDegraded?: boolean;
  checkpointOnFailure?: boolean;
  maxRecoveryAttempts?: number;
};

export type WorkflowDocumentInput = {
  id: string;
  label: string;
  mimeTypes?: string[];
  required?: boolean;
  templateId?: string;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  variables: Record<string, string>;
  schedule?: WorkflowSchedule;
  packageId?: string;
  connectionIds?: string[];
  recipeIds?: string[];
  approvalProfileId?: string;
  exceptionPolicy?: WorkflowExceptionPolicy;
  documentInputSchema?: WorkflowDocumentInput[];
  createdAt: number;
  updatedAt: number;
};
