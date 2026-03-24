import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RouteView } from "../../router";
import { setRoute } from "../../router";
import { resolveAgentModel } from "../../../../src/settings/resolveAgentModel.js";
import { DEFAULT_AGENT, useAgentStore, type AgentConfig } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useContextStore } from "../../stores/contextStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSkillStore, type Skill } from "../../stores/skillStore";
import { useTaskStore } from "../../stores/taskStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import {
  buildCommandRegistry,
  scoreCommand,
  type CommandPaletteCommand,
} from "../../services/commandRegistry";
import type { NavView } from "./Sidebar";

function normalizeEmbeddedPrompt(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^---\s*\n*/i, "").trim();
}

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: NavView) => void;
  onNewChat: () => void;
  onSwitchLanguage: () => void;
};

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNewChat,
  onSwitchLanguage,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const settings = useSettingsStore((state) => state.settings);

  const { agents, loaded: agentsLoaded, loadAgents } = useAgentStore();
  const { skills, loaded: skillsLoaded, loadSkills, buildSkillsPrompt } = useSkillStore();
  const { workflows, loaded: workflowsLoaded, loadWorkflows, runWorkflow } = useWorkflowStore();
  const { conversations, loadConversations, createConversation } = useChatStore();
  const {
    contexts,
    loaded: contextsLoaded,
    loadContexts,
    activeContextId,
    setActiveContextId,
  } = useContextStore();
  const createTask = useTaskStore((state) => state.createTask);
  const searchKnowledge = useKnowledgeStore((state) => state.search);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setSelectedIdx(0);
    window.setTimeout(() => inputRef.current?.focus(), 40);

    if (!agentsLoaded) {
      void loadAgents();
    }
    if (!skillsLoaded) {
      void loadSkills();
    }
    if (!workflowsLoaded) {
      void loadWorkflows();
    }
    if (!contextsLoaded) {
      void loadContexts();
    }
    void loadConversations();
  }, [
    agentsLoaded,
    contextsLoaded,
    loadAgents,
    loadContexts,
    loadConversations,
    loadSkills,
    loadWorkflows,
    open,
    skillsLoaded,
    workflowsLoaded,
  ]);

  function navigate(view: RouteView, param?: string) {
    if (param) {
      setRoute(view, param);
      return;
    }
    onNavigate(view as NavView);
  }

  function buildAgentSystemPrompt(agent: AgentConfig): string {
    const parts = [agent.systemPrompt];

    if (settings.globalSystemPrompt.trim()) {
      parts.push(`Global instructions:\n${settings.globalSystemPrompt.trim()}`);
    }

    if (settings.fastMode) {
      parts.push("Fast mode is enabled. Prefer lower latency and concise execution.");
    }

    const skillsPrompt = normalizeEmbeddedPrompt(buildSkillsPrompt(agent.skillIds));
    if (skillsPrompt) {
      parts.push(skillsPrompt);
    }

    return parts.join("\n\n---\n\n");
  }

  function buildSkillSystemPrompt(skill: Skill): string {
    const parts = [DEFAULT_AGENT.systemPrompt];

    if (settings.globalSystemPrompt.trim()) {
      parts.push(`Global instructions:\n${settings.globalSystemPrompt.trim()}`);
    }

    if (settings.fastMode) {
      parts.push("Fast mode is enabled. Prefer lower latency and concise execution.");
    }

    parts.push(`## Skill: ${skill.name}\n${skill.content.trim()}`);

    return parts.join("\n\n---\n\n");
  }

  function startAgentChat(agent: AgentConfig) {
    const projectContextId = activeContextId || agent.projectContextId || "";
    if (projectContextId) {
      setActiveContextId(projectContextId);
    }

    createConversation(
      resolveAgentModel(agent, settings.defaultModelRef),
      buildAgentSystemPrompt(agent),
      agent.id,
      projectContextId || undefined,
    );
    navigate("chat");
  }

  function startSkillChat(skill: Skill) {
    createConversation(
      settings.defaultModelRef,
      buildSkillSystemPrompt(skill),
      DEFAULT_AGENT.id,
      activeContextId || undefined,
    );
    navigate("chat");
  }

  const commands = useMemo(
    () =>
      buildCommandRegistry({
        t,
        query,
        agents: [DEFAULT_AGENT, ...agents],
        skills,
        workflows,
        contexts,
        conversations,
        settings,
        activeContextId,
        navigate,
        startNewChat: onNewChat,
        switchLanguage: onSwitchLanguage,
        startAgentChat,
        startSkillChat,
        activateContext: (contextId) => {
          setActiveContextId(contextId);
        },
        runWorkflow: async (workflowId) => {
          await runWorkflow(workflowId);
          navigate("workflows");
        },
        searchKnowledge: async (nextQuery) => {
          await searchKnowledge({
            query: nextQuery,
            limit: 16,
            projectContextId: activeContextId || undefined,
          });
          navigate("knowledge");
        },
        createTask: async (title) => {
          await createTask({
            title,
            status: "backlog",
            projectContextId: activeContextId || undefined,
            source: "command-palette",
          });
          navigate("tasks");
        },
        openSession: (sessionId) => {
          navigate("chat", sessionId);
        },
      }),
    [
      activeContextId,
      agents,
      contexts,
      conversations,
      createTask,
      createConversation,
      onNewChat,
      onSwitchLanguage,
      query,
      runWorkflow,
      searchKnowledge,
      settings,
      skills,
      startAgentChat,
      workflows,
      t,
    ],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }

    return commands
      .map((command) => ({
        command,
        score: scoreCommand(command, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.command.label.localeCompare(right.command.label))
      .map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered.length, query]);

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }

    const items = listRef.current.querySelectorAll("[data-command-item]");
    items[selectedIdx]?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIdx]);

  async function executeCommand(command: CommandPaletteCommand) {
    setExecutingId(command.id);
    onClose();

    try {
      await command.action();
    } finally {
      setExecutingId(null);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIdx((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIdx((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter" && filtered[selectedIdx]) {
        event.preventDefault();
        void executeCommand(filtered[selectedIdx]);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, onClose, open, selectedIdx]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-bg-secondary shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              "commandPalette.placeholder",
              "Buscar acoes, skills, workflows, agentes, contextos ou digite um texto para criar task/busca...",
            )}
            className="w-full bg-transparent text-sm text-text-primary placeholder-text-secondary/50 outline-none"
          />
          <div className="mt-2 text-[11px] text-text-secondary/60">
            {t(
              "commandPalette.hint",
              "Enter executa. Use o texto digitado para buscar na base ou criar uma tarefa rapidamente.",
            )}
          </div>
        </div>

        <div ref={listRef} className="max-h-[70vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-secondary">{t("common.noResults")}</div>
          ) : (
            filtered.map((command, index) => {
              const selected = index === selectedIdx;
              const busy = executingId === command.id;

              return (
                <button
                  key={command.id}
                  type="button"
                  data-command-item
                  disabled={Boolean(executingId)}
                  onClick={() => void executeCommand(command)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    selected
                      ? "bg-white/8 text-text-primary"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  } ${executingId && !busy ? "opacity-60" : ""}`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5">
                    <command.icon size={15} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">{command.label}</span>
                      <span className="rounded-full border border-border bg-bg-primary px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-secondary/60">
                        {command.group}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-text-secondary/70">
                      {command.description}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
