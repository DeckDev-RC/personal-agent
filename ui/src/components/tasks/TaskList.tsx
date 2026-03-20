import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import type { TaskRecord, TaskStatus } from "../../../../src/types/task.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";

const STATUS_OPTIONS: Array<{ value: TaskStatus; labelKey: string }> = [
  { value: "backlog", labelKey: "tasks.status.backlog" },
  { value: "today", labelKey: "tasks.status.today" },
  { value: "in_progress", labelKey: "tasks.status.inProgress" },
  { value: "done", labelKey: "tasks.status.done" },
];

function priorityColor(priority: TaskRecord["priority"]): "gray" | "orange" | "red" {
  if (priority === "high") return "red";
  if (priority === "medium") return "orange";
  return "gray";
}

type TaskListProps = {
  tasks: TaskRecord[];
  contextLabels: Record<string, string>;
  onEdit: (task: TaskRecord) => void;
  onDelete: (taskId: string) => Promise<void>;
  onComplete: (taskId: string) => Promise<void>;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
};

export default function TaskList({
  tasks,
  contextLabels,
  onEdit,
  onDelete,
  onComplete,
  onStatusChange,
}: TaskListProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-8 text-center text-sm text-text-secondary/70">
        {t("tasks.noTasks")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-secondary/70 overflow-hidden">
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_140px_140px_150px_220px] gap-3 border-b border-border px-4 py-3 text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
        <div>{t("tasks.name")}</div>
        <div>{t("tasks.statusLabel")}</div>
        <div>{t("tasks.priorityLabel")}</div>
        <div>{t("tasks.dueDate")}</div>
        <div>{t("tasks.actions")}</div>
      </div>

      <div className="divide-y divide-border">
        {tasks.map((task) => (
          <div key={task.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,2fr)_140px_140px_150px_220px] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{task.title}</span>
                {task.projectContextId && contextLabels[task.projectContextId] && (
                  <Badge color="gray">{contextLabels[task.projectContextId]}</Badge>
                )}
              </div>
              {task.description && (
                <p className="mt-1 text-xs leading-relaxed text-text-secondary/70 line-clamp-2">
                  {task.description}
                </p>
              )}
            </div>

            <div>
              <select
                value={task.status}
                onChange={(event) => void onStatusChange(task.id, event.target.value as TaskStatus)}
                className="w-full appearance-none rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:border-white/20 focus:border-accent-green"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Badge color={priorityColor(task.priority)}>
                {t(`tasks.priority.${task.priority}`)}
              </Badge>
            </div>

            <div className="text-sm text-text-secondary">
              {task.dueDate || t("tasks.noDueDate")}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
                <Pencil size={13} />
                {t("common.edit")}
              </Button>
              {task.status !== "done" && (
                <Button variant="ghost" size="sm" onClick={() => void onComplete(task.id)}>
                  <CheckCircle2 size={13} />
                  {t("tasks.complete")}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => void onDelete(task.id)}>
                <Trash2 size={13} />
                {t("common.delete")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
