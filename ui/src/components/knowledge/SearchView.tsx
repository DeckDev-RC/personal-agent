import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Database, RefreshCw, Search, Sparkles } from "lucide-react";
import type { MemorySourceType } from "../../../../src/types/runtime.js";
import { setRoute } from "../../router";
import { useContextStore } from "../../stores/contextStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";
import Input from "../shared/Input";
import Select from "../shared/Select";
import Spinner from "../shared/Spinner";
import KnowledgeCard from "./KnowledgeCard";

const SOURCE_OPTIONS: Array<{ value: "__all__" | MemorySourceType; label: string }> = [
  { value: "__all__", label: "Todas as fontes" },
  { value: "workspace_file", label: "Workspace" },
  { value: "note", label: "Notas" },
  { value: "session_message", label: "Chat" },
  { value: "attachment_text", label: "Anexos" },
  { value: "search_result", label: "Busca web" },
  { value: "browser_snapshot", label: "Browser" },
];

function formatTimestamp(value?: number): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export default function SearchView() {
  const { t } = useTranslation();
  const { contexts, loaded: contextsLoaded, loadContexts, activeContextId } = useContextStore();
  const {
    query,
    results,
    status,
    loading,
    syncing,
    error,
    refreshStatus,
    syncKnowledge,
    search,
    clear,
  } = useKnowledgeStore();
  const [draftQuery, setDraftQuery] = useState(query);
  const [sourceFilter, setSourceFilter] = useState<"__all__" | MemorySourceType>("__all__");
  const [contextFilter, setContextFilter] = useState(activeContextId || "__all__");

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (!contextsLoaded) {
      void loadContexts();
    }
  }, [contextsLoaded, loadContexts]);

  useEffect(() => {
    if (!status) {
      void refreshStatus();
    }
  }, [status, refreshStatus]);

  const contextOptions = useMemo(
    () => [
      { value: "__all__", label: t("knowledge.allContexts", "Todos os contextos") },
      ...contexts.map((projectContext) => ({
        value: projectContext.id,
        label: projectContext.name,
      })),
    ],
    [contexts, t],
  );

  async function runSearch(nextQuery: string) {
    if (!nextQuery.trim()) {
      clear();
      return;
    }

    await search({
      query: nextQuery,
      limit: 16,
      sourceTypes: sourceFilter === "__all__" ? undefined : [sourceFilter],
      projectContextId: contextFilter === "__all__" ? undefined : contextFilter,
    });
  }

  async function handleSync() {
    await syncKnowledge();
    if (draftQuery.trim()) {
      await runSearch(draftQuery);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Sparkles size={18} className="text-accent-blue" />
                {t("knowledge.title", "Base de Conhecimento")}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-text-secondary/75">
                {t(
                  "knowledge.subtitle",
                  "Busque semanticamente entre mensagens, notas, arquivos de workspace, anexos e saidas recentes do agente.",
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void refreshStatus()}>
                <RefreshCw size={14} />
                {t("knowledge.refresh", "Atualizar status")}
              </Button>
              <Button variant="primary" size="sm" onClick={() => void handleSync()} disabled={syncing}>
                <Database size={14} />
                {syncing ? t("knowledge.syncing", "Sincronizando...") : t("knowledge.sync", "Sincronizar indice")}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
              {t("knowledge.stats.sources", "Fontes")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{status?.sourceCount ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
              {t("knowledge.stats.chunks", "Chunks")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{status?.chunkCount ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
              {t("knowledge.stats.backend", "Backend")}
            </div>
            <div className="mt-2">
              <Badge color={status?.ready ? "green" : "gray"}>{status?.backend ?? "lancedb"}</Badge>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary/55">
              {t("knowledge.stats.lastSync", "Ultima sincronizacao")}
            </div>
            <div className="mt-1 text-sm font-medium text-text-primary">{formatTimestamp(status?.lastSyncAt)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
          <form
            className="grid gap-3 xl:grid-cols-[minmax(0,1fr),220px,220px,auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(draftQuery);
            }}
          >
            <Input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t("knowledge.searchPlaceholder", "Ex.: o que decidimos sobre deploy na reuniao de terca?")}
            />

            <Select
              value={sourceFilter}
              onChange={(value) => setSourceFilter(value as "__all__" | MemorySourceType)}
              options={SOURCE_OPTIONS.map((option) => ({
                value: option.value,
                label:
                  option.value === "__all__"
                    ? t("knowledge.allSources", option.label)
                    : t(`knowledge.sources.${option.value}`, option.label),
              }))}
            />

            <Select value={contextFilter} onChange={setContextFilter} options={contextOptions} />

            <Button type="submit" variant="primary" className="justify-center" disabled={loading}>
              <Search size={14} />
              {loading ? t("knowledge.searching", "Buscando...") : t("knowledge.searchAction", "Buscar")}
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary/70">
            <span>{t("knowledge.tip", "Use linguagem natural. A busca combina indexacao semantica e texto.")}</span>
            {status?.lastError && <Badge color="red">{status.lastError}</Badge>}
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!query.trim() ? (
          <EmptyState
            icon={<Sparkles size={20} />}
            title={t("knowledge.emptyTitle", "Comece com uma pergunta")}
            description={t(
              "knowledge.emptyDescription",
              "Pesquise por decisoes, resumos, mensagens, documentos e contexto acumulado pelo agente.",
            )}
            action={{
              label: t("knowledge.sync", "Sincronizar indice"),
              onClick: () => void handleSync(),
            }}
          />
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={<Search size={20} />}
            title={t("knowledge.noResultsTitle", "Nenhum resultado encontrado")}
            description={t(
              "knowledge.noResultsDescription",
              "Tente outra pergunta, remova filtros ou sincronize o indice para capturar dados mais recentes.",
            )}
          />
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-text-primary">
                {t("knowledge.results", "Resultados")} ({results.length})
              </div>
              <div className="text-xs text-text-secondary/70">
                {t("knowledge.filteredBy", "Filtro ativo")}:{" "}
                <span className="text-text-primary">
                  {sourceFilter === "__all__"
                    ? t("knowledge.allSources", "Todas as fontes")
                    : t(`knowledge.sources.${sourceFilter}`, sourceFilter)}
                </span>
              </div>
            </div>

            <div className="grid gap-4">
              {results.map((result) => (
                <KnowledgeCard
                  key={result.chunkId}
                  result={result}
                  onOpenChat={(sessionId) => setRoute("chat", sessionId)}
                  onOpenWorkspace={(relativePath) => setRoute("workspace", encodeURIComponent(relativePath))}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
