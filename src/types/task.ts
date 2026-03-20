export type TaskStatus = "backlog" | "today" | "in_progress" | "done";

export type TaskPriority = "low" | "medium" | "high";

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectContextId?: string;
  dueDate?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};
