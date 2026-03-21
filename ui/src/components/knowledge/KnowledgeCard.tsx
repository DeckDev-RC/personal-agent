import React from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, FolderTree, MessageSquare, SearchCheck } from "lucide-react";
import type { KnowledgeSearchResult } from "../../../../src/types/knowledge.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";

type KnowledgeCardProps = {
  result: KnowledgeSearchResult;
  onOpenChat?: (sessionId: string) => void;
  onOpenWorkspace?: (relativePath: string) => void;
};

function badgeColorForSource(sourceType: KnowledgeSearchResult["sourceType"]): "blue" | "green" | "orange" | "gray" {
  if (sourceType === "workspace_file" || sourceType === "note") {
    return "blue";
  }
  if (sourceType === "session_message" || sourceType === "attachment_text") {
    return "green";
  }
  if (sourceType === "search_result" || sourceType === "browser_snapshot") {
    return "orange";
  }
  return "gray";
}

function labelForSource(sourceType: KnowledgeSearchResult["sourceType"]): string {
  switch (sourceType) {
    case "workspace_file":
      return "Workspace";
    case "session_message":
      return "Chat";
    case "run_artifact":
      return "Artifact";
    case "note":
      return "Nota";
    case "browser_snapshot":
      return "Browser";
    case "attachment_text":
      return "Anexo";
    case "search_result":
      return "Busca";
    default:
      return sourceType;
  }
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function canOpenWorkspace(result: KnowledgeSearchResult): boolean {
  if (!result.path) {
    return false;
  }
  if (/^https?:\/\//i.test(result.path)) {
    return false;
  }
  return result.sourceType === "workspace_file" || result.sourceType === "note";
}

export default function KnowledgeCard({ result, onOpenChat, onOpenWorkspace }: KnowledgeCardProps) {
  const { t } = useTranslation();

  return (
    <article className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={badgeColorForSource(result.sourceType)}>
            {labelForSource(result.sourceType)}
          </Badge>
          <Badge color={result.origin === "hybrid" ? "green" : result.origin === "vector" ? "blue" : "gray"}>
            {result.origin === "hybrid"
              ? t("knowledge.hybrid", "Hibrido")
              : result.origin === "vector"
                ? t("knowledge.semantic", "Semantico")
                : t("knowledge.keyword", "Texto")}
          </Badge>
          <span className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
            {t("knowledge.score", "Relevancia")} {(result.score * 100).toFixed(0)}%
          </span>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-text-primary">{result.title}</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary/85">
            {result.preview}
          </p>
        </div>

        <div className="grid gap-2 text-xs text-text-secondary/70 md:grid-cols-2">
          <div>
            <span className="font-medium text-text-secondary/90">{t("knowledge.updatedAt", "Atualizado")}:</span>{" "}
            {formatTimestamp(result.updatedAt)}
          </div>
          <div>
            <span className="font-medium text-text-secondary/90">{t("knowledge.sourceLabel", "Origem")}:</span>{" "}
            {labelForSource(result.sourceType)}
          </div>
          {result.sessionTitle && (
            <div>
              <span className="font-medium text-text-secondary/90">{t("knowledge.session", "Sessao")}:</span>{" "}
              {result.sessionTitle}
            </div>
          )}
          {result.projectContextName && (
            <div>
              <span className="font-medium text-text-secondary/90">{t("knowledge.context", "Contexto")}:</span>{" "}
              {result.projectContextName}
            </div>
          )}
          {result.path && (
            <div className="md:col-span-2 break-all">
              <span className="font-medium text-text-secondary/90">{t("knowledge.path", "Referencia")}:</span>{" "}
              {result.path}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {result.sessionId && onOpenChat && (
            <Button variant="ghost" size="sm" onClick={() => onOpenChat(result.sessionId!)}>
              <MessageSquare size={14} />
              {t("knowledge.openChat", "Abrir chat")}
            </Button>
          )}
          {result.path && canOpenWorkspace(result) && onOpenWorkspace && (
            <Button variant="ghost" size="sm" onClick={() => onOpenWorkspace(result.path!)}>
              <FolderTree size={14} />
              {t("knowledge.openWorkspace", "Abrir workspace")}
            </Button>
          )}
          {result.path && /^https?:\/\//i.test(result.path) && (
            <Button variant="ghost" size="sm" onClick={() => window.open(result.path, "_blank", "noopener,noreferrer")}>
              <ExternalLink size={14} />
              {t("knowledge.openSource", "Abrir fonte")}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
            <SearchCheck size={12} />
            {t("knowledge.match", "Match")}
          </div>
        </div>
      </div>
    </article>
  );
}
