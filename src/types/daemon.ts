import type {
  ArtifactRecord,
  BrowserSessionRecord,
  JobRecord,
  MemorySearchResult,
  RunRecord,
  SessionRecord,
  ToolApprovalRequest,
  ToolHistoryRecord,
  WorkspaceRecord,
} from "./runtime.js";

export type DaemonEventName =
  | "run.queued"
  | "run.started"
  | "run.delta"
  | "run.tool_call"
  | "run.tool_result"
  | "run.approval_required"
  | "run.artifact_created"
  | "run.completed"
  | "run.failed"
  | "job.updated";

export type DaemonEnvelope<TEvent extends DaemonEventName = DaemonEventName, TData = unknown> = {
  event: TEvent;
  data: TData;
};

export type DaemonHealthStatus = {
  ok: boolean;
  pid: number;
  startedAt: number;
};

export type DaemonRunQueuedEvent = {
  runId: string;
  sessionId: string;
  jobId?: string;
};

export type DaemonRunStartedEvent = {
  runId: string;
  sessionId: string;
};

export type DaemonRunDeltaEvent = {
  runId: string;
  sessionId: string;
  phase?: string;
  stream: "text" | "thinking";
  delta: string;
};

export type DaemonToolCallEvent = {
  runId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  source: "native" | "mcp" | "browser";
  serverId?: string;
  serverName?: string;
};

export type DaemonToolResultEvent = DaemonToolCallEvent & {
  content: string;
  isError: boolean;
};

export type DaemonApprovalEvent = {
  runId: string;
  sessionId: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  reason: string;
  riskLevel: "medium" | "high";
  request: Record<string, unknown>;
};

export type DaemonArtifactEvent = {
  runId: string;
  sessionId: string;
  artifactId: string;
  label: string;
  artifactType: string;
};

export type DaemonRunCompletedEvent = {
  runId: string;
  sessionId: string;
  text: string;
  review: string;
  success: boolean;
};

export type DaemonRunFailedEvent = {
  runId: string;
  sessionId: string;
  message: string;
};

export type DaemonJobEvent = {
  job: JobRecord;
};

export type DaemonStateSnapshot = {
  sessions: SessionRecord[];
  runs: RunRecord[];
  approvals: ToolApprovalRequest[];
  artifacts: ArtifactRecord[];
  toolHistory: ToolHistoryRecord[];
  workspaces: WorkspaceRecord[];
};

export type DaemonMemorySearchResponse = {
  query: string;
  results: MemorySearchResult[];
};

export type DaemonBrowserStatusResponse = {
  browserSession: BrowserSessionRecord | null;
};
