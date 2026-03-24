import type { TFunction } from "i18next";

export type AdvancedConsoleSnapshot = {
  approvalsCount: number;
  artifactsCount: number;
  toolsCount: number;
  jobsCount: number;
  browserStatus?: string | null;
  workspaceRoot?: string | null;
  workspaceFileCount?: number;
  workspaceChunkCount?: number;
  showInternalPhases: boolean;
  planMode: boolean;
  lastRunStatus?: string | null;
  activePhase?: string | null;
};

export function shouldAutoShowAdvancedConsole(snapshot: AdvancedConsoleSnapshot): boolean {
  if (snapshot.showInternalPhases || snapshot.planMode) {
    return true;
  }

  if (snapshot.lastRunStatus === "failed" || Boolean(snapshot.activePhase)) {
    return true;
  }

  if (
    snapshot.approvalsCount > 0 ||
    snapshot.artifactsCount > 0 ||
    snapshot.toolsCount > 0 ||
    snapshot.jobsCount > 0
  ) {
    return true;
  }

  if ((snapshot.workspaceFileCount ?? 0) > 0 || (snapshot.workspaceChunkCount ?? 0) > 0) {
    return true;
  }

  if (snapshot.workspaceRoot?.trim()) {
    return true;
  }

  return Boolean(snapshot.browserStatus && snapshot.browserStatus !== "idle");
}

export function getConversationDisplayTitle(title: string, t: TFunction): string {
  const trimmed = title.trim();
  if (!trimmed || trimmed === "New session" || trimmed === "Nova sessão") {
    return t("chat.newSession");
  }
  return trimmed;
}
