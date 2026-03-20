import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KanbanSquare, List, Plus } from "lucide-react";
import type { TaskRecord, TaskStatus } from "../../../../src/types/task.js";
import { useContextStore } from "../../stores/contextStore";
import { useTaskStore } from "../../stores/taskStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import Select from "../shared/Select";
import KanbanBoard from "./KanbanBoard";
import TaskEditor from "./TaskEditor";
import TaskList from "./TaskList";

type ViewMode = "kanban" | "list";

export default function TasksView() {
  const { t } = useTranslation();
  const { tasks, loaded, loadTasks, createTask, updateTask, moveTask, completeTask, deleteTask } = useTaskStore();
  const { contexts, loaded: contextsLoaded, loadContexts, activeContextId } = useContextStore();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [showDone, setShowDone] = useState(false);
  const [filterContextId, setFilterContextId] = useState(() => activeContextId || "__all__");
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!loaded) {
      void loadTasks();
    }
  }, [loaded, loadTasks]);

  useEffect(() => {
    if (!contextsLoaded) {
      void loadContexts();
    }
  }, [contextsLoaded, loadContexts]);

  const contextLabels = useMemo(
    () =>
      Object.fromEntries(
        contexts.map((projectContext) => [projectContext.id, projectContext.name]),
      ) as Record<string, string>,
    [contexts],
  );

  const contextOptions = useMemo(
    () => [
      { value: "", label: t("tasks.noContext") },
      ...contexts.map((projectContext) => ({
        value: projectContext.id,
        label: projectContext.name,
      })),
    ],
    [contexts, t],
  );

  const filterOptions = useMemo(
    () => [
      { value: "__all__", label: t("tasks.allContexts") },
      ...contexts.map((projectContext) => ({
        value: projectContext.id,
        label: projectContext.name,
      })),
    ],
    [contexts, t],
  );

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!showDone && task.status === "done") {
        return false;
      }
      if (filterContextId !== "__all__" && task.projectContextId !== filterContextId) {
        return false;
      }
      return true;
    });
  }, [filterContextId, showDone, tasks]);

  const openTasks = visibleTasks.filter((task) => task.status !== "done");
  const doneTasks = visibleTasks.filter((task) => task.status === "done");

  async function handleSaveTask(patch: Partial<TaskRecord>) {
    if (editingTask) {
      await updateTask(editingTask.id, patch);
      return;
    }
    await createTask({
      ...patch,
      projectContextId:
        patch.projectContextId ??
        (filterContextId !== "__all__" ? filterContextId : activeContextId || undefined),
    });
  }

  async function handleMoveTask(taskId: string, status: TaskStatus) {
    await moveTask(taskId, status);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{t("tasks.title")}</h1>
            <p className="mt-1 text-sm text-text-secondary/70">{t("tasks.subtitle")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={showDone ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowDone((current) => !current)}
            >
              {showDone ? t("tasks.hideDone") : t("tasks.showDone")}
            </Button>

            <div className="min-w-52">
              <Select
                value={filterContextId}
                onChange={setFilterContextId}
                options={filterOptions}
              />
            </div>

            <div className="inline-flex rounded-xl border border-border bg-bg-secondary/70 p-1">
              <button
                onClick={() => setViewMode("kanban")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                  viewMode === "kanban"
                    ? "bg-white/10 text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <KanbanSquare size={14} />
                {t("tasks.kanban")}
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white/10 text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <List size={14} />
                {t("tasks.list")}
              </button>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingTask(null);
                setEditorOpen(true);
              }}
            >
              <Plus size={14} />
              {t("tasks.create")}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">{t("tasks.openTasks")}</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{openTasks.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">{t("tasks.doneTasks")}</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{doneTasks.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">{t("tasks.activeFilter")}</div>
            <div className="mt-2">
              <Badge color="blue">
                {filterOptions.find((option) => option.value === filterContextId)?.label ?? t("tasks.allContexts")}
              </Badge>
            </div>
          </div>
        </div>

        {viewMode === "kanban" ? (
          <KanbanBoard
            tasks={visibleTasks}
            contextLabels={contextLabels}
            onMove={handleMoveTask}
            onEdit={(task) => {
              setEditingTask(task);
              setEditorOpen(true);
            }}
            onDelete={deleteTask}
            onComplete={completeTask}
          />
        ) : (
          <TaskList
            tasks={visibleTasks}
            contextLabels={contextLabels}
            onEdit={(task) => {
              setEditingTask(task);
              setEditorOpen(true);
            }}
            onDelete={deleteTask}
            onComplete={completeTask}
            onStatusChange={handleMoveTask}
          />
        )}
      </div>

      <TaskEditor
        open={editorOpen}
        task={editingTask}
        contextOptions={contextOptions}
        defaultProjectContextId={filterContextId !== "__all__" ? filterContextId : activeContextId || ""}
        onClose={() => {
          setEditorOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
      />
    </div>
  );
}
