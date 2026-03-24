import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, CheckSquare, FileText, MessageSquare, Zap, ArrowLeft, ArrowRight } from "lucide-react";
import Button from "../shared/Button";
import Spinner from "../shared/Spinner";

type WeeklyReportData = {
  weekStart: number;
  weekEnd: number;
  tasksCompleted: number;
  documentsGenerated: number;
  skillsUsed: Record<string, number>;
  totalSessions: number;
  totalToolCalls: number;
  draftsSent: number;
  topActivities: Array<{ type: string; count: number }>;
};

const api = () => (window as any).codexAgent;

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-secondary p-3">
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${color}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-lg font-bold text-text-primary">{value}</p>
        <p className="text-[10px] text-text-secondary">{label}</p>
      </div>
    </div>
  );
}

export default function WeeklyReport() {
  const { t } = useTranslation();
  const [report, setReport] = useState<WeeklyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + weekOffset * 7);
    void api().analytics.weeklyReport(monday.getTime()).then((data: WeeklyReportData) => {
      setReport(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [weekOffset]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!report) {
    return <div className="p-4 text-text-secondary text-sm">{t("analytics.noData", "Sem dados disponíveis")}</div>;
  }

  const weekStartDate = new Date(report.weekStart);
  const weekEndDate = new Date(report.weekEnd);
  const formatDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  const skillEntries = Object.entries(report.skillsUsed).sort(([, a], [, b]) => b - a);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <BarChart3 size={16} className="text-accent-blue" />
          {t("analytics.weeklyReport", "Relatório Semanal")}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset((o) => o - 1)} className="text-text-secondary hover:text-text-primary cursor-pointer p-1">
            <ArrowLeft size={14} />
          </button>
          <span className="text-xs text-text-secondary">
            {formatDate(weekStartDate)} - {formatDate(weekEndDate)}
          </span>
          <button onClick={() => setWeekOffset((o) => Math.min(o + 1, 0))} disabled={weekOffset >= 0} className="text-text-secondary hover:text-text-primary cursor-pointer p-1 disabled:opacity-30">
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={CheckSquare} label={t("analytics.tasksCompleted", "Tarefas concluídas")} value={report.tasksCompleted} color="bg-green-500/15 text-green-400" />
        <StatCard icon={FileText} label={t("analytics.docsGenerated", "Documentos gerados")} value={report.documentsGenerated} color="bg-blue-500/15 text-blue-400" />
        <StatCard icon={MessageSquare} label={t("analytics.sessions", "Sessões de chat")} value={report.totalSessions} color="bg-purple-500/15 text-purple-400" />
        <StatCard icon={Zap} label={t("analytics.toolCalls", "Chamadas de ferramenta")} value={report.totalToolCalls} color="bg-amber-500/15 text-amber-400" />
      </div>

      {skillEntries.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <h3 className="text-xs font-medium text-text-primary mb-2">
            {t("analytics.topSkills", "Skills mais usadas")}
          </h3>
          <div className="flex flex-col gap-1.5">
            {skillEntries.slice(0, 5).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">{name}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 bg-accent-blue/30 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(...skillEntries.map(([, c]) => c))) * 80)}px` }}>
                    <div className="h-full bg-accent-blue rounded-full" style={{ width: "100%" }} />
                  </div>
                  <span className="text-xs text-text-primary font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.topActivities.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <h3 className="text-xs font-medium text-text-primary mb-2">
            {t("analytics.activityBreakdown", "Distribuição de atividades")}
          </h3>
          <div className="flex flex-col gap-1">
            {report.topActivities.map(({ type, count }) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{type.replace(/_/g, " ")}</span>
                <span className="text-text-primary font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
