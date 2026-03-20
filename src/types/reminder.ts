export type ReminderRecurrence = "none" | "daily" | "weekly" | "weekdays";

export type ReminderStatus = "pending" | "delivered" | "acknowledged" | "canceled";

export type ReminderSource = "manual" | "agent" | "workflow";

export type ReminderRecord = {
  id: string;
  message: string;
  triggerAt: number;
  recurring: ReminderRecurrence;
  status: ReminderStatus;
  projectContextId?: string;
  sessionId?: string;
  source?: ReminderSource;
  createdAt: number;
  updatedAt: number;
  deliveredAt?: number;
  acknowledgedAt?: number;
  canceledAt?: number;
};
