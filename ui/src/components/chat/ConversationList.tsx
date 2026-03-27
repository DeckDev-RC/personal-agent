import { useTranslation } from "react-i18next";
import { GitBranch, Trash2 } from "lucide-react";
import Badge from "../shared/Badge";
import { getConversationDisplayTitle } from "./chatUi";

type ConversationSummary = {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
  workspaceRoot?: string;
  lastRunStatus?: string;
  lastRunPhase?: string;
};

type ConversationListProps = {
  conversations: ConversationSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

function getConversationAbbreviation(title: string): string {
  const compact = Array.from(title.replace(/\s+/g, "").trim()).slice(0, 2).join("");
  return (compact || "CH").toUpperCase();
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const { t } = useTranslation();

  const translateStatus = (status?: string) => {
    if (!status) {
      return "";
    }
    return t(`chat.console.statuses.${status}`, status);
  };

  const translatePhase = (phase?: string) => {
    if (!phase) {
      return "";
    }
    return t(`chat.console.phases.${phase}`, phase);
  };

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-text-secondary/50">
        {t("chat.noConversations")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-2">
      {conversations.map((conversation) => {
        const displayTitle = getConversationDisplayTitle(conversation.title, t);
        const isActive = conversation.id === activeId;

        return (
          <div
            key={conversation.id}
            className={`group cursor-pointer rounded-xl border-l-2 px-3 py-2.5 transition-colors ${
              isActive
                ? "border-accent bg-accent-subtle text-text-primary"
                : "border-transparent text-text-secondary hover:bg-surface-raised hover:text-text-primary"
            }`}
            onClick={() => onSelect(conversation.id)}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-[10px] font-semibold tracking-[0.08em] text-text-primary/85">
                {getConversationAbbreviation(displayTitle)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="flex-1 truncate text-[13px] font-medium text-text-primary">
                    {displayTitle}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(conversation.id);
                    }}
                    className="cursor-pointer rounded-md p-1 text-text-secondary opacity-0 transition-all hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)] group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-secondary/62">
                  <span>{conversation.messageCount} {t("chat.messageCount")}</span>
                  {conversation.workspaceRoot && (
                    <>
                      <span>-</span>
                      <GitBranch size={11} />
                      <span className="max-w-[110px] truncate">
                        {conversation.workspaceRoot.split(/[\\/]/).pop()}
                      </span>
                    </>
                  )}
                </div>

                {(conversation.lastRunStatus || conversation.lastRunPhase) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {conversation.lastRunPhase && (
                      <Badge color="gray" className="text-[11px]">
                        {translatePhase(conversation.lastRunPhase)}
                      </Badge>
                    )}
                    {conversation.lastRunStatus && (
                      <Badge
                        color={
                          conversation.lastRunStatus === "completed"
                            ? "green"
                            : conversation.lastRunStatus === "failed"
                              ? "red"
                              : conversation.lastRunStatus === "awaiting_approval"
                                ? "orange"
                                : "blue"
                        }
                        className="text-[11px]"
                      >
                        {translateStatus(conversation.lastRunStatus)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
