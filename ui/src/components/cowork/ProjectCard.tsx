import { useTranslation } from "react-i18next";
import { FolderOpen, AlertTriangle, CheckCircle, Clock, Trash2 } from "lucide-react";
import type { CoworkProject } from "../../../../src/types/cowork.js";
import Badge from "../shared/Badge.js";

type ProjectCardProps = {
  project: CoworkProject;
  onDelete?: () => void;
  onClick?: () => void;
};

const STATUS_COLORS: Record<string, "blue" | "orange" | "green" | "gray"> = {
  active: "blue",
  paused: "orange",
  completed: "green",
};

export default function ProjectCard({ project, onDelete, onClick }: ProjectCardProps) {
  const { t } = useTranslation();
  const completedMilestones = project.milestones.filter((m) => m.completed).length;

  return (
    <div
      className="rounded-lg border border-border bg-bg-primary/50 p-3 space-y-2 hover:bg-white/5 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen size={14} className="text-accent shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">{project.name}</span>
        </div>
        <Badge color={STATUS_COLORS[project.status] ?? "gray"}>
          {project.status === "active" ? t("cowork.project.active", "Ativo") :
           project.status === "paused" ? t("cowork.project.paused", "Pausado") :
           t("cowork.project.completed", "Concluido")}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {project.openTaskCount} {t("cowork.project.openTasks", "abertas")}
        </span>
        {project.overdueTaskCount > 0 && (
          <span className="flex items-center gap-1 text-danger">
            <AlertTriangle size={12} />
            {project.overdueTaskCount} {t("cowork.project.overdue", "atrasadas")}
          </span>
        )}
        {project.milestones.length > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle size={12} />
            {completedMilestones}/{project.milestones.length} {t("cowork.project.milestones", "marcos")}
          </span>
        )}
      </div>

      {project.nextDeadline && (
        <p className="text-[10px] text-text-secondary">
          {t("cowork.project.nextDeadline", "Proximo prazo")}: {project.nextDeadline}
        </p>
      )}

      {onDelete && (
        <div className="flex justify-end pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-danger/20 text-danger hover:bg-danger/30 transition-colors cursor-pointer"
          >
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
