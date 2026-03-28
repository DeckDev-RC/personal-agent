import { useTranslation } from "react-i18next";
import { Sun, CheckCircle, Clock, AlertTriangle, Mail, Calendar } from "lucide-react";
import type { DailyBriefing } from "../../../../src/types/cowork.js";

type BriefingCardProps = {
  briefing: DailyBriefing;
};

export default function BriefingCard({ briefing }: BriefingCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-accent">
          <Sun size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{briefing.greeting}</h2>
          <p className="text-xs text-text-secondary">{briefing.date}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<AlertTriangle size={14} />}
          label={t("cowork.briefing.overdue", "Atrasadas")}
          value={briefing.tasksOverdue}
          color={briefing.tasksOverdue > 0 ? "text-danger" : "text-text-secondary"}
        />
        <StatCard
          icon={<CheckCircle size={14} />}
          label={t("cowork.briefing.dueToday", "Para hoje")}
          value={briefing.tasksDueToday}
          color="text-accent"
        />
        <StatCard
          icon={<Clock size={14} />}
          label={t("cowork.briefing.inProgress", "Em andamento")}
          value={briefing.tasksInProgress}
          color="text-info"
        />
        <StatCard
          icon={<Mail size={14} />}
          label={t("cowork.briefing.drafts", "Rascunhos")}
          value={briefing.pendingDrafts}
          color="text-text-secondary"
        />
      </div>

      {briefing.upcomingMeetings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("cowork.briefing.todayMeetings", "Reunioes de hoje")}
          </p>
          {briefing.upcomingMeetings.slice(0, 3).map((meeting) => (
            <div key={meeting.id} className="flex items-center gap-2 text-xs text-text-primary">
              <Calendar size={12} className="text-accent shrink-0" />
              <span className="font-medium">{new Date(meeting.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="truncate">{meeting.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-bg-primary/50 p-3 text-center">
      <div className={`flex items-center justify-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="text-[10px] text-text-secondary mt-1">{label}</p>
    </div>
  );
}
