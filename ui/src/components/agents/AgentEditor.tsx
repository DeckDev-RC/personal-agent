import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, Zap, Check } from "lucide-react";
import { useAgentStore, type AgentConfig } from "../../stores/agentStore";
import { useContextStore } from "../../stores/contextStore";
import { useSkillStore, type Skill } from "../../stores/skillStore";
import { useMcpStore, type McpServerConfig } from "../../stores/mcpStore";
import { useSettingsStore } from "../../stores/settingsStore";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { TextArea } from "../shared/Input";
import Badge from "../shared/Badge";
import Select from "../shared/Select";

type AgentEditorProps = {
  agent?: AgentConfig;
  onClose: () => void;
};

function SkillPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { skills, loaded, loadSkills } = useSkillStore();

  useEffect(() => {
    if (!loaded) loadSkills();
  }, [loaded, loadSkills]);

  if (skills.length === 0) {
    return (
      <p className="text-xs text-text-secondary/50">{t("skills.noSkills")}</p>
    );
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {skills.map((skill) => {
        const selected = selectedIds.includes(skill.id);
        return (
          <button
            key={skill.id}
            type="button"
            onClick={() => toggle(skill.id)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-left cursor-pointer transition-colors border ${
              selected
                ? "border-accent-blue/30 bg-accent-blue/8 text-text-primary"
                : "border-border bg-bg-tertiary text-text-secondary hover:border-white/10"
            }`}
          >
            <div
              className={`shrink-0 w-4 h-4 rounded flex items-center justify-center ${
                selected ? "bg-accent-blue text-black" : "bg-white/5 border border-border"
              }`}
            >
              {selected && <Check size={10} />}
            </div>
            <Zap size={12} className="text-accent-orange shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="truncate">{skill.name}</span>
              {skill.description && (
                <span className="text-text-secondary/50 ml-1.5">— {skill.description}</span>
              )}
            </div>
            <Badge color={skill.type === "prompt" ? "blue" : "orange"}>{skill.type}</Badge>
          </button>
        );
      })}
    </div>
  );
}

function McpPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { servers, loaded, loadServers } = useMcpStore();

  useEffect(() => {
    if (!loaded) loadServers();
  }, [loaded, loadServers]);

  if (servers.length === 0) {
    return <p className="text-xs text-text-secondary/50">{t("mcp.noServers")}</p>;
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((serverId) => serverId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {servers.map((server) => {
        const selected = selectedIds.includes(server.id);
        return (
          <button
            key={server.id}
            type="button"
            onClick={() => toggle(server.id)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-left cursor-pointer transition-colors border ${
              selected
                ? "border-accent-green/30 bg-accent-green/8 text-text-primary"
                : "border-border bg-bg-tertiary text-text-secondary hover:border-white/10"
            }`}
          >
            <div
              className={`shrink-0 w-4 h-4 rounded flex items-center justify-center ${
                selected ? "bg-accent-green text-black" : "bg-white/5 border border-border"
              }`}
            >
              {selected && <Check size={10} />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="truncate">{server.name}</span>
              <span className="text-text-secondary/50 ml-1.5">{server.type}</span>
            </div>
            <Badge color={server.type === "stdio" ? "blue" : "orange"}>{server.type}</Badge>
          </button>
        );
      })}
    </div>
  );
}

export default function AgentEditor({ agent, onClose }: AgentEditorProps) {
  const { t } = useTranslation();
  const { createAgent, updateAgent } = useAgentStore();
  const { contexts, loaded: contextsLoaded, loadContexts } = useContextStore();
  const defaultModelRef = useSettingsStore((state) => state.settings.defaultModelRef);
  const isNew = !agent;

  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    agent?.systemPrompt ?? "You are a helpful assistant.",
  );
  const [model, setModel] = useState(agent?.model ?? defaultModelRef);
  const [skillIds, setSkillIds] = useState<string[]>(agent?.skillIds ?? []);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(agent?.mcpServerIds ?? []);
  const [projectContextId, setProjectContextId] = useState(agent?.projectContextId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contextsLoaded) {
      void loadContexts();
    }
  }, [contextsLoaded, loadContexts]);

  useEffect(() => {
    if (!agent) {
      setModel(defaultModelRef);
    }
  }, [agent, defaultModelRef]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        await createAgent({
          name: name.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          model: model.trim(),
          skillIds,
          mcpServerIds,
          projectContextId: projectContextId || undefined,
        });
      } else {
        await updateAgent({
          ...agent,
          name: name.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          model: model.trim(),
          skillIds,
          mcpServerIds,
          projectContextId: projectContextId || undefined,
          updatedAt: Date.now(),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {isNew ? t("agents.create") : t("agents.edit")}
          </h1>
        </div>

        <div className="space-y-5">
          <Input
            label={t("agents.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Code Reviewer, Escritor, Pesquisador..."
          />

          <Input
            label={t("agents.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descrição do que este agente faz..."
          />

          <Input
            label={t("agents.model")}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={defaultModelRef}
          />

          <Select
            label={t("agents.projectContext")}
            value={projectContextId}
            onChange={setProjectContextId}
            options={[
              { value: "", label: t("contexts.none") },
              ...contexts.map((projectContext) => ({
                value: projectContext.id,
                label: projectContext.name,
              })),
            ]}
          />

          <TextArea
            label={t("agents.systemPrompt")}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Instruções que definem o comportamento do agente..."
            className="min-h-48 font-mono text-xs leading-relaxed"
          />

          {/* Skills selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">
              {t("agents.skills")}
            </label>
            <SkillPicker selectedIds={skillIds} onChange={setSkillIds} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">
              {t("agents.mcpServers")}
            </label>
            <McpPicker selectedIds={mcpServerIds} onChange={setMcpServerIds} />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" onClick={handleSave} disabled={!name.trim() || saving}>
              <Save size={14} />
              {t("common.save")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
