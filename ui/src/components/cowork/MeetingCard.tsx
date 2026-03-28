import { useTranslation } from "react-i18next";
import { Calendar, Clock, Users, CheckCircle, FileText, ListTodo, Trash2 } from "lucide-react";
import type { CoworkMeeting } from "../../../../src/types/cowork.js";
import Badge from "../shared/Badge.js";

type MeetingCardProps = {
  meeting: CoworkMeeting;
  expanded?: boolean;
  onComplete?: () => void;
  onDelete?: () => void;
  onExtractActions?: () => void;
};

const STATUS_COLORS: Record<string, "blue" | "orange" | "green" | "gray"> = {
  upcoming: "blue",
  in_progress: "orange",
  completed: "green",
};

export default function MeetingCard({ meeting, expanded, onComplete, onDelete, onExtractActions }: MeetingCardProps) {
  const { t } = useTranslation();
  const date = new Date(meeting.scheduledAt);
  const durationMin = Math.round(meeting.duration / 60000);

  return (
    <div className="rounded-lg border border-border bg-bg-primary/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar size={14} className="text-accent shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">{meeting.title}</span>
        </div>
        <Badge color={STATUS_COLORS[meeting.status] ?? "gray"}>
          {meeting.status === "upcoming" ? t("cowork.meeting.upcoming", "Agendada") :
           meeting.status === "in_progress" ? t("cowork.meeting.inProgress", "Em andamento") :
           t("cowork.meeting.completed", "Concluida")}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {durationMin}min
        </span>
        {meeting.participants.length > 0 && (
          <span className="flex items-center gap-1">
            <Users size={12} />
            {meeting.participants.length} {t("cowork.meeting.participants", "participantes")}
          </span>
        )}
      </div>

      {meeting.participants.length > 0 && expanded && (
        <div className="flex flex-wrap gap-1">
          {meeting.participants.map((p, i) => (
            <span key={i} className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] text-text-secondary">
              {p}
            </span>
          ))}
        </div>
      )}

      {expanded && meeting.actionItemTaskIds.length > 0 && (
        <p className="text-xs text-text-secondary flex items-center gap-1">
          <ListTodo size={12} />
          {meeting.actionItemTaskIds.length} {t("cowork.meeting.actionItems", "action items")}
        </p>
      )}

      {expanded && meeting.status !== "completed" && (
        <div className="flex items-center gap-2 pt-1">
          {onComplete && (
            <button
              onClick={onComplete}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-ok/20 text-ok hover:bg-ok/30 transition-colors cursor-pointer"
            >
              <CheckCircle size={10} />
              {t("cowork.meeting.complete", "Concluir")}
            </button>
          )}
          {onExtractActions && (
            <button
              onClick={onExtractActions}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors cursor-pointer"
            >
              <FileText size={10} />
              {t("cowork.meeting.extract", "Extrair Acoes")}
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-danger/20 text-danger hover:bg-danger/30 transition-colors cursor-pointer ml-auto"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
