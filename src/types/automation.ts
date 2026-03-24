import type { ConnectionAuthType } from "./connection.js";
import type { ProjectContext } from "./projectContext.js";
import type { ReminderRecurrence } from "./reminder.js";
import type { TaskPriority, TaskStatus } from "./task.js";
import type {
  WorkflowDocumentInput,
  WorkflowExceptionPolicy,
} from "./workflow.js";

export type AutomationPackageStatus =
  | "draft"
  | "needs_credentials"
  | "needs_mapping"
  | "ready_for_activation"
  | "active"
  | "degraded";

export type ApprovalProfileId =
  | "manual_all"
  | "manual_sensitive"
  | "trusted_package"
  | "trusted_read_only"
  | (string & {});

export type AutomationActivationMode =
  | "manual"
  | "semi_autonomous"
  | "trusted_package";

export type AutomationValidationSeverity = "info" | "warning" | "error";

export type AutomationValidationCheck = {
  code: string;
  severity: AutomationValidationSeverity;
  message: string;
  field?: string;
  relatedArtifactIds?: string[];
};

export type AutomationValidationReport = {
  valid: boolean;
  generatedAt: number;
  summary: string;
  checks: AutomationValidationCheck[];
};

export type AutomationActivationPolicy = {
  mode: AutomationActivationMode;
  approvalProfileId: ApprovalProfileId;
  allowBackgroundRun: boolean;
  requiresDryRun: boolean;
  allowedToolNames: string[];
  allowedDomains: string[];
};

export type AutomationPackage = {
  id: string;
  title: string;
  goal: string;
  status: AutomationPackageStatus;
  sourcePrompt: string;
  workflowId?: string;
  recipeIds: string[];
  cronJobIds: string[];
  connectionIds: string[];
  taskIds: string[];
  reminderIds: string[];
  projectContextIds: string[];
  validationReport?: AutomationValidationReport;
  activationPolicy: AutomationActivationPolicy;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lastValidatedAt?: number;
  lastActivatedAt?: number;
  lastRunAt?: number;
  nextRunAt?: number;
  lastError?: string;
};

export type AutomationDraftRequirementKind =
  | "workflow"
  | "recipe"
  | "cron"
  | "connection"
  | "document_parser"
  | "task_fallback"
  | "reminder";

export type AutomationDraftRequirement = {
  kind: AutomationDraftRequirementKind;
  required: boolean;
  reason: string;
};

export type AutomationDraftConnection = {
  id: string;
  provider: string;
  label: string;
  authType: ConnectionAuthType;
  loginUrl?: string;
  targetSite?: string;
};

export type AutomationDraftRecipe = {
  id: string;
  name: string;
  description: string;
  connectionId?: string;
  targetSite?: string;
  inputSchema?: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "json";
    description?: string;
    required?: boolean;
  }>;
  expectedOutputs?: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "json";
    description?: string;
    required?: boolean;
  }>;
  steps: Array<{
    id: string;
    label: string;
    action:
      | "browser_tabs"
      | "browser_open"
      | "browser_snapshot"
      | "browser_click"
      | "browser_hover"
      | "browser_type"
      | "browser_drag"
      | "browser_select"
      | "browser_fill"
      | "browser_wait"
      | "browser_evaluate"
      | "browser_batch"
      | "browser_set_input_files"
      | "browser_handle_dialog"
      | "browser_screenshot"
      | "browser_extract_text"
      | "browser_close";
    args: Record<string, string | number | boolean>;
  }>;
};

export type AutomationDraftCronJob = {
  id: string;
  name: string;
  cronExpr: string;
  enabled: boolean;
};

export type AutomationDraftTask = {
  title: string;
  description: string;
  priority?: TaskPriority;
  status?: TaskStatus;
};

export type AutomationDraftReminder = {
  message: string;
  triggerAt: string;
  recurring?: ReminderRecurrence;
};

export type AutomationDraftProjectContext = Pick<
  ProjectContext,
  "name" | "description" | "stakeholders"
>;

export type AutomationDraftWorkflow = {
  id: string;
  name: string;
  description: string;
  connectionIds: string[];
  recipeIds: string[];
  approvalProfileId?: ApprovalProfileId;
  exceptionPolicy?: WorkflowExceptionPolicy;
  documentInputSchema?: WorkflowDocumentInput[];
};

export type AutomationDraft = {
  id: string;
  title: string;
  goal: string;
  sourcePrompt: string;
  status: AutomationPackageStatus;
  activationMode: AutomationActivationMode;
  reasoning: string[];
  requirements: AutomationDraftRequirement[];
  suggestedAllowedDomains: string[];
  workflow: AutomationDraftWorkflow;
  connections: AutomationDraftConnection[];
  recipes: AutomationDraftRecipe[];
  cronJobs: AutomationDraftCronJob[];
  tasks: AutomationDraftTask[];
  reminders: AutomationDraftReminder[];
  projectContexts: AutomationDraftProjectContext[];
};
