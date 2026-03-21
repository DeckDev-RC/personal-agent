export type DraftType = "email" | "slack" | "teams" | "generic";
export type DraftStatus = "draft" | "sent" | "failed";

export type DraftRecord = {
  id: string;
  type: DraftType;
  to: string;
  subject: string;
  body: string;
  status: DraftStatus;
  mcpServerId?: string;
  projectContextId?: string;
  sessionId?: string;
  attachments?: string[];
  sentAt?: number;
  createdAt: number;
  updatedAt: number;
};
