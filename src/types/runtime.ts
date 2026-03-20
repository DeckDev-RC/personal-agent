export type SessionMessageRole = "user" | "assistant" | "tool" | "system";

export type RunPhase = "plan" | "execute" | "review" | "repair" | "complete";

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "retrying"
  | "completed"
  | "failed"
  | "aborted";

export type TaskType =
  | "chat_simple"
  | "plan_research"
  | "code_read"
  | "code_change"
  | "command_exec"
  | "review_fix"
  | "tool_invoke";

export type SessionRecord = {
  sessionId: string;
  title: string;
  agentId?: string;
  projectContextId?: string;
  model: string;
  systemPrompt: string;
  workspaceId?: string;
  workspaceRoot?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastRunId?: string;
  lastRunStatus?: RunStatus;
  lastRunPhase?: RunPhase;
};

export type SessionMessageRecord = {
  id: string;
  sessionId: string;
  runId?: string;
  role: SessionMessageRole;
  content: string;
  thinkingContent?: string;
  model?: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
  phase?: RunPhase;
  kind?: string;
  metadata?: Record<string, unknown>;
};

export type RunRecord = {
  runId: string;
  sessionId: string;
  workflowId?: string;
  taskType: TaskType;
  phase: RunPhase;
  status: RunStatus;
  prompt: string;
  planText?: string;
  reviewText?: string;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
};

export type WorkspaceRecord = {
  workspaceId: string;
  sessionId: string;
  rootPath: string;
  status: "idle" | "indexing" | "ready" | "error";
  lastJobId?: string;
  indexedAt?: number;
  fileCount: number;
  chunkCount: number;
  lastError?: string;
};

export type JobKind =
  | "run_execute"
  | "workflow_run"
  | "workspace_reindex"
  | "memory_sync"
  | "maintenance"
  | "browser_action";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "aborted";

export type JobRecord = {
  jobId: string;
  kind: JobKind;
  scopeType: "session" | "workspace" | "system";
  scopeId: string;
  status: JobStatus;
  payload?: Record<string, unknown>;
  resultSummary?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
};

export type MemorySourceType =
  | "workspace_file"
  | "session_message"
  | "run_artifact"
  | "note"
  | "browser_snapshot"
  | "attachment_text"
  | "search_result";

export type MemorySourceRecord = {
  sourceId: string;
  sourceType: MemorySourceType;
  sessionId?: string;
  runId?: string;
  workspaceId?: string;
  path?: string;
  title: string;
  contentHash: string;
  updatedAt: number;
};

export type MemoryChunkRecord = {
  chunkId: string;
  sourceId: string;
  sessionId?: string;
  runId?: string;
  workspaceId?: string;
  path?: string;
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
  updatedAt: number;
};

export type MemorySearchResult = {
  chunkId: string;
  sourceId: string;
  sourceType: MemorySourceType;
  title: string;
  content: string;
  path?: string;
  score: number;
};

export type ToolCapability =
  | "read_only"
  | "mutating"
  | "networked"
  | "long_running"
  | "requires_approval";

export type ToolMetadata = {
  capabilities: ToolCapability[];
  defaultTimeoutMs: number;
};

export type BrowserSessionRecord = {
  browserSessionId: string;
  sessionId: string;
  profilePath: string;
  currentUrl?: string;
  status: "idle" | "launching" | "ready" | "error" | "closed";
  lastActivityAt: number;
  lastError?: string;
};

export type BrowserToolArgs =
  | { action: "browser_open"; url: string }
  | { action: "browser_snapshot" }
  | { action: "browser_click"; selector: string }
  | { action: "browser_type"; selector: string; text: string; submit?: boolean }
  | { action: "browser_wait"; selector?: string; text?: string; timeMs?: number }
  | { action: "browser_screenshot"; fullPage?: boolean }
  | { action: "browser_extract_text"; selector?: string }
  | { action: "browser_close" };

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
};

export type AttachmentRecord = {
  artifactId: string;
  sessionId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  extractedTextAvailable: boolean;
};

export type ToolInvocationStatus =
  | "started"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "aborted";

export type ToolInvocationResponse = {
  status: ToolInvocationStatus;
  runId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  content: string;
  approvalId?: string;
  artifactsCreated: string[];
  filesTouched: string[];
  timedOut: boolean;
  aborted: boolean;
  isError: boolean;
};

export type ToolApprovalStatus = "pending" | "approved" | "rejected";

export type ToolApprovalRequest = {
  approvalId: string;
  sessionId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  riskLevel: "low" | "medium" | "high";
  reason: string;
  source: "native" | "mcp" | "browser";
  request: Record<string, unknown>;
  createdAt: number;
  status: ToolApprovalStatus;
  resolution?: {
    approved: boolean;
    decidedAt: number;
    note?: string;
  };
};

export type ContextCheckpoint = {
  checkpointId: string;
  sessionId: string;
  runId?: string;
  summary: string;
  objective?: string;
  activePlan?: string;
  decisions: string[];
  relevantFiles: string[];
  pendingApprovals: string[];
  createdAt: number;
};

export type ArtifactRecord = {
  artifactId: string;
  sessionId: string;
  runId: string;
  type:
    | "diff"
    | "patch"
    | "review"
    | "plan"
    | "command"
    | "checkpoint"
    | "text"
    | "file"
    | "log"
    | "preview"
    | "report"
    | "screenshot"
    | "dom_snapshot"
    | "browser_log"
    | "attachment"
    | "search_results";
  label: string;
  filePath?: string;
  contentText?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type TaskPolicyProfile = {
  taskType: TaskType;
  modelRef: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
};

export type ToolHistoryRecord = {
  toolCallId: string;
  sessionId: string;
  runId: string;
  toolName: string;
  source: "native" | "mcp" | "browser";
  serverId?: string;
  serverName?: string;
  status: "started" | "completed" | "error" | "awaiting_approval" | "rejected";
  args: Record<string, unknown>;
  resultText?: string;
  isError: boolean;
  createdAt: number;
  updatedAt: number;
  approvalId?: string;
};
