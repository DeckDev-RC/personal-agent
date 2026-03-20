import { create } from "zustand";
import type { Workflow, WorkflowStep } from "../../../src/types/workflow.js";

export type { Workflow, WorkflowStep };

export type WorkflowStepRunState = {
  stepId: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  message?: string;
  output?: string;
};

export type WorkflowRunState = {
  workflowId: string;
  running: boolean;
  variables: Record<string, string>;
  steps: WorkflowStepRunState[];
  error?: string;
  finishedAt?: number;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const api = () => (window as any).codexAgent;

type WorkflowState = {
  workflows: Workflow[];
  loaded: boolean;
  runState: WorkflowRunState | null;

  loadWorkflows: () => Promise<void>;
  createWorkflow: (partial: Partial<Workflow>) => Promise<Workflow>;
  updateWorkflow: (workflow: Workflow) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  getWorkflow: (id: string) => Workflow | undefined;
  runWorkflow: (workflowId: string) => Promise<void>;
  abortWorkflow: () => void;
  handleProgress: (payload: any) => void;
  handleDone: (payload: any) => void;
  handleError: (payload: any) => void;
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  loaded: false,
  runState: null,

  loadWorkflows: async () => {
    const workflows = await api().store.listWorkflows();
    set({ workflows, loaded: true });
  },

  createWorkflow: async (partial) => {
    const now = Date.now();
    const workflow: Workflow = {
      id: generateId(),
      name: partial.name ?? "Novo Workflow",
      description: partial.description ?? "",
      steps: partial.steps ?? [],
      variables: partial.variables ?? {},
      schedule: partial.schedule,
      createdAt: now,
      updatedAt: now,
    };
    await api().store.saveWorkflow(workflow);
    await get().loadWorkflows();
    return workflow;
  },

  updateWorkflow: async (workflow) => {
    await api().store.saveWorkflow({ ...workflow, updatedAt: Date.now() });
    await get().loadWorkflows();
  },

  deleteWorkflow: async (id) => {
    await api().store.deleteWorkflow(id);
    await get().loadWorkflows();
  },

  getWorkflow: (id) => get().workflows.find((workflow) => workflow.id === id),

  runWorkflow: async (workflowId) => {
    const workflow = get().getWorkflow(workflowId);
    set({
      runState: {
        workflowId,
        running: true,
        variables: { ...(workflow?.variables ?? {}) },
        steps: (workflow?.steps ?? []).map((step) => ({
          stepId: step.id,
          status: "pending",
        })),
      },
    });
    await api().runWorkflow(workflowId);
  },

  abortWorkflow: () => {
    api().abortWorkflow();
    set((state) => ({
      runState: state.runState
        ? {
            ...state.runState,
            running: false,
            error: "Workflow aborted.",
            finishedAt: Date.now(),
          }
        : null,
    }));
  },

  handleProgress: (payload) => {
    set((state) => {
      const current = state.runState;
      if (!current || current.workflowId !== payload.workflowId) {
        return {
          runState: {
            workflowId: payload.workflowId,
            running: true,
            variables: payload.variables ?? {},
            steps: [
              {
                stepId: payload.stepId,
                status: payload.status,
                message: payload.message,
                output: payload.output,
              },
            ],
          },
        };
      }

      const existing = current.steps.find((step) => step.stepId === payload.stepId);
      const nextSteps = existing
        ? current.steps.map((step) =>
            step.stepId === payload.stepId
              ? {
                  ...step,
                  status: payload.status,
                  message: payload.message,
                  output: payload.output,
                }
              : step,
          )
        : [
            ...current.steps,
            {
              stepId: payload.stepId,
              status: payload.status,
              message: payload.message,
              output: payload.output,
            },
          ];

      return {
        runState: {
          ...current,
          running: true,
          variables: payload.variables ?? current.variables,
          steps: nextSteps,
        },
      };
    });
  },

  handleDone: (payload) => {
    set((state) => {
      if (!state.runState || state.runState.workflowId !== payload.workflowId) {
        return state;
      }

      const stepOutputs =
        payload.stepOutputs && typeof payload.stepOutputs === "object"
          ? (payload.stepOutputs as Record<string, { status?: string; output?: string }>)
          : {};
      const nextSteps =
        Object.keys(stepOutputs).length > 0
          ? state.runState.steps.map((step) => {
              const output = stepOutputs[step.stepId];
              if (!output) {
                return step;
              }
              return {
                ...step,
                status:
                  output.status === "running" ||
                  output.status === "success" ||
                  output.status === "error" ||
                  output.status === "skipped"
                    ? output.status
                    : step.status,
                output: typeof output.output === "string" ? output.output : step.output,
              };
            })
          : state.runState.steps;

      return {
        runState: {
          ...state.runState,
          running: false,
          variables: payload.variables ?? state.runState.variables,
          steps: nextSteps,
          finishedAt: Date.now(),
        },
      };
    });
  },

  handleError: (payload) => {
    set((state) => ({
      runState:
        state.runState && state.runState.workflowId === payload.workflowId
          ? {
              ...state.runState,
              running: false,
              error: payload.message,
              finishedAt: Date.now(),
            }
          : state.runState,
    }));
  },
}));
