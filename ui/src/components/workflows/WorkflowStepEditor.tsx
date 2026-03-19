import React from "react";
import { Trash2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import type { WorkflowStep } from "../../stores/workflowStore";
import { useAgentStore, DEFAULT_AGENT } from "../../stores/agentStore";
import { useSkillStore } from "../../stores/skillStore";
import Input, { TextArea } from "../shared/Input";

type WorkflowStepEditorProps = {
  step: WorkflowStep;
  stepIndex: number;
  stepCount: number;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onChange: (step: WorkflowStep) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export default function WorkflowStepEditor({
  step,
  stepIndex,
  stepCount,
  dragging = false,
  onDragStart,
  onDragOver,
  onDrop,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: WorkflowStepEditorProps) {
  const agents = useAgentStore((state) => state.agents);
  const skills = useSkillStore((state) => state.skills);
  const allAgents = [DEFAULT_AGENT, ...agents];

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOver?.();
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop?.();
            }}
            className={`p-1 rounded-lg cursor-grab border ${dragging ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue" : "border-border text-text-secondary hover:text-text-primary"}`}
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </button>
          <span className="text-xs text-text-secondary/60">Step {stepIndex + 1}</span>
          <select
            value={step.type}
            onChange={(e) =>
              onChange({
                ...step,
                type: e.target.value as WorkflowStep["type"],
              })
            }
            className="rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary"
          >
            <option value="agent-chat">agent-chat</option>
            <option value="skill-execute">skill-execute</option>
            <option value="conditional">conditional</option>
            <option value="delay">delay</option>
            <option value="tool-call">tool-call</option>
            <option value="memory-query">memory-query</option>
            <option value="reindex-workspace">reindex-workspace</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={stepIndex === 0}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-30 cursor-pointer"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={stepIndex === stepCount - 1}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-30 cursor-pointer"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {step.type === "agent-chat" && (
        <div className="grid gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Agent</label>
            <select
              value={step.agentId ?? DEFAULT_AGENT.id}
              onChange={(e) => onChange({ ...step, agentId: e.target.value })}
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
            label="Prompt"
            value={step.prompt ?? ""}
            onChange={(e) => onChange({ ...step, prompt: e.target.value })}
            placeholder="Use {{variables}} if needed."
            className="min-h-28 font-mono text-xs"
          />
        </div>
      )}

      {step.type === "skill-execute" && (
        <div className="grid gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">Skill</label>
            <select
              value={step.skillId ?? ""}
              onChange={(e) => onChange({ ...step, skillId: e.target.value })}
              className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Select a skill</option>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </div>
          <TextArea
            label="Prompt"
            value={step.prompt ?? ""}
            onChange={(e) => onChange({ ...step, prompt: e.target.value })}
            placeholder="Optional user prompt for the skill."
            className="min-h-24 font-mono text-xs"
          />
        </div>
      )}

      {step.type === "conditional" && (
        <Input
          label="Condition"
          value={step.condition ?? ""}
          onChange={(e) => onChange({ ...step, condition: e.target.value })}
          placeholder='Examples: approved, !approved, status == "done"'
        />
      )}

      {step.type === "delay" && (
        <Input
          label="Delay (ms)"
          type="number"
          value={String(step.delayMs ?? 1000)}
          onChange={(e) => onChange({ ...step, delayMs: Number(e.target.value) || 0 })}
        />
      )}

      {step.type === "tool-call" && (
        <div className="grid gap-4">
          <Input
            label="Tool name"
            value={step.toolName ?? ""}
            onChange={(e) => onChange({ ...step, toolName: e.target.value })}
            placeholder="Ex: read_file, search, browser_open"
          />
          <TextArea
            label="Tool args"
            value={JSON.stringify(step.toolArgs ?? {}, null, 2)}
            onChange={(e) => {
              try {
                onChange({ ...step, toolArgs: JSON.parse(e.target.value || "{}") });
              } catch {
                onChange({ ...step, toolArgs: step.toolArgs ?? {} });
              }
            }}
            placeholder='{"path":"src/index.ts"}'
            className="min-h-24 font-mono text-xs"
          />
        </div>
      )}

      {step.type === "memory-query" && (
        <div className="grid gap-4">
          <Input
            label="Memory query"
            value={step.memoryQuery ?? ""}
            onChange={(e) => onChange({ ...step, memoryQuery: e.target.value })}
            placeholder="Ex: auth flow, pending TODO, latest run output"
          />
          <Input
            label="Result limit"
            type="number"
            value={String(step.memoryLimit ?? 4)}
            onChange={(e) => onChange({ ...step, memoryLimit: Number(e.target.value) || 0 })}
          />
        </div>
      )}

      {step.type === "reindex-workspace" && (
        <div className="rounded-xl border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">
          Reindexes the active workspace for the workflow session.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="On Success Step ID"
          value={step.onSuccess ?? ""}
          onChange={(e) => onChange({ ...step, onSuccess: e.target.value || undefined })}
          placeholder="Optional jump target"
        />
        <Input
          label="On Failure Step ID"
          value={step.onFailure ?? ""}
          onChange={(e) => onChange({ ...step, onFailure: e.target.value || undefined })}
          placeholder="Optional jump target"
        />
      </div>
    </div>
  );
}
