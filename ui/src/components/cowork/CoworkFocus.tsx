import { useTranslation } from "react-i18next";
import { Target, CheckCircle, ArrowLeft } from "lucide-react";
import { useCoworkStore } from "../../stores/coworkStore.js";
import { useTaskStore } from "../../stores/taskStore.js";
import FocusTimer from "./FocusTimer.js";
import Button from "../shared/Button.js";

export default function CoworkFocus() {
  const { t } = useTranslation();
  const { focusActive, focusTaskId, enterFocus, exitFocus } = useCoworkStore();
  const { tasks, loadTasks, completeTask } = useTaskStore();

  const focusTask = focusTaskId ? tasks.find((t) => t.id === focusTaskId) : null;

  // If not in focus, show task picker
  if (!focusActive) {
    const availableTasks = tasks.filter((t) => t.status !== "done").slice(0, 10);

    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("cowork.focus.title", "Modo Foco")}
        </h2>
        <p className="text-xs text-text-secondary">
          {t("cowork.focus.selectTask", "Selecione uma tarefa para focar ou inicie sem tarefa.")}
        </p>

        <Button onClick={() => enterFocus()}>
          <Target size={14} className="mr-1.5" />
          {t("cowork.focus.startFree", "Iniciar sem tarefa")}
        </Button>

        {availableTasks.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t("cowork.focus.pickTask", "Ou selecione uma tarefa")}
            </p>
            {availableTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => enterFocus(task.id)}
                className="flex items-center gap-2 w-full rounded-lg border border-border bg-bg-primary/50 px-3 py-2 text-xs text-text-primary hover:bg-white/5 transition-colors cursor-pointer text-left"
              >
                <Target size={12} className="text-accent shrink-0" />
                <span className="truncate">{task.title}</span>
                {task.priority === "high" && (
                  <span className="text-[10px] text-danger ml-auto shrink-0">alta</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Focus mode active
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <button
        onClick={exitFocus}
        className="absolute top-4 left-4 flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} />
        {t("cowork.focus.exit", "Sair do foco")}
      </button>

      <FocusTimer
        durationMinutes={25}
        onComplete={() => {
          // Timer completed
        }}
      />

      {focusTask && (
        <div className="max-w-sm w-full rounded-xl border border-border bg-bg-secondary p-4 space-y-2 text-center">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("cowork.focus.currentTask", "Tarefa Atual")}
          </p>
          <p className="text-sm font-semibold text-text-primary">{focusTask.title}</p>
          {focusTask.description && (
            <p className="text-xs text-text-secondary">{focusTask.description}</p>
          )}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={async () => {
                await completeTask(focusTask.id);
                exitFocus();
                await loadTasks();
              }}
            >
              <CheckCircle size={12} className="mr-1" />
              {t("cowork.focus.complete", "Concluir")}
            </Button>
            <Button size="sm" variant="secondary" onClick={exitFocus}>
              {t("cowork.focus.defer", "Adiar")}
            </Button>
          </div>
        </div>
      )}

      {!focusTask && (
        <p className="text-sm text-text-secondary">
          {t("cowork.focus.freeMode", "Modo livre - concentre-se no que precisa fazer")}
        </p>
      )}
    </div>
  );
}
