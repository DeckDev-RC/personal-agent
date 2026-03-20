import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, FileText, MessageSquareText } from "lucide-react";
import type {
  DashboardSessionSummary,
  DashboardWorkspaceFile,
} from "../../stores/dashboardStore";
import Badge from "../shared/Badge";
import EmptyState from "../shared/EmptyState";

type RecentActivityProps = {
  sessions: DashboardSessionSummary[];
  files: DashboardWorkspaceFile[];
  contextLabels: Record<string, string>;
  onOpenConversation: (sessionId: string) => void;
  onOpenWorkspaceFile: (relativePath: string) => void;
};

type ActivityItem =
  | {
      id: string;
      type: "chat";
      title: string;
      timestamp: number;
      subtitle: string;
      contextLabel?: string;
      status?: string;
      action: () => void;
    }
  | {
      id: string;
      type: "workspace";
      title: string;
      timestamp: number;
      subtitle: string;
      categoryLabel: string;
      contextLabel?: string;
      action: () => void;
    };

export default function RecentActivity({
  sessions,
  files,
  contextLabels,
  onOpenConversation,
  onOpenWorkspaceFile,
}: RecentActivityProps) {
  const { t } = useTranslation();

  const items = useMemo<ActivityItem[]>(() => {
    const chatItems: ActivityItem[] = sessions.map((session) => ({
      id: `chat:${session.id}`,
      type: "chat",
      title: session.title,
      timestamp: session.updatedAt,
      subtitle: `${session.messageCount} ${t("dashboard.activity.messages")}`,
      contextLabel: session.projectContextId
        ? contextLabels[session.projectContextId]
        : undefined,
      status: session.lastRunStatus,
      action: () => onOpenConversation(session.id),
    }));

    const fileItems: ActivityItem[] = files.map((file) => ({
      id: `workspace:${file.relativePath}`,
      type: "workspace",
      title: file.title,
      timestamp: file.updatedAt,
      subtitle: file.skillName || file.preview || file.relativePath,
      categoryLabel: t(`workspace.categories.${file.category}`),
      contextLabel: file.projectContextId
        ? contextLabels[file.projectContextId]
        : undefined,
      action: () => onOpenWorkspaceFile(file.relativePath),
    }));

    return [...chatItems, ...fileItems]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 8);
  }, [contextLabels, files, onOpenConversation, onOpenWorkspaceFile, sessions, t]);

  return (
    <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <MessageSquareText size={16} className="text-accent-green" />
          {t("dashboard.activity.title")}
        </div>
        <p className="mt-1 text-xs text-text-secondary/70">
          {t("dashboard.activity.description")}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText size={18} />}
          title={t("dashboard.activity.emptyTitle")}
          description={t("dashboard.activity.emptyDescription")}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={item.action}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-bg-primary px-3 py-3 text-left transition-colors hover:bg-white/5 cursor-pointer"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary">
                {item.type === "chat" ? <MessageSquareText size={16} /> : <FileText size={16} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">{item.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-text-secondary/70">
                      {item.subtitle}
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="shrink-0 text-text-secondary/60" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-secondary/55">
                  <Badge color={item.type === "chat" ? "green" : "blue"}>
                    {item.type === "chat"
                      ? t("dashboard.activity.chatBadge")
                      : t("dashboard.activity.workspaceBadge")}
                  </Badge>
                  {item.type === "workspace" && <Badge color="gray">{item.categoryLabel}</Badge>}
                  {item.contextLabel && <Badge color="gray">{item.contextLabel}</Badge>}
                  {item.type === "chat" && item.status && <Badge color="gray">{item.status}</Badge>}
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
