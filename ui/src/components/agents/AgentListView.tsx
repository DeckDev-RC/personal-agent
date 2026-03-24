import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Bot, Pencil, Trash2 } from "lucide-react";
import { useAgentStore, DEFAULT_AGENT, type AgentConfig } from "../../stores/agentStore";
import Button from "../shared/Button";
import Badge from "../shared/Badge";
import AgentEditor from "./AgentEditor";
import SubagentPanel from "./SubagentPanel";

export default function AgentListView() {
  const { t } = useTranslation();
  const { loaded, loadAgents, deleteAgent } = useAgentStore();
  const persistedAgents = useAgentStore((s) => s.agents);
  const allAgents = [DEFAULT_AGENT, ...persistedAgents];

  const [editing, setEditing] = useState<AgentConfig | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loaded) loadAgents();
  }, [loaded, loadAgents]);

  function handleEdit(agent: AgentConfig) {
    if (agent.id === "__default__") return;
    setEditing(agent);
  }

  function handleDelete(agent: AgentConfig) {
    if (agent.id === "__default__") return;
    deleteAgent(agent.id);
  }

  if (editing || creating) {
    return (
      <AgentEditor
        agent={editing ?? undefined}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-text-primary">{t("agents.title")}</h1>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            {t("agents.create")}
          </Button>
        </div>

        <div className="mb-4">
          <SubagentPanel />
        </div>

        {allAgents.length === 0 ? (
          <div className="text-center py-12 text-text-secondary text-sm">
            {t("agents.noAgents")}
          </div>
        ) : (
          <div className="grid gap-3">
            {allAgents.map((agent) => {
              const isDefault = agent.id === "__default__";
              return (
                <div
                  key={agent.id}
                  className="group flex items-start gap-4 rounded-xl border border-border bg-bg-secondary p-4 hover:border-white/10 transition-colors"
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center mt-0.5">
                    <Bot size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {agent.name}
                      </span>
                      {isDefault && <Badge color="blue">padrão</Badge>}
                      <Badge color="gray">{agent.model}</Badge>
                    </div>
                    {agent.description && (
                      <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] text-text-secondary/50 truncate font-mono">
                      {agent.systemPrompt.slice(0, 100)}...
                    </p>
                  </div>
                  {!isDefault && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleEdit(agent)}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(agent)}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
