import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  LayoutDashboard,
  Plug,
  RefreshCw,
  SendHorizonal,
  Sparkles,
} from "lucide-react";
import type { McpServerStatus } from "../../../../src/types/mcp.js";
import AgendaWidget from "./AgendaWidget";
import RecentActivity from "./RecentActivity";
import TasksWidget from "./TasksWidget";
import { DEFAULT_AGENT } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useContextStore } from "../../stores/contextStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { setRoute } from "../../router";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";
import QuickActions from "../skills/QuickActions";

const api = () => (window as any).codexAgent;

function buildDashboardSystemPrompt(globalSystemPrompt: string, fastMode: boolean): string {
  const parts = [DEFAULT_AGENT.systemPrompt];

  if (globalSystemPrompt.trim()) {
    parts.push(`Global instructions:\n${globalSystemPrompt.trim()}`);
  }

  if (fastMode) {
    parts.push("Fast mode is enabled. Prefer lower latency and concise execution.");
  }

  return parts.join("\n\n---\n\n");
}

function connectedStatuses(statuses: McpServerStatus[]): McpServerStatus[] {
  return statuses.filter((status) => status.connected).slice(0, 6);
}

export default function DayView() {
  const { t } = useTranslation();
  const {
    loaded,
    loading,
    error,
    tasks,
    sessions,
    files,
    mcpStatuses,
    manualAgenda,
    loadDashboard,
    addManualAgendaItem,
    toggleManualAgendaItem,
    removeManualAgendaItem,
    getConnectedCatalogIds,
  } = useDashboardStore();
  const settings = useSettingsStore((state) => state.settings);
  const { contexts, loaded: contextsLoaded, loadContexts, activeContextId } = useContextStore();
  const {
    createConversation,
    addUserMessage,
    startStreaming,
    attachRemoteSession,
    loadConversations,
    errorStreaming,
    setUiMode,
  } = useChatStore();

  const [quickPrompt, setQuickPrompt] = useState("");
  const [sendingQuickPrompt, setSendingQuickPrompt] = useState(false);

  useEffect(() => {
    if (!loaded && !loading) {
      void loadDashboard();
    }
  }, [loaded, loading, loadDashboard]);

  useEffect(() => {
    if (!contextsLoaded) {
      void loadContexts();
    }
  }, [contextsLoaded, loadContexts]);

  const contextLabels = useMemo(
    () =>
      Object.fromEntries(
        contexts.map((projectContext) => [projectContext.id, projectContext.name]),
      ) as Record<string, string>,
    [contexts],
  );

  const activeContext = contexts.find((projectContext) => projectContext.id === activeContextId);
  const openTasks = tasks.filter((task) => task.status !== "done");
  const connectedMcp = connectedStatuses(mcpStatuses);
  const connectedCatalogIds = getConnectedCatalogIds();
  const calendarConnected = connectedCatalogIds.includes("google-calendar");

  const handleQuickPrompt = useCallback(async () => {
    const prompt = quickPrompt.trim();
    if (!prompt || sendingQuickPrompt) {
      return;
    }

    setSendingQuickPrompt(true);
    try {
      const projectContextId = activeContextId || undefined;
      const conversation = createConversation(
        settings.defaultModelRef,
        buildDashboardSystemPrompt(settings.globalSystemPrompt, settings.fastMode),
        DEFAULT_AGENT.id,
        projectContextId,
      );

      addUserMessage(prompt);

      const runResult = await api().startChat({
        title: conversation.title,
        agentId: DEFAULT_AGENT.id,
        projectContextId,
        modelRef: conversation.model,
        systemPrompt: conversation.systemPrompt,
        messages: [
          {
            id: `dashboard-${Date.now()}`,
            role: "user",
            content: prompt,
            timestamp: Date.now(),
          },
        ],
        mcpServerIds: DEFAULT_AGENT.mcpServerIds,
        attachments: [],
      });

      if (!runResult?.ok) {
        throw new Error(runResult?.error ?? "Failed to start quick prompt.");
      }

      startStreaming(runResult.runId, runResult.uiMode ?? "agentic");
      setUiMode(runResult.uiMode ?? "agentic");
      if (runResult.sessionId) {
        attachRemoteSession(runResult.sessionId);
      }
      await loadConversations();
      setQuickPrompt("");
      setRoute("chat", runResult.sessionId ?? conversation.id);
    } catch (error) {
      errorStreaming(error instanceof Error ? error.message : String(error));
      setRoute("chat");
    } finally {
      setSendingQuickPrompt(false);
    }
  }, [
    activeContextId,
    addUserMessage,
    attachRemoteSession,
    createConversation,
    errorStreaming,
    loadConversations,
    quickPrompt,
    sendingQuickPrompt,
    settings.defaultModelRef,
    settings.fastMode,
    settings.globalSystemPrompt,
    setUiMode,
    startStreaming,
  ]);

  if (!loaded && loading) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-6 py-16 text-center text-sm text-text-secondary">
            {t("dashboard.loading")}
          </div>
        </div>
      </div>
    );
  }

  if (error && !loading && sessions.length === 0 && files.length === 0 && tasks.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <EmptyState
            icon={<LayoutDashboard size={18} />}
            title={t("dashboard.errorTitle")}
            description={error}
            action={{
              label: t("dashboard.retry"),
              onClick: () => void loadDashboard(),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <LayoutDashboard size={18} className="text-accent-blue" />
                {t("dashboard.title")}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-text-secondary/75">
                {t("dashboard.subtitle")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary/65">
                <span>{t("dashboard.activeContext")}:</span>
                <Badge color={activeContext ? "blue" : "gray"}>
                  {activeContext?.name ?? t("dashboard.noContext")}
                </Badge>
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw size={14} />
              {t("dashboard.refresh")}
            </Button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.4fr),minmax(320px,0.8fr)]">
            <div className="rounded-2xl border border-border bg-bg-primary/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Sparkles size={16} className="text-accent-orange" />
                {t("dashboard.quickPromptTitle")}
              </div>
              <p className="mt-1 text-xs text-text-secondary/70">
                {t("dashboard.quickPromptDescription")}
              </p>

              <div className="mt-4 flex flex-col gap-3">
                <textarea
                  value={quickPrompt}
                  onChange={(event) => setQuickPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void handleQuickPrompt();
                    }
                  }}
                  placeholder={t("dashboard.quickPromptPlaceholder")}
                  className="min-h-[120px] w-full rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                />

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleQuickPrompt()}
                    disabled={!quickPrompt.trim() || sendingQuickPrompt}
                  >
                    <SendHorizonal size={14} />
                    {t("dashboard.sendQuickPrompt")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("dashboard.stats.openTasks")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">{openTasks.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("dashboard.stats.recentOutputs")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">{files.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("dashboard.stats.connectedMcp")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">
                  {connectedMcp.length}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t("dashboard.stats.manualAgenda")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">
                  {manualAgenda.length}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr),minmax(360px,0.95fr)]">
          <div className="space-y-6">
            <AgendaWidget
              items={manualAgenda}
              calendarConnected={calendarConnected}
              onAdd={addManualAgendaItem}
              onToggle={toggleManualAgendaItem}
              onRemove={removeManualAgendaItem}
            />

            <RecentActivity
              sessions={sessions}
              files={files}
              contextLabels={contextLabels}
              onOpenConversation={(sessionId) => setRoute("chat", sessionId)}
              onOpenWorkspaceFile={(relativePath) =>
                setRoute("workspace", encodeURIComponent(relativePath))
              }
            />
          </div>

          <div className="space-y-6">
            <TasksWidget
              tasks={tasks}
              contextLabels={contextLabels}
              onOpenTasks={() => setRoute("tasks")}
            />

            <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Plug size={16} className="text-accent-green" />
                    {t("dashboard.mcp.title")}
                  </div>
                  <p className="mt-1 text-xs text-text-secondary/70">
                    {t("dashboard.mcp.description")}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setRoute("mcp")}>
                  {t("dashboard.mcp.manage")}
                </Button>
              </div>

              {connectedMcp.length === 0 ? (
                <EmptyState
                  icon={<Plug size={18} />}
                  title={t("dashboard.mcp.emptyTitle")}
                  description={t("dashboard.mcp.emptyDescription")}
                  action={{
                    label: t("dashboard.mcp.manage"),
                    onClick: () => setRoute("mcp"),
                  }}
                />
              ) : (
                <div className="mt-4 space-y-2">
                  {connectedMcp.map((status) => (
                    <div key={status.id} className="rounded-xl border border-border bg-bg-primary px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">{status.id}</div>
                          <div className="mt-1 text-[11px] text-text-secondary/60">
                            {status.toolCount} tools
                          </div>
                        </div>
                        <Badge color={status.error ? "orange" : "green"}>
                          {status.error ? t("dashboard.mcp.error") : t("dashboard.mcp.ready")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <FolderOpen size={16} className="text-accent-blue" />
                {t("dashboard.quickActionsTitle")}
              </div>
              <p className="mt-1 text-xs text-text-secondary/70">
                {t("dashboard.quickActionsDescription")}
              </p>
              <div className="mt-3">
                <QuickActions />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
