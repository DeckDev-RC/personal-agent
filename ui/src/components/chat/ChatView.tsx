import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Globe,
  FolderRoot,
  Hammer,
  ListTodo,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useAgentStore, DEFAULT_AGENT, type AgentConfig } from "../../stores/agentStore";
import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import { useContextStore } from "../../stores/contextStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSkillStore } from "../../stores/skillStore";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import ContextSelector from "../context/ContextSelector";
import ChatInput, { type PendingAttachment } from "./ChatInput";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";

const api = () => (window as any).codexAgent;

function AgentSelector({
  selectedAgentId,
  onSelect,
}: {
  selectedAgentId: string;
  onSelect: (agent: AgentConfig) => void;
}) {
  const agents = useAgentStore((state) => state.agents);
  const allAgents = [DEFAULT_AGENT, ...agents];
  const [open, setOpen] = useState(false);
  const selected = allAgents.find((item) => item.id === selectedAgentId) ?? DEFAULT_AGENT;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/5 border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-white/8 transition-colors cursor-pointer"
      >
        <Bot size={12} className="text-accent-green" />
        <span className="truncate max-w-[140px]">{selected.name}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-xl border border-border bg-bg-secondary shadow-xl overflow-hidden">
            {allAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  onSelect(agent);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-3 text-xs cursor-pointer transition-colors ${
                  agent.id === selectedAgentId
                    ? "bg-white/8 text-text-primary"
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                <Bot size={12} className="text-accent-green shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate">{agent.name}</div>
                  {agent.description && (
                    <div className="truncate text-[10px] text-text-secondary/50 mt-0.5">
                      {agent.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon,
  aside,
  children,
  collapsible = false,
  collapsed = false,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
      <section className="rounded-xl border border-border bg-bg-secondary/70">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={collapsible ? onToggle : undefined}
          className={`flex items-center gap-2 text-xs font-medium text-text-primary ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        >
          <span className="text-text-secondary">{icon}</span>
          {collapsible && (collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />)}
          {title}
        </button>
        {aside}
      </div>
      {!collapsed && <div className="p-3">{children}</div>}
    </section>
  );
}

function PhaseRail({ activePhase }: { activePhase?: string }) {
  const { t } = useTranslation();
  const phases = ["plan", "execute", "review", "repair", "complete"];
  return (
    <div className="grid grid-cols-5 gap-2">
      {phases.map((phase, index) => {
        const active = phase === activePhase;
        const reached = activePhase ? phases.indexOf(activePhase) >= index : false;
        return (
          <div
            key={phase}
            className={`rounded-lg border px-2.5 py-1.5 text-[9px] uppercase tracking-[0.12em] transition-colors ${
              active
                ? "border-accent-blue/35 bg-accent-blue/10 text-accent-blue"
                : reached
                  ? "border-accent-green/20 bg-accent-green/[0.06] text-accent-green"
                  : "border-border bg-bg-tertiary/80 text-text-secondary/60"
            }`}
          >
            {t(`chat.console.phases.${phase}`, phase)}
          </div>
        );
      })}
    </div>
  );
}

type ChatViewProps = {
  sessionId?: string;
};

export default function ChatView({ sessionId }: ChatViewProps) {
  const { t } = useTranslation();
  const {
    conversations,
    activeConversation,
    streaming,
    streamingText,
    thinkingText,
    activePhase,
    activeRunId,
    uiMode,
    showInternalPhases,
    collapsedInspectorSections,
    createConversation,
    selectConversation,
    deleteConversation,
    addUserMessage,
    addToolMessage,
    startStreaming,
    errorStreaming,
    abortStreaming,
    attachRemoteSession,
    patchActiveConversation,
    loadConversations,
    setUiMode,
    setShowInternalPhases,
    toggleInspectorSection,
    resetInspectorSections,
  } = useChatStore();
  const settings = useSettingsStore((state) => state.settings);
  const getProviderStatus = useAuthStore((state) => state.getProviderStatus);
  const { loaded: agentsLoaded, loadAgents } = useAgentStore();
  const {
    loaded: contextsLoaded,
    loadContexts,
    activeContextId,
    setActiveContextId,
  } = useContextStore();
  const { loaded: skillsLoaded, loadSkills } = useSkillStore();

  const [selectedAgentId, setSelectedAgentId] = useState("__default__");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [workspaceState, setWorkspaceState] = useState<any | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [toolHistory, setToolHistory] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [jobHistory, setJobHistory] = useState<any[]>([]);
  const [memoryStatus, setMemoryStatus] = useState<any | null>(null);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [browserStatus, setBrowserStatus] = useState<any | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedArtifactContent, setSelectedArtifactContent] = useState<string>("");

  useEffect(() => {
    if (!agentsLoaded) void loadAgents();
  }, [agentsLoaded, loadAgents]);

  useEffect(() => {
    if (!skillsLoaded) void loadSkills();
  }, [skillsLoaded, loadSkills]);

  useEffect(() => {
    if (!contextsLoaded) void loadContexts();
  }, [contextsLoaded, loadContexts]);

  useEffect(() => {
    setSelectedAgentId(activeConversation?.agentId ?? "__default__");
    const fallbackAgent =
      useAgentStore.getState().getAgent(activeConversation?.agentId ?? "__default__") ?? DEFAULT_AGENT;
    const nextContextId =
      activeConversation?.projectContextId ?? fallbackAgent.projectContextId ?? activeContextId ?? "";
    setSelectedContextId(nextContextId);
    setWorkspaceInput(activeConversation?.workspaceRoot ?? "");
  }, [activeConversation?.id, activeConversation?.agentId, activeConversation?.projectContextId, activeConversation?.workspaceRoot, activeContextId]);

  useEffect(() => {
    resetInspectorSections();
  }, [activeConversation?.id, resetInspectorSections]);

  useEffect(() => {
    if (!sessionId || sessionId === activeConversation?.id) {
      return;
    }
    void selectConversation(sessionId);
  }, [activeConversation?.id, selectConversation, sessionId]);

  const refreshSessionDetails = useCallback(async (sessionId?: string) => {
    if (!sessionId || sessionId.startsWith("draft-")) return;
    const agent = useAgentStore.getState().getAgent(selectedAgentId) ?? DEFAULT_AGENT;
    const [nextApprovals, nextArtifacts, nextHistory, nextWorkspace, nextBrowser, nextMemory, nextSessionJobs, nextTools, nextCapabilities] = await Promise.all([
      api().tools.approvals(sessionId),
      api().artifacts.list({ sessionId }),
      api().tools.history({ sessionId }),
      api().workspaces.status(sessionId),
      api().browser.status(sessionId),
      api().memory.status(sessionId),
      api().jobs.list({ scopeType: "session", scopeId: sessionId }),
      api().tools.list({ sessionId, mcpServerIds: agent.mcpServerIds }),
      api().capabilities.list({ sessionId, mcpServerIds: agent.mcpServerIds }),
    ]);
    setApprovals((nextApprovals ?? []).filter((item: any) => item.status === "pending"));
    setArtifacts(nextArtifacts ?? []);
    setToolHistory((nextHistory ?? []).slice(0, 8));
    setWorkspaceState(nextWorkspace ?? null);
    setBrowserStatus(nextBrowser?.browserSession ?? null);
    const mergedJobs = [...(nextSessionJobs ?? []), ...((nextMemory?.jobs as any[]) ?? [])];
    setJobHistory(Array.from(new Map(mergedJobs.map((job: any) => [job.jobId, job])).values()).slice(0, 8));
    setMemoryStatus(nextMemory ?? null);
    setAvailableTools(nextTools ?? []);
    setCapabilities(nextCapabilities ?? []);
  }, [selectedAgentId]);

  useEffect(() => {
    if (approvals.length > 0 && collapsedInspectorSections.includes("approvals")) {
      toggleInspectorSection("approvals");
    }
  }, [approvals.length, collapsedInspectorSections, toggleInspectorSection]);

  useEffect(() => {
    if (activeConversation?.lastRunStatus === "failed" && collapsedInspectorSections.includes("artifacts")) {
      toggleInspectorSection("artifacts");
    }
  }, [activeConversation?.lastRunStatus, collapsedInspectorSections, toggleInspectorSection]);

  useEffect(() => {
    if (activeConversation?.id && !activeConversation.id.startsWith("draft-")) {
      void refreshSessionDetails(activeConversation.id);
    } else {
      setApprovals([]);
      setArtifacts([]);
      setToolHistory([]);
      setCapabilities([]);
      setJobHistory([]);
      setMemoryStatus(null);
      setAvailableTools([]);
      setBrowserStatus(null);
      setWorkspaceState(null);
    }
  }, [activeConversation?.id, refreshSessionDetails]);

  useEffect(() => {
    const unsubscribers = [
      api().onChatDelta((delta: string) => {
        useChatStore.getState().appendDelta(delta);
      }),
      api().onChatThinking((delta: string) => {
        useChatStore.getState().appendThinking(delta);
      }),
      api().onChatToolResult((result: any) => {
        useChatStore.getState().addToolMessage({
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          content: result.content,
          phase: result.phase,
        });
      }),
      api().onChatDone(async (result: { sessionId?: string }) => {
        const sessionId = result.sessionId ?? useChatStore.getState().activeConversation?.id;
        useChatStore.getState().finishStreaming();
        if (sessionId) {
          useChatStore.getState().attachRemoteSession(sessionId);
          await useChatStore.getState().selectConversation(sessionId);
          await useChatStore.getState().loadConversations();
          await refreshSessionDetails(sessionId);
        }
      }),
      api().onChatError((message: string) => {
        useChatStore.getState().errorStreaming(message);
      }),
      api().onRunEvent((event: any) => {
        if (event.type === "phase") {
          useChatStore.getState().setActivePhase(event.phase);
          useChatStore.getState().setUiMode("agentic");
        }
        if (
          event.type === "approval_required" ||
          event.type === "approval_resolved" ||
          event.type === "artifact" ||
          event.type === "toolresult" ||
          event.type === "job_updated"
        ) {
          void refreshSessionDetails(event.sessionId ?? useChatStore.getState().activeConversation?.id);
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [refreshSessionDetails]);

  const getSelectedAgent = useCallback((): AgentConfig => {
    return useAgentStore.getState().getAgent(selectedAgentId) ?? DEFAULT_AGENT;
  }, [selectedAgentId]);

  const canRunSelectedModel = useMemo(() => {
    const modelRef =
      activeConversation?.model ||
      getSelectedAgent().model ||
      settings.defaultModelRef;
    const status = getProviderStatus(modelRef);
    return status?.authenticated !== false;
  }, [activeConversation?.model, getProviderStatus, getSelectedAgent, settings.defaultModelRef]);

  const buildSystemPrompt = useCallback((agent: AgentConfig) => {
    const skillsPrompt = useSkillStore.getState().buildSkillsPrompt(agent.skillIds);
    const parts = [agent.systemPrompt];
    if (settings.globalSystemPrompt.trim()) {
      parts.push(`Global instructions:\n${settings.globalSystemPrompt.trim()}`);
    }
    if (settings.fastMode) {
      parts.push("Fast mode is enabled. Prefer lower latency and concise execution.");
    }
    if (skillsPrompt) {
      parts.push(skillsPrompt);
    }
    return parts.join("\n\n---\n\n");
  }, [settings.fastMode, settings.globalSystemPrompt]);

  const handleNewChat = useCallback(async () => {
    const agent = getSelectedAgent();
    const nextContextId = selectedContextId || agent.projectContextId || "";
    if (nextContextId) {
      setActiveContextId(nextContextId);
    }
    createConversation(
      agent.model || settings.defaultModelRef,
      buildSystemPrompt(agent),
      agent.id,
      nextContextId || undefined,
    );
  }, [buildSystemPrompt, createConversation, getSelectedAgent, selectedContextId, setActiveContextId, settings.defaultModelRef]);

  const handleAgentSelect = useCallback((agent: AgentConfig) => {
    setSelectedAgentId(agent.id);
    if (activeConversation && activeConversation.messages.length === 0) {
      const nextContextId =
        activeConversation.projectContextId ||
        selectedContextId ||
        agent.projectContextId ||
        "";
      setSelectedContextId(nextContextId);
      if (nextContextId) {
        setActiveContextId(nextContextId);
      }
      patchActiveConversation({
        agentId: agent.id,
        projectContextId: nextContextId || undefined,
        model: agent.model || settings.defaultModelRef,
        systemPrompt: buildSystemPrompt(agent),
      });
    }
  }, [activeConversation, buildSystemPrompt, patchActiveConversation, selectedContextId, setActiveContextId, settings.defaultModelRef]);

  const handleContextSelect = useCallback(async (contextId: string) => {
    setSelectedContextId(contextId);
    setActiveContextId(contextId);

    const current = useChatStore.getState().activeConversation;
    if (!current) {
      return;
    }

    patchActiveConversation({
      projectContextId: contextId || undefined,
    });

    if (!current.id.startsWith("draft-")) {
      await api().sessions.patch(current.id, {
        projectContextId: contextId,
      });
    }
  }, [patchActiveConversation, setActiveContextId]);

  const handleSend = useCallback(async ({ message, attachments }: { message: string; attachments: PendingAttachment[] }) => {
    try {
      const agent = getSelectedAgent();
      const resolvedProjectContextId = selectedContextId || agent.projectContextId || undefined;
      let current =
        useChatStore.getState().activeConversation ??
        createConversation(
          agent.model || settings.defaultModelRef,
          buildSystemPrompt(agent),
          agent.id,
          resolvedProjectContextId,
        );

      if (attachments.length > 0 && current.id.startsWith("draft-")) {
        const createdSession = await api().sessions.create({
          title: current.title,
          modelRef: current.model,
          systemPrompt: current.systemPrompt,
          agentId: agent.id,
          projectContextId: current.projectContextId ?? resolvedProjectContextId,
        });
        attachRemoteSession(createdSession.sessionId);
        current = {
          ...current,
          id: createdSession.sessionId,
        };
      }

      const uploadedAttachments = current.id.startsWith("draft-")
        ? []
        : await Promise.all(
            attachments.map((attachment) =>
              api().attachments.upload({
                sessionId: current.id,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                bytesBase64: attachment.bytesBase64,
              }),
            ),
          );

      addUserMessage(message);
      const runResult = await api().startChat({
        sessionId: current.id.startsWith("draft-") ? undefined : current.id,
        title: current.title,
        agentId: agent.id,
        projectContextId: current.projectContextId ?? resolvedProjectContextId,
        modelRef: current.model,
        systemPrompt: current.systemPrompt,
        messages: [
          ...current.messages,
          {
            id: `pending-${Date.now()}`,
            role: "user",
            content: message,
            timestamp: Date.now(),
          },
        ],
        mcpServerIds: agent.mcpServerIds,
        attachments: uploadedAttachments,
      });

      if (!runResult?.ok) {
        throw new Error(runResult?.error ?? "Failed to start run.");
      }

      startStreaming(runResult.runId, runResult.uiMode ?? "agentic");
      setUiMode(runResult.uiMode ?? "agentic");
      if (runResult.sessionId) {
        attachRemoteSession(runResult.sessionId);
      }
      await loadConversations();
    } catch (error) {
      errorStreaming(error instanceof Error ? error.message : String(error));
    }
  }, [addUserMessage, attachRemoteSession, buildSystemPrompt, createConversation, errorStreaming, getSelectedAgent, loadConversations, selectedContextId, settings.defaultModelRef, startStreaming]);

  const handleWorkspaceSave = useCallback(async () => {
    if (!activeConversation || activeConversation.id.startsWith("draft-")) {
      return;
    }
    const nextWorkspace = await api().workspaces.setRoot({ sessionId: activeConversation.id, rootPath: workspaceInput });
    patchActiveConversation({ workspaceRoot: workspaceInput });
    setWorkspaceState(nextWorkspace);
    await refreshSessionDetails(activeConversation.id);
  }, [activeConversation, patchActiveConversation, refreshSessionDetails, workspaceInput]);

  const handleReindex = useCallback(async () => {
    if (!activeConversation || activeConversation.id.startsWith("draft-")) {
      return;
    }
    setWorkspaceState((current: any) => (current ? { ...current, status: "indexing" } : current));
    await api().workspaces.reindex(activeConversation.id);
    await refreshSessionDetails(activeConversation.id);
  }, [activeConversation, refreshSessionDetails]);

  const handleApproval = useCallback(async (approvalId: string, runId: string, approved: boolean) => {
    if (!runId) {
      return;
    }
    await api().runs.approve({ runId, approvalId, approved });
    if (activeConversation?.id) {
      await refreshSessionDetails(activeConversation.id);
    }
  }, [activeConversation?.id, refreshSessionDetails]);

  const openArtifact = useCallback(async (artifactId: string) => {
    const artifact = await api().artifacts.get(artifactId);
    setSelectedArtifactId(artifactId);
    setSelectedArtifactContent(
      artifact?.contentText ??
        JSON.stringify(
          {
            filePath: artifact?.filePath,
            metadata: artifact?.metadata,
          },
          null,
          2,
        ),
    );
  }, []);

  const handleBrowserReset = useCallback(async () => {
    if (!activeConversation || activeConversation.id.startsWith("draft-")) {
      return;
    }
    await api().browser.reset(activeConversation.id);
    await refreshSessionDetails(activeConversation.id);
  }, [activeConversation, refreshSessionDetails]);

  const pendingArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.artifactId === selectedArtifactId) ?? null,
    [artifacts, selectedArtifactId],
  );

  const recentArtifacts = useMemo(() => artifacts.slice(0, 8), [artifacts]);
  const browserArtifacts = useMemo(
    () => artifacts.filter((artifact) => ["screenshot", "dom_snapshot", "browser_log"].includes(artifact.type)).slice(0, 6),
    [artifacts],
  );
  const attachmentArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.type === "attachment").slice(0, 6),
    [artifacts],
  );
  const searchArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.type === "search_results").slice(0, 6),
    [artifacts],
  );
  const recentSources = useMemo(() => (memoryStatus?.recentSources ?? []).slice(0, 6), [memoryStatus]);
  const latestTools = useMemo(() => toolHistory.slice(0, 6), [toolHistory]);
  const visibleCapabilities = useMemo(() => capabilities.slice(0, 8), [capabilities]);
  const latestJobs = useMemo(() => jobHistory.slice(0, 6), [jobHistory]);
  const visibleTools = useMemo(() => availableTools.slice(0, 8), [availableTools]);
  const shouldShowInternal = showInternalPhases || settings.planMode || approvals.length > 0 || activeConversation?.lastRunStatus === "failed";
  const visibleMessages = useMemo(() => {
    if (!activeConversation) {
      return [];
    }
      return activeConversation.messages.filter((message) => {
        const isInternal =
          message.role === "system" ||
          message.kind === "assistant-toolcall" ||
          message.phase === "plan" ||
          message.phase === "review" ||
          message.phase === "repair";
      if (!isInternal) {
        return true;
      }
      return shouldShowInternal;
    });
  }, [activeConversation, shouldShowInternal]);

  const sessionMeta = useMemo(() => {
    if (!activeConversation) return null;
    return [
      { label: t("chat.console.sessionLabel"), value: activeConversation.id.startsWith("draft-") ? t("chat.console.draft") : activeConversation.id.slice(0, 8) },
      { label: t("chat.console.messagesLabel"), value: String(activeConversation.messages.length) },
      { label: t("chat.model"), value: activeConversation.model },
      { label: t("chat.console.runLabel"), value: activeRunId ? activeRunId.slice(0, 8) : activeConversation.lastRunId?.slice(0, 8) ?? t("chat.console.none") },
    ];
  }, [activeConversation, activeRunId, t]);

  const translateStatus = useCallback(
    (status?: string) => {
      if (!status) return "";
      return t(`chat.console.statuses.${status}`, status);
    },
    [t],
  );

  return (
    <div className="flex flex-1 min-h-0 bg-[radial-gradient(circle_at_top_left,rgba(74,222,128,0.06),transparent_32%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.07),transparent_36%)]">
      <aside className="w-56 border-r border-border bg-bg-secondary/88 backdrop-blur flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-secondary">{t("chat.console.sessionsTitle")}</div>
            <div className="text-xs text-text-secondary/60 mt-1">{t("chat.console.sessionsSubtitle")}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleNewChat}>
            <Plus size={12} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            activeId={activeConversation?.id}
            onSelect={selectConversation}
            onDelete={deleteConversation}
          />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="border-b border-border bg-bg-primary/70 backdrop-blur">
            <div className="px-5 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AgentSelector selectedAgentId={selectedAgentId} onSelect={handleAgentSelect} />
                    <ContextSelector selectedContextId={selectedContextId} onSelect={(contextId) => void handleContextSelect(contextId)} />
                    {activeConversation?.lastRunStatus && (
                      <Badge
                        color={
                          activeConversation.lastRunStatus === "completed"
                            ? "green"
                            : activeConversation.lastRunStatus === "failed"
                              ? "red"
                              : activeConversation.lastRunStatus === "awaiting_approval"
                                ? "orange"
                                : "blue"
                        }
                      >
                        {translateStatus(activeConversation.lastRunStatus)}
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-2 text-[18px] leading-none font-semibold text-text-primary truncate">
                    {activeConversation?.title ?? t("chat.console.defaultTitle")}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {sessionMeta?.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border bg-bg-secondary/60 px-2 py-1 min-w-[60px]">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{item.label}</div>
                      <div className="mt-0.5 text-[12px] text-text-primary">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                {uiMode === "agentic" ? (
                  <div className="flex-1">
                    <PhaseRail activePhase={activePhase ?? activeConversation?.lastRunPhase} />
                  </div>
                ) : (
                  <div />
                )}
                {uiMode === "agentic" && (
                  <Button variant="ghost" size="sm" onClick={() => setShowInternalPhases(!showInternalPhases)}>
                    {shouldShowInternal ? "Ocultar detalhes" : "Mostrar detalhes"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {activeConversation ? (
            <>
              <div className="flex-1 min-h-0 flex flex-col bg-[linear-gradient(180deg,rgba(17,17,17,0.28),rgba(10,10,10,0.04))]">
                <MessageList
                  messages={visibleMessages}
                  streaming={streaming}
                  streamingText={streamingText}
                  thinkingText={thinkingText}
                />
              </div>
              <div className="border-t border-border bg-bg-primary/92">
                <ChatInput
                  onSend={(message) => void handleSend(message)}
                  onAbort={abortStreaming}
                  disabled={!canRunSelectedModel || streaming}
                  streaming={streaming}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="text-text-secondary/40 text-sm">{t("chat.emptyState")}</div>
              <Button variant="secondary" onClick={handleNewChat}>
                <Plus size={14} />
                {t("chat.newConversation")}
              </Button>
            </div>
          )}
        </div>

        <aside className="w-[300px] border-l border-border bg-bg-secondary/78 backdrop-blur overflow-y-auto shrink-0">
          <div className="p-4 space-y-4">
            <SectionCard
              title={t("chat.console.workspaceTitle")}
              icon={<FolderRoot size={14} />}
              aside={
                workspaceState?.status ? (
                  <Badge
                    color={
                      workspaceState.status === "ready"
                        ? "green"
                        : workspaceState.status === "error"
                          ? "red"
                          : workspaceState.status === "indexing"
                            ? "blue"
                            : "gray"
                    }
                  >
                    {translateStatus(workspaceState.status)}
                  </Badge>
                ) : undefined
              }
            >
              <div className="space-y-3">
                <input
                  value={workspaceInput}
                  onChange={(event) => setWorkspaceInput(event.target.value)}
                  onBlur={() => void handleWorkspaceSave()}
                  placeholder={t("chat.console.workspacePlaceholder")}
                  className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none"
                />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{t("chat.console.filesLabel")}</div>
                    <div className="mt-1 text-text-primary">{workspaceState?.fileCount ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{t("chat.console.chunksLabel")}</div>
                    <div className="mt-1 text-text-primary">{workspaceState?.chunkCount ?? 0}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => void handleWorkspaceSave()}>
                    <FolderRoot size={12} />
                    {t("chat.console.saveRoot")}
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => void handleReindex()}>
                    <RefreshCw size={12} />
                    {t("chat.console.reindex")}
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Browser"
              icon={<Globe size={14} />}
              aside={
                browserStatus?.status ? (
                  <Badge
                    color={
                      browserStatus.status === "ready"
                        ? "green"
                        : browserStatus.status === "error"
                          ? "red"
                          : browserStatus.status === "launching"
                            ? "blue"
                            : "gray"
                    }
                  >
                    {translateStatus(browserStatus.status)}
                  </Badge>
                ) : undefined
              }
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">Current URL</div>
                  <div className="mt-1 text-xs text-text-primary break-all">
                    {browserStatus?.currentUrl ?? "No active page"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">Browser artifacts</div>
                    <div className="mt-1 text-text-primary">{browserArtifacts.length}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">Last activity</div>
                    <div className="mt-1 text-text-primary">
                      {browserStatus?.lastActivityAt ? new Date(browserStatus.lastActivityAt).toLocaleTimeString() : "—"}
                    </div>
                  </div>
                </div>
                <Button variant="secondary" size="sm" className="w-full" onClick={() => void handleBrowserReset()}>
                  <RefreshCw size={12} />
                  Reset browser session
                </Button>
                {browserArtifacts.length > 0 && (
                  <div className="space-y-2">
                    {browserArtifacts.map((artifact) => (
                      <button
                        key={artifact.artifactId}
                        onClick={() => void openArtifact(artifact.artifactId)}
                        className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-left cursor-pointer hover:bg-white/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-text-primary truncate">{artifact.label}</div>
                          <Badge color="gray">{artifact.type}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title={t("chat.console.executionTitle")}
              icon={<PlayCircle size={14} />}
              aside={activePhase ? <Badge color="blue">{t(`chat.console.phases.${activePhase}`, activePhase)}</Badge> : undefined}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{t("chat.console.approvalsLabel")}</div>
                  <div className="mt-1 text-text-primary">{approvals.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{t("chat.console.artifactsLabel")}</div>
                  <div className="mt-1 text-text-primary">{artifacts.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{t("chat.console.toolsLabel")}</div>
                  <div className="mt-1 text-text-primary">{toolHistory.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">Jobs</div>
                  <div className="mt-1 text-text-primary">{jobHistory.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">{t("chat.console.modeLabel")}</div>
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {settings.planMode && <Badge color="blue">{t("statusBar.plan")}</Badge>}
                    {settings.fastMode && <Badge color="orange">{t("statusBar.fast")}</Badge>}
                    {!settings.planMode && !settings.fastMode && <Badge color="gray">{t("chat.console.normalMode")}</Badge>}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={t("chat.console.pendingApprovalsTitle")}
              icon={<ShieldAlert size={14} />}
              aside={approvals.length > 0 ? <Badge color="orange">{approvals.length}</Badge> : undefined}
              collapsible
              collapsed={collapsedInspectorSections.includes("approvals")}
              onToggle={() => toggleInspectorSection("approvals")}
            >
              {approvals.length === 0 ? (
                <div className="text-xs text-text-secondary/60">{t("chat.console.noApprovals")}</div>
              ) : (
                <div className="space-y-3">
                  {approvals.map((approval) => (
                    <div key={approval.approvalId} className="rounded-xl border border-border bg-bg-primary p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-text-primary">{approval.toolName}</div>
                        <Badge color={approval.riskLevel === "high" ? "red" : "orange"}>
                          {approval.riskLevel}
                        </Badge>
                      </div>
                      <div className="mt-2 text-[11px] text-text-secondary leading-relaxed">
                        {approval.reason}
                      </div>
                      <pre className="mt-2 rounded-lg border border-border bg-bg-secondary p-2 text-[10px] text-text-secondary whitespace-pre-wrap">
                        {JSON.stringify(approval.request, null, 2)}
                      </pre>
                      <div className="mt-3 flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => void handleApproval(approval.approvalId, approval.runId, true)}>
                          {t("chat.console.approve")}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void handleApproval(approval.approvalId, approval.runId, false)}>
                          {t("chat.console.reject")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Jobs recentes"
              icon={<ListTodo size={14} />}
              aside={latestJobs.length > 0 ? <Badge color="gray">{latestJobs.length}</Badge> : undefined}
            >
              {latestJobs.length === 0 ? (
                <div className="text-xs text-text-secondary/60">Nenhum job recente.</div>
              ) : (
                <div className="space-y-2">
                  {latestJobs.map((job) => (
                    <div key={job.jobId} className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary">{job.kind}</div>
                        <Badge
                          color={
                            job.status === "completed"
                              ? "green"
                              : job.status === "failed" || job.status === "aborted"
                                ? "red"
                                : "blue"
                          }
                        >
                          {translateStatus(job.status)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {job.scopeType}:{String(job.scopeId).slice(0, 8)}
                      </div>
                      {job.resultSummary && (
                        <div className="mt-1 text-[11px] text-text-secondary line-clamp-2">{job.resultSummary}</div>
                      )}
                      {job.error && (
                        <div className="mt-1 text-[11px] text-red-300/80 line-clamp-2">{job.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Memória"
              icon={<Database size={14} />}
              aside={
                memoryStatus?.sourceCount ? <Badge color="blue">{memoryStatus.sourceCount}</Badge> : undefined
              }
            >
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">Sources</div>
                  <div className="mt-1 text-text-primary">{memoryStatus?.sourceCount ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">Index jobs</div>
                  <div className="mt-1 text-text-primary">{memoryStatus?.jobs?.length ?? 0}</div>
                </div>
              </div>
              {memoryStatus?.recentSources?.length ? (
                <div className="mt-3 space-y-2">
                  {memoryStatus.recentSources.map((source: any) => (
                    <div key={source.sourceId} className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                      <div className="text-xs text-text-primary truncate">{source.title}</div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {source.sourceType} {source.path ? `• ${source.path}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-text-secondary/60">Nenhuma fonte indexada ainda.</div>
              )}
            </SectionCard>

            <SectionCard
              title="Anexos"
              icon={<Hammer size={14} />}
              aside={attachmentArtifacts.length > 0 ? <Badge color="gray">{attachmentArtifacts.length}</Badge> : undefined}
            >
              {attachmentArtifacts.length === 0 ? (
                <div className="text-xs text-text-secondary/60">Nenhum anexo recente.</div>
              ) : (
                <div className="space-y-2">
                  {attachmentArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      onClick={() => void openArtifact(artifact.artifactId)}
                      className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-left cursor-pointer hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary truncate">{artifact.label}</div>
                        <Badge color="gray">attachment</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Fontes recentes"
              icon={<Database size={14} />}
              aside={recentSources.length > 0 ? <Badge color="gray">{recentSources.length}</Badge> : undefined}
            >
              {recentSources.length === 0 ? (
                <div className="text-xs text-text-secondary/60">Nenhuma fonte recente.</div>
              ) : (
                <div className="space-y-2">
                  {recentSources.map((source: any) => (
                    <div key={source.sourceId} className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                      <div className="text-xs text-text-primary truncate">{source.title}</div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {source.sourceType} {source.path ? `• ${source.path}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={t("chat.console.toolActivityTitle")}
              icon={<Wrench size={14} />}
              aside={latestTools.length > 0 ? <Badge color="gray">{latestTools.length}</Badge> : undefined}
              collapsible
              collapsed={collapsedInspectorSections.includes("tools")}
              onToggle={() => toggleInspectorSection("tools")}
            >
              {latestTools.length === 0 ? (
                <div className="text-xs text-text-secondary/60">{t("chat.console.noToolActivity")}</div>
              ) : (
                <div className="space-y-2">
                  {latestTools.map((tool) => (
                    <div key={tool.toolCallId} className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary">{tool.toolName}</div>
                        <Badge
                          color={
                            tool.status === "completed"
                              ? "green"
                              : tool.status === "error" || tool.status === "rejected"
                                ? "red"
                                : tool.status === "awaiting_approval"
                                  ? "orange"
                                  : "blue"
                          }
                        >
                          {translateStatus(tool.status)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {tool.source} {tool.serverName ? `• ${tool.serverName}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Capacidades"
              icon={<Wrench size={14} />}
              aside={visibleCapabilities.length > 0 ? <Badge color="gray">{visibleCapabilities.length}</Badge> : undefined}
            >
              {visibleCapabilities.length === 0 ? (
                <div className="text-xs text-text-secondary/60">Nenhuma capacidade derivada.</div>
              ) : (
                <div className="space-y-2">
                  {visibleCapabilities.map((capability) => (
                    <div key={capability.capabilityId} className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary">{capability.label}</div>
                        <Badge color={capability.requiresApproval ? "orange" : "green"}>
                          {capability.requiresApproval ? "approval" : "ready"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {capability.description}
                      </div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {capability.toolNames.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Tools disponíveis"
              icon={<Wrench size={14} />}
              aside={visibleTools.length > 0 ? <Badge color="gray">{visibleTools.length}</Badge> : undefined}
            >
              {visibleTools.length === 0 ? (
                <div className="text-xs text-text-secondary/60">Nenhuma tool registrada.</div>
              ) : (
                <div className="space-y-2">
                  {visibleTools.map((tool) => (
                    <div key={tool.publicName} className="rounded-xl border border-border bg-bg-primary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary">{tool.publicName}</div>
                        <Badge color={tool.requiresApprovalNow ? "orange" : "green"}>
                          {tool.requiresApprovalNow ? "approval" : "ready"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-text-secondary/55">
                        {tool.source} {tool.serverName ? `• ${tool.serverName}` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(tool.metadata?.capabilities ?? []).slice(0, 4).map((capability: string) => (
                          <Badge key={capability} color="gray">{capability}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={t("chat.console.artifactsTitle")}
              icon={<Hammer size={14} />}
              aside={recentArtifacts.length > 0 ? <Badge color="gray">{recentArtifacts.length}</Badge> : undefined}
              collapsible
              collapsed={collapsedInspectorSections.includes("artifacts")}
              onToggle={() => toggleInspectorSection("artifacts")}
            >
              {recentArtifacts.length === 0 ? (
                <div className="text-xs text-text-secondary/60">{t("chat.console.noArtifacts")}</div>
              ) : (
                <div className="space-y-2">
                  {recentArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      onClick={() => void openArtifact(artifact.artifactId)}
                      className={`w-full rounded-xl border px-3 py-2 text-left cursor-pointer transition-colors ${
                        selectedArtifactId === artifact.artifactId
                          ? "border-accent-blue/30 bg-accent-blue/10"
                          : "border-border bg-bg-primary hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary truncate">{artifact.label}</div>
                        <Badge color="gray">{artifact.type}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedArtifactId && (
                <div className="mt-3 rounded-xl border border-border bg-bg-primary">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <div className="text-xs text-text-primary truncate">
                      {pendingArtifact?.label ?? t("chat.console.artifactPreview")}
                    </div>
                    {pendingArtifact?.type && <Badge color="blue">{pendingArtifact.type}</Badge>}
                  </div>
                  <pre className="max-h-64 overflow-auto p-3 text-[11px] text-text-secondary whitespace-pre-wrap">
                    {selectedArtifactContent}
                  </pre>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Search artifacts"
              icon={<Hammer size={14} />}
              aside={searchArtifacts.length > 0 ? <Badge color="gray">{searchArtifacts.length}</Badge> : undefined}
            >
              {searchArtifacts.length === 0 ? (
                <div className="text-xs text-text-secondary/60">Nenhum resultado de busca recente.</div>
              ) : (
                <div className="space-y-2">
                  {searchArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      onClick={() => void openArtifact(artifact.artifactId)}
                      className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-left cursor-pointer hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-primary truncate">{artifact.label}</div>
                        <Badge color="gray">{artifact.type}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={t("chat.console.timingTitle")}
              icon={<Clock3 size={14} />}
              collapsible
              collapsed={collapsedInspectorSections.includes("timing")}
              onToggle={() => toggleInspectorSection("timing")}
            >
              <div className="space-y-2 text-xs text-text-secondary">
                <div className="flex items-center justify-between gap-2">
                  <span>{t("chat.console.updatedLabel")}</span>
                  <span className="text-text-primary">
                    {activeConversation ? new Date(activeConversation.updatedAt).toLocaleTimeString() : t("chat.console.na")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{t("chat.console.contextBudgetLabel")}</span>
                  <span className="text-text-primary">{settings.compactAtTokens.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{t("chat.console.workspaceLabel")}</span>
                  <span className="text-text-primary truncate max-w-[180px]">
                    {activeConversation?.workspaceRoot?.split(/[\\/]/).pop() ?? t("chat.console.none")}
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        </aside>
      </div>
    </div>
  );
}
