import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Play, Square, ExternalLink } from "lucide-react";
import { DEFAULT_AGENT, useAgentStore } from "../../stores/agentStore";
import { useSubagentStore } from "../../stores/subagentStore";
import { setRoute } from "../../router";
import Button from "../shared/Button";
import Badge from "../shared/Badge";
import { TextArea } from "../shared/Input";

function statusColor(status: string): "green" | "blue" | "orange" | "red" | "gray" {
  switch (status) {
    case "completed":
      return "green";
    case "running":
      return "blue";
    case "queued":
      return "orange";
    case "failed":
    case "aborted":
      return "red";
    default:
      return "gray";
  }
}

export default function SubagentPanel() {
  const { t } = useTranslation();
  const { loaded: agentsLoaded, loadAgents } = useAgentStore();
  const persistedAgents = useAgentStore((state) => state.agents);
  const { subagents, loaded, loading, loadSubagents, spawnSubagent, cancelSubagent } = useSubagentStore();

  const allAgents = useMemo(() => [DEFAULT_AGENT, ...persistedAgents], [persistedAgents]);
  const agentNameById = useMemo(
    () => new Map(allAgents.map((agent) => [agent.id, agent.name])),
    [allAgents],
  );

  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("__default__");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!agentsLoaded) {
      void loadAgents();
    }
  }, [agentsLoaded, loadAgents]);

  useEffect(() => {
    if (!loaded) {
      void loadSubagents({ limit: 12 });
    }
    const interval = window.setInterval(() => {
      void loadSubagents({ limit: 12 });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loaded, loadSubagents]);

  useEffect(() => {
    const unsubscribe = (window as any).codexAgent?.onRunEvent?.((event: { type?: string }) => {
      if (!event?.type || ["text_delta", "thinking_delta", "toolcall", "toolresult"].includes(event.type)) {
        return;
      }
      void loadSubagents({ limit: 12 });
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [loadSubagents]);

  async function handleSpawn() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError(t("agents.subagentsPromptRequired", "Descreva a tarefa do subagente."));
      return;
    }

    setBusy(true);
    setError("");
    try {
      await spawnSubagent({
        prompt: trimmedPrompt,
        agentId: agentId === "__default__" ? undefined : agentId,
        requestedBy: "user",
      });
      setPrompt("");
    } catch (spawnError) {
      setError(spawnError instanceof Error ? spawnError.message : String(spawnError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-text-primary">
            {t("agents.subagentsTitle", "Subagentes")}
          </h2>
          <p className="mt-1 text-xs text-text-secondary/70">
            {t(
              "agents.subagentsDescription",
              "Dispare execucoes paralelas em background e acompanhe o status aqui.",
            )}
          </p>
        </div>
        <Badge color="gray">
          {loading ? t("common.loading", "Carregando") : `${subagents.length} ${t("agents.subagentsCount", "recentes")}`}
        </Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">
            {t("agents.subagentsAgent", "Agente")}
          </label>
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
          >
            {allAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <TextArea
          label={t("agents.subagentsPrompt", "Tarefa")}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t(
            "agents.subagentsPromptPlaceholder",
            "Ex.: revisar o plano da sprint e listar riscos de entrega.",
          )}
          className="min-h-24"
        />

        <div className="flex items-end">
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSpawn()}
            disabled={busy}
            className="w-full lg:w-auto"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {t("agents.subagentsSpawn", "Executar")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {subagents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-text-secondary">
            {t("agents.subagentsEmpty", "Nenhum subagente executado ainda.")}
          </div>
        ) : (
          subagents.map((subagent) => (
            <div
              key={subagent.id}
              className="rounded-lg border border-border bg-bg-primary/40 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {subagent.title}
                    </span>
                    <Badge color={statusColor(subagent.status)}>{subagent.status}</Badge>
                    {subagent.agentId && (
                      <Badge color="gray">
                        {agentNameById.get(subagent.agentId) ?? subagent.agentId}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-text-secondary/70">
                    {new Date(subagent.createdAt).toLocaleString()}
                    {subagent.phase ? ` · ${subagent.phase}` : ""}
                    {subagent.requestedBy === "agent" ? ` · ${t("agents.subagentsRequestedByAgent", "delegado pelo agente")}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {subagent.sessionId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRoute("chat", subagent.sessionId)}
                    >
                      <ExternalLink size={13} />
                      {t("agents.subagentsOpenSession", "Abrir sessao")}
                    </Button>
                  )}
                  {(subagent.status === "queued" || subagent.status === "running") && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void cancelSubagent(subagent.id)}
                    >
                      <Square size={13} />
                      {t("agents.subagentsCancel", "Cancelar")}
                    </Button>
                  )}
                </div>
              </div>

              <p className="mt-2 text-xs text-text-secondary line-clamp-2">
                {subagent.prompt}
              </p>

              {subagent.resultText && (
                <div className="mt-2 rounded-md bg-white/5 px-3 py-2 text-xs text-text-primary/85 line-clamp-3">
                  {subagent.resultText}
                </div>
              )}

              {subagent.error && (
                <div className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300 line-clamp-3">
                  {subagent.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
