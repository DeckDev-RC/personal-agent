import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import type { TaskRecord, TaskStatus } from "../../../../src/types/task.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";

const COLUMNS: Array<{ status: TaskStatus; labelKey: string }> = [
  { status: "backlog", labelKey: "tasks.status.backlog" },
  { status: "today", labelKey: "tasks.status.today" },
  { status: "in_progress", labelKey: "tasks.status.inProgress" },
  { status: "done", labelKey: "tasks.status.done" },
];

function priorityColor(priority: TaskRecord["priority"]): "gray" | "orange" | "red" {
  if (priority === "high") return "red";
  if (priority === "medium") return "orange";
  return "gray";
}

type KanbanBoardProps = {
  tasks: TaskRecord[];
  contextLabels: Record<string, string>;
  onMove: (taskId: string, status: TaskStatus) => Promise<void>;
  onEdit: (task: TaskRecord) => void;
  onDelete: (taskId: string) => Promise<void>;
  onComplete: (taskId: string) => Promise<void>;
};

export default function KanbanBoard({
  tasks,
  contextLabels,
  onMove,
  onEdit,
  onDelete,
  onComplete,
}: KanbanBoardProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        return (
          <section
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData("text/plain");
              if (taskId) {
                void onMove(taskId, column.status);
              }
            }}
            className="rounded-2xl border border-border bg-bg-secondary/70 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-primary">{t(column.labelKey)}</div>
              <Badge color="gray">{columnTasks.length}</Badge>
            </div>

            <div className="space-y-3 min-h-24">
              {columnTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-text-secondary/60">
                  {t("tasks.emptyColumn")}
                </div>
              ) : (
                columnTasks.map((task) => (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", task.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className="rounded-xl border border-border bg-bg-primary p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">{task.title}</div>
                        {task.description && (
                          <p className="mt-1 text-xs leading-relaxed text-text-secondary/70 line-clamp-3">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <Badge color={priorityColor(task.priority)}>
                        {t(`tasks.priority.${task.priority}`)}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {task.dueDate && <Badge color="blue">{task.dueDate}</Badge>}
                      {task.projectContextId && contextLabels[task.projectContextId] && (
                        <Badge color="gray">{contextLabels[task.projectContextId]}</Badge>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
                        <Pencil size={13} />
                        {t("common.edit")}
                      </Button>
                      {task.status !== "done" ? (
                        <Button variant="ghost" size="sm" onClick={() => void onComplete(task.id)}>
                          <CheckCircle2 size={13} />
                          {t("tasks.complete")}
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void onMove(task.id, "backlog")}>
                          {t("tasks.reopen")}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void onDelete(task.id)}>
                        <Trash2 size={13} />
                        {t("common.delete")}
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
