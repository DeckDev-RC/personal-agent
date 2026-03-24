import React from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, MessageSquare, Trash2 } from "lucide-react";
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

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const { t } = useTranslation();
  const translateStatus = (status?: string) => {
    if (!status) return "";
    return t(`chat.console.statuses.${status}`, status);
  };
  const translatePhase = (phase?: string) => {
    if (!phase) return "";
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
    <div className="flex flex-col gap-0.5 px-1.5 py-1">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={`group rounded-lg px-2 py-2 cursor-pointer transition-colors ${
            conv.id === activeId
              ? "bg-white/10 text-text-primary ring-1 ring-white/10"
              : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
          }`}
          onClick={() => onSelect(conv.id)}
        >
          <div className="flex items-start gap-2">
            <MessageSquare size={12} className="shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <span className="text-xs truncate flex-1">{getConversationDisplayTitle(conv.title, t)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-text-secondary hover:text-red-400 transition-all cursor-pointer"
                >
                  <Trash2 size={10} />
                </button>
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-text-secondary/60">
                <span>{conv.messageCount} {t("chat.messageCount")}</span>
                {conv.workspaceRoot && (
                  <>
                    <span>•</span>
                    <GitBranch size={10} />
                    <span className="truncate max-w-[110px]">{conv.workspaceRoot.split(/[\\/]/).pop()}</span>
                  </>
                )}
              </div>

              {(conv.lastRunStatus || conv.lastRunPhase) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {conv.lastRunPhase && <Badge color="gray">{translatePhase(conv.lastRunPhase)}</Badge>}
                  {conv.lastRunStatus && (
                    <Badge
                      color={
                        conv.lastRunStatus === "completed"
                          ? "green"
                          : conv.lastRunStatus === "failed"
                            ? "red"
                            : conv.lastRunStatus === "awaiting_approval"
                              ? "orange"
                              : "blue"
                      }
                    >
                      {translateStatus(conv.lastRunStatus)}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
