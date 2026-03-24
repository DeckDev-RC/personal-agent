import type { RunPhase } from "./runtime.js";

export type SubagentStatus = "queued" | "running" | "completed" | "failed" | "aborted";

export type SubagentRequestedBy = "user" | "agent";

export type SubagentRecord = {
  id: string;
  title: string;
  prompt: string;
  status: SubagentStatus;
  requestedBy: SubagentRequestedBy;
  parentSessionId?: string;
  parentRunId?: string;
  sessionId?: string;
  runId?: string;
  agentId?: string;
  projectContextId?: string;
  modelRef: string;
  phase?: RunPhase;
  resultText?: string;
  reviewText?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
};

export type SpawnSubagentInput = {
  title?: string;
  prompt: string;
  parentSessionId?: string;
  parentRunId?: string;
  agentId?: string;
  projectContextId?: string;
  modelRef?: string;
  systemPrompt?: string;
  mcpServerIds?: string[];
  requestedBy?: SubagentRequestedBy;
};
