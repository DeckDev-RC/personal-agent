import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { useSkillStore } from "../../stores/skillStore";
import { useWorkflowStore, type Workflow, type WorkflowStep } from "../../stores/workflowStore";
import Button from "../shared/Button";
import Input, { TextArea } from "../shared/Input";
import WorkflowStepEditor from "./WorkflowStepEditor";

type WorkflowEditorProps = {
  workflow?: Workflow;
  onClose: () => void;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseVariables(input: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    variables[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return variables;
}

function formatVariables(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function createStep(type: WorkflowStep["type"] = "agent-chat"): WorkflowStep {
  return {
    id: generateId(),
    type,
    prompt: "",
    delayMs: 1000,
  };
}

export default function WorkflowEditor({ workflow, onClose }: WorkflowEditorProps) {
  const { createWorkflow, updateWorkflow } = useWorkflowStore();
  const { loaded: agentsLoaded, loadAgents } = useAgentStore();
  const { loaded: skillsLoaded, loadSkills } = useSkillStore();
  const isNew = !workflow;

  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [variablesText, setVariablesText] = useState(formatVariables(workflow?.variables ?? {}));
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(workflow?.schedule?.enabled));
  const [intervalMinutes, setIntervalMinutes] = useState(String(workflow?.schedule?.intervalMinutes ?? 60));
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.steps.length ? workflow.steps : [createStep()],
  );
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agentsLoaded) loadAgents();
    if (!skillsLoaded) loadSkills();
  }, [agentsLoaded, loadAgents, skillsLoaded, loadSkills]);

  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);

  function updateStep(index: number, nextStep: WorkflowStep) {
    setSteps((current) => current.map((step, currentIndex) => (currentIndex === index ? nextStep : step)));
  }

  function deleteStep(index: number) {
    setSteps((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function moveStepById(fromId: string, toId: string) {
    if (fromId === toId) return;
    setSteps((current) => {
      const fromIndex = current.findIndex((step) => step.id === fromId);
      const toIndex = current.findIndex((step) => step.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload: Workflow = {
      id: workflow?.id ?? generateId(),
      name: name.trim(),
      description: description.trim(),
      variables: parseVariables(variablesText),
      steps,
      schedule: scheduleEnabled
        ? {
            ...(workflow?.schedule ?? {}),
            enabled: true,
            intervalMinutes: Number(intervalMinutes) || 60,
          }
        : undefined,
      createdAt: workflow?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    try {
      if (isNew) {
        await createWorkflow(payload);
      } else {
        await updateWorkflow(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {isNew ? "Criar workflow" : "Editar workflow"}
          </h1>
        </div>

        <div className="grid gap-4">
          <Input
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Onboarding, Post-process, MCP batch"
          />
          <Input
            label="Descricao"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Resumo rapido do workflow"
          />
          <TextArea
            label="Variaveis"
            value={variablesText}
            onChange={(e) => setVariablesText(e.target.value)}
            placeholder={"project=codex-agent\npriority=high"}
            className="min-h-24 font-mono text-xs"
          />
          <div className="grid grid-cols-[auto,1fr] gap-3 items-end">
            <label className="flex items-center gap-2 text-xs text-text-secondary font-medium">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
              />
              Schedule
            </label>
            <Input
              label="Interval (minutes)"
              type="number"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
              placeholder="60"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-secondary">Steps</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-secondary/50">
                IDs: {stepIds.join(", ")}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setSteps((current) => [...current, createStep()])}>
                <Plus size={14} />
                Add step
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedStepId) {
                    moveStepById(draggedStepId, step.id);
                    setDraggedStepId(null);
                  }
                }}
              >
                <WorkflowStepEditor
                  step={step}
                  stepIndex={index}
                  stepCount={steps.length}
                  dragging={draggedStepId === step.id}
                  onDragStart={() => setDraggedStepId(step.id)}
                  onDragOver={() => {
                    if (draggedStepId && draggedStepId !== step.id) {
                      moveStepById(draggedStepId, step.id);
                      setDraggedStepId(step.id);
                    }
                  }}
                  onDrop={() => setDraggedStepId(null)}
                  onChange={(nextStep) => updateStep(index, nextStep)}
                  onDelete={() => deleteStep(index)}
                  onMoveUp={() => moveStep(index, -1)}
                  onMoveDown={() => moveStep(index, 1)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleSave} disabled={!name.trim() || saving}>
            <Save size={14} />
            Salvar
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
