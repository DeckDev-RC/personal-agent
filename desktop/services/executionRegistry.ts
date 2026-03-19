type ApprovalWaiter = {
  resolve: (value: { approved: boolean; note?: string }) => void;
  reject: (error: Error) => void;
};

export type ExecutionContext = {
  runId: string;
  sessionId: string;
  abortController: AbortController;
  approvals: Map<string, ApprovalWaiter>;
};

const activeExecutions = new Map<string, ExecutionContext>();

export function createExecutionContext(params: {
  runId: string;
  sessionId: string;
}): ExecutionContext {
  const context: ExecutionContext = {
    runId: params.runId,
    sessionId: params.sessionId,
    abortController: new AbortController(),
    approvals: new Map(),
  };
  activeExecutions.set(params.runId, context);
  return context;
}

export function getExecutionContext(runId: string): ExecutionContext | undefined {
  return activeExecutions.get(runId);
}

export function abortExecution(runId: string): boolean {
  const context = activeExecutions.get(runId);
  if (!context) {
    return false;
  }
  context.abortController.abort();
  return true;
}

export async function waitForApproval(
  runId: string,
  approvalId: string,
): Promise<{ approved: boolean; note?: string }> {
  const context = activeExecutions.get(runId);
  if (!context) {
    throw new Error("Execution is no longer active.");
  }
  return await new Promise<{ approved: boolean; note?: string }>((resolve, reject) => {
    context.approvals.set(approvalId, { resolve, reject });
  });
}

export async function resolveExecutionApproval(params: {
  runId: string;
  approvalId: string;
  approved: boolean;
  note?: string;
}): Promise<boolean> {
  const context = activeExecutions.get(params.runId);
  if (!context) {
    return false;
  }
  const waiter = context.approvals.get(params.approvalId);
  if (!waiter) {
    return false;
  }
  context.approvals.delete(params.approvalId);
  waiter.resolve({ approved: params.approved, note: params.note });
  return true;
}

export function finishExecution(runId: string): void {
  const context = activeExecutions.get(runId);
  if (!context) {
    return;
  }
  for (const waiter of context.approvals.values()) {
    waiter.reject(new Error("Execution finished before approval resolution."));
  }
  activeExecutions.delete(runId);
}
