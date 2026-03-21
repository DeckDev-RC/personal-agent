export type AnalyticsEventType =
  | "skill_used"
  | "task_completed"
  | "document_generated"
  | "workflow_run"
  | "chat_session"
  | "mcp_tool_call"
  | "draft_sent"
  | "recipe_executed"
  | "knowledge_search";

export type AnalyticsEvent = {
  id: string;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  timestamp: number;
};

export type WeeklyReportData = {
  weekStart: number;
  weekEnd: number;
  tasksCompleted: number;
  documentsGenerated: number;
  skillsUsed: Record<string, number>;
  totalSessions: number;
  totalToolCalls: number;
  draftsSent: number;
  topActivities: Array<{ type: string; count: number }>;
};
