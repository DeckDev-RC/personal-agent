import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronRight, ListTodo } from "lucide-react";
import type { TaskRecord } from "../../../../src/types/task.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";

type TasksWidgetProps = {
  tasks: TaskRecord[];
  contextLabels: Record<string, string>;
  onOpenTasks: () => void;
};

function statusOrder(status: TaskRecord["status"]): number {
  switch (status) {
    case "today":
      return 0;
    case "in_progress":
      return 1;
    case "backlog":
      return 2;
    default:
      return 3;
  }
}

function priorityOrder(priority: TaskRecord["priority"]): number {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function priorityBadge(priority: TaskRecord["priority"]): "red" | "orange" | "gray" {
  switch (priority) {
    case "high":
      return "red";
    case "medium":
      return "orange";
    default:
      return "gray";
  }
}

function statusLabel(task: TaskRecord, t: (key: string) => string): string {
  switch (task.status) {
    case "today":
      return t("tasks.status.today");
    case "in_progress":
      return t("tasks.status.inProgress");
    case "done":
      return t("tasks.status.done");
    default:
      return t("tasks.status.backlog");
  }
}

export default function TasksWidget({
  tasks,
  contextLabels,
  onOpenTasks,
}: TasksWidgetProps) {
  const { t } = useTranslation();
  const todayKey = new Date().toISOString().slice(0, 10);

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "done")
        .sort((left, right) => {
          const statusDiff = statusOrder(left.status) - statusOrder(right.status);
          if (statusDiff !== 0) {
            return statusDiff;
          }
          const priorityDiff = priorityOrder(left.priority) - priorityOrder(right.priority);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          if (left.dueDate && right.dueDate) {
            return left.dueDate.localeCompare(right.dueDate);
          }
          if (left.dueDate) {
            return -1;
          }
          if (right.dueDate) {
            return 1;
          }
          return right.updatedAt - left.updatedAt;
        }),
    [tasks],
  );

  const todayTasks = openTasks.filter((task) => task.status === "today").length;
  const inProgressTasks = openTasks.filter((task) => task.status === "in_progress").length;
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && task.dueDate < todayKey,
  ).length;

  return (
    <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <ListTodo size={16} className="text-accent-orange" />
            {t("dashboard.tasks.title")}
          </div>
          <p className="mt-1 text-xs text-text-secondary/70">
            {t("dashboard.tasks.description")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpenTasks}>
          {t("dashboard.tasks.viewAll")}
          <ChevronRight size={14} />
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg-primary px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
            {t("dashboard.tasks.todayCount")}
          </div>
          <div className="mt-1 text-lg font-semibold text-text-primary">{todayTasks}</div>
        </div>
        <div className="rounded-xl border border-border bg-bg-primary px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
            {t("dashboard.tasks.inProgressCount")}
          </div>
          <div className="mt-1 text-lg font-semibold text-text-primary">{inProgressTasks}</div>
        </div>
        <div className="rounded-xl border border-border bg-bg-primary px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
            {t("dashboard.tasks.overdueCount")}
          </div>
          <div className="mt-1 text-lg font-semibold text-text-primary">{overdueTasks}</div>
        </div>
      </div>

      {openTasks.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={18} />}
          title={t("dashboard.tasks.emptyTitle")}
          description={t("dashboard.tasks.emptyDescription")}
          action={{
            label: t("dashboard.tasks.viewAll"),
            onClick: onOpenTasks,
          }}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {openTasks.slice(0, 6).map((task) => {
            const dueState =
              task.dueDate && task.dueDate < todayKey
                ? t("dashboard.tasks.overdue")
                : task.dueDate === todayKey
                  ? t("dashboard.tasks.dueToday")
                  : task.dueDate ?? t("dashboard.tasks.noDueDate");

            return (
              <div key={task.id} className="rounded-xl border border-border bg-bg-primary px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">{task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary/60">
                      <Badge color="blue">{statusLabel(task, t)}</Badge>
                      <Badge color={priorityBadge(task.priority)}>
                        {t(`tasks.priority.${task.priority}`)}
                      </Badge>
                      {task.projectContextId && contextLabels[task.projectContextId] && (
                        <Badge color="gray">{contextLabels[task.projectContextId]}</Badge>
                      )}
                    </div>
                  </div>
                  <Badge color={task.dueDate && task.dueDate < todayKey ? "red" : "gray"}>
                    {dueState}
                  </Badge>
                </div>
                {task.description && (
                  <div className="mt-2 line-clamp-2 text-xs text-text-secondary/70">
                    {task.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
