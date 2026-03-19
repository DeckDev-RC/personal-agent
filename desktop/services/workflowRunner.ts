import type { AgentConfig } from "../../src/types/agent.js";
import type { Skill } from "../../src/types/skill.js";
import type { Workflow, WorkflowStep } from "../../src/types/workflow.js";
import { runAgentChat } from "./agentRunner.js";
import * as store from "./store.js";

const DEFAULT_AGENT: AgentConfig = {
  id: "__default__",
  name: "Assistente Pessoal",
  description: "Assistente pessoal versatil para tarefas do dia a dia.",
  systemPrompt: `Voce e um assistente pessoal altamente capaz e versatil. Seu objetivo e ajudar o usuario com qualquer tarefa de forma eficiente, clara e proativa.

Diretrizes:
- Responda sempre no idioma em que o usuario escrever
- Seja direto e conciso, mas completo quando necessario
- Para codigo, use markdown com syntax highlighting
- Para tarefas complexas, divida em passos claros
- Sugira melhorias e alternativas quando relevante
- Se nao souber algo, diga honestamente
- Use formatacao markdown para melhor legibilidade`,
  model: "gpt-5.4",
  skillIds: [],
  mcpServerIds: [],
  createdAt: 0,
  updatedAt: 0,
};

export type WorkflowProgressEvent = {
  workflowId: string;
  stepId: string;
  status: "running" | "success" | "error" | "skipped";
  message?: string;
  output?: string;
  variables: Record<string, string>;
};

export type WorkflowRunResult = {
  workflowId: string;
  success: boolean;
  variables: Record<string, string>;
  outputs: Record<string, string>;
};

export type RunWorkflowParams = {
  accessToken: string;
  workflow: Workflow;
  signal?: AbortSignal;
  onProgress?: (event: WorkflowProgressEvent) => void;
};

function renderTemplate(input: string | undefined, variables: Record<string, string>): string {
  if (!input) return "";
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}

function buildSkillsPrompt(skills: Skill[], ids: string[]): string {
  const picked = ids
    .map((id) => skills.find((skill) => skill.id === id))
    .filter((skill): skill is Skill => Boolean(skill))
    .filter((skill) => skill.type === "prompt" && skill.content.trim().length > 0);

  if (picked.length === 0) {
    return "";
  }

  return (
    "\n\n---\n\n" +
    picked.map((skill) => `## Skill: ${skill.name}\n${skill.content}`).join("\n\n---\n\n")
  );
}

function evaluateCondition(condition: string | undefined, variables: Record<string, string>): boolean {
  if (!condition?.trim()) {
    return false;
  }

  const expr = renderTemplate(condition.trim(), variables);
  const equalsMatch = expr.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=)\s*(.+)$/);
  if (equalsMatch) {
    const [, rawKey, operator, rawValue] = equalsMatch;
    const left = variables[rawKey] ?? "";
    const right = rawValue.trim().replace(/^["']|["']$/g, "");
    return operator === "==" ? left === right : left !== right;
  }

  if (expr.startsWith("!")) {
    const key = expr.slice(1).trim();
    return !(variables[key] ?? "").trim();
  }

  return Boolean((variables[expr] ?? expr).trim());
}

function resolveNextStepId(step: WorkflowStep, success: boolean): string | undefined {
  return success ? step.onSuccess : step.onFailure;
}

function setOutputVariables(
  variables: Record<string, string>,
  outputs: Record<string, string>,
  stepId: string,
  output: string,
): Record<string, string> {
  const next = {
    ...variables,
    lastOutput: output,
    [`step.${stepId}.output`]: output,
  };
  outputs[stepId] = output;
  return next;
}

async function resolveAgent(agentId: string | undefined): Promise<AgentConfig> {
  if (!agentId || agentId === DEFAULT_AGENT.id) {
    return DEFAULT_AGENT;
  }
  return (await store.getAgent(agentId)) ?? DEFAULT_AGENT;
}

async function runAgentStep(params: {
  accessToken: string;
  step: WorkflowStep;
  workflowId: string;
  variables: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (event: WorkflowProgressEvent) => void;
}): Promise<string> {
  const [skills, settings] = await Promise.all([store.listSkills(), store.getSettings()]);
  const agent = await resolveAgent(params.step.agentId);
  const systemPrompt = agent.systemPrompt + buildSkillsPrompt(skills, agent.skillIds);
  const prompt = renderTemplate(params.step.prompt, params.variables);
  let finalText = "";

  for await (const event of runAgentChat({
    model: agent.model || settings.defaultModelRef,
    systemPrompt,
    messages: [
      {
        id: `${params.workflowId}-${params.step.id}-user`,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      },
    ],
    mcpServerIds: agent.mcpServerIds,
    reasoningEffort: settings.fastMode ? "low" : settings.reasoningEffort,
    contextWindow: settings.contextWindow,
    compactAtTokens: settings.compactAtTokens,
    maxOutputTokens: settings.maxOutputTokens,
    signal: params.signal,
  })) {
    if (params.signal?.aborted) {
      throw new Error("Workflow aborted.");
    }

    if (event.type === "toolresult") {
      params.onProgress?.({
        workflowId: params.workflowId,
        stepId: params.step.id,
        status: "running",
        message: `tool ${event.toolName}`,
        output: event.content,
        variables: params.variables,
      });
    }

    if (event.type === "done") {
      finalText = event.text;
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return finalText;
}

async function runSkillStep(params: {
  accessToken: string;
  step: WorkflowStep;
  workflowId: string;
  variables: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (event: WorkflowProgressEvent) => void;
}): Promise<string> {
  if (!params.step.skillId) {
    throw new Error("Skill step missing skillId.");
  }

  const [skill, settings] = await Promise.all([store.getSkill(params.step.skillId), store.getSettings()]);

  if (!skill) {
    throw new Error(`Skill "${params.step.skillId}" not found.`);
  }

  if (skill.type !== "prompt") {
    throw new Error(`Skill "${skill.name}" is not runnable yet because it is a tool skill.`);
  }

  const prompt = renderTemplate(params.step.prompt, params.variables) || "Execute the skill instructions.";
  let finalText = "";

  for await (const event of runAgentChat({
    model: settings.defaultModelRef,
    systemPrompt: renderTemplate(skill.content, params.variables),
    messages: [
      {
        id: `${params.workflowId}-${params.step.id}-skill`,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      },
    ],
    reasoningEffort: settings.fastMode ? "low" : settings.reasoningEffort,
    contextWindow: settings.contextWindow,
    compactAtTokens: settings.compactAtTokens,
    maxOutputTokens: settings.maxOutputTokens,
    signal: params.signal,
  })) {
    if (params.signal?.aborted) {
      throw new Error("Workflow aborted.");
    }

    if (event.type === "toolresult") {
      params.onProgress?.({
        workflowId: params.workflowId,
        stepId: params.step.id,
        status: "running",
        message: `tool ${event.toolName}`,
        output: event.content,
        variables: params.variables,
      });
    }

    if (event.type === "done") {
      finalText = event.text;
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return finalText;
}

function getStepIndexById(steps: WorkflowStep[], stepId: string | undefined): number {
  if (!stepId) return -1;
  return steps.findIndex((step) => step.id === stepId);
}

export async function runWorkflow(params: RunWorkflowParams): Promise<WorkflowRunResult> {
  const { workflow, onProgress, signal } = params;
  let variables = { ...workflow.variables };
  const outputs: Record<string, string> = {};
  let index = 0;

  while (index >= 0 && index < workflow.steps.length) {
    if (signal?.aborted) {
      throw new Error("Workflow aborted.");
    }

    const step = workflow.steps[index];
    onProgress?.({
      workflowId: workflow.id,
      stepId: step.id,
      status: "running",
      message: step.type,
      variables,
    });

    try {
      let output = "";
      let shouldJump = false;

      switch (step.type) {
        case "agent-chat":
          output = await runAgentStep({
            accessToken: params.accessToken,
            workflowId: workflow.id,
            step,
            variables,
            signal,
            onProgress,
          });
          variables = setOutputVariables(variables, outputs, step.id, output);
          break;
        case "skill-execute":
          output = await runSkillStep({
            accessToken: params.accessToken,
            workflowId: workflow.id,
            step,
            variables,
            signal,
            onProgress,
          });
          variables = setOutputVariables(variables, outputs, step.id, output);
          break;
        case "delay": {
          const delayMs = Math.max(0, Number(step.delayMs ?? 0));
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, delayMs);
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timeout);
                reject(new Error("Workflow aborted."));
              },
              { once: true },
            );
          });
          output = `Delayed for ${delayMs}ms`;
          variables = setOutputVariables(variables, outputs, step.id, output);
          break;
        }
        case "conditional": {
          const result = evaluateCondition(step.condition, variables);
          output = result ? "Condition matched" : "Condition did not match";
          variables = setOutputVariables(variables, outputs, step.id, output);
          onProgress?.({
            workflowId: workflow.id,
            stepId: step.id,
            status: result ? "success" : "skipped",
            output,
            variables,
          });
          const nextStepId = resolveNextStepId(step, result);
          const nextIndex = getStepIndexById(workflow.steps, nextStepId);
          if (nextIndex >= 0) {
            index = nextIndex;
            shouldJump = true;
          } else {
            index += 1;
          }
          continue;
        }
      }

      onProgress?.({
        workflowId: workflow.id,
        stepId: step.id,
        status: "success",
        output,
        variables,
      });

      const nextStepId = resolveNextStepId(step, true);
      const nextIndex = getStepIndexById(workflow.steps, nextStepId);
      if (nextIndex >= 0) {
        index = nextIndex;
        shouldJump = true;
      }

      if (!shouldJump) {
        index += 1;
      }
    } catch (error: any) {
      const message = error?.message ?? String(error);
      onProgress?.({
        workflowId: workflow.id,
        stepId: step.id,
        status: "error",
        message,
        output: message,
        variables,
      });

      const nextStepId = resolveNextStepId(step, false);
      const nextIndex = getStepIndexById(workflow.steps, nextStepId);
      if (nextIndex >= 0) {
        index = nextIndex;
        continue;
      }

      throw error;
    }
  }

  return {
    workflowId: workflow.id,
    success: true,
    variables,
    outputs,
  };
}
